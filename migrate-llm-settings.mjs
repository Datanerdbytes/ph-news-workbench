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
  CREATE TABLE IF NOT EXISTS llm_settings (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    base_url TEXT,
    api_key_encrypted TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

const rows = await sql`SELECT count(*)::int AS llm_settings FROM llm_settings`;
console.log(JSON.stringify({ migrated: true, ...rows[0] }));
