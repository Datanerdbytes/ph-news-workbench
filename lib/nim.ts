import { sql } from './db';
import { DEFAULT_TEXT_MODEL, isTextModel } from './models';

const PER_DRAFT_CAP = Number(process.env.NIM_PER_DRAFT_TOKEN_CAP ?? 1500);
const DAILY_CAP = Number(process.env.NIM_DAILY_TOKEN_CAP ?? 20000);
const TIMEOUT_MS = 120_000;

export type DraftResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export function defaultTextModel(): string {
  const env = process.env.NIM_MODEL?.trim();
  return env && isTextModel(env) ? env : DEFAULT_TEXT_MODEL;
}

export function resolveTextModel(workspaceModel?: string | null): string {
  const chosen = workspaceModel?.trim();
  return chosen && isTextModel(chosen) ? chosen : defaultTextModel();
}

export async function draftPost(
  prompt: string,
  model = defaultTextModel()
): Promise<DraftResult> {
  let res: Response;
  try {
    res = await fetch(`${process.env.NIM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: PER_DRAFT_CAP,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('The AI model took too long to respond. Try a faster model.');
    }
    throw new Error('Could not reach the NVIDIA model endpoint.');
  }

  if (!res.ok) throw new Error(`NIM ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const total = inputTokens + outputTokens;

  if (!text.trim()) {
    throw new Error('The model returned an empty draft. Try a different model.');
  }

  if (total > PER_DRAFT_CAP) throw new Error('per-draft cap exceeded');

  const today = new Date().toISOString().slice(0, 10);
  await sql`INSERT INTO usage_daily (day, total_tokens) VALUES (${today}, ${total})
            ON CONFLICT (day) DO UPDATE SET total_tokens = usage_daily.total_tokens + ${total}`;

  const row = await sql`SELECT total_tokens FROM usage_daily WHERE day = ${today}`;
  if ((row[0]?.total_tokens ?? 0) > DAILY_CAP) {
    throw new Error('daily cap exceeded');
  }

  return { text, inputTokens, outputTokens, estimatedCost: total * 0.000001 };
}