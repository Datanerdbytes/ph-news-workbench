import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    dedupe_key TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, id DESC)`;

await sql`
  CREATE INDEX IF NOT EXISTS notifications_workspace_idx
  ON notifications (workspace_id, created_at DESC)`;

// One UNREAD notification per workspace + dedupe key. Once the row is read,
// a new occurrence of the same condition may insert again.
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_unread_idx
  ON notifications (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND read_at IS NULL`;

const rows = await sql`
  SELECT count(*)::int AS existing_notifications FROM notifications`;
console.log(JSON.stringify({ migrated: true, ...rows[0] }));
