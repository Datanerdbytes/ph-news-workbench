import { TEXT_MODELS } from './models';

export type ComposerModel = {
  id: string;
  label: string;
  detail: string;
};

export type ComposerProvider = {
  id: 'huggingface' | 'nim' | 'openai' | 'custom';
  label: string;
  detail: string;
  // Fixed base URL; null means the workspace supplies one (custom).
  baseUrl: string | null;
  // Env keys used as fallback when the workspace has no stored setting.
  envKeyVar: string | null;
  envModelVar: string | null;
  models: ComposerModel[];
  freeTextModel: boolean;
};

const HF_MODELS: ComposerModel[] = [
  {
    id: 'deepseek-ai/DeepSeek-V3.1',
    label: 'DeepSeek V3.1',
    detail: 'Strong general coding model — good HTML/CSS compositions',
  },
  {
    id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    label: 'Qwen3 Coder 480B',
    detail: 'Frontier open coding model — best composition quality',
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    detail: 'Balanced open-weight model with solid HTML output',
  },
  {
    id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    label: 'Qwen2.5 Coder 32B',
    detail: 'Faster and cheaper — good for quick iterations',
  },
];

const OPENAI_MODELS: ComposerModel[] = [
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    detail: 'Frontier model — best composition quality',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    detail: 'Fast and capable for HTML generation',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    detail: 'Latest small model with strong code output',
  },
];

const NIM_MODELS: ComposerModel[] = TEXT_MODELS.map((model) => ({
  id: model.id,
  label: model.label,
  detail: model.detail,
}));

export const COMPOSER_PROVIDERS: ComposerProvider[] = [
  {
    id: 'huggingface',
    label: 'Hugging Face',
    detail: 'Inference Providers router — pay per token with an hf_ key',
    baseUrl: 'https://router.huggingface.co/v1',
    envKeyVar: 'HF_API_KEY',
    envModelVar: 'HF_MODEL',
    models: HF_MODELS,
    freeTextModel: false,
  },
  {
    id: 'nim',
    label: 'NVIDIA NIM (server key)',
    detail: 'Uses the server NIM_API_KEY, with a workspace model pick',
    baseUrl: null, // resolved from NIM_BASE_URL at runtime
    envKeyVar: 'NIM_API_KEY',
    envModelVar: 'NIM_MODEL',
    models: NIM_MODELS,
    freeTextModel: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    detail: 'OpenAI chat completions API',
    baseUrl: 'https://api.openai.com/v1',
    envKeyVar: 'OPENAI_API_KEY',
    envModelVar: 'OPENAI_MODEL',
    models: OPENAI_MODELS,
    freeTextModel: false,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    detail: 'Any endpoint exposing POST /chat/completions',
    baseUrl: null,
    envKeyVar: null,
    envModelVar: null,
    models: [],
    freeTextModel: true,
  },
];

export function composerProvider(id: string): ComposerProvider | null {
  return COMPOSER_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function isComposerProvider(value: string): boolean {
  return composerProvider(value) !== null;
}

export function isProviderModel(providerId: string, model: string): boolean {
  const provider = composerProvider(providerId);
  if (!provider) return false;
  if (provider.freeTextModel) return model.trim().length > 0;
  return provider.models.some((entry) => entry.id === model);
}

export function providerModels(providerId: string): ComposerModel[] {
  return composerProvider(providerId)?.models ?? [];
}
