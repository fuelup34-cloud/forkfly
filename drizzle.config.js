import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.js',
  out: './server/db/migrations',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL },
});
