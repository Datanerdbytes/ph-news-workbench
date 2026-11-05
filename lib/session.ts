import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspaces";

export async function requireUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function requireWorkspace(request: Request) {
  const user = await requireUser(request);
  if (!user) return null;
  const workspace = await getWorkspaceForUser(user);
  return { user, workspace };
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Authenticated user in a workspace where they are an owner. Returns null when
 * unauthenticated (call unauthorized()), or a 403 NextResponse when
 * authenticated but not an owner.
 */
export async function requireOwner(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return null;
  if (access.workspace.role !== "owner") {
    return NextResponse.json(
      { error: "Only workspace owners can manage sources" },
      { status: 403 },
    );
  }
  return access;
}
