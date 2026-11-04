import { sql } from './db';
import { decryptSecret, SECRET_INFOS } from './facebook-token';
import {
  composerProvider,
  isProviderModel,
  providerModels,
} from './llm-providers';
import { isTextModel, DEFAULT_TEXT_MODEL } from './models';

const TIMEOUT_MS = 180_000;

export type LlmSettingsRow = {
  provider: string;
  model: string;
  base_url: string | null;
  api_key_encrypted: string;
};

export type ResolvedComposerLlm = {
  providerId: string;
  providerLabel: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  source: 'workspace' | 'env';
};

function nimBaseUrl(): string {
  return process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
}

function defaultNimModel(): string {
  const env = process.env.NIM_MODEL?.trim();
  return env && isTextModel(env) ? env : DEFAULT_TEXT_MODEL;
}

export async function getLlmSettings(
  workspaceId: string
): Promise<LlmSettingsRow | null> {
  const rows = (await sql`
    SELECT provider, model, base_url, api_key_encrypted
    FROM llm_settings
    WHERE workspace_id = ${workspaceId}
  `) as unknown as LlmSettingsRow[];
  return rows[0] ?? null;
}

/**
 * Resolve the LLM used for HyperFrames composition. Prefers the workspace's
 * stored provider/model/key; falls back to HF_API_KEY/HF_MODEL env, then the
 * server's NIM credentials.
 */
export async function resolveComposerLlm(
  workspaceId: string
): Promise<ResolvedComposerLlm | null> {
  const row = await getLlmSettings(workspaceId);
  if (row) {
    const provider = composerProvider(row.provider);
    if (!provider || !isProviderModel(row.provider, row.model)) {
      throw new Error('The saved composer provider or model is no longer available.');
    }
    const baseUrl =
      row.base_url?.trim() ||
      provider.baseUrl ||
      (row.provider === 'nim' ? nimBaseUrl() : '');
    if (!baseUrl) {
      throw new Error('The saved custom provider is missing its base URL.');
    }

    let apiKey = provider.envKeyVar
      ? process.env[provider.envKeyVar]?.trim() ?? ''
      : '';
    if (row.api_key_encrypted !== '-') {
      try {
        apiKey = decryptSecret(row.api_key_encrypted, SECRET_INFOS.llmProviderKey);
      } catch {
        throw new Error(
          'The saved composer API key cannot be decrypted. Re-enter it in Settings → Video composer LLM.'
        );
      }
    }
    if (!apiKey) {
      throw new Error(
        `No API key is configured for ${provider.label}. Add one in Settings → Video composer LLM.`
      );
    }

    return {
      providerId: row.provider,
      providerLabel: provider.label,
      model: row.model,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      apiKey,
      source: 'workspace',
    };
  }

  const hfKey = process.env.HF_API_KEY?.trim();
  if (hfKey) {
    const provider = composerProvider('huggingface')!;
    const envModel = process.env.HF_MODEL?.trim();
    const model =
      envModel && isProviderModel('huggingface', envModel)
        ? envModel
        : provider.models[0].id;
    return {
      providerId: 'huggingface',
      providerLabel: provider.label,
      model,
      baseUrl: provider.baseUrl!,
      apiKey: hfKey,
      source: 'env',
    };
  }

  const nimKey = process.env.NIM_API_KEY?.trim();
  if (nimKey) {
    const model = defaultNimModel();
    return {
      providerId: 'nim',
      providerLabel: 'NVIDIA NIM (server key)',
      model,
      baseUrl: nimBaseUrl().replace(/\/$/, ''),
      apiKey: nimKey,
      source: 'env',
    };
  }

  return null;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function chatCompletion({
  llm,
  messages,
  maxTokens,
  chatTemplateKwargs,
}: {
  llm: ResolvedComposerLlm;
  messages: ChatMessage[];
  maxTokens: number;
  chatTemplateKwargs?: { enable_thinking: boolean };
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  let res: Response;
  try {
    res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages,
        max_tokens: maxTokens,
        ...(chatTemplateKwargs
          ? { chat_template_kwargs: chatTemplateKwargs }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The composer model took too long to respond.');
    }
    throw new Error(`Could not reach ${llm.providerLabel}.`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `${llm.providerLabel} ${res.status}: ${detail.slice(0, 300) || 'request failed'}`
    );
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) {
    throw new Error(`${llm.providerLabel} returned an empty response.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const total =
    (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
  if (total > 0) {
    await sql`INSERT INTO usage_daily (day, total_tokens) VALUES (${today}, ${total})
              ON CONFLICT (day) DO UPDATE SET total_tokens = usage_daily.total_tokens + ${total}`;
  }

  return {
    content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export { providerModels };
