import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/session';
import { isThemeId, DEFAULT_THEME } from '@/lib/themes';

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorized();

  try {
    const result = await sql`
      SELECT theme FROM user_preferences WHERE user_id = ${user.id}
    `;
    return NextResponse.json(
      { theme: result[0]?.theme ?? DEFAULT_THEME },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error(JSON.stringify({
      route: 'preferences',
      event: 'get_error',
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorized();

  try {
    const body = await request.json();
    const { theme } = body;

    if (!isThemeId(theme)) {
      return NextResponse.json({ error: 'Unknown theme' }, { status: 400 });
    }

    await sql`
      INSERT INTO user_preferences (user_id, theme, updated_at)
      VALUES (${user.id}, ${theme}, now())
      ON CONFLICT (user_id) DO UPDATE
      SET theme = ${theme}, updated_at = now()
    `;

    return NextResponse.json({ theme });
  } catch (error) {
    console.error(JSON.stringify({
      route: 'preferences',
      event: 'update_error',
      error: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 });
  }
}
