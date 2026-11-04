export type TextModel = {
  id: string;
  label: string;
  detail: string;
};

// Only models that answered on the current NVIDIA NIM account; the catalog
// lists many more that return 404 "function not found" when called.
export const TEXT_MODELS: TextModel[] = [
  {
    id: "nvidia/nemotron-3.5-bolt-e4b",
    label: "Nemotron 3.5 Bolt",
    detail: "Fastest — small model, best for short posts",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni",
    detail: "Balanced — 30B mixture-of-experts with reasoning",
  },
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    label: "Nemotron 3.5 Lightning",
    detail: "Strongest reasoning, but slower to respond",
  },
];

export const DEFAULT_TEXT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";

export function isTextModel(value: string): boolean {
  return TEXT_MODELS.some((model) => model.id === value);
}

export function textModelLabel(value: string): string {
  return TEXT_MODELS.find((model) => model.id === value)?.label ?? value;
}
