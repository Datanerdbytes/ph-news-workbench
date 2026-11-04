"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { useFacebookConnection } from "@/components/facebook-connection";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { textModelLabel, TEXT_MODELS } from "@/lib/models";

type WorkspaceInfo = {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  aiModel: string | null;
  defaultModel: string;
};

type ComposerProviderOption = {
  id: string;
  label: string;
  detail: string;
  baseUrl: string | null;
  envKeyVar: string | null;
  envKeyAvailable: boolean;
  freeTextModel: boolean;
  models: { id: string; label: string; detail: string }[];
};

type ComposerSettingsResponse = {
  configured: boolean;
  provider?: string;
  model?: string;
  baseUrl?: string | null;
  keySet?: boolean;
  providers: ComposerProviderOption[];
  error?: string;
};

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [composerProviders, setComposerProviders] = useState<ComposerProviderOption[]>([]);
  const [composerProviderId, setComposerProviderId] = useState('huggingface');
  const [composerModel, setComposerModel] = useState('');
  const [composerBaseUrl, setComposerBaseUrl] = useState('');
  const [composerKey, setComposerKey] = useState('');
  const [composerKeySet, setComposerKeySet] = useState(false);
  const [loadingComposer, setLoadingComposer] = useState(true);
  const [savingComposer, setSavingComposer] = useState(false);
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
    fetch('/api/settings/llm', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const data = (await res.json()) as ComposerSettingsResponse;
        if (!res.ok) {
          throw new Error(data.error ?? 'Could not load composer LLM settings.');
        }
        return data;
      })
      .then((data) => {
        const providers = Array.isArray(data.providers) ? data.providers : [];
        setComposerProviders(providers);
        const initialProvider =
          providers.find((option) => option.id === data.provider) ??
          providers.find((option) => option.id === 'huggingface') ??
          providers[0];
        if (initialProvider) {
          setComposerProviderId(initialProvider.id);
          setComposerModel(
            data.model ??
              initialProvider.models[0]?.id ??
              ''
          );
        }
        setComposerBaseUrl(data.baseUrl ?? '');
        setComposerKeySet(data.keySet ?? false);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        toast.error('Could not load composer settings', {
          description:
            error instanceof Error ? error.message : 'Please try again.',
        });
      })
      .finally(() => setLoadingComposer(false));
    return () => controller.abort();
  }, []);

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

  function changeComposerProvider(next: string) {
    const provider = composerProviders.find((option) => option.id === next);
    setComposerProviderId(next);
    setComposerModel(provider?.models[0]?.id ?? '');
    setComposerKey('');
    setComposerKeySet(false);
  }

  async function saveComposerSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !isOwner) return;
    setSavingComposer(true);
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: composerProviderId,
          model: composerModel,
          baseUrl: composerProviderId === 'custom' ? composerBaseUrl : undefined,
          apiKey: composerKey,
        }),
      });
      const data = (await res.json()) as {
        provider?: string;
        model?: string;
        baseUrl?: string | null;
        keySet?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Could not save composer settings.');
      setComposerProviderId(data.provider ?? composerProviderId);
      setComposerModel(data.model ?? composerModel);
      setComposerBaseUrl(data.baseUrl ?? '');
      setComposerKeySet(data.keySet ?? false);
      setComposerKey('');
      toast.success('Video composer settings saved');
    } catch (error) {
      toast.error('Could not save composer settings', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSavingComposer(false);
    }
  }

  const isOwner = workspace?.role === "owner";
  const selectedComposerProvider = composerProviders.find(
    (option) => option.id === composerProviderId
  );

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
          <h2 className="text-[13px] font-semibold">Video composer LLM</h2>
          <p className="text-[10.5px] text-muted-foreground">
            {isOwner
              ? 'A dedicated model generates HTML compositions for Reels; it does not change your post-drafting model.'
              : 'Only workspace owners can change the video composer provider.'}
          </p>
          <form onSubmit={saveComposerSettings} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="composer-provider"
                  className="eyebrow text-muted-foreground"
                >
                  Provider
                </label>
                <select
                  id="composer-provider"
                  value={composerProviderId}
                  onChange={(event) => changeComposerProvider(event.target.value)}
                  disabled={!isOwner || loadingComposer || savingComposer}
                  className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                >
                  {composerProviders.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="composer-model"
                  className="eyebrow text-muted-foreground"
                >
                  Model
                </label>
                {selectedComposerProvider?.freeTextModel ? (
                  <input
                    id="composer-model"
                    value={composerModel}
                    onChange={(event) => setComposerModel(event.target.value)}
                    disabled={!isOwner || loadingComposer || savingComposer}
                    placeholder="Model ID"
                    className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                  />
                ) : (
                  <select
                    id="composer-model"
                    value={composerModel}
                    onChange={(event) => setComposerModel(event.target.value)}
                    disabled={
                      !isOwner ||
                      loadingComposer ||
                      savingComposer ||
                      !selectedComposerProvider?.models.length
                    }
                    className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                  >
                    {selectedComposerProvider?.models.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {selectedComposerProvider?.freeTextModel && (
              <div>
                <label
                  htmlFor="composer-base-url"
                  className="eyebrow text-muted-foreground"
                >
                  Base URL
                </label>
                <input
                  id="composer-base-url"
                  type="url"
                  value={composerBaseUrl}
                  onChange={(event) => setComposerBaseUrl(event.target.value)}
                  disabled={!isOwner || loadingComposer || savingComposer}
                  placeholder="https://your-provider.example/v1"
                  className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                />
              </div>
            )}
            <div>
              <label
                htmlFor="composer-api-key"
                className="eyebrow text-muted-foreground"
              >
                API key
              </label>
              <input
                id="composer-api-key"
                type="password"
                autoComplete="new-password"
                value={composerKey}
                onChange={(event) => setComposerKey(event.target.value)}
                disabled={!isOwner || loadingComposer || savingComposer}
                placeholder={composerKeySet ? 'Saved — leave blank to keep it' : 'Enter a provider key'}
                className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              />
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                {composerKeySet
                  ? 'A key is saved securely. It is never returned to the browser.'
                  : selectedComposerProvider?.envKeyVar
                    ? selectedComposerProvider.envKeyAvailable
                      ? `No workspace key is saved. The server has ${selectedComposerProvider.envKeyVar} configured as a fallback.`
                      : `No key is configured. Enter your ${selectedComposerProvider.label} API key to save these settings.`
                    : 'No key is configured. Enter an API key to save these settings.'}
              </p>
            </div>
            {selectedComposerProvider?.detail && (
              <p className="text-[10.5px] text-muted-foreground">
                {selectedComposerProvider.detail}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                variant="brand"
                disabled={
                  !isOwner ||
                  loadingComposer ||
                  savingComposer ||
                  !composerProviderId ||
                  !composerModel
                }
              >
                {savingComposer ? 'Saving…' : 'Save composer settings'}
              </Button>
              {loadingComposer && (
                <span className="text-[10.5px] text-muted-foreground">
                  Loading settings…
                </span>
              )}
            </div>
          </form>
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
