// Accounts and sign-in (Better Auth, stored in our own Postgres).
// Routes live under /api/auth/* — sign-up, sign-in, sign-out, session.

import os from 'node:os';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { sendCodeEmail } from './mail.js';

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
    // New accounts confirm their email with a 6-digit code before they can sign in.
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    // Signing in to an unconfirmed account sends a fresh code.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      // Codes replace Better Auth's default verification links.
      overrideDefaultEmailVerification: true,
      sendVerificationOTP: sendCodeEmail,
    }),
  ],
  user: {
    additionalFields: {
      // input: false — nobody can make themselves an admin by sending a role when signing up.
      role: { type: 'string', defaultValue: 'customer', input: false },
      // 'suspended' by an admin: they can't sign in, and existing sessions stop working.
      status: { type: 'string', defaultValue: 'active', input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        async before(session) {
          const [u] = await db.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.id, session.userId));
          if (u?.status === 'suspended') throw new APIError('FORBIDDEN', { message: 'This account is suspended. Contact Forkfly support.' });
        },
      },
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
      // Each sends an email, and codes are short, so these stay tight.
      '/email-otp/send-verification-otp': { window: 60, max: 3 },
      '/email-otp/request-password-reset': { window: 60, max: 3 },
      '/email-otp/verify-email': { window: 60, max: 10 },
      '/email-otp/reset-password': { window: 60, max: 10 },
    },
  },
  telemetry: { enabled: false },
});

// The signed-in user for a Node request (or WebSocket upgrade), or null.
export async function getSession(req) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    // Sessions are also deleted on suspension; this covers one cached in a cookie.
    return session?.user?.status === 'suspended' ? null : session;
  } catch {
    return null;
  }
}
