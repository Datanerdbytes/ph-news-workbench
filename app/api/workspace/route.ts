import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isTextModel } from "@/lib/models";
import { defaultTextModel } from "@/lib/nim";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const members = await sql`
    SELECT count(*)::int AS count
    FROM workspace_members
    WHERE workspace_id = ${access.workspace.id}`;

  return NextResponse.json(
    {
      id: access.workspace.id,
      name: access.workspace.name,
      role: access.workspace.role,
      memberCount: members[0]?.count ?? 1,
      aiModel: access.workspace.aiModel,
      defaultModel: defaultTextModel(),
      user: { id: access.user.id, name: access.user.name },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function PATCH(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (access.workspace.role !== "owner") {
    return NextResponse.json(
      { error: "Only workspace owners can change workspace settings." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    aiModel?: unknown;
  } | null;

  const hasName = typeof body?.name === "string";
  const hasModel = body !== null && "aiModel" in body;
  if (!hasName && !hasModel) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  let name = access.workspace.name;
  if (hasName) {
    name = (body?.name as string).trim();
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json(
        { error: "Workspace name must be between 2 and 60 characters." },
        { status: 400 }
      );
    }
  }

  let aiModel: string | null | undefined;
  if (hasModel) {
    const value = body?.aiModel;
    if (value === null || value === "") {
      aiModel = null;
    } else if (typeof value === "string" && isTextModel(value)) {
      aiModel = value;
    } else {
      return NextResponse.json(
        { error: "That model is not available." },
        { status: 400 }
      );
    }
  }

  if (hasName && hasModel) {
    await sql`
      UPDATE workspaces
      SET name = ${name}, ai_model = ${aiModel}
      WHERE id = ${access.workspace.id}`;
  } else if (hasName) {
    await sql`
      UPDATE workspaces
      SET name = ${name}
      WHERE id = ${access.workspace.id}`;
  } else {
    await sql`
      UPDATE workspaces
      SET ai_model = ${aiModel}
      WHERE id = ${access.workspace.id}`;
  }

  return NextResponse.json({ id: access.workspace.id, name, aiModel });
}
