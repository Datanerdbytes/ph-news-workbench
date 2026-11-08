import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Creating youtube_connections table...');

  await sql`
    CREATE TABLE IF NOT EXISTS youtube_connections (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      youtube_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scopes TEXT,
      expires_at TIMESTAMPTZ,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log('Done: youtube_connections.');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
