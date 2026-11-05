import { config } from 'dotenv';

config();
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

/**
 * Unify the two scheduling executors behind one local record.
 *
 * scheduled_posts already carries `kind` (post|photo|video|reel|live) and
 * `source` (local|facebook). This migration adds the columns the unified
 * paths need:
 *
 * - page_id       the Facebook Page a native schedule targets, so cancelling
 *                 can pick that Page's access token.
 * - attempts      how many times the local executor has tried the row, so a
 *                 transient Facebook failure is retried instead of failing
 *                 the scheduled post permanently.
 *
 * It also backfills the index the native status sweep uses.
 */
async function main() {
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'post'`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local'`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS facebook_post_ids JSONB`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS page_id TEXT`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`;

  await sql`
    CREATE INDEX IF NOT EXISTS scheduled_native_idx
    ON scheduled_posts (source, status, scheduled_for)`;

  // The audit log must exist even on a database provisioned from schema.sql.
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
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE source = 'facebook')::int AS facebook_source,
           count(*) FILTER (WHERE source = 'local')::int AS local_source
    FROM scheduled_posts`;

  console.log(
    JSON.stringify({
      migration: 'scheduling-unification',
      event: 'done',
      ...rows[0],
    })
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
