"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthAlert } from "@/components/auth-alert";
import { AuthBrand } from "@/components/auth-brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FacebookMark } from "@/components/facebook-mark";
import { cn } from "cn";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) setError(error.message ?? "Could not start the reset");
    else setSent(true);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <AuthBrand />

        <p className="eyebrow text-brand">Password reset</p>
        <h1 className="mt-2 text-balance font-heading text-3xl tracking-[-0.02em]">
          Forgot your password?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter your desk email and we&rsquo;ll start a password reset for it.
        </p>

        {sent ? (
          <div className="mt-7 space-y-4">
            <AuthAlert kind="status">
              If that email belongs to a workbench account, a reset link was
              generated for it. Links aren&rsquo;t emailed — ask the workspace
              owner to share it with you.
            </AuthAlert>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "brand" }),
                "h-10 w-full"
              )}
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-card"
              />
            </div>

            {error && <AuthAlert>{error}</AuthAlert>}

            <Button
              type="submit"
              variant="brand"
              className="h-10 w-full"
              disabled={loading}
            >
              {loading ? "Starting reset…" : "Start password reset"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
          Remembered it after all?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Sign in
          </Link>
        </p>

        <div className="mt-8 flex items-center gap-2 border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
          <FacebookMark className="size-4" />
          Publishing to your connected Facebook Page.
        </div>
      </div>
    </main>
  );
}
