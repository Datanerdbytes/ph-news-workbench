import { NextResponse } from 'next/server';
import { FacebookApiError, redactTokens } from '@/lib/facebook';

export function facebookErrorResponse(
  error: unknown,
  code: string,
  fallback: string
): NextResponse {
  if (error instanceof FacebookApiError) {
    const permissionIssue =
      error.code === 10 || error.code === 200 || error.code === 190;

    if (permissionIssue) {
      return NextResponse.json(
        {
          error: `${redactTokens(error.message)} Reconnect the Page to refresh its permissions.`,
          code: 'permission',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: redactTokens(error.message), code },
      { status: 502 }
    );
  }

  if (error instanceof Error && error.message) {
    return NextResponse.json(
      { error: redactTokens(error.message), code },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: fallback, code }, { status: 500 });
}
