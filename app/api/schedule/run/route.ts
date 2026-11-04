import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { publishDuePosts } from "@/lib/schedule-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isCronRequest(request)) {
    return NextResponse.json(await publishDuePosts({ source: "cron" }));
  }

  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  return NextResponse.json(
    await publishDuePosts({
      source: "manual",
      actorUserId: access.user.id,
    })
  );
}
