// Facebook tools belong to the Facebook workbench only. The platform studios
// and the cross-platform Platforms hub must not show Facebook-only nav.
const FACEBOOK_TOOLS_HIDDEN_ON = [
  "/platforms",
  "/instagram",
  "/tiktok",
  "/youtube",
];

export function facebookToolsVisible(pathname: string): boolean {
  return !FACEBOOK_TOOLS_HIDDEN_ON.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}