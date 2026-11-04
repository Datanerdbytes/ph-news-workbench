import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

const users = await sql`SELECT id FROM "user" ORDER BY created_at ASC LIMIT 1`;
if (!users.length) {
  throw new Error('No user exists to backfill draft ownership.');
}

await sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`UPDATE drafts SET user_id = ${users[0].id} WHERE user_id IS NULL`;
await sql`ALTER TABLE drafts ALTER COLUMN user_id SET NOT NULL`;

await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'drafts_user_id_fkey'
    ) THEN
      ALTER TABLE drafts
        ADD CONSTRAINT drafts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    END IF;
  END
  $$`;

await sql`CREATE INDEX IF NOT EXISTS drafts_user_item_idx ON drafts (user_id, news_item_id, id DESC)`;

const counts = await sql`
  SELECT count(*)::int AS drafts, count(DISTINCT user_id)::int AS owners FROM drafts`;
console.log(JSON.stringify({ migrated: true, ...counts[0] }));
