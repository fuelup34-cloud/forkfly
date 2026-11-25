// One-time local setup: writes .env (with a fresh secret), creates the database,
// applies migrations and loads the demo restaurants. Safe to run again.
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const ENV = '.env';

if (!fs.existsSync(ENV)) {
  const user = process.env.USER || 'postgres';
  fs.writeFileSync(
    ENV,
    [
      '# Local settings. Never commit this file.',
      `DATABASE_URL=postgres://${user}@localhost:5432/forkfly`,
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64url')}`,
      'BETTER_AUTH_URL=http://localhost:5190',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  console.log('Created .env');
}
process.loadEnvFile(ENV);

// Create the database if it isn't there yet.
const target = new URL(process.env.DATABASE_URL);
const dbName = decodeURIComponent(target.pathname.slice(1));
const admin = new URL(target);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
try {
  await client.connect();
  const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!rowCount) {
    await client.query(`create database "${dbName.replace(/"/g, '""')}"`);
    console.log(`Created database ${dbName}`);
  }
} catch (err) {
  console.error(`Could not reach Postgres at ${admin.host}: ${err.message}`);
  console.error('Is Postgres running? (brew services start postgresql@14)');
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// Demo restaurants, then local test accounts (see scripts/seed-dev.js for the logins).
for (const script of ['server/db/migrate.js', 'server/db/seed.js', 'scripts/seed-dev.js']) {
  const { status } = spawnSync(process.execPath, [`--env-file=${ENV}`, script], { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}
console.log('\nAll set. Run `npm start` and sign in with one of the test accounts above.');
