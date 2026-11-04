import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { FacebookConnectionProvider } from "@/components/facebook-connection";
import { SessionProvider } from "@/components/session-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
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
  themeColor: "#f6f3eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider>
          <FacebookConnectionProvider>{children}</FacebookConnectionProvider>
        </SessionProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
