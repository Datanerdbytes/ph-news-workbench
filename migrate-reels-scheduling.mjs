import { config } from 'dotenv';

config();
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

/**
 * Reconcile Facebook-scheduled Reels with the local scheduling record:
 * scheduled_posts gains `kind` (post|reel), `source` (local|facebook), and
 * `facebook_post_ids` (per-page publish results). Reels keep Facebook as the
 * executor (including native scheduling) but are mirrored locally so the
 * Calendar and Analytics see them; the local scheduler skips
 * source='facebook' rows and syncs their status instead.
 */
async function main() {
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'post'`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local'`;
  await sql`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS facebook_post_ids JSONB`;

  const existing = await sql`
    SELECT count(*)::int AS count
    FROM scheduled_posts
    WHERE source = 'facebook'`;
  console.log(
    JSON.stringify({
      migration: 'reels-scheduling',
      event: 'done',
      facebookSourceRows: existing[0]?.count ?? 0,
    })
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
