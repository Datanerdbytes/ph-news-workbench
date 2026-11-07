import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Starting auth hardening migration...');

  console.log('Creating sign_in_locks table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sign_in_locks (
      email TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_failure_at TIMESTAMPTZ,
      locked_until TIMESTAMPTZ
    )`;

  console.log('Marking existing accounts email-verified (they predate the verification gate)...');
  const before = await sql`SELECT count(*)::int AS count FROM "user" WHERE email_verified = false`;
  await sql`UPDATE "user" SET email_verified = true WHERE email_verified = false`;
  console.log(`  verified ${before[0]?.count ?? 0} account(s)`);

  console.log('Done.');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
