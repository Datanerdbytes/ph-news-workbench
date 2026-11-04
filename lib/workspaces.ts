import { sql } from "@/lib/db";

export type Workspace = {
  id: string;
  name: string;
  role: string;
  ownerId: string;
  aiModel: string | null;
};

type Row = {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  ai_model: string | null;
};

export async function getWorkspaceForUser(user: {
  id: string;
  name?: string | null;
}): Promise<Workspace> {
  const rows = (await sql`
    SELECT w.id, w.name, w.owner_id, m.role, w.ai_model
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${user.id}
    ORDER BY m.created_at ASC, w.created_at ASC
    LIMIT 1`) as unknown as Row[];

  if (rows.length) {
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      ownerId: row.owner_id,
      aiModel: row.ai_model,
    };
  }

  const id = `ws_${user.id}`;
  const name = user.name?.trim()
    ? `${user.name.trim()}'s workspace`
    : "Personal workspace";

  await sql`
    INSERT INTO workspaces (id, name, owner_id)
    VALUES (${id}, ${name}, ${user.id})
    ON CONFLICT (id) DO NOTHING`;
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${id}, ${user.id}, 'owner')
    ON CONFLICT DO NOTHING`;

  return { id, name, role: "owner", ownerId: user.id, aiModel: null };
}
