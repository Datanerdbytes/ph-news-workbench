import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    news_item_id INTEGER REFERENCES news_items(id) ON DELETE SET NULL,
    draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    image_url TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    facebook_post_id TEXT,
    error_message TEXT,
    created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS scheduled_workspace_time_idx
  ON scheduled_posts (workspace_id, scheduled_for)`;

await sql`
  CREATE INDEX IF NOT EXISTS scheduled_due_idx
  ON scheduled_posts (status, scheduled_for)`;

const summary = await sql`SELECT count(*)::int AS scheduled FROM scheduled_posts`;
console.log(JSON.stringify({ migrated: true, ...summary[0] }));
