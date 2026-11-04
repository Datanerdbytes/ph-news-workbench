import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
  )`;

await sql`CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id)`;

await sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS workspace_id TEXT`;
await sql`ALTER TABLE facebook_connections ADD COLUMN IF NOT EXISTS workspace_id TEXT`;

const users = await sql`SELECT id, name FROM "user" ORDER BY created_at ASC`;

for (const user of users) {
  const workspaceId = `ws_${user.id}`;
  const page = await sql`
    SELECT page_name FROM facebook_connections
    WHERE user_id = ${user.id} LIMIT 1`;
  const fallbackName = user.name?.trim()
    ? `${user.name.trim()}'s workspace`
    : 'Personal workspace';
  const name = page[0]?.page_name ?? fallbackName;

  await sql`
    INSERT INTO workspaces (id, name, owner_id)
    VALUES (${workspaceId}, ${name}, ${user.id})
    ON CONFLICT (id) DO NOTHING`;

  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${workspaceId}, ${user.id}, 'owner')
    ON CONFLICT DO NOTHING`;

  await sql`
    UPDATE drafts SET workspace_id = ${workspaceId}
    WHERE user_id = ${user.id} AND workspace_id IS NULL`;

  await sql`
    UPDATE facebook_connections SET workspace_id = ${workspaceId}
    WHERE user_id = ${user.id} AND workspace_id IS NULL`;
}

await sql`ALTER TABLE drafts ALTER COLUMN workspace_id SET NOT NULL`;

await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'drafts_workspace_id_fkey'
    ) THEN
      ALTER TABLE drafts
        ADD CONSTRAINT drafts_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
    END IF;
  END
  $$`;

await sql`CREATE INDEX IF NOT EXISTS drafts_workspace_idx ON drafts (workspace_id, id DESC)`;

await sql`ALTER TABLE facebook_connections ALTER COLUMN workspace_id SET NOT NULL`;

await sql`
  DO $$
  DECLARE pk_name text;
  BEGIN
    SELECT conname INTO pk_name FROM pg_constraint
    WHERE conrelid = 'facebook_connections'::regclass AND contype = 'p';
    IF pk_name IS NOT NULL AND pk_name <> 'facebook_connections_pkey' THEN
      EXECUTE format('ALTER TABLE facebook_connections DROP CONSTRAINT %I', pk_name);
    END IF;
    IF pk_name IS NOT NULL AND pk_name = 'facebook_connections_pkey' THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'facebook_connections'::regclass
          AND contype = 'p' AND pg_get_constraintdef(oid) LIKE '%workspace_id%'
      ) THEN
        ALTER TABLE facebook_connections DROP CONSTRAINT facebook_connections_pkey;
      END IF;
    END IF;
  END
  $$`;

await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'facebook_connections'::regclass AND contype = 'p'
    ) THEN
      ALTER TABLE facebook_connections ADD PRIMARY KEY (workspace_id);
    END IF;
  END
  $$`;

await sql`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'facebook_connections_workspace_id_fkey'
    ) THEN
      ALTER TABLE facebook_connections
        ADD CONSTRAINT facebook_connections_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
    END IF;
  END
  $$`;

const summary = await sql`
  SELECT
    (SELECT count(*)::int FROM workspaces) AS workspaces,
    (SELECT count(*)::int FROM workspace_members) AS members,
    (SELECT count(*)::int FROM drafts WHERE workspace_id IS NULL) AS unowned_drafts,
    (SELECT count(*)::int FROM facebook_connections WHERE workspace_id IS NULL) AS unowned_connections`;

console.log(JSON.stringify({ migrated: true, ...summary[0] }));
