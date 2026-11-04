import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS facebook_pages (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    page_name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, page_id)
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS facebook_pages_workspace_idx
  ON facebook_pages (workspace_id, is_primary DESC)`;

await sql`
  INSERT INTO facebook_pages
    (workspace_id, page_id, page_name, access_token, is_primary, updated_at)
  SELECT workspace_id, page_id, page_name, access_token, true, updated_at
  FROM facebook_connections
  ON CONFLICT (workspace_id, page_id) DO NOTHING`;

await sql`
  CREATE TABLE IF NOT EXISTS live_streams (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    facebook_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    stream_key TEXT,
    secure_stream_url TEXT,
    permalink_url TEXT,
    planned_start_time TIMESTAMPTZ,
    created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, facebook_video_id)
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS live_streams_workspace_idx
  ON live_streams (workspace_id, created_at DESC)`;

const pages = await sql`SELECT count(*)::int AS facebook_pages FROM facebook_pages`;
const streams = await sql`SELECT count(*)::int AS live_streams FROM live_streams`;
console.log(JSON.stringify({ migrated: true, ...pages[0], ...streams[0] }));
