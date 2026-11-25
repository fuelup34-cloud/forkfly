// Accounts and sign-in (Better Auth, stored in our own Postgres).
// Routes live under /api/auth/* — sign-up, sign-in, sign-out, session.

import os from 'node:os';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import { db, schema } from './db/index.js';

const HTTP_PORT = Number(process.env.PORT) || 3002;
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT) || 5190;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5443;

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  console.error('BETTER_AUTH_SECRET is missing or too short. Run `npm run setup` to create one.');
  process.exit(1);
}

// Pages are allowed to sign in (and send changes) only from these addresses:
// this computer, plus its Wi-Fi address so phones on the same network work.
function localOrigins() {
  const hosts = ['localhost', '127.0.0.1'];
  for (const n of Object.values(os.networkInterfaces()).flat()) {
    if (n?.family === 'IPv4' && !n.internal) hosts.push(n.address);
  }
  const ports = [...new Set([PUBLIC_PORT, HTTP_PORT])];
  return hosts.flatMap((h) => [...ports.map((p) => `http://${h}:${p}`), `https://${h}:${HTTPS_PORT}`]);
}

export const TRUSTED_ORIGINS = [
  ...new Set([
    ...localOrigins(),
    ...(process.env.TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]),
];

export const auth = betterAuth({
  appName: 'Forkfly',
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${PUBLIC_PORT}`,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      // input: false — nobody can make themselves an admin by sending a role when signing up.
      role: { type: 'string', defaultValue: 'customer', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refreshed at most once a day
  },
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
    },
  },
  telemetry: { enabled: false },
});

// The signed-in user for a Node request (or WebSocket upgrade), or null.
export async function getSession(req) {
  try {
    return await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch {
    return null;
  }
}
