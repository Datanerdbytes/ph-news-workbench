/**
 * Pre-built reel animation presets.
 *
 * Every preset ships two renderers over the same time base:
 *  - `draw` renders one frame into a 1080×1920 design space. The live preview
 *    overlay and the baked video both call this, so what you preview is
 *    exactly what gets rendered into the posted reel.
 *  - `mount` builds a looping GSAP DOM preview in a 270×480 design space for
 *    the picker's gallery cards, where no video is playing underneath.
 *
 * `draw` receives LOCAL time in seconds (0 at the effect's start), so presets
 * are anchored by the registry — the slot they are attached to (`start`,
 * `middle`, `end`) decides where each effect lands on the reel, not callers.
 *
 * This module is intentionally GSAP-free so the bake path (lib/reels/bake.ts)
 * can import it without pulling GSAP into module scope. GSAP-dependent mount
 * functions live in presets.preview.ts.
 */

export type PresetValues = Record<string, string>;

export type PresetField = { key: string; label: string; value: string };

export type PresetCategory =
  | 'Headlines'
  | 'Captions'
  | 'Newsroom'
  | 'Branding'
  | 'Motion';

/** Where on the reel an animation can be attached. */
export type PresetSlot = 'start' | 'middle' | 'end';

/** One animation picked for a slot; `loop` repeats it through the reel. */
export type ReelAttachment = {
  presetId: string;
  slot: PresetSlot;
  loop: boolean;
};

export const SLOT_ORDER: PresetSlot[] = ['start', 'middle', 'end'];

type Ctx = CanvasRenderingContext2D;

export type ReelPreset = {
  id: string;
  name: string;
  category: PresetCategory;
  /** Slots this effect suits — the picker only offers it there. */
  slots: PresetSlot[];
  /** Display label for where the effect lands on the reel. */
  window: string;
  /** Effect length in seconds. */
  duration: number;
  /** Seconds into the reel where the effect starts (in the 'start' slot). */
  start: number;
  /** Text inputs the user can edit for this preset. */
  fields: PresetField[];
  /** Render one frame at local time `t` in a 1080×1920 design space. */
  draw?: (ctx: Ctx, t: number, duration: number, values: PresetValues) => void;
  /** Frame zoom multiplier over local time (camera motion baked into footage). */
  scale?: (t: number) => number;
  /** Build the looping DOM preview for picker cards (GSAP, preview only). */
  mount?: (stage: HTMLElement, values: PresetValues) => unknown;
};

const RED = '#d92d20';
const DESIGN_W = 1080;
const DESIGN_H = 1920;

/* ---------------------------------- easing --------------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inCubic = (x: number) => x * x * x;
/** GSAP `power4.out` / `outQuart`: 1 - (1 - x)^4. */
const outQuart = (x: number) => 1 - Math.pow(1 - x, 4);
const outBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** Normalized progress of `t` through a segment starting at `from` lasting `len`. */
const seg = (t: number, from: number, len: number) =>
  clamp01((t - from) / (len || 1));

/* ------------------------------- canvas helpers ---------------------------- */

let cachedFamily: string | null = null;
function fontFamily(): string {
  if (!cachedFamily && typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-manrope')
      .trim();
    if (v) cachedFamily = v;
  }
  return cachedFamily || 'Manrope, sans-serif';
}

const font = (weight: number, size: number) =>
  `${weight} ${size}px ${fontFamily()}`;

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/* --------------------------------- presets --------------------------------- */

export const headline: ReelPreset = {
  id: 'headline',
  name: 'Kinetic Headline',
  category: 'Headlines',
  slots: ['start'],
  window: 'First 3s',
  duration: 3.4,
  start: 0,
  fields: [{ key: 'text', label: 'Headline text', value: 'Big news today' }],
  draw(ctx, t, duration, v) {
    const words = (v.text || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    if (!words.length) return;
    const size = 132;
    const lineH = 158;
    const top = 360;
    const padX = 110;
    const barIn = outQuart(seg(t, 0, 0.35));
    const barOut = inCubic(seg(t, duration - 0.65, 0.3));
    if (barIn > 0 && barOut < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - barOut;
      ctx.translate(padX + barOut * 40, top - 64);
      ctx.scale(barIn, 1);
      ctx.fillStyle = RED;
      ctx.fillRect(0, 0, 150, 18);
      ctx.restore();
    }
    ctx.save();
    ctx.font = font(800, size);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 28;
    words.forEach((word, i) => {
      const inP = outQuart(seg(t, 0.3 + i * 0.28, 0.55));
      const outP = inCubic(seg(t, duration - 0.75 + i * 0.07, 0.4));
      if (inP === 0 || outP === 1) return;
      const y = top + i * lineH;
      const dy = (1 - inP) * (lineH + 30) - outP * (lineH + 30);
      ctx.save();
      ctx.beginPath();
      ctx.rect(padX - 6, y - 8, DESIGN_W - padX * 2 + 12, lineH);
      ctx.clip();
      ctx.fillText(word, padX, y + dy);
      ctx.restore();
    });
    ctx.restore();
  },
};

export const breaking: ReelPreset = {
  id: 'breaking',
  name: 'Breaking Banner',
  category: 'Newsroom',
  slots: ['start', 'middle'],
  window: '0–5s',
  duration: 5,
  start: 0,
  fields: [
    { key: 'text', label: 'Banner text', value: 'Supreme Court rules on charter case' },
  ],
  draw(ctx, t, duration, v) {
    const fade = 1 - seg(t, duration - 0.4, 0.4);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    const tagIn = outBack(seg(t, 0, 0.3));
    if (tagIn > 0) {
      const tagW = 300;
      const tagH = 74;
      ctx.save();
      ctx.translate(80 + tagW / 2, 120 + tagH / 2);
      const s = Math.max(tagIn, 0.001);
      ctx.scale(s, s);
      ctx.fillStyle = RED;
      roundRect(ctx, -tagW / 2, -tagH / 2, tagW, tagH, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(800, 38);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BREAKING', 0, 2);
      ctx.restore();
    }
    const barIn = outCubic(seg(t, 0.15, 0.4));
    if (barIn > 0) {
      const barH = 140;
      const barY = DESIGN_H - 260 - (1 - barIn) * (barH + 40);
      ctx.fillStyle = 'rgba(10,14,18,0.92)';
      ctx.fillRect(0, barY, DESIGN_W, barH);
      ctx.font = font(700, 54);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const text = (v.text || '').toUpperCase();
      const unit = Math.max(ctx.measureText(`${text}   •   `).width, 100);
      const x = -((t * 240) % unit);
      for (let i = 0; i < Math.ceil(DESIGN_W / unit) + 2; i++) {
        ctx.fillText(`${text}   •   `, x + i * unit, barY + barH / 2 + 2);
      }
    }
    ctx.restore();
  },
};

export const lowerthird: ReelPreset = {
  id: 'lowerthird',
  name: 'Lower Third',
  category: 'Newsroom',
  slots: ['start', 'middle'],
  window: '1–4s',
  duration: 3.4,
  start: 1,
  fields: [{ key: 'name', label: 'Reporter name', value: 'Maria Santos' }],
  draw(ctx, t, duration, v) {
    const inP = outCubic(seg(t, 0, 0.45));
    const outP = inCubic(seg(t, duration - 0.45, 0.45));
    if (inP === 0 || outP === 1) return;
    const name = (v.name || '').toUpperCase();
    ctx.save();
    ctx.translate((inP - 1) * 640 - outP * 640, 0);
    ctx.font = font(800, 62);
    const panelW = Math.max(ctx.measureText(name).width + 110, 430);
    const bx = 70;
    const by = DESIGN_H - 430;
    const bh = 150;
    ctx.fillStyle = RED;
    ctx.fillRect(bx, by, 16, bh);
    ctx.fillStyle = 'rgba(10,14,18,0.92)';
    ctx.fillRect(bx + 16, by, panelW, bh);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, bx + 52, by + 52);
    ctx.globalAlpha = seg(t, 0.35, 0.3);
    ctx.font = font(700, 34);
    ctx.fillStyle = '#f7b3ad';
    ctx.fillText('FIELD REPORTER', bx + 52, by + 110);
    ctx.restore();
  },
};

export const captionpop: ReelPreset = {
  id: 'captionpop',
  name: 'Caption Pop',
  category: 'Captions',
  slots: ['start', 'middle'],
  window: 'After 1.5s',
  duration: 4,
  start: 1.5,
  fields: [
    { key: 'text', label: 'Caption words', value: 'The cleanup started at dawn' },
  ],
  draw(ctx, t, duration, v) {
    const words = (v.text || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10);
    if (!words.length) return;
    const fadeOut = 1 - seg(t, duration - 0.45, 0.45);
    if (fadeOut <= 0) return;
    ctx.save();
    ctx.font = font(800, 58);
    ctx.textBaseline = 'middle';
    const padX = 24;
    const chipH = 96;
    const gap = 16;
    const rows: { word: string; w: number }[][] = [[]];
    let rowW = 0;
    const maxW = DESIGN_W - 180;
    for (const word of words) {
      const w = ctx.measureText(word).width + padX * 2;
      const lineW = rows[rows.length - 1];
      rowW = lineW.reduce((sum, c) => sum + c.w + gap, -gap);
      if (rowW + w > maxW && lineW.length) rows.push([{ word, w }]);
      else rows[rows.length - 1].push({ word, w });
    }
    const blockH = rows.length * chipH + (rows.length - 1) * gap;
    let y = 1480 - blockH / 2;
    let index = 0;
    rows.forEach((row) => {
      const total = row.reduce((sum, c) => sum + c.w + gap, -gap);
      let x = (DESIGN_W - total) / 2;
      row.forEach(({ word, w }) => {
        const p = outBack(seg(t, index * 0.22, 0.32));
        if (p > 0.001) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, p) * fadeOut;
          ctx.translate(x + w / 2, y + chipH / 2);
          ctx.scale(p, p);
          ctx.fillStyle = 'rgba(10,14,18,0.85)';
          roundRect(ctx, -w / 2, -chipH / 2, w, chipH, 16);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(word, -w / 2 + padX, 2);
          ctx.restore();
        }
        x += w + gap;
        index += 1;
      });
      y += chipH + gap;
    });
    ctx.restore();
  },
};

export const quote: ReelPreset = {
  id: 'quote',
  name: 'Quote Reveal',
  category: 'Headlines',
  slots: ['middle'],
  window: 'Mid reel',
  duration: 4,
  start: 3,
  fields: [
    { key: 'text', label: 'Quote', value: '“We will finish what we started.”' },
    { key: 'by', label: 'Attribution', value: '— Mayor Lim' },
  ],
  draw(ctx, t, duration, v) {
    const inP = outCubic(seg(t, 0, 0.45));
    const outP = inCubic(seg(t, duration - 0.45, 0.45));
    if (inP === 0 || outP === 1) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, inP * 1.4) * (1 - outP);
    ctx.translate(0, (1 - inP) * 60 - outP * 50);
    const cardX = 90;
    const cardW = DESIGN_W - cardX * 2;
    ctx.font = font(600, 58);
    const lines = wrapText(ctx, v.text || '', cardW - 130);
    const lineH = 84;
    const cardH = lines.length * lineH + 150;
    const cardY = 830 - cardH / 2;
    ctx.fillStyle = 'rgba(10,14,18,0.62)';
    roundRect(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.fillRect(cardX, cardY, 14, cardH);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, cardX + 64, cardY + 54 + i * lineH);
    });
    ctx.font = font(700, 36);
    ctx.fillStyle = '#c8d2d8';
    ctx.fillText((v.by || '').toUpperCase(), cardX + 64, cardY + cardH - 82);
    ctx.restore();
  },
};

export const stat: ReelPreset = {
  id: 'stat',
  name: 'Stat Pop',
  category: 'Headlines',
  slots: ['start', 'middle'],
  window: '0–3s',
  duration: 3.2,
  start: 0.5,
  fields: [
    { key: 'num', label: 'Big number', value: '72%' },
    { key: 'label', label: 'Stat label', value: 'of flood projects audited' },
  ],
  draw(ctx, t, duration, v) {
    const inP = outQuart(seg(t, 0, 0.4));
    const outP = seg(t, duration - 0.4, 0.4);
    if (inP === 0 || outP === 1) return;
    ctx.save();
    ctx.globalAlpha = (1 - outP) * Math.min(1, inP * 1.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = DESIGN_W / 2;
    const cy = 830;
    const scale = 1.9 - 0.9 * inP;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.font = font(800, 300);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 44;
    const match = /^(\d+)/.exec(v.num || '');
    const countP = outQuart(seg(t, 0.1, 0.75));
    const shown = match
      ? `${Math.round(Number(match[1]) * countP)}${(v.num || '').slice(match[1].length)}`
      : v.num || '';
    ctx.fillText(shown, 0, 0);
    ctx.restore();
    const ruleIn = outCubic(seg(t, 0.35, 0.35));
    ctx.save();
    ctx.translate(cx, cy + 220);
    ctx.scale(ruleIn, 1);
    ctx.fillStyle = RED;
    ctx.fillRect(-100, 0, 200, 14);
    ctx.restore();
    ctx.font = font(700, 46);
    ctx.fillStyle = '#d7e0e6';
    ctx.fillText((v.label || '').toUpperCase(), cx, cy + 300);
    ctx.restore();
  },
};

export const punchzoom: ReelPreset = {
  id: 'punchzoom',
  name: 'Punch Zoom',
  category: 'Motion',
  slots: ['start', 'middle', 'end'],
  window: 'On beat drops',
  duration: 2.4,
  start: 2,
  fields: [],
  scale(t) {
    const inP = outQuart(seg(t, 0, 0.3));
    const outP = inCubic(seg(t, 2.0, 0.4));
    return 1 + 0.16 * inP * (1 - outP);
  },
};

export const logosting: ReelPreset = {
  id: 'logosting',
  name: 'Logo Sting',
  category: 'Branding',
  slots: ['start', 'end'],
  window: 'Intro / outro',
  duration: 2.6,
  start: 0.2,
  fields: [{ key: 'text', label: 'Mark', value: 'PN' }],
  draw(ctx, t, duration, v) {
    const ringIn = outBack(seg(t, 0, 0.45));
    const outP = seg(t, duration - 0.5, 0.5);
    const flash = seg(t, 0.55, 0.12) * (1 - seg(t, 0.67, 0.12));
    if ((ringIn === 0 && flash === 0) || outP === 1) return;
    const cx = DESIGN_W / 2;
    const cy = 850;
    const s = (1 + outP * 0.25) * Math.max(ringIn, 0.001);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.globalAlpha = 1 - outP;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 170, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((v.text || 'PN').toUpperCase(), 0, 4);
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(flash * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }
  },
};

export const endcard: ReelPreset = {
  id: 'endcard',
  name: 'End Card',
  category: 'Branding',
  slots: ['end'],
  window: 'Last 4s',
  duration: 3.6,
  start: 0,
  fields: [
    { key: 'text', label: 'End card text', value: 'Follow for daily news' },
  ],
  draw(ctx, t, duration, v) {
    const ovIn = seg(t, 0, 0.4);
    const outP = seg(t, duration - 0.5, 0.5);
    if (ovIn === 0 || outP === 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - outP;
    ctx.fillStyle = `rgba(8,12,16,${(0.78 * ovIn).toFixed(3)})`;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    const words = (v.text || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    const size = words.length > 3 ? 92 : 108;
    const lineH = size * 1.16;
    const top = 810 - (words.length * lineH) / 2;
    ctx.font = font(800, size);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    const cx = DESIGN_W / 2;
    words.forEach((word, i) => {
      const inP = outQuart(seg(t, 0.3 + i * 0.18, 0.55));
      if (inP === 0) return;
      const y = top + i * lineH;
      const w = ctx.measureText(word).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(80, y - 8, DESIGN_W - 160, lineH);
      ctx.clip();
      ctx.fillText(word, cx - w / 2, y + (1 - inP) * (lineH + 20));
      ctx.restore();
    });
    const btnP = outBack(seg(t, 0.75, 0.35));
    if (btnP > 0.001) {
      const label = 'Follow';
      ctx.save();
      ctx.translate(cx, top + words.length * lineH + 150);
      ctx.scale(Math.max(btnP, 0.001), Math.max(btnP, 0.001));
      ctx.font = font(800, 48);
      const bw = ctx.measureText(label).width + 130;
      ctx.fillStyle = RED;
      roundRect(ctx, -bw / 2, -52, bw, 104, 52);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 2);
      ctx.restore();
    }
    ctx.restore();
  },
};

export const REEL_PRESETS: ReelPreset[] = [
  { id: 'none', name: 'None', category: 'Headlines', slots: [], window: 'No animation', duration: 0, start: 0, fields: [] },
  headline,
  breaking,
  lowerthird,
  captionpop,
  quote,
  stat,
  punchzoom,
  logosting,
  endcard,
];

export const PRESET_CATEGORIES = [
  'All',
  'Headlines',
  'Captions',
  'Newsroom',
  'Branding',
  'Motion',
] as const;

/** Silence between looped repeats of an effect, in seconds. */
export const LOOP_GAP_SECONDS = 0.4;

/** Effect start time for `slot` on a reel of `videoDuration` seconds. */
export function slotStart(
  preset: ReelPreset,
  slot: PresetSlot,
  videoDuration: number
): number {
  if (slot === 'end') {
    return Math.max(0, videoDuration - preset.duration - 0.2);
  }
  if (slot === 'middle') {
    return Math.max(0, videoDuration / 2 - preset.duration / 2);
  }
  return preset.start;
}

/**
 * Local seconds into an effect at absolute reel time `t`, or null while the
 * effect is off screen — before its start, after a single play finishes, or
 * inside the gap between looped repeats. Looped effects cycle
 * `duration + LOOP_GAP_SECONDS` so each repeat plays the effect's own in/out
 * animation before the next one begins.
 */
export function effectLocalTime(
  t: number,
  start: number,
  duration: number,
  loop: boolean
): number | null {
  if (t < start) return null;
  const local = loop ? (t - start) % (duration + LOOP_GAP_SECONDS) : t - start;
  return local <= duration ? local : null;
}

/** A planned effect: a preset resolved to one absolute time on a reel. */
export type PlannedEffect = {
  preset: ReelPreset;
  slot: PresetSlot;
  loop: boolean;
  /** Absolute reel time the effect (or its first looped cycle) starts. */
  start: number;
  values: PresetValues;
};

/**
 * Resolves the picker's attachments into concrete timed effects for one reel:
 * slots become absolute times, unknown/incompatible picks are dropped, and
 * 'end' effects never loop (their single play already closes the reel).
 */
export function planEffects(
  attachments: ReelAttachment[],
  videoDuration: number,
  values: Record<string, PresetValues> = {}
): PlannedEffect[] {
  const planned: PlannedEffect[] = [];
  for (const attachment of attachments) {
    const preset = getPreset(attachment.presetId);
    if (!preset || preset.id === 'none') continue;
    if (!preset.draw && !preset.scale) continue;
    if (!preset.slots.includes(attachment.slot)) continue;
    planned.push({
      preset,
      slot: attachment.slot,
      loop: attachment.loop && attachment.slot !== 'end',
      start: slotStart(preset, attachment.slot, videoDuration),
      values: values[attachment.presetId] ?? {},
    });
  }
  return planned;
}

/** Reads the picker's per-slot selection into bake-ready attachments. */
export function attachmentsFromSlots(
  slots: Record<PresetSlot, string | null>,
  loops: Record<PresetSlot, boolean>
): ReelAttachment[] {
  return SLOT_ORDER.flatMap((slot) => {
    const presetId = slots[slot];
    if (!presetId || presetId === 'none') return [];
    return [{ presetId, slot, loop: loops[slot] }];
  });
}

export function getPreset(id: string | null | undefined): ReelPreset | null {
  if (!id) return null;
  return REEL_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function defaultPresetValues(): Record<string, PresetValues> {
  return Object.fromEntries(
    REEL_PRESETS.map((preset) => [
      preset.id,
      Object.fromEntries(preset.fields.map((field) => [field.key, field.value])),
    ])
  );
}
