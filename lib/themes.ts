export type ThemeId =
  | "ink-white"
  | "ink-emerald"
  | "navy-champagne"
  | "plum-rose"
  | "slate-sky"
  | "forest-amber";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  /** Primary color: buttons, navigation, avatar. */
  brand: string;
  /** Darker brand shade for hovers and emphasis. */
  brandStrong: string;
  /** Accent color: active filters, highlight callouts. */
  accent: string;
  /** Soft accent tint behind accent-colored text. */
  accentSoft: string;
  /** Page background and neutral surfaces. */
  background: string;
  tint: string;
  border: string;
  input: string;
  foreground: string;
  mutedForeground: string;
};

export const DEFAULT_THEME: ThemeId = "ink-white";

export const THEMES: ThemeDef[] = [
  {
    id: "ink-white",
    label: "Ink & White",
    brand: "#1a1d23",
    brandStrong: "#0d1015",
    accent: "#1a1d23",
    accentSoft: "#eef0f2",
    background: "#ffffff",
    tint: "#f4f5f6",
    border: "#e6e8ea",
    input: "#ccd0d6",
    foreground: "#161b23",
    mutedForeground: "#6b7482",
  },
  {
    id: "ink-emerald",
    label: "Ink & Emerald",
    brand: "#1a1d23",
    brandStrong: "#0d1015",
    accent: "#047857",
    accentSoft: "#e5f3ee",
    background: "#ffffff",
    tint: "#f4f5f6",
    border: "#e6e8ea",
    input: "#ccd0d6",
    foreground: "#161b23",
    mutedForeground: "#6b7482",
  },
  {
    id: "navy-champagne",
    label: "Navy & Champagne",
    brand: "#1e3a5f",
    brandStrong: "#14283f",
    accent: "#b7791f",
    accentSoft: "#f6eedd",
    background: "#f7f8fa",
    tint: "#f0f2f5",
    border: "#e4e8ee",
    input: "#cfd6e0",
    foreground: "#17202e",
    mutedForeground: "#64708a",
  },
  {
    id: "plum-rose",
    label: "Plum & Rose",
    brand: "#6b21a8",
    brandStrong: "#571a89",
    accent: "#be185d",
    accentSoft: "#fbe9f1",
    background: "#faf9fc",
    tint: "#f4f1f8",
    border: "#e9e4f0",
    input: "#d6cddd",
    foreground: "#221a29",
    mutedForeground: "#736a80",
  },
  {
    id: "slate-sky",
    label: "Slate & Sky",
    brand: "#334155",
    brandStrong: "#223046",
    accent: "#0284c7",
    accentSoft: "#e5f2fa",
    background: "#f6f8fa",
    tint: "#eff2f6",
    border: "#e3e8ee",
    input: "#cdd5de",
    foreground: "#1c2532",
    mutedForeground: "#68758a",
  },
  {
    id: "forest-amber",
    label: "Forest & Amber",
    brand: "#14532d",
    brandStrong: "#0e3b21",
    accent: "#d97706",
    accentSoft: "#fbeed9",
    background: "#f6f8f6",
    tint: "#eff3ef",
    border: "#e2e8e2",
    input: "#ccd6cc",
    foreground: "#1a231b",
    mutedForeground: "#61705f",
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}

export function getTheme(id: string | null | undefined): ThemeDef {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
