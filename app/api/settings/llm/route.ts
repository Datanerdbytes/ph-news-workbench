import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { encryptSecret, SECRET_INFOS } from '@/lib/facebook-token';
import {
  COMPOSER_PROVIDERS,
  composerProvider,
  isProviderModel,
  providerModels,
} from '@/lib/llm-providers';
import { getLlmSettings } from '@/lib/llm';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  try {
    const row = await getLlmSettings(access.workspace.id);
    if (!row) {
      return NextResponse.json(
        {
          configured: false,
          provider: null,
          model: null,
          baseUrl: null,
          keySet: false,
          providers: providerCatalog(),
        },
        { headers: { 'cache-control': 'no-store' } }
      );
    }
    const definition = composerProvider(row.provider);
    const baseUrl =
      row.base_url?.trim() ||
      definition?.baseUrl ||
      (row.provider === 'nim'
        ? process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1'
        : null);
    return NextResponse.json(
      {
        configured: true,
        provider: row.provider,
        model: row.model,
        baseUrl,
        keySet: row.api_key_encrypted !== '-',
        providers: providerCatalog(),
      },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    console.error('Could not load composer LLM settings:', error);
    return NextResponse.json(
      { error: 'Could not load the composer LLM settings.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  if (access.workspace.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only workspace owners can change the composer LLM.' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    model?: unknown;
    baseUrl?: unknown;
    apiKey?: unknown;
  } | null;

  const provider = typeof body?.provider === 'string' ? body.provider.trim() : '';
  const definition = composerProvider(provider);
  if (!definition) {
    return NextResponse.json(
      { error: 'Choose a valid LLM provider.' },
      { status: 400 }
    );
  }

  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  if (!isProviderModel(provider, model)) {
    return NextResponse.json(
      { error: 'Choose a valid model for this provider.' },
      { status: 400 }
    );
  }

  let baseUrl: string | null = null;
  if (provider === 'custom') {
    const candidate = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : '';
    let parsed: URL | null = null;
    try {
      parsed = new URL(candidate);
    } catch {
      parsed = null;
    }
    if (
      !parsed ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return NextResponse.json(
        { error: 'Enter a valid custom provider base URL without credentials or query parameters.' },
        { status: 400 }
      );
    }
    baseUrl = candidate.replace(/\/+$/, '');
  }

  const newKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (newKey.length > 4096) {
    return NextResponse.json({ error: 'API keys must be 4096 characters or fewer.' }, { status: 400 });
  }

  try {
    const existing = await getLlmSettings(access.workspace.id);
    const envKeyAvailable = definition.envKeyVar
      ? Boolean(process.env[definition.envKeyVar]?.trim())
      : false;
    const existingKeyCanBeKept =
      existing?.provider === provider && existing.api_key_encrypted !== '-';
    if (!newKey && !envKeyAvailable && !existingKeyCanBeKept) {
      return NextResponse.json(
        { error: 'Enter an API key for this provider.' },
        { status: 400 }
      );
    }

    // A provider with a server env key (NIM) may be saved without a stored
    // key; '-' marks "no stored key" since the column is NOT NULL, and
    // resolveComposerLlm falls back to env credentials when it can't decrypt.
    // Keys never carry across providers: switching without a new key resets.
    const keyEncrypted = newKey
      ? encryptSecret(newKey, SECRET_INFOS.llmProviderKey)
      : existing && existing.provider === provider
        ? existing.api_key_encrypted
        : '-';

    await sql`
      INSERT INTO llm_settings
        (workspace_id, provider, model, base_url, api_key_encrypted, updated_at)
      VALUES
        (${access.workspace.id}, ${provider}, ${model}, ${baseUrl},
         ${keyEncrypted || '-'}, now())
      ON CONFLICT (workspace_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        base_url = EXCLUDED.base_url,
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        updated_at = now()`;

    return NextResponse.json({
      provider,
      model,
      baseUrl,
      keySet: keyEncrypted !== '-',
    });
  } catch (error) {
    console.error('Could not save composer LLM settings:', error);
    return NextResponse.json(
      { error: 'Could not save the composer LLM settings.' },
      { status: 500 }
    );
  }
}

function providerCatalog() {
  return COMPOSER_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    detail: provider.detail,
    baseUrl: provider.baseUrl,
    envKeyVar: provider.envKeyVar,
    freeTextModel: provider.freeTextModel,
    models: providerModels(provider.id),
  }));
}
