require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS facebook_connections (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL,
      page_name TEXT NOT NULL,
      access_token TEXT NOT NULL,
      scopes TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'facebook_connections_user_id_fkey'
      ) THEN
        ALTER TABLE facebook_connections
          ADD CONSTRAINT facebook_connections_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
      END IF;
    END
    $$
  `;
  console.log('facebook_connections ready');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
