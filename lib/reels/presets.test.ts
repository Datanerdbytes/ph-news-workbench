import { describe, expect, it } from "vitest";
import {
  LOOP_GAP_SECONDS,
  PRESET_CATEGORIES,
  REEL_PRESETS,
  SLOT_ORDER,
  attachmentsFromSlots,
  defaultPresetValues,
  effectLocalTime,
  getPreset,
  planEffects,
  slotStart,
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

  it("declares at least one slot for every real preset, in valid slot names", () => {
    for (const preset of REEL_PRESETS) {
      if (preset.id === "none") {
        expect(preset.slots).toEqual([]);
        continue;
      }
      expect(preset.slots.length, preset.id).toBeGreaterThan(0);
      for (const slot of preset.slots) {
        expect(SLOT_ORDER, `${preset.id}: ${slot}`).toContain(slot);
      }
    }
  });

  it("places headline effects at the start and branding at the end", () => {
    expect(getPreset("headline")!.slots).toContain("start");
    expect(getPreset("quote")!.slots).toEqual(["middle"]);
    expect(getPreset("endcard")!.slots).toEqual(["end"]);
    expect(getPreset("logosting")!.slots).toContain("end");
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

describe("slotStart", () => {
  it("uses the preset's own start in the start slot", () => {
    expect(slotStart(getPreset("headline")!, "start", 60)).toBe(0);
    expect(slotStart(getPreset("lowerthird")!, "start", 60)).toBe(1);
    expect(slotStart(getPreset("captionpop")!, "start", 60)).toBe(1.5);
  });

  it("centers effects in the middle slot regardless of their own start", () => {
    expect(slotStart(getPreset("quote")!, "middle", 30)).toBe(15 - 2);
    expect(slotStart(getPreset("lowerthird")!, "middle", 30)).toBe(15 - 1.7);
    expect(slotStart(getPreset("headline")!, "middle", 3)).toBe(0);
  });

  it("anchors the end slot to the last seconds of the reel", () => {
    const endcard = getPreset("endcard")!;
    expect(slotStart(endcard, "end", 30)).toBeCloseTo(30 - 3.6 - 0.2, 5);
    expect(slotStart(getPreset("logosting")!, "end", 30)).toBeCloseTo(
      30 - 2.6 - 0.2,
      5
    );
  });

  it("never starts before the reel begins", () => {
    const endcard = getPreset("endcard")!;
    expect(slotStart(endcard, "end", 2)).toBe(0);
  });
});

describe("effectLocalTime", () => {
  const start = 2;
  const duration = 3;

  it("returns null before the effect starts", () => {
    expect(effectLocalTime(1.9, start, duration, false)).toBeNull();
  });

  it("returns local time inside the effect window", () => {
    expect(effectLocalTime(2.5, start, duration, false)).toBe(0.5);
    expect(effectLocalTime(5, start, duration, false)).toBe(3);
  });

  it("returns null after a single play finishes", () => {
    expect(effectLocalTime(5.1, start, duration, false)).toBeNull();
  });

  it("loops back to zero after each duration + gap cycle", () => {
    const cycle = duration + LOOP_GAP_SECONDS;
    expect(effectLocalTime(start + cycle, start, duration, true)).toBeCloseTo(0, 6);
    expect(effectLocalTime(start + cycle + 1, start, duration, true)).toBeCloseTo(1, 6);
  });

  it("returns null across the gap between looped repeats", () => {
    expect(
      effectLocalTime(start + duration + LOOP_GAP_SECONDS / 2, start, duration, true)
    ).toBeNull();
  });

  it("does not loop when loop is false even after the cycle length", () => {
    expect(
      effectLocalTime(start + duration + LOOP_GAP_SECONDS + 1, start, duration, false)
    ).toBeNull();
  });
});

describe("planEffects", () => {
  it("resolves slot attachments into ordered timed effects", () => {
    const effects = planEffects(
      [
        { presetId: "headline", slot: "start", loop: false },
        { presetId: "endcard", slot: "end", loop: false },
      ],
      30,
      { headline: { text: "Hello" } }
    );
    expect(effects.map((effect) => effect.preset.id)).toEqual([
      "headline",
      "endcard",
    ]);
    expect(effects[0].start).toBe(0);
    expect(effects[0].values).toEqual({ text: "Hello" });
    expect(effects[1].start).toBeCloseTo(30 - 3.6 - 0.2, 5);
  });

  it("drops unknown presets, 'none', and slot-incompatible picks", () => {
    const effects = planEffects(
      [
        { presetId: "ghost", slot: "start", loop: false },
        { presetId: "none", slot: "start", loop: false },
        { presetId: "endcard", slot: "start", loop: false },
        { presetId: "headline", slot: "start", loop: false },
      ],
      30
    );
    expect(effects.map((effect) => effect.preset.id)).toEqual(["headline"]);
  });

  it("keeps end-slot loop flags off — the end effect closes the reel", () => {
    const effects = planEffects(
      [{ presetId: "endcard", slot: "end", loop: true }],
      30
    );
    expect(effects[0].loop).toBe(false);
  });

  it("passes through empty values when none are supplied", () => {
    const effects = planEffects([{ presetId: "stat", slot: "middle", loop: false }], 30);
    expect(effects[0].values).toEqual({});
  });
});

describe("attachmentsFromSlots", () => {
  it("reads the picker's per-slot state into ordered attachments", () => {
    expect(
      attachmentsFromSlots(
        { start: "headline", middle: null, end: "endcard" },
        { start: true, middle: false, end: false }
      )
    ).toEqual([
      { presetId: "headline", slot: "start", loop: true },
      { presetId: "endcard", slot: "end", loop: false },
    ]);
  });

  it("skips empty slots and the 'none' placeholder", () => {
    expect(
      attachmentsFromSlots(
        { start: "none", middle: null, end: "quote" },
        { start: false, middle: false, end: true }
      )
    ).toEqual([{ presetId: "quote", slot: "end", loop: true }]);
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
