import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Starting sources workspace migration...');

  try {
    // 1. Add workspace_id to feeds table (nullable first for backfill)
    console.log('Adding workspace_id to feeds table...');
    await sql`ALTER TABLE feeds ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE`;

    // 2. Create index on feeds.workspace_id
    console.log('Creating index on feeds.workspace_id...');
    await sql`CREATE INDEX IF NOT EXISTS feeds_workspace_idx ON feeds (workspace_id)`;

    // 3. Get the first workspace to assign existing feeds to (for backward compatibility)
    const workspaceResult = await sql`SELECT id FROM workspaces ORDER BY created_at LIMIT 1`;
    const defaultWorkspaceId = workspaceResult[0]?.id;

    if (!defaultWorkspaceId) {
      console.log('No workspaces found. Skipping backfill. Feeds will need workspace_id on creation.');
    } else {
      console.log(`Backfilling existing feeds with workspace_id: ${defaultWorkspaceId}`);
      await sql`UPDATE feeds SET workspace_id = ${defaultWorkspaceId} WHERE workspace_id IS NULL`;

      // 4. Now make workspace_id NOT NULL
      console.log('Setting workspace_id NOT NULL on feeds...');
      await sql`ALTER TABLE feeds ALTER COLUMN workspace_id SET NOT NULL`;

      // 5. Drop old unique constraint on url and add composite unique
      console.log('Updating unique constraint on feeds...');
      try {
        await sql`ALTER TABLE feeds DROP CONSTRAINT IF EXISTS feeds_url_key`;
      } catch (e) {
        console.log('No feeds_url_key constraint to drop');
      }
      await sql`ALTER TABLE feeds ADD CONSTRAINT feeds_workspace_url_unique UNIQUE (workspace_id, url)`;
    }

    // 6. Add workspace_id to news_items table (nullable first for backfill)
    console.log('Adding workspace_id to news_items table...');
    await sql`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE`;

    // 7. Create index on news_items.workspace_id
    console.log('Creating index on news_items.workspace_id...');
    await sql`CREATE INDEX IF NOT EXISTS news_items_workspace_idx ON news_items (workspace_id)`;

    // 8. Backfill news_items.workspace_id from feeds
    console.log('Backfilling news_items.workspace_id from feeds...');
    await sql`
      UPDATE news_items ni
      SET workspace_id = f.workspace_id
      FROM feeds f
      WHERE ni.feed_id = f.id
      AND ni.workspace_id IS NULL
      AND f.workspace_id IS NOT NULL
    `;

    // 9. For any remaining news_items without workspace_id, assign to default workspace
    if (defaultWorkspaceId) {
      console.log(`Backfilling remaining news_items with workspace_id: ${defaultWorkspaceId}`);
      await sql`UPDATE news_items SET workspace_id = ${defaultWorkspaceId} WHERE workspace_id IS NULL`;

      // 10. Now make workspace_id NOT NULL on news_items
      console.log('Setting workspace_id NOT NULL on news_items...');
      await sql`ALTER TABLE news_items ALTER COLUMN workspace_id SET NOT NULL`;
    }

    // 11. Add enabled column to feeds for disable/enable functionality
    console.log('Adding enabled column to feeds...');
    await sql`ALTER TABLE feeds ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`;

    // 12. Add error_message column to feeds for tracking fetch errors
    console.log('Adding error_message column to feeds...');
    await sql`ALTER TABLE feeds ADD COLUMN IF NOT EXISTS error_message TEXT`;

    // 13. Add title column to feeds for storing feed title
    console.log('Adding title column to feeds...');
    await sql`ALTER TABLE feeds ADD COLUMN IF NOT EXISTS title TEXT`;

    // 14. Update unique constraint on news_items to include workspace_id for per-workspace deduplication
    console.log('Updating unique constraint on news_items...');
    try {
      await sql`ALTER TABLE news_items DROP CONSTRAINT IF EXISTS news_items_feed_id_dedup_hash_key`;
    } catch (e) {
      console.log('No existing constraint to drop');
    }
    await sql`ALTER TABLE news_items ADD CONSTRAINT news_items_workspace_dedup_unique UNIQUE (workspace_id, dedup_hash)`;

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

migrate().catch(console.error);