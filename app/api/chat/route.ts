import { NextResponse } from 'next/server';
import { draftPost } from '@/lib/nim';
import { requireUser, unauthorized } from '@/lib/session';

export async function POST(req: Request) {
  if (!(await requireUser(req))) return unauthorized();
  const { message, draft } = await req.json();
  const current = typeof draft === 'string' ? draft.trim() : '';
  const prompt = current
    ? `You are editing a Facebook post draft. Current draft:\n${current}\n\nUser request: ${message}\n\nReturn the revised draft only.`
    : `You are a newsroom assistant for a Philippine news team publishing on Facebook. User question or request: ${message}\n\nReply concisely and practically. Do not invent facts or quotes.`;
  const result = await draftPost(prompt);
  return NextResponse.json({ text: result.text });
}
