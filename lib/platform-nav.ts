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

// The platform studios — routes that publish to their own channel/account
// rather than the shared Facebook Page. Inside one of these sections the
// chrome reports that platform's own state (sidebar card, quick-nav, CTA).
export type PlatformSection = "youtube" | "tiktok" | "instagram";

const PLATFORM_STUDIO_ROUTES: Record<PlatformSection, string> = {
  youtube: "/youtube",
  tiktok: "/tiktok",
  instagram: "/instagram",
};

export function platformSectionFromPath(pathname: string): PlatformSection | null {
  for (const [section, route] of Object.entries(PLATFORM_STUDIO_ROUTES) as [
    PlatformSection,
    string,
  ][]) {
    if (pathname === route || pathname.startsWith(`${route}/`)) return section;
  }
  return null;
}