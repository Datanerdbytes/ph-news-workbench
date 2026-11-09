import type { NextResponse } from 'next/server';

/** Only same-origin paths may be used as a post-OAuth landing spot. */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * A completed grant lands in its platform studio; every other outcome returns
 * to the page that started the flow, or the platform default.
 */
export function resolveReturnPath(
  next: string | null,
  outcome: string,
  successPath: string,
  fallbackPath: string
): string {
  if (outcome === 'connected') return successPath;
  return safeNext(next) ?? fallbackPath;
}

/** Stamps the outcome flag onto a return path so the connection hook can toast it. */
export function returnUrl(
  request: Request,
  path: string,
  param: string,
  outcome: string
): URL {
  const url = new URL(path, request.url);
  url.searchParams.set(param, outcome);
  return url;
}

/** Clears the one-shot OAuth cookies once the callback has consumed them. */
export function clearOAuthCookies(
  response: NextResponse,
  names: string[]
): void {
  for (const name of names) {
    response.cookies.set(name, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
  }
}
