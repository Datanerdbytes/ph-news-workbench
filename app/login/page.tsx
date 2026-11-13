"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FacebookMark } from "@/components/facebook-mark";
import { AuthBrand } from "@/components/auth-brand";
import { AuthAlert } from "@/components/auth-alert";
import { PasswordInput } from "@/components/auth-password-input";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteState, setInviteState] = useState<"idle" | "accepted" | "failed">(
    "idle",
  );
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    setInviteToken(token);
    setInviteCode(token);
    setMode("signup");
  }, []);

  // A signed-in visitor opening an invite link: accept it immediately and
  // report the outcome instead of showing them a sign-in form.
  useEffect(() => {
    if (!inviteToken || sessionPending || !session || inviteState !== "idle")
      return;
    void acceptInvite().then((ok) => setInviteState(ok ? "accepted" : "failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken, sessionPending, session, inviteState]);

  // Move focus to the error so sighted keyboard users don't have to hunt
  // for it (screen readers already announce the role="alert").
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function acceptInvite(): Promise<boolean> {
    if (!inviteToken) return true;
    try {
      const res = await fetch("/api/workspace/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function enter() {
    if (inviteToken) {
      const ok = await acceptInvite();
      if (!ok) {
        setError(
          "This invite is invalid or has expired. Ask the workspace owner for a fresh link — your account was created, but the workspace wasn't joined.",
        );
        return;
      }
    }
    router.push("/platforms");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "signup") {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { body: { inviteCode } },
      });
      setLoading(false);
      if (error) setError(error.message ?? "Account creation failed");
      else await enter();
      return;
    }

    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      // Sign-in stays closed until the email is verified; offer a resend
      // (the workspace uses a log-only mailer — lib/mailer.ts).
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(true);
        setError(
          "Your email isn't verified yet. Open the verification link from when you signed up — links aren't emailed, so ask the workspace owner to share it with you.",
        );
      } else {
        setError(error.message ?? "Login failed");
      }
    } else {
      await enter();
    }
  }

  async function resendVerification() {
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/login",
    });
    setResending(false);
    if (error) {
      setError(error.message ?? "Could not generate the verification link");
    } else {
      toast.success("Verification link generated", {
        description:
          "Links aren't emailed — ask the workspace owner to share it with you.",
      });
      setNeedsVerification(false);
      setError("");
    }
  }

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError("");
    setNeedsVerification(false);
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-paper lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 font-heading text-[30rem] leading-none text-paper/[0.04]"
        >
          PH
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-brand/10 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="relative grid size-9 place-items-center rounded-[7px] bg-paper text-ink">
            <span className="font-heading text-[17px] leading-none">PH</span>
            <span className="absolute inset-x-1.5 bottom-1 h-[3px] rounded-full bg-brand" />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-[19px] leading-none">
              News Workbench
            </span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-paper/50">
              Philippine desk
            </span>
          </span>
        </div>

        <div className="relative max-w-lg">
          <p className="eyebrow text-brand-soft">
            Philippine news, considered
          </p>
          <h1 className="mt-5 text-balance font-heading text-5xl leading-[1.05] tracking-[-0.02em] xl:text-6xl">
            The day&rsquo;s news, ready to publish.
          </h1>          <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/70">
            Draft from trusted Philippine outlets, shape the voice, add an
            illustration, and prepare a post for your Facebook Page — all in one
            desk.
          </p>
          <div className="mt-8 h-px w-16 bg-brand" />
          <ul className="mt-8 space-y-3 text-sm text-paper/75">
            <li className="flex gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <strong className="font-medium text-paper">
                  Feed-first story queue.
                </strong>{" "}
                Inquirer, Rappler, and Philstar in one queue.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <strong className="font-medium text-paper">An editorial voice.</strong>{" "}
                English or Tagalog, refined in place by the AI assistant.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <strong className="font-medium text-paper">Built for Facebook.</strong>{" "}
                See the post as readers will before you publish.
              </span>
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-paper/35">
          <span>Philippine News Workbench</span>
          <span>Est. 2026</span>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <AuthBrand className="lg:hidden" />

          <p className="eyebrow text-brand">
            {mode === "signup" ? "Invite only" : "Welcome back"}
          </p>
          {/* The only h1 on mobile — the marketing headline lives in the
              desktop-only panel. */}
          <h1 className="mt-2 text-balance font-heading text-3xl tracking-[-0.02em]">
            {mode === "signup"
              ? "Join the workbench"
              : "Sign in to the workbench"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "signup"
              ? "Create a desk account with the invite code from the workspace owner."
              : "Use your desk account to open the news queue and drafts."}
          </p>

          {!sessionPending && session ? (
            <div className="mt-7 space-y-4">
              {inviteToken && (
                <AuthAlert kind={inviteState === "failed" ? "error" : "status"}>
                  {inviteState === "accepted"
                    ? "Invite accepted — this desk is now part of your workspace."
                    : inviteState === "failed"
                      ? "This invite is invalid or has expired. Ask the workspace owner for a fresh link."
                      : "Accepting the invite…"}
                </AuthAlert>
              )}
              <p className="text-sm text-muted-foreground">
                You&apos;re already signed in
                {session.user?.email ? ` as ${session.user.email}` : ""}.
              </p>
              <Link
                href="/platforms"
                className={buttonVariants({
                  variant: "brand",
                  className: "h-10 w-full",
                })}
              >
                Go to the desk
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-10 bg-card"
                />
              </div>
            )}
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                required
                minLength={mode === "signup" ? 8 : undefined}
                className="h-10 bg-card pr-10"
              />
            </div>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="inviteCode">Invite code</Label>
                <Input
                  id="inviteCode"
                  type="text"
                  autoComplete="off"
                  placeholder="Provided by the owner"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className="h-10 bg-card"
                />
              </div>
            )}

            {error && (
              <div
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive focus-visible:outline-none"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            {needsVerification && (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full"
                disabled={resending}
                onClick={() => void resendVerification()}
              >
                {resending ? "Sending…" : "Resend verification email"}
              </Button>
            )}

            <Button
              type="submit"
              variant="brand"
              className="h-10 w-full"
              disabled={loading}
            >
              {loading
                ? mode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </Button>

            {mode === "signin" && (
              <p className="text-center text-[11.5px] text-muted-foreground">
                <Link
                  href="/forgot-password"
                  className="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Forgot your password?
                </Link>
              </p>
            )}
          </form>
          )}

          <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New to the workbench?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              className="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {mode === "signup" ? "Sign in" : "Join with an invite code"}
            </button>
          </p>

          <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            Accounts are created by invitation.
          </div>

          <div className="mt-8 flex items-center gap-2 border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
            <FacebookMark className="size-4" />
            Publishing to your connected Facebook Page.
          </div>
        </div>
      </section>
    </main>
  );
}
