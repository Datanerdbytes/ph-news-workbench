import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video downloads",
  description:
    "A local-first workspace for saving videos from YouTube, Facebook, Instagram, X, Reddit, and TikTok.",
};

export default function DownloadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
