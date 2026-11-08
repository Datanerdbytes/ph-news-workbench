import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { FacebookConnectionProvider } from "@/components/facebook-connection";
import { InstagramConnectionProvider } from "@/components/instagram-connection";
import { SessionProvider } from "@/components/session-provider";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_THEME, getTheme, isThemeId } from "@/lib/themes";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Philippine News Workbench",
    template: "%s · PH News Workbench",
  },
  description:
    "Turn Philippine news into considered Facebook posts — draft, illustrate, and prepare to publish.",
  applicationName: "PH News Workbench",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

async function getUserTheme(): Promise<string> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return DEFAULT_THEME;
    const result = await sql`
      SELECT theme FROM user_preferences WHERE user_id = ${session.user.id}
    `;
    const theme = result[0]?.theme;
    return isThemeId(theme) ? theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = getTheme(await getUserTheme());

  return (
    <html
      lang="en"
      data-theme={theme.id}
      className={`${manrope.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider>
          <FacebookConnectionProvider>
            <InstagramConnectionProvider>{children}</InstagramConnectionProvider>
          </FacebookConnectionProvider>
        </SessionProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
