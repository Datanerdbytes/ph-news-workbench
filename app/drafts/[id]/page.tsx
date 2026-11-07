'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppFrame } from '@/components/app-frame';
import { StatusPill } from '@/components/status-pill';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatDateTime, wordCount } from '@/lib/format';

type Draft = {
  id: number;
  news_item_id: number;
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: string | number;
  status: string;
  correlation_id: string;
  error_message: string | null;
  created_at: string;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-xs text-foreground">{children}</span>
    </div>
  );
}

export default function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/drafts/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(setDraft)
      .catch((e) => setError(String(e)));
  }, [id]);

  async function copy() {
    if (!draft?.text) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
      toast.success('Draft copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the draft');
    }
  }

  async function remove() {
    if (!draft) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'The draft could not be deleted.');
      }
      toast.success('Draft deleted');
      router.push('/status');
    } catch (e) {
      setDeleting(false);
      toast.error('Could not delete the draft', {
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    }
  }

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/status"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Drafts &amp; activity
        </Link>

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">This draft could not be loaded.</p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">{error}</p>
              <Link
                href="/status"
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'mt-4',
                })}
              >
                Back to activity
              </Link>
            </div>
          </div>
        ) : !draft ? (
          <div className="mt-8 animate-pulse space-y-4">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-10 w-2/3 rounded bg-muted" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="h-80 rounded-xl bg-muted/70" />
              <div className="h-64 rounded-xl bg-muted/70" />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow text-brand">Draft #{draft.id}</p>
                <h1 className="mt-2 font-heading text-4xl tracking-[-0.02em]">
                  Generated draft
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
                  <StatusPill status={draft.status} />
                  <span aria-hidden>·</span>
                  <span>{formatDateTime(draft.created_at)}</span>
                  <span aria-hidden>·</span>
                  <span>{wordCount(draft.text)} words</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="brand" size="sm" onClick={copy} disabled={!draft.text}>
                  {copied ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {copied ? 'Copied' : 'Copy text'}
                </Button>
                {confirmDelete ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={remove}
                      disabled={deleting}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {deleting ? 'Deleting…' : 'Confirm delete'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete draft
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
              <section className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                  <span className="eyebrow text-muted-foreground">
                    Post text
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {draft.text.length} characters
                  </span>
                </div>
                <div className="p-5 sm:p-7">
                  {draft.text ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">
                      {draft.text}
                    </p>
                  ) : (
                    <p className="text-sm italic leading-relaxed text-muted-foreground">
                      This draft has no text.
                    </p>
                  )}
                </div>
                {draft.error_message && (
                  <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-xs leading-relaxed text-destructive">
                    <AlertCircle
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                    {draft.error_message}
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-5 py-3">
                  <span className="text-[11px] text-muted-foreground">
                    Generated by the AI assistant
                  </span>
                  <Link
                    href="/"
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    Back to the story queue
                  </Link>
                </div>
              </section>

              <aside className="overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow-sm">
                <div className="border-b border-border/60 px-5 py-3">
                  <span className="eyebrow text-muted-foreground">Details</span>
                </div>
                <div className="px-5 py-2">
                  <DetailRow label="Status">
                    <StatusPill status={draft.status} />
                  </DetailRow>
                  <DetailRow label="Model">
                    <span className="font-mono text-[11px]">{draft.model}</span>
                  </DetailRow>
                  <DetailRow label="Input">
                    <span className="tabular-nums">
                      {draft.input_tokens} tokens
                    </span>
                  </DetailRow>
                  <DetailRow label="Output">
                    <span className="tabular-nums">
                      {draft.output_tokens} tokens
                    </span>
                  </DetailRow>
                  <DetailRow label="Est. cost">
                    <span className="tabular-nums">
                      ${Number(draft.estimated_cost).toFixed(6)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Created">
                    {formatDateTime(draft.created_at)}
                  </DetailRow>
                  <DetailRow label="Correlation">
                    <span className="block max-w-[150px] break-all font-mono text-[10px] text-muted-foreground">
                      {draft.correlation_id}
                    </span>
                  </DetailRow>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}
