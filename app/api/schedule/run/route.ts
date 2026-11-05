import { NextResponse } from "next/server";
import { hasCronSecret, isCronRequest } from "@/lib/cron";
import { requireWorkspace, unauthorized } from "@/lib/session";
import { publishDuePosts } from "@/lib/schedule-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isCronRequest(request)) {
    // Cron requests require CRON_SECRET to be set
    if (!hasCronSecret()) {
      return NextResponse.json(
        {
          error:
            "The scheduler is not configured: set CRON_SECRET so the cron endpoint can authenticate. Scheduled posts will not publish on a timer until it is set.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(await publishDuePosts({ source: "cron" }));
  }

  // Manual trigger by authenticated workspace user — always allowed
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  return NextResponse.json(
    await publishDuePosts({
      source: "manual",
      actorUserId: access.user.id,
    })
  );
}
