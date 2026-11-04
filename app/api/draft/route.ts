import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { draftPost, resolveTextModel } from '@/lib/nim';
import { requireWorkspace, unauthorized } from '@/lib/session';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const access = await requireWorkspace(req);
  if (!access) return unauthorized();
  const { newsItemId, language } = await req.json();
  const lang = language === 'tl' ? 'Tagalog' : 'English';
  const model = resolveTextModel(access.workspace.aiModel);
  const correlationId = randomUUID();
  console.log(JSON.stringify({ route: 'draft', correlationId, event: 'start', newsItemId, model }));
  const items = await sql`SELECT title, summary, link FROM news_items WHERE id = ${newsItemId}`;
  if (!items.length) { console.log(JSON.stringify({ route: 'draft', correlationId, event: 'not_found', newsItemId })); return NextResponse.json({ error: 'not found', correlationId }, { status: 404 }); }
  const item = items[0];
  const prompt = `Summarize the following Philippine news item and write a concise Facebook post (text only) in ${lang}. Include a brief summary of the article, not just the headline.\nTitle: ${item.title}\nSummary: ${item.summary}\nLink: ${item.link}\nTone: informative, neutral.`;
  try {
    const result = await draftPost(prompt, model);
    console.log(JSON.stringify({ route: 'draft', correlationId, event: 'drafted', newsItemId, model, inputTokens: result.inputTokens, outputTokens: result.outputTokens }));
    await sql`
      INSERT INTO drafts (user_id, workspace_id, news_item_id, text, model, input_tokens, output_tokens, estimated_cost, status, correlation_id)
      VALUES (${access.user.id}, ${access.workspace.id}, ${newsItemId}, ${result.text}, ${model}, ${result.inputTokens}, ${result.outputTokens}, ${result.estimatedCost}, 'drafted', ${correlationId})`;
    return NextResponse.json({ text: result.text, model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCost: result.estimatedCost, correlationId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error(JSON.stringify({ route: 'draft', correlationId, event: 'failed', newsItemId, model, error: message }));
    await sql`
      INSERT INTO drafts (user_id, workspace_id, news_item_id, text, model, input_tokens, output_tokens, estimated_cost, status, correlation_id, error_message)
      VALUES (${access.user.id}, ${access.workspace.id}, ${newsItemId}, '', ${model}, 0, 0, 0, 'failed', ${correlationId}, ${message})`;
    const rateLimited = message.includes('cap exceeded') || message.startsWith('NIM 429');
    return NextResponse.json({ error: message, correlationId }, { status: rateLimited ? 429 : 502 });
  }
}