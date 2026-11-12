"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md">
        <ErrorState
          title="Something went wrong"
          description="An unexpected error occurred. Your saved work is untouched — try again, and if it keeps failing check the workspace status."
          onRetry={reset}
        />
      </div>
    </main>
  );
}
