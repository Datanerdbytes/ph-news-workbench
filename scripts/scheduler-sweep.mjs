// Scheduling sweep against production. Runs on a timer via the launchd agent
// installed by scripts/install-scheduler.sh; the GitHub Actions cron stays as
// the backup for when this Mac is asleep.
//
// Reads CRON_SECRET from the environment (launchd passes --env-file=.env.local),
// so the secret never lives in the plist. If the secret is rotated on Vercel,
// update .env.local to match or every run will 401.

const PRODUCTION_URL = (
  process.env.PRODUCTION_URL ?? "https://ph-news-workbench.vercel.app"
).replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET?.trim();

if (!SECRET) {
  console.log(
    JSON.stringify({
      route: "scheduler-agent",
      event: "skipped",
      reason: "CRON_SECRET is not set in .env.local",
    })
  );
  process.exit(0);
}

try {
  const res = await fetch(`${PRODUCTION_URL}/api/schedule/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const body = await res.text();
  console.log(
    JSON.stringify({
      route: "scheduler-agent",
      event: "ran",
      status: res.status,
      result: body.slice(0, 200),
    })
  );
  if (!res.ok) process.exit(1);
} catch (error) {
  console.log(
    JSON.stringify({
      route: "scheduler-agent",
      event: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
}
