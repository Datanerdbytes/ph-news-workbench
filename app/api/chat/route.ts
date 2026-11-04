import { NextResponse } from 'next/server';
import { draftPost } from '@/lib/nim';
import { requireUser, unauthorized } from '@/lib/session';

export async function POST(req: Request) {
  if (!(await requireUser(req))) return unauthorized();
  const { message, draft } = await req.json();
  const prompt = `You are editing a Facebook post draft. Current draft:\n${draft}\n\nUser request: ${message}\n\nReturn the revised draft only.`;
  const result = await draftPost(prompt);
  return NextResponse.json({ text: result.text });
}