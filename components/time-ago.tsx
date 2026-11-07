"use client";

import { useEffect, useState } from "react";

interface TimeAgoProps {
  date: string | Date;
  className?: string;
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const [timeAgo, setTimeAgo] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => {
      const input = typeof date === "string" ? new Date(date) : date;
      const seconds = Math.floor((Date.now() - input.getTime()) / 1000);
      if (!Number.isFinite(seconds)) {
        setTimeAgo("");
        return;
      }
      if (seconds < 60) {
        setTimeAgo("just now");
      } else if (seconds < 3600) {
        setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
      } else if (seconds < 86400) {
        setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
      } else if (seconds < 604800) {
        setTimeAgo(`${Math.floor(seconds / 86400)}d ago`);
      } else {
        setTimeAgo(
          input.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
        );
      }
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [date]);

  if (!mounted) {
    return <span className={className} aria-hidden>—</span>;
  }

  // An unparseable date must not crash the tree — render it like the lib
  // helper does, with an empty label and no dateTime attribute.
  const parsed = new Date(date);
  return (
    <time
      className={className}
      dateTime={Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()}
    >
      {timeAgo}
    </time>
  );
}