import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-secondary">
          <Compass className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-2xl">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This page doesn&apos;t exist or was moved.
        </p>
        <Link
          href="/"
          className={buttonVariants({
            variant: "brand",
            size: "sm",
            className: "mt-4",
          })}
        >
          Back to the story queue
        </Link>
      </div>
    </main>
  );
}
