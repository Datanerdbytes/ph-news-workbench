import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Same lookup order as Next.js: .env.local overrides .env.
config();
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS hyperframes_compositions (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brief TEXT NOT NULL,
    html TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS hyperframes_compositions_workspace_idx
  ON hyperframes_compositions (workspace_id, created_at DESC)`;

await sql`
  CREATE TABLE IF NOT EXISTS hyperframes_renders (
    id SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    composition_id INTEGER NOT NULL REFERENCES hyperframes_compositions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    quality TEXT NOT NULL DEFAULT 'draft',
    mp4_path TEXT,
    log_tail TEXT,
    error TEXT,
    created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE INDEX IF NOT EXISTS hyperframes_renders_workspace_idx
  ON hyperframes_renders (workspace_id, created_at DESC)`;

const compositions = await sql`SELECT count(*)::int AS hyperframes_compositions FROM hyperframes_compositions`;
const renders = await sql`SELECT count(*)::int AS hyperframes_renders FROM hyperframes_renders`;
console.log(
  JSON.stringify({ migrated: true, ...compositions[0], ...renders[0] })
);
