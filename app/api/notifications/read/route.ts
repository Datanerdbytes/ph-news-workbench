import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const body = await request.json().catch(() => null);

  if (body?.all === true) {
    await sql`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${access.user.id} AND read_at IS NULL`;
    return NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Pass a notification id, or { all: true }." },
      { status: 400 }
    );
  }

  await sql`
    UPDATE notifications SET read_at = now()
    WHERE user_id = ${access.user.id} AND id = ${id} AND read_at IS NULL`;

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } }
  );
}
