"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { useFacebookConnection } from "@/components/facebook-connection";
import { Button } from "@/components/ui/button";
import {
  PageAvatar,
  useManagedPages,
} from "@/components/publishing/page-selection";
import { cn } from "cn";
import { authClient } from "@/lib/auth-client";
import { validateNewPassword } from "@/lib/password";
import { textModelLabel, TEXT_MODELS } from "@/lib/models";
import { isThemeId, THEMES, type ThemeId } from "@/lib/themes";

type WorkspaceInfo = {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  aiModel: string | null;
  defaultModel: string;
};

/**
 * Picks which connected Page every composer starts on. Writes the workspace's
 * `is_primary` flag through the shared page-selection store, so the sidebar
 * and every composer reflect the change immediately.
 */
function DefaultPagePicker({ connected }: { connected: boolean }) {
  const { pages, setPrimaryPage } = useManagedPages();
  const [saving, setSaving] = useState(false);

  async function choose(pageId: string) {
    setSaving(true);
    try {
      await setPrimaryPage(pageId);
      toast.success("Default publishing page updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the default."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!connected || !pages.length) return null;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold">Default publishing page</p>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
        Every composer starts on this page. Switch pages per post right inside
        the composer.
      </p>
      <div
        role="radiogroup"
        aria-label="Default publishing page"
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            role="radio"
            aria-checked={page.primary}
            disabled={saving}
            onClick={() => void choose(page.id)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
              page.primary
                ? "border-ink bg-ink text-paper"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            <PageAvatar page={page} className="size-[18px] text-[8px]" />
            <span className="max-w-[150px] truncate">{page.name}</span>
            {page.primary && (
              <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider">
                Default
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("ink-white");
  // The <html> data-theme attribute derives from the saved preference state —
  // one writer, covering initial load, optimistic switches, and reverts.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [savingTheme, setSavingTheme] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const { data: session } = authClient.useSession();
  const connection = useFacebookConnection();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setWorkspace(data);
        setName(data.name ?? "");
        setModel(data.aiModel ?? data.defaultModel ?? "");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/preferences", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && isThemeId(data.theme)) {
          setTheme(data.theme);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function changeTheme(next: ThemeId) {
    if (next === theme || savingTheme) return;
    const previous = theme;
    setTheme(next);
    setSavingTheme(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the theme.");
      toast.success("Theme updated", {
        description: `Now using ${THEMES.find((option) => option.id === next)?.label}.`,
      });
    } catch (error) {
      setTheme(previous);
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingTheme(false);
    }
  }

  async function saveWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!workspace || trimmed === workspace.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the workspace.");
      setWorkspace((current) =>
        current ? { ...current, name: data.name } : current
      );
      toast.success("Workspace updated", {
        description: `Now called "${data.name}".`,
      });
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changeModel(next: string) {
    if (!workspace || next === model) return;
    const previous = model;
    setModel(next);
    setSavingModel(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiModel: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the model.");
      setWorkspace((current) =>
        current ? { ...current, aiModel: data.aiModel } : current
      );
      toast.success("AI model updated", {
        description: `New drafts use ${textModelLabel(next)}.`,
      });
    } catch (error) {
      setModel(previous);
      toast.error("Could not save", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingModel(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateNewPassword(newPassword, confirmPassword);
    if (validation) {
      toast.error("Check the new password", { description: validation });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message ?? "Could not update the password.");
      toast.success("Password updated", {
        description: "Other signed-in devices were signed out.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error("Could not update the password", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  const isOwner = workspace?.role === "owner";

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6 lg:py-7">
        <p className="eyebrow">Manage</p>
        <h1 className="page-title mt-1">Settings</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Workspace identity, your account and the publishing connection.
        </p>

        <section className="mt-5 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Workspace</h2>
          <p className="text-[10.5px] text-muted-foreground">
            {isOwner
              ? "Shown across the sidebar and shared with your team."
              : "Only workspace owners can rename the workspace."}
          </p>
          <form onSubmit={saveWorkspace} className="mt-3 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="workspace-name">
              Workspace name
            </label>
            <input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!isOwner || saving}
              maxLength={60}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            />
            <Button
              type="submit"
              disabled={!isOwner || saving || name.trim() === workspace?.name}
              className="h-9"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10.5px] text-muted-foreground">
            <span>
              Your role:{" "}
              <strong className="font-semibold text-foreground">
                {isOwner ? "Owner" : "Editor"}
              </strong>
            </span>
            <span>
              Members:{" "}
              <strong className="font-semibold text-foreground">
                {workspace?.memberCount ?? "—"}
              </strong>
            </span>
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Account</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                Name
              </dt>
              <dd className="mt-0.5 text-[12.5px] font-medium">
                {session?.user?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
                Email
              </dt>
              <dd className="mt-0.5 truncate text-[12.5px] font-medium">
                {session?.user?.email ?? "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Password</h2>
          <p className="text-[10.5px] text-muted-foreground">
            Changing the password signs out your other devices.
          </p>
          <form onSubmit={changePassword} className="mt-3 grid gap-2 sm:max-w-md">
            <input
              type="password"
              name="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={savingPassword}
              required
              placeholder="Current password"
              className="h-9 rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            />
            <input
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={savingPassword}
              required
              minLength={8}
              placeholder="New password (at least 8 characters)"
              className="h-9 rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            />
            <input
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={savingPassword}
              required
              placeholder="Confirm new password"
              className="h-9 rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            />
            <div>
              <Button
                type="submit"
                disabled={
                  savingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                className="h-9"
              >
                {savingPassword ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </section>

        <section className="mt-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Appearance</h2>
          <p className="text-[10.5px] text-muted-foreground">
            Color combination for your account. Applies everywhere you sign in.
          </p>
          <div
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Theme"
          >
            {THEMES.map((option) => {
              const selected = option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingTheme}
                  onClick={() => void changeTheme(option.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 ${
                    selected
                      ? "border-ring bg-brand-soft/60 ring-2 ring-ring/30"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  <span className="flex shrink-0 items-center -space-x-1">
                    <span
                      className="size-5 rounded-full border border-border"
                      style={{ background: option.background }}
                    />
                    <span
                      className="size-5 rounded-full border border-white/60"
                      style={{ background: option.brand }}
                    />
                    <span
                      className="size-5 rounded-full border border-white/60"
                      style={{ background: option.accent }}
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] font-medium">
                    {option.label}
                  </span>
                  {selected && (
                    <Check className="size-4 shrink-0 text-brand-accent" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">AI model</h2>
          <p className="text-[10.5px] text-muted-foreground">
            {isOwner
              ? "NVIDIA NIM model that writes drafts for this workspace."
              : "Only workspace owners can change the model."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="ai-model">
              AI model
            </label>
            <select
              id="ai-model"
              value={model}
              onChange={(event) => void changeModel(event.target.value)}
              disabled={!isOwner || savingModel || !model}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            >
              {TEXT_MODELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {savingModel && (
              <span className="text-[10.5px] text-muted-foreground">
                Saving…
              </span>
            )}
          </div>
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            {TEXT_MODELS.find((option) => option.id === model)?.detail ??
              "Served through the NVIDIA integrate API."}
          </p>
        </section>

        <section className="mt-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Publishing</h2>
          <p className="text-[10.5px] text-muted-foreground">
            The Facebook Page this workspace publishes to.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-[#1877f2] text-[11px] font-bold text-white">
              f
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold">
                {connection.loading
                  ? "Checking…"
                  : connection.connected
                    ? (connection.page?.name ?? "Facebook Page")
                    : "No Page connected"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {connection.connected
                  ? "Ready to publish and schedule"
                  : "Connect a Page to publish"}
              </p>
            </div>
            {connection.connected ? (
              <Button
                type="button"
                variant="outline"
                className="h-8"
                disabled={connection.refreshing}
                onClick={() => void connection.disconnect()}
              >
                {connection.refreshing ? "…" : "Disconnect"}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-8"
                disabled={connection.loading}
                onClick={connection.connect}
              >
                Connect
              </Button>
            )}
          </div>
          <DefaultPagePicker connected={connection.connected} />
        </section>

        <Link
          href="/team"
          className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-surface-3 text-secondary-foreground">
            <UserPlus className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold">Team &amp; invites</p>
            <p className="text-[10.5px] text-muted-foreground">
              Add editors and manage pending invites
            </p>
          </div>
          <ChevronRight className="size-4 text-faint" aria-hidden />
        </Link>
      </div>
    </AppFrame>
  );
}
