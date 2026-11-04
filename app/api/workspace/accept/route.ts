import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type InviteRow = { id: string; workspace_id: string };

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
  }

  const invites = (await sql`
    SELECT id, workspace_id FROM workspace_invites
    WHERE id = ${token} AND accepted_at IS NULL AND expires_at > now()`) as unknown as InviteRow[];

  if (!invites.length) {
    return NextResponse.json(
      { error: "This invite is invalid or has expired." },
      { status: 410 }
    );
  }

  const invite = invites[0];

  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${invite.workspace_id}, ${user.id}, 'editor')
    ON CONFLICT (workspace_id, user_id) DO NOTHING`;

  await sql`
    UPDATE workspace_invites
    SET accepted_by = ${user.id}, accepted_at = now()
    WHERE id = ${token} AND accepted_at IS NULL`;

  // A freshly created account gets a personal workspace; discard it once the
  // account joins a team so the invited workspace is the one they open.
  await sql`
    DELETE FROM workspaces w
    WHERE w.id = ${`ws_${user.id}`}
      AND w.owner_id = ${user.id}
      AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.workspace_id = w.id)`;

  const workspace = await sql`
    SELECT name FROM workspaces WHERE id = ${invite.workspace_id}`;

  return NextResponse.json({
    workspaceId: invite.workspace_id,
    name: workspace[0]?.name ?? "Workspace",
  });
}
