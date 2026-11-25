// Applies any database migrations that haven't run yet. Safe to run every time.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

try {
  await migrate(db, { migrationsFolder: path.join(HERE, 'migrations') });
  console.log('Database is up to date.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
