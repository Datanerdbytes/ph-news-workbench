import { neon } from "@neondatabase/serverless";
import { requireEnv } from "./env";

let client: ReturnType<typeof neon> | null = null;

function db() {
  if (!client) client = neon(requireEnv("DATABASE_URL"));
  return client;
}

const SEED_MARKER = "Regression seed";

/** Insert unread notifications for every member of the first workspace. */
export async function seedNotifications(count = 2): Promise<void> {
  const sql = db();
  const workspace = (
    (await sql`SELECT id FROM workspaces ORDER BY created_at LIMIT 1`) as unknown as {
      id: string;
    }[]
  )[0];
  const members = (await sql`
    SELECT user_id FROM workspace_members WHERE workspace_id = ${workspace.id}`) as unknown as {
    user_id: string;
  }[];

  for (const member of members) {
    for (let index = 0; index < count; index++) {
      const title = `${SEED_MARKER} ${index + 1}`;
      await sql`
        INSERT INTO notifications (workspace_id, user_id, type, title, body, link)
        VALUES (${workspace.id}, ${member.user_id}, 'scheduled_publish_success',
                ${title}, 'Seeded by the regression suite.', '/calendar')`;
    }
  }
}

/** Remove exactly what seedNotifications wrote. */
export async function clearSeededNotifications(): Promise<void> {
  await db()`DELETE FROM notifications WHERE title LIKE ${`${SEED_MARKER}%`}`;
}

/** The lockout spec locks a throwaway email — never leave it locked. */
export async function clearSignInLock(email: string): Promise<void> {
  await db()`DELETE FROM sign_in_locks WHERE email = ${email}`;
}
