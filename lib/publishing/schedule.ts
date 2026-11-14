// Meta rejects Page post schedules outside this window.
export const MIN_SCHEDULE_MS = 10 * 60 * 1000;
export const MAX_SCHEDULE_MS = 75 * 24 * 60 * 60 * 1000;

export function parseScheduledPublishTime(value: unknown): {
  unix: number | null;
  error?: string;
} {
  if (value === undefined || value === null || value === '') {
    return { unix: null };
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return { unix: null, error: 'Pick a valid date and time to schedule.' };
  }

  const delta = date.getTime() - Date.now();
  if (delta < MIN_SCHEDULE_MS) {
    return {
      unix: null,
      error: 'Scheduled time must be at least 10 minutes from now.',
    };
  }
  if (delta > MAX_SCHEDULE_MS) {
    return {
      unix: null,
      error: 'Scheduling supports at most 75 days ahead.',
    };
  }

  return { unix: Math.floor(date.getTime() / 1000) };
}

export function scheduledFields(
  unix: number | null
): Record<string, string> {
  if (unix === null) return {};
  return {
    published: 'false',
    scheduled_publish_time: String(unix),
  };
}
