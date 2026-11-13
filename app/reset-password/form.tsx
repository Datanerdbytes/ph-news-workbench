"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { validateNewPassword } from "@/lib/password";
import { AuthAlert } from "@/components/auth-alert";
import { AuthBrand } from "@/components/auth-brand";
import { PasswordInput } from "@/components/auth-password-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

/** better-auth redirects here from GET /api/auth/reset-password/:token with
 * either the reset token or an error marker. */
const ERROR_LABELS: Record<string, string> = {
  INVALID_TOKEN: "This reset link is invalid or has already been used.",
  TOKEN_EXPIRED: "This reset link has expired. Start a new reset to continue.",
};

function labelForCode(code?: string): string {
  return (code && ERROR_LABELS[code]) || "This reset link is not valid.";
}

export function ResetPasswordForm({
  token,
  error,
}: {
  token?: string;
  error?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);

  const linkError = error ? labelForCode(error) : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateNewPassword(password, confirm);
    if (validation) {
      setFieldError(validation);
      return;
    }
    setFieldError("");

    setLoading(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);

    if (error) {
      setFieldError(
        error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN"
          ? labelForCode(error.code)
          : error.message ?? "Could not reset the password",
      );
      return;
    }

    toast.success("Password updated", {
      description: "Sign in with your new password.",
    });
    router.push("/login");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <AuthBrand />

        <p className="eyebrow text-brand">Password reset</p>
        <h1 className="mt-2 text-balance font-heading text-3xl tracking-[-0.02em]">
          Choose a new password
        </h1>

        {linkError ? (
          <div className="mt-7 space-y-4">
            <AuthAlert>{linkError}</AuthAlert>
            <Link
              href="/forgot-password"
              className={cn(
                buttonVariants({ variant: "brand" }),
                "h-10 w-full"
              )}
            >
              Start a new reset
            </Link>
          </div>
        ) : !token ? (
          <div className="mt-7 space-y-4">
            <AuthAlert>
              This page needs a reset link token. Start a new reset to get one.
            </AuthAlert>
            <Link
              href="/forgot-password"
              className={cn(
                buttonVariants({ variant: "brand" }),
                "h-10 w-full"
              )}
            >
              Start a new reset
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={setPassword}
                required
                minLength={8}
                className="h-10 bg-card pr-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                placeholder="Repeat the new password"
                value={confirm}
                onChange={setConfirm}
                required
                className="h-10 bg-card pr-10"
              />
            </div>

            {fieldError && <AuthAlert>{fieldError}</AuthAlert>}

            <Button
              type="submit"
              variant="brand"
              className="h-10 w-full"
              disabled={loading}
            >
              {loading ? "Updating password…" : "Update password"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
          <Link
            href="/login"
            className="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Back to sign in
          </Link>
        </p>

        <div className="mt-8 flex items-center gap-2 border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Passwords are hashed and never stored in plain text.
        </div>
      </div>
    </main>
  );
}
