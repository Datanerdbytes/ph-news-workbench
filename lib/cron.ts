export function hasCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret);
}

export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
