import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, getTheme, isThemeId } from "./themes";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("THEMES registry", () => {
  it("has unique ids and contains the default theme", () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_THEME);
  });

  it("keeps every color a six-digit hex value", () => {
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(theme)) {
        if (key === "id" || key === "label") continue;
        expect(value, `${theme.id}.${key}`).toMatch(HEX);
      }
    }
  });
});

describe("isThemeId", () => {
  it("accepts every registered theme id", () => {
    for (const theme of THEMES) {
      expect(isThemeId(theme.id)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isThemeId("neon-pink")).toBe(false);
    expect(isThemeId("")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });
});

describe("getTheme", () => {
  it("returns the matching theme", () => {
    expect(getTheme("plum-rose").id).toBe("plum-rose");
  });

  it("falls back to the default theme for unknown or missing ids", () => {
    expect(getTheme("nope").id).toBe(DEFAULT_THEME);
    expect(getTheme(null).id).toBe(DEFAULT_THEME);
    expect(getTheme(undefined).id).toBe(DEFAULT_THEME);
  });
});

describe("globals.css mirroring", () => {
  // lib/themes.ts and the html[data-theme] blocks in app/globals.css must
  // stay in sync — the settings picker reads one and the DOM applies the other.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  function themeBlock(id: string): string | null {
    const match = css.match(
      new RegExp(`html\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\}`)
    );
    return match?.[1] ?? null;
  }

  const VAR_FOR_FIELD: Record<string, string> = {
    brand: "--brand",
    brandStrong: "--brand-strong",
    accent: "--brand-accent",
    accentSoft: "--brand-accent-soft",
    background: "--background",
    foreground: "--foreground",
    border: "--border",
    input: "--input",
    mutedForeground: "--muted-foreground",
  };

  it("declares a data-theme block for every non-default theme", () => {
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_THEME) continue;
      expect(themeBlock(theme.id), `missing block for ${theme.id}`).not.toBeNull();
    }
  });

  it("has no data-theme blocks outside the registry", () => {
    const declared = [...css.matchAll(/html\[data-theme="([^"]+)"\]/g)].map(
      (match) => match[1]
    );
    const known = THEMES.filter((t) => t.id !== DEFAULT_THEME).map((t) => t.id);
    expect(declared).toEqual(known);
  });

  it("mirrors every CSS variable the blocks declare to lib/themes.ts values", () => {
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_THEME) continue;
      const block = themeBlock(theme.id)!;
      for (const [field, cssVar] of Object.entries(VAR_FOR_FIELD)) {
        const declared = block.match(new RegExp(`${cssVar}\\s*:\\s*([^;]+);`));
        if (!declared) continue;
        expect(`${theme.id} ${cssVar}: ${declared[1].trim()}`).toBe(
          `${theme.id} ${cssVar}: ${theme[field as keyof typeof theme]}`
        );
      }
    }
  });
});
