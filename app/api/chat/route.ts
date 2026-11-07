import { NextResponse } from 'next/server';
import { draftPost } from '@/lib/nim';
import { requireUser, unauthorized } from '@/lib/session';

export async function POST(req: Request) {
  if (!(await requireUser(req))) return unauthorized();
  const body = (await req.json().catch(() => null)) as
    | { message?: unknown; draft?: unknown; context?: unknown }
    | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  if (!message.trim()) {
    return NextResponse.json(
      { error: 'Ask a question or request a change.' },
      { status: 400 }
    );
  }
  const current = typeof body?.draft === 'string' ? body.draft.trim() : '';
  // A context means the client edits a specific field (post message, reel
  // caption, …) — even when that field is still empty, so the model writes
  // into it from scratch. No context means general chat.
  const rawContext = typeof body?.context === 'string' ? body.context.trim() : '';
  const hasContext = rawContext.length > 0;
  const context = hasContext ? rawContext : 'Facebook post draft';
  const prompt = current
    ? `You are editing a ${context}. Current text:\n${current}\n\nUser request: ${message}\n\nReturn the revised text only. Respect the character limit if the context states one.`
    : hasContext
      ? `You are writing a ${context} from scratch for a Philippine news team publishing on Facebook. User request: ${message}\n\nReturn the finished text only — no preamble, no surrounding quotes. Respect the character limit if the context states one. Do not invent facts or quotes.`
      : `You are a newsroom assistant for a Philippine news team publishing on Facebook. User question or request: ${message}\n\nReply concisely and practically. Do not invent facts or quotes.`;
  const result = await draftPost(prompt);
  return NextResponse.json({ text: result.text });
}
