import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drafts",
};

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
