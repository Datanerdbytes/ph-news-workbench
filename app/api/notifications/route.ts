import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireWorkspace, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "15"), 1),
    50
  );
  // Cursor pagination by id: `before` is the last id already shown.
  const beforeParam = Number(url.searchParams.get("before") ?? "");
  const before =
    Number.isFinite(beforeParam) && beforeParam > 0 ? beforeParam : null;

  const rows = (await sql`
    SELECT id, type, title, body, link,
           read_at AS "readAt", created_at AS "createdAt"
    FROM notifications
    WHERE user_id = ${access.user.id}
      ${before ? sql`AND id < ${before}` : sql``}
    ORDER BY id DESC
    LIMIT ${limit + 1}`) as unknown as NotificationRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.length ? page[page.length - 1] : null;
  const nextCursor = hasMore && last ? Number(last.id) : null;

  const unreadRows = (await sql`
    SELECT count(*)::int AS unread FROM notifications
    WHERE user_id = ${access.user.id} AND read_at IS NULL`) as unknown as {
    unread: number;
  }[];

  return NextResponse.json(
    { rows: page, unread: unreadRows[0]?.unread ?? 0, nextCursor, hasMore },
    { headers: { "cache-control": "no-store" } }
  );
}
