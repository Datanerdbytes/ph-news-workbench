import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS workspace_invites (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
    created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accepted_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx ON workspace_invites (workspace_id)`;

const summary = await sql`SELECT count(*)::int AS invites FROM workspace_invites`;
console.log(JSON.stringify({ migrated: true, ...summary[0] }));
