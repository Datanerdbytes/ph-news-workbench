import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const members = await sql`
    SELECT m.user_id, m.role, m.created_at, u.name, u.email
    FROM workspace_members m
    JOIN "user" u ON u.id = m.user_id
    WHERE m.workspace_id = ${access.workspace.id}
    ORDER BY m.created_at ASC`;

  return NextResponse.json(
    { members, role: access.workspace.role },
    { headers: { "cache-control": "no-store" } }
  );
}
