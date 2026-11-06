import { createDecipheriv, hkdfSync } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is required to decrypt stored page tokens');
}

const sql = neon(process.env.DATABASE_URL);

function decryptPageToken(payload) {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Stored secret is not readable.');
  }
  const key = Buffer.from(
    hkdfSync('sha256', process.env.BETTER_AUTH_SECRET, 'ph-news-workbench', 'facebook-page-token', 32)
  );
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function fetchPagePictureUrl(pageId, pageToken) {
  const url = new URL(`https://graph.facebook.com/v23.0/${pageId}/picture`);
  url.searchParams.set('redirect', 'false');
  url.searchParams.set('type', 'large');
  url.searchParams.set('access_token', pageToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Graph returned ${res.status}`);
  const body = await res.json();
  // Default silhouettes are not real photos — store null so the UI falls
  // back to initials instead of rendering the generic gray avatar.
  return body?.data?.url && !body?.data?.is_silhouette ? body.data.url : null;
}

async function migrate() {
  console.log('Starting facebook page pictures migration...');

  console.log('Adding page_picture_url column...');
  await sql`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS page_picture_url TEXT`;

  const rows = await sql`
    SELECT page_id, page_name, access_token
    FROM facebook_pages
    WHERE page_picture_url IS NULL
  `;
  console.log(`Backfilling pictures for ${rows.length} page(s)...`);
  for (const row of rows) {
    try {
      const token = decryptPageToken(row.access_token);
      const picture = await fetchPagePictureUrl(row.page_id, token);
      if (picture) {
        await sql`UPDATE facebook_pages SET page_picture_url = ${picture} WHERE page_id = ${row.page_id}`;
        console.log(`  ${row.page_name}: picture stored`);
      } else {
        console.log(`  ${row.page_name}: no picture returned (silhouette or missing)`);
      }
    } catch (error) {
      console.log(`  ${row.page_name}: skipped — ${error.message}`);
    }
  }

  console.log('Done.');
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
