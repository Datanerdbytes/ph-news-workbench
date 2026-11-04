import { publishDuePosts } from "@/lib/schedule-worker";

const INTERVAL_MS = 60_000;

type SchedulerGlobal = typeof globalThis & {
  __phScheduleTimer?: ReturnType<typeof setInterval>;
};

async function tick() {
  try {
    const result = await publishDuePosts({ source: "scheduler" });
    if (result.due > 0) {
      console.log(
        JSON.stringify({ route: "scheduler", event: "ran", ...result })
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        route: "scheduler",
        event: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

export function startLocalScheduler() {
  const holder = globalThis as SchedulerGlobal;
  if (holder.__phScheduleTimer) return;

  holder.__phScheduleTimer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  holder.__phScheduleTimer.unref?.();

  console.log(
    JSON.stringify({ route: "scheduler", event: "started", intervalMs: INTERVAL_MS })
  );
  void tick();
}
