import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS image_urls JSONB`;

const rows = await sql`SELECT count(*)::int AS scheduled FROM scheduled_posts`;
console.log(JSON.stringify({ migrated: true, ...rows[0] }));
