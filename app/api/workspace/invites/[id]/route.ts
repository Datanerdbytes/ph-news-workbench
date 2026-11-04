import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (access.workspace.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can revoke invites." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const rows = await sql`
    DELETE FROM workspace_invites
    WHERE id = ${id} AND workspace_id = ${access.workspace.id}
    RETURNING id`;

  if (!rows.length) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
