import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const invites = await sql`
    SELECT i.id, i.role, i.created_at, i.expires_at
    FROM workspace_invites i
    WHERE i.workspace_id = ${access.workspace.id}
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
    ORDER BY i.created_at DESC`;

  return NextResponse.json(
    { invites, role: access.workspace.role },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (access.workspace.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can invite editors." },
      { status: 403 }
    );
  }

  const token = randomBytes(18).toString("base64url");

  const rows = await sql`
    INSERT INTO workspace_invites (id, workspace_id, role, created_by, expires_at)
    VALUES (${token}, ${access.workspace.id}, 'editor', ${access.user.id}, now() + interval '14 days')
    RETURNING id, role, expires_at`;

  return NextResponse.json(rows[0], { status: 201 });
}
