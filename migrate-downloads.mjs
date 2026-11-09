import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS download_jobs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    quality TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'fetching', 'downloading', 'finalizing', 'done', 'failed')),
    progress REAL,
    status_message TEXT NOT NULL DEFAULT '',
    file_name TEXT,
    blob_url TEXT,
    file_size BIGINT,
    save_location TEXT,
    error TEXT,
    worker_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS download_jobs_workspace_idx
  ON download_jobs (workspace_id, created_at DESC)`;

await sql`
  CREATE INDEX IF NOT EXISTS download_jobs_queue_idx
  ON download_jobs (status, created_at)`;

const rows = await sql`
  SELECT count(*)::int AS existing_download_jobs FROM download_jobs`;
console.log(JSON.stringify({ migrated: true, ...rows[0] }));