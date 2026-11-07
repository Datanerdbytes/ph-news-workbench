'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = ['Make it shorter', 'More engaging', 'Add hashtags'];

const PANEL_ID = 'ask-ai-panel';

export function AssistantChat({
  draft = '',
  storyId,
  onDraftChange,
  contextLabel,
}: {
  draft?: string;
  storyId?: number;
  onDraftChange?: (text: string) => void;
  /** Tells the model what it is editing, e.g. "reel caption (2,200 character limit)". */
  contextLabel?: string;
}) {
  // Without a draft target the assistant is a general chat: replies appear
  // in the conversation instead of rewriting a text field.
  const chatMode = !onDraftChange;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [storyId]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy || (!chatMode && !draft)) return;

    setMessages((history) => [...history, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, draft, context: contextLabel }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) {
        throw new Error(
          data.error ??
            (chatMode
              ? 'The assistant could not respond.'
              : 'The assistant could not revise the text.')
        );
      }
      if (chatMode) {
        setMessages((history) => [
          ...history,
          { role: 'assistant', content: data.text },
        ]);
      } else {
        onDraftChange(data.text);
        setMessages((history) => [
          ...history,
          {
            role: 'assistant',
            content: 'Draft updated. The revision is in the draft panel.',
          },
        ]);
      }
    } catch (error) {
      setMessages((history) => [
        ...history,
        {
          role: 'assistant',
          content:
            error instanceof Error ? error.message : 'The revision failed.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    send(input);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-full border border-ink/10 bg-ink py-1.5 pl-1.5 pr-2.5 text-paper shadow-paper-sm transition-all hover:-translate-y-0.5 hover:shadow-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:pr-4"
        >
          <span className="grid size-9 place-items-center rounded-full bg-brand">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="hidden text-[13px] font-semibold sm:block">
            Ask AI
          </span>
          <span className="sr-only sm:hidden">Open the AI assistant</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[392px]">
          <section
            id={PANEL_ID}
            role="dialog"
            aria-label="AI assistant"
            className="flex max-h-[min(72vh,600px)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card paper-shadow"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-paper">
                  <Sparkles className="size-4 text-brand" aria-hidden />
                </span>
                <div className="min-w-0 leading-none">
                  <p className="truncate text-sm font-semibold">
                    AI assistant
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        chatMode || draft
                          ? 'bg-brand'
                          : 'bg-muted-foreground/40'
                      )}
                      aria-hidden
                    />
                    {chatMode ? 'General chat' : draft ? 'Draft in context' : 'No draft yet'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="min-h-[180px] flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4"
            >
              {!messages.length && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {chatMode
                      ? 'Ask anything — story ideas, hooks, caption lines, posting questions. Replies appear right here.'
                      : 'Ask for a rewrite of the current draft. The text updates in place — nothing is published from here.'}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {(chatMode
                      ? [
                          'Give me story ideas',
                          'Write a short hook',
                          'What makes a good story?',
                        ]
                      : SUGGESTIONS
                    ).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        disabled={(!chatMode && !draft) || busy}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <p
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                      message.role === 'user'
                        ? 'rounded-br-sm bg-ink text-paper'
                        : 'rounded-bl-sm border border-border/70 bg-background text-foreground'
                    )}
                  >
                    {message.content}
                  </p>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Revising…
                  </span>
                </div>
              )}
            </div>

            <form
              onSubmit={submit}
              className="border-t border-border/60 bg-muted/30 p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={
                    draft
                      ? 'Rewrite — shorter, warmer, add hashtags…'
                      : chatMode
                        ? 'Ask anything…'
                        : 'Add some text first'
                  }
                  aria-label="Ask the assistant to revise the draft"
                  className="h-9 bg-background"
                  disabled={busy || (!chatMode && !draft)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 px-3"
                  disabled={!input.trim() || busy || (!chatMode && !draft)}
                  aria-label="Send revision request"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <SendHorizontal className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {chatMode
                  ? 'Replies stay in this chat. Nothing is sent to Facebook.'
                  : draft
                    ? 'Edits the text in place. Nothing is sent to Facebook.'
                    : 'Add some text first, then ask the assistant to revise it.'}
              </p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
