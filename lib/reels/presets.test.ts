import { describe, expect, it } from "vitest";
import {
  PRESET_CATEGORIES,
  REEL_PRESETS,
  defaultPresetValues,
  getPreset,
  presetStart,
  punchzoom,
} from "./presets";

describe("REEL_PRESETS registry", () => {
  it("has unique ids and always includes 'none'", () => {
    const ids = REEL_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("none");
    expect(ids).toContain("headline");
  });

  it("gives every real preset a positive duration and usable fields", () => {
    for (const preset of REEL_PRESETS) {
      if (preset.id === "none") continue;
      expect(preset.duration, `${preset.id}.duration`).toBeGreaterThan(0);
      expect(preset.window.trim(), preset.id).not.toBe("");
      const keys = preset.fields.map((field) => field.key);
      expect(new Set(keys).size, preset.id).toBe(keys.length);
      for (const field of preset.fields) {
        expect(field.label.trim(), `${preset.id}.${field.key}`).not.toBe("");
      }
    }
  });

  it("keeps every preset inside a declared category", () => {
    const categories = PRESET_CATEGORIES.filter((category) => category !== "All");
    for (const preset of REEL_PRESETS) {
      expect(categories, preset.id).toContain(preset.category);
    }
  });
});

describe("getPreset", () => {
  it("resolves known ids and rejects everything else", () => {
    expect(getPreset("headline")?.name).toBe("Kinetic Headline");
    expect(getPreset("none")).not.toBeNull();
    expect(getPreset("does-not-exist")).toBeNull();
    expect(getPreset(null)).toBeNull();
    expect(getPreset(undefined)).toBeNull();
    expect(getPreset("")).toBeNull();
  });
});

describe("presetStart", () => {
  it("uses the preset's own start for start-anchored effects", () => {
    expect(presetStart(getPreset("headline")!, 60)).toBe(0);
    expect(presetStart(getPreset("lowerthird")!, 60)).toBe(1);
    expect(presetStart(getPreset("captionpop")!, 60)).toBe(1.5);
  });

  it("anchors end-anchored effects to the last seconds of the reel", () => {
    const endcard = getPreset("endcard")!;
    expect(endcard.anchor).toBe("end");
    expect(presetStart(endcard, 30)).toBeCloseTo(30 - 3.6 - 0.2, 5);
  });

  it("never starts before the reel begins", () => {
    const endcard = getPreset("endcard")!;
    expect(presetStart(endcard, 2)).toBe(0);
  });
});

describe("defaultPresetValues", () => {
  it("seeds every preset's fields with their default values", () => {
    const values = defaultPresetValues();
    expect(Object.keys(values).sort()).toEqual(
      REEL_PRESETS.map((preset) => preset.id).sort()
    );
    expect(values.headline).toEqual({ text: "Big news today" });
    expect(values.none).toEqual({});
  });
});

describe("punchzoom scale curve", () => {
  it("starts at 1, peaks, and returns to 1", () => {
    expect(punchzoom.scale!(0)).toBeCloseTo(1, 5);
    expect(punchzoom.scale!(0.3)).toBeCloseTo(1.16, 5);
    expect(punchzoom.scale!(2.4)).toBeCloseTo(1, 5);
  });
});
