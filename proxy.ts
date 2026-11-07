import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Paths reachable without a session. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const session = request.cookies.get("better-auth.session_token");
  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path.startsWith("/api/");
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
