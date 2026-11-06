import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Starting user theme preference migration...');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
        theme TEXT NOT NULL DEFAULT 'ink-white',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log('user_preferences table ready.');
    console.log('Done.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  }
}

migrate();
