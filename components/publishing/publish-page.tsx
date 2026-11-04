'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FacebookMark } from '@/components/facebook-mark';
import { AppFrame } from '@/components/app-frame';
import { useFacebookConnection } from '@/components/facebook-connection';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

export function PublishPage({
  eyebrow,
  title,
  description,
  endpoint,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  endpoint: string;
  children: React.ReactNode;
}) {
  const connection = useFacebookConnection();

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-brand">{eyebrow}</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <code className="self-start rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            {endpoint}
          </code>
        </header>

        {connection.loading ? (
          <div className="mt-6 grid gap-3">
            <div className="h-9 w-52 animate-pulse rounded-lg bg-surface-3" />
            <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : connection.connected ? (
          <div className="mt-6">{children}</div>
        ) : (
          <ConnectGate
            configured={connection.configured}
            unreachable={connection.unreachable}
            onConnect={connection.connect}
          />
        )}
      </div>
    </AppFrame>
  );
}

function ConnectGate({
  configured,
  unreachable,
  onConnect,
}: {
  configured: boolean;
  unreachable: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center paper-shadow-sm">
      <span className="mx-auto grid size-10 place-items-center">
        <FacebookMark className="size-7" />
      </span>
      <h2 className="mt-3 text-sm font-semibold">
        {unreachable
          ? 'Connection status unavailable'
          : configured
            ? 'Connect a Facebook Page'
            : 'Facebook is not configured'}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
        {unreachable
          ? 'Reload the page to check the Page connection again.'
          : configured
            ? 'Publishing tools post with the Page access token, so a Page must be connected first.'
            : 'Add the Facebook app credentials to this environment before publishing.'}
      </p>
      {configured && !unreachable && (
        <Button variant="brand" size="sm" className="mt-4" onClick={onConnect}>
          Connect Facebook
        </Button>
      )}
    </div>
  );
}

export type ManagedPage = { id: string; name: string; primary: boolean };

export function useManagedPages(enabled = true) {
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/facebook/pages', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { pages: [] }))
      .then((data: { pages?: ManagedPage[] }) => {
        const list = Array.isArray(data.pages) ? data.pages : [];
        setPages(list);
        setSelected((current) => {
          if (current.length) return current;
          const primary = list.find((page) => page.primary) ?? list[0];
          return primary ? [primary.id] : [];
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  return { pages, selected, toggle, loading };
}

export function ComposerCard({
  icon,
  title,
  badge,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <span className="text-brand" aria-hidden>
          {icon}
        </span>
        <span className="text-sm font-semibold">{title}</span>
        {badge && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-4">{children}</div>
        <aside className="space-y-3 text-[11px] leading-relaxed text-muted-foreground">
          {aside}
        </aside>
      </div>
    </section>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="eyebrow text-muted-foreground">
        {children}
      </label>
      {hint && <span className="text-[10px] text-faint">{hint}</span>}
    </div>
  );
}

export const textareaClass =
  'mt-1.5 w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

export const inputClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

export function FilePicker({
  id,
  accept,
  label,
  hint,
  file,
  onPick,
  onClear,
  icon,
}: {
  id: string;
  accept: string;
  label: string;
  hint?: string;
  file: File | null;
  onPick: (file: File | null) => void;
  onClear?: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} hint={hint}>
        File
      </FieldLabel>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-2 py-1.5">
        <label
          htmlFor={id}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>{icon}</span>
          <span className="truncate">{file ? file.name : label}</span>
        </label>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            onPick(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        {file && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function PageSelector({
  pages,
  selected,
  onToggle,
  loading,
}: {
  pages: ManagedPage[];
  selected: string[];
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div>
      <FieldLabel hint="Crosspost">Pages</FieldLabel>
      {loading ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Loading managed Pages…
        </p>
      ) : pages.length <= 1 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Posting to {pages[0]?.name ?? 'the connected Page'}.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {pages.map((page) => (
            <li key={page.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={selected.includes(page.id)}
                  onChange={() => onToggle(page.id)}
                  className="size-3.5 accent-[var(--brand)]"
                />
                <span className="min-w-0 flex-1 truncate">{page.name}</span>
                {page.primary && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-faint">
                    Primary
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScheduleField({
  enabled,
  onEnabled,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
          className="size-3.5 accent-[var(--brand)]"
        />
        Schedule with Facebook
      </label>
      {enabled && (
        <>
          <input
            type="datetime-local"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cn(inputClass, 'mt-1.5')}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            10 minutes to 75 days from now. Facebook publishes it from its own
            queue.
          </p>
        </>
      )}
    </div>
  );
}

export function defaultScheduleValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type PublishResult = {
  page: { id: string; name: string };
  ok: boolean;
  id?: string;
  permalink?: string | null;
  error?: string;
};

export function ResultList({ results }: { results: PublishResult[] }) {
  if (!results.length) return null;
  return (
    <ul className="space-y-1.5">
      {results.map((result) => (
        <li
          key={result.page.id}
          className={cn(
            'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px]',
            result.ok
              ? 'border-success/30 bg-success/5'
              : 'border-destructive/30 bg-destructive/5'
          )}
        >
          <span
            className={cn(
              'mt-0.5 size-1.5 shrink-0 rounded-full',
              result.ok ? 'bg-success' : 'bg-destructive'
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{result.page.name}</p>
            {result.ok && result.permalink ? (
              <Link
                href={result.permalink}
                target="_blank"
                rel="noreferrer"
                className="break-all text-muted-foreground underline-offset-2 hover:underline"
              >
                {result.permalink}
              </Link>
            ) : result.ok ? (
              <p className="text-muted-foreground">Published.</p>
            ) : (
              <p className="break-words text-destructive">{result.error}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
