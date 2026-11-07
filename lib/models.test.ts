import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_MODEL,
  TEXT_MODELS,
  isTextModel,
  textModelLabel,
} from "./models";

describe("TEXT_MODELS registry", () => {
  it("has unique model ids containing the default", () => {
    const ids = TEXT_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_TEXT_MODEL);
  });

  it("labels every model", () => {
    for (const model of TEXT_MODELS) {
      expect(model.label.trim()).not.toBe("");
      expect(model.detail.trim()).not.toBe("");
    }
  });
});

describe("isTextModel", () => {
  it("accepts registered ids and rejects anything else", () => {
    for (const model of TEXT_MODELS) {
      expect(isTextModel(model.id)).toBe(true);
    }
    expect(isTextModel("gpt-4")).toBe(false);
    expect(isTextModel("")).toBe(false);
  });
});

describe("textModelLabel", () => {
  it("maps known ids to labels", () => {
    expect(textModelLabel(DEFAULT_TEXT_MODEL)).toBe(
      TEXT_MODELS.find((model) => model.id === DEFAULT_TEXT_MODEL)!.label
    );
  });

  it("passes unknown values through unchanged", () => {
    expect(textModelLabel("custom-model")).toBe("custom-model");
  });
});
