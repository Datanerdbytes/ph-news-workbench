export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const onVercel = Boolean(process.env.VERCEL);
  const production = process.env.NODE_ENV === "production";

  // On Vercel the cron declared in vercel.json is the executor — a timer
  // inside a serverless function is not reliable. Anywhere else (self-hosted
  // or a long-running Node server) the in-process timer is the right answer.
  if (production && onVercel) return;

  const scheduler = await import("./lib/local-scheduler");
  scheduler.startLocalScheduler();
}
