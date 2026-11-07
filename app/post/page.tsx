'use client';

import { useState } from 'react';
import { Link2, PenLine, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { AssistantChat } from '@/components/assistant-chat';
import { Button } from '@/components/ui/button';
import {
  ComposerCard,
  FieldLabel,
  PageSelector,
  PublishPage,
  ResultList,
  ScheduleField,
  defaultScheduleValue,
  inputClass,
  textareaClass,
  useManagedPages,
  type PublishResult,
} from '@/components/publishing/publish-page';

const MAX_MESSAGE_LENGTH = 5000;

export default function PostPage() {
  const pages = useManagedPages();
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);

  const canPublish = message.trim().length > 0;

  async function post() {
    if (!canPublish) return;
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          link: link.trim(),
          pageIds: pages.selected,
          ...(scheduleOn
            ? { scheduledFor: new Date(scheduledFor).toISOString() }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'The post could not be published.');
      setResults(data.results ?? []);
      toast.success(scheduleOn ? 'Post scheduled' : 'Post published', {
        description: data.warning,
      });
      setMessage('');
      setLink('');
    } catch (error) {
      toast.error('Post failed', {
        description:
          error instanceof Error ? error.message : 'The post could not be published.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublishPage eyebrow="Publishing" title="Post">
      <ComposerCard
        icon={<PenLine className="size-4" />}
        title="New post"
        badge="Text post"
        aside={
          <>
            <p className="font-semibold text-secondary-foreground">How a post publishes</p>
            <p>
              Text posts go to the Page&apos;s{' '}
              <code className="mx-1 rounded bg-surface-3 px-1 py-0.5 text-[10px]">/feed</code>{' '}
              edge with the Page access token. A link field turns the post into a link
              share with Facebook&apos;s own preview card.
            </p>
            <p>Scheduled posts are queued by Facebook and appear once published.</p>
          </>
        }
      >
        <div>
          <FieldLabel htmlFor="post-message" hint={`${message.length}/${MAX_MESSAGE_LENGTH}`}>
            Message
          </FieldLabel>
          <textarea
            id="post-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Write the post…"
            className={textareaClass}
          />
        </div>

        <div>
          <FieldLabel htmlFor="post-link" hint="Optional">
            Link
          </FieldLabel>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="post-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://…"
              className={`${inputClass} pl-8`}
              type="url"
            />
          </div>
        </div>

        <PageSelector
          pages={pages.pages}
          selected={pages.selected}
          onSelect={pages.selectOne}
          loading={pages.loading}
        />

        <ScheduleField
          enabled={scheduleOn}
          onEnabled={setScheduleOn}
          value={scheduledFor}
          onChange={setScheduledFor}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="brand"
            size="sm"
            onClick={post}
            disabled={!canPublish || busy || !pages.selected.length}
          >
            <SendHorizontal className="size-3.5" aria-hidden />
            {busy ? 'Publishing…' : scheduleOn ? 'Schedule post' : 'Publish post'}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {scheduleOn
              ? 'Facebook queues the post and publishes it at the chosen time.'
              : 'Publishes straight to the selected Page(s).'}
          </span>
        </div>

        {results && <ResultList results={results} />}
      </ComposerCard>
      <AssistantChat
        draft={message}
        onDraftChange={setMessage}
        contextLabel="post message (5,000 character limit)"
      />
    </PublishPage>
  );
}
