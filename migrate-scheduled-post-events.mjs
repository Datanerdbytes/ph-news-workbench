import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS scheduled_post_events (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    scheduled_post_id INTEGER NOT NULL,
    news_item_id INTEGER,
    event TEXT NOT NULL,
    source TEXT NOT NULL,
    actor_user_id TEXT,
    facebook_post_id TEXT,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS scheduled_post_events_post_idx
  ON scheduled_post_events (scheduled_post_id, created_at DESC)`;

await sql`
  CREATE INDEX IF NOT EXISTS scheduled_post_events_workspace_idx
  ON scheduled_post_events (workspace_id, created_at DESC)`;

const rows = await sql`
  SELECT count(*)::int AS existing_events FROM scheduled_post_events`;
console.log(JSON.stringify({ migrated: true, ...rows[0] }));
