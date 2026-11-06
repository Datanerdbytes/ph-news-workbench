import { gsap } from 'gsap';

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
 * are anchored by the registry (`start` / `anchor: 'end'`), not by callers.
 */

export type PresetValues = Record<string, string>;

export type PresetField = { key: string; label: string; value: string };

export type PresetCategory =
  | 'Headlines'
  | 'Captions'
  | 'Newsroom'
  | 'Branding'
  | 'Motion';

type Ctx = CanvasRenderingContext2D;
type Timeline = ReturnType<typeof gsap.timeline>;

export type ReelPreset = {
  id: string;
  name: string;
  category: PresetCategory;
  /** Display label for where the effect lands on the reel. */
  window: string;
  /** Effect length in seconds. */
  duration: number;
  /** Seconds into the reel where the effect starts (when `anchor` is 'start'). */
  start: number;
  /** 'end' anchors the effect to the last `duration` seconds of the reel. */
  anchor?: 'start' | 'end';
  /** Text inputs the user can edit for this preset. */
  fields: PresetField[];
  /** Render one frame at local time `t` in a 1080×1920 design space. */
  draw?: (ctx: Ctx, t: number, duration: number, values: PresetValues) => void;
  /** Frame zoom multiplier over local time (camera motion baked into footage). */
  scale?: (t: number) => number;
  /** Build the looping DOM preview for picker cards. */
  mount?: (stage: HTMLElement, values: PresetValues) => Timeline | null;
};

const RED = '#d92d20';
const DESIGN_W = 1080;
const DESIGN_H = 1920;

/* ---------------------------------- easing --------------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inCubic = (x: number) => x * x * x;
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

const headline: ReelPreset = {
  id: 'headline',
  name: 'Kinetic Headline',
  category: 'Headlines',
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
    const barIn = outCubic(seg(t, 0, 0.35));
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
      const inP = outCubic(seg(t, 0.3 + i * 0.28, 0.55));
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
  mount(stage, v) {
    addStageBg(stage);
    const wrap = div(stage, 'position:absolute;left:20px;right:20px;top:52px;');
    const bar = div(
      wrap,
      'position:absolute;top:-14px;left:0;width:34px;height:5px;background:' +
        RED +
        ';border-radius:2px;'
    );
    const words = (v.text || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    const wordEls = words.map((w) =>
      maskedWord(wrap, 'font-weight:800;font-size:30px;line-height:1.14;letter-spacing:-.3px;color:#fff;text-transform:uppercase;text-shadow:0 2px 16px rgba(0,0,0,.38);', w)
    );
    return loop((tl) => {
      tl.from(bar, { scaleX: 0, transformOrigin: '0 50%', duration: 0.35, ease: 'power3.out' })
        .from(wordEls, { yPercent: 118, duration: 0.55, stagger: 0.16, ease: 'power4.out' }, '-=0.1')
        .to(wordEls, { yPercent: -118, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, '+=1.1')
        .to(bar, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.3, ease: 'power2.in' }, '-=0.35');
    });
  },
};

const breaking: ReelPreset = {
  id: 'breaking',
  name: 'Breaking Banner',
  category: 'Newsroom',
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
  mount(stage, v) {
    addStageBg(stage);
    const tag = div(
      stage,
      'position:absolute;top:18px;left:16px;background:' +
        RED +
        ';color:#fff;font-size:10px;font-weight:800;letter-spacing:.12em;padding:4px 9px;border-radius:3px;',
      'BREAKING'
    );
    const bar = div(
      stage,
      'position:absolute;left:0;right:0;bottom:44px;height:36px;background:rgba(10,14,18,.92);overflow:hidden;'
    );
    const tick = div(
      bar,
      'position:absolute;left:0;top:50%;margin-top:-9px;white-space:nowrap;color:#fff;font-size:12px;font-weight:700;letter-spacing:.04em;',
      `${(v.text || '').toUpperCase()}   •   `.repeat(3)
    );
    return loop((tl) => {
      tl.from(tag, { scale: 1.7, opacity: 0, duration: 0.3, ease: 'back.out(2.2)' })
        .from(bar, { yPercent: 130, duration: 0.4, ease: 'power3.out' }, '-=0.05')
        .fromTo(tick, { xPercent: 8 }, { xPercent: -60, duration: 5, ease: 'none' }, '-=0.2')
        .to([tag, bar], { opacity: 0, duration: 0.35 }, '+=0.2');
    });
  },
};

const lowerthird: ReelPreset = {
  id: 'lowerthird',
  name: 'Lower Third',
  category: 'Newsroom',
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
  mount(stage, v) {
    addStageBg(stage);
    const wrap = div(
      stage,
      'position:absolute;left:14px;bottom:64px;display:flex;align-items:stretch;'
    );
    div(wrap, 'width:4px;background:' + RED + ';');
    const body = div(
      wrap,
      'background:rgba(10,14,18,.92);padding:8px 14px 9px 12px;'
    );
    const name = div(
      body,
      'color:#fff;font-size:15px;font-weight:800;letter-spacing:-.2px;',
      v.name || ''
    );
    const role = div(
      body,
      'color:#f7b3ad;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:2px;',
      'Field reporter'
    );
    return loop((tl) => {
      tl.from(wrap, { xPercent: -130, duration: 0.45, ease: 'power3.out' })
        .from(role, { opacity: 0, duration: 0.3 }, '-=0.15')
        .to(wrap, { xPercent: -130, duration: 0.4, ease: 'power3.in' }, '+=1.4');
    });
  },
};

const captionpop: ReelPreset = {
  id: 'captionpop',
  name: 'Caption Pop',
  category: 'Captions',
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
  mount(stage, v) {
    addStageBg(stage);
    const wrap = div(
      stage,
      'position:absolute;left:18px;right:18px;bottom:110px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;'
    );
    const chips = (v.text || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) =>
        div(
          wrap,
          'background:rgba(10,14,18,.85);color:#fff;font-size:15px;font-weight:800;padding:5px 11px;border-radius:7px;text-transform:uppercase;',
          w
        )
      );
    return loop((tl) => {
      tl.from(chips, { scale: 0, opacity: 0, duration: 0.32, stagger: 0.22, ease: 'back.out(2.4)' })
        .to(chips, { opacity: 0, duration: 0.3, stagger: 0.03 }, '+=0.7');
    });
  },
};

const quote: ReelPreset = {
  id: 'quote',
  name: 'Quote Reveal',
  category: 'Headlines',
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
  mount(stage, v) {
    addStageBg(stage);
    const card = div(
      stage,
      'position:absolute;left:22px;right:22px;top:44%;background:rgba(10,14,18,.62);border-left:3px solid ' +
        RED +
        ';border-radius:10px;padding:16px 16px 13px;'
    );
    div(card, 'color:#fff;font-size:15.5px;font-weight:700;line-height:1.45;', v.text || '');
    const by = div(
      card,
      'color:#c8d2d8;font-size:10px;font-weight:700;margin-top:8px;letter-spacing:.06em;text-transform:uppercase;',
      v.by || ''
    );
    return loop((tl) => {
      tl.from(card, { y: 26, opacity: 0, duration: 0.45, ease: 'power3.out' })
        .from(by, { opacity: 0, y: 6, duration: 0.3 }, '-=0.1')
        .to(card, { opacity: 0, y: -14, duration: 0.4, ease: 'power2.in' }, '+=1.6');
    });
  },
};

const stat: ReelPreset = {
  id: 'stat',
  name: 'Stat Pop',
  category: 'Headlines',
  window: '0–3s',
  duration: 3.2,
  start: 0.5,
  fields: [
    { key: 'num', label: 'Big number', value: '72%' },
    { key: 'label', label: 'Stat label', value: 'of flood projects audited' },
  ],
  draw(ctx, t, duration, v) {
    const inP = outCubic(seg(t, 0, 0.4));
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
    const countP = outCubic(seg(t, 0.1, 0.75));
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
  mount(stage, v) {
    addStageBg(stage);
    const wrap = div(
      stage,
      'position:absolute;left:20px;right:20px;top:40%;text-align:center;'
    );
    const num = div(
      wrap,
      'color:#fff;font-size:54px;font-weight:800;letter-spacing:-2px;line-height:1;text-shadow:0 4px 22px rgba(0,0,0,.4);',
      v.num || ''
    );
    div(
      wrap,
      'width:46px;height:4px;background:' +
        RED +
        ';border-radius:2px;margin:12px auto 0;'
    );
    div(
      wrap,
      'color:#d7e0e6;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:8px;',
      v.label || ''
    );
    return loop((tl) => {
      tl.from(num, { scale: 1.9, opacity: 0, duration: 0.4, ease: 'power4.out' })
        .to(wrap, { opacity: 0, duration: 0.35 }, '+=1.2');
    });
  },
};

const punchzoom: ReelPreset = {
  id: 'punchzoom',
  name: 'Punch Zoom',
  category: 'Motion',
  window: 'On beat drops',
  duration: 2.4,
  start: 2,
  fields: [],
  scale(t) {
    const inP = outCubic(seg(t, 0, 0.3));
    const outP = inCubic(seg(t, 2.0, 0.4));
    return 1 + 0.16 * inP * (1 - outP);
  },
  mount(stage) {
    const bg = addStageBg(stage);
    div(
      stage,
      'position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 45%, transparent 55%, rgba(5,10,14,.55) 100%);'
    );
    return loop((tl) => {
      tl.fromTo(bg, { scale: 1 }, { scale: 1.16, duration: 0.3, ease: 'power4.out' }).to(
        bg,
        { scale: 1, duration: 0.35, ease: 'power2.inOut' },
        '+=1.0'
      );
    });
  },
};

const logosting: ReelPreset = {
  id: 'logosting',
  name: 'Logo Sting',
  category: 'Branding',
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
  mount(stage, v) {
    addStageBg(stage);
    const ring = div(
      stage,
      'position:absolute;left:50%;top:44%;width:84px;height:84px;margin:-42px 0 0 -42px;border:3px solid #fff;border-radius:50%;'
    );
    const mark = div(
      stage,
      'position:absolute;left:50%;top:44%;width:84px;height:84px;margin:-42px 0 0 -42px;display:grid;place-items:center;color:#fff;font-size:24px;font-weight:800;letter-spacing:1px;',
      (v.text || 'PN').toUpperCase()
    );
    const flash = div(stage, 'position:absolute;inset:0;background:#fff;opacity:0;');
    return loop((tl) => {
      tl.from(ring, { scale: 0, duration: 0.45, ease: 'back.out(2)' })
        .from(mark, { scale: 0, duration: 0.4, ease: 'back.out(2.4)' }, '-=0.25')
        .to(flash, { opacity: 0.4, duration: 0.12, yoyo: true, repeat: 1 }, '-=0.1')
        .to([ring, mark], { scale: 1.25, opacity: 0, duration: 0.4, ease: 'power2.in' }, '+=0.8');
    });
  },
};

const endcard: ReelPreset = {
  id: 'endcard',
  name: 'End Card',
  category: 'Branding',
  window: 'Last 4s',
  duration: 3.6,
  start: 0,
  anchor: 'end',
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
      const inP = outCubic(seg(t, 0.3 + i * 0.18, 0.55));
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
  mount(stage, v) {
    addStageBg(stage);
    const ov = div(stage, 'position:absolute;inset:0;background:rgba(8,12,16,.78);');
    const wrap = div(
      stage,
      'position:absolute;left:24px;right:24px;top:42%;text-align:center;'
    );
    const title = maskedWord(
      wrap,
      'font-weight:800;font-size:21px;line-height:1.2;color:#fff;text-transform:uppercase;text-shadow:0 2px 16px rgba(0,0,0,.4);',
      v.text || ''
    );
    const btn = div(
      wrap,
      'display:inline-block;margin-top:14px;background:' +
        RED +
        ';color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.06em;padding:8px 18px;border-radius:999px;',
      'Follow'
    );
    return loop((tl) => {
      tl.from(ov, { opacity: 0, duration: 0.4 })
        .from(title, { yPercent: 120, duration: 0.5, ease: 'power4.out' }, '-=0.1')
        .from(btn, { scale: 0, duration: 0.35, ease: 'back.out(2.2)' }, '-=0.2')
        .to([ov, wrap], { opacity: 0, duration: 0.4 }, '+=1.6');
    });
  },
};

export const REEL_PRESETS: ReelPreset[] = [
  { id: 'none', name: 'None', category: 'Headlines', window: 'No animation', duration: 0, start: 0, fields: [] },
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

/** Effect start time within a reel of `videoDuration` seconds. */
export function presetStart(preset: ReelPreset, videoDuration: number): number {
  if (preset.anchor === 'end') {
    return Math.max(0, videoDuration - preset.duration - 0.2);
  }
  return preset.start;
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

/* ----------------------------- DOM preview helpers ------------------------- */

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function loop(fn: (tl: Timeline) => void): Timeline | null {
  if (prefersReducedMotion()) return null;
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.9 });
  fn(tl);
  return tl;
}

function div(parent: HTMLElement, css: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText = css;
  if (text != null) d.textContent = text;
  parent.appendChild(d);
  return d;
}

/** Simulated footage background shared by every DOM preview. */
function addStageBg(stage: HTMLElement): HTMLDivElement {
  stage.style.fontFamily = fontFamily();
  return div(
    stage,
    'position:absolute;inset:0;background:radial-gradient(120% 90% at 22% 10%, #2b4a52 0%, #16323a 46%, #0d2127 100%);'
  );
}

/** Masked word: clipped container + inner span that GSAP slides in from below. */
function maskedWord(parent: HTMLElement, css: string, text: string): HTMLDivElement {
  const mask = div(parent, 'display:block;overflow:hidden;');
  return div(mask, css, text);
}

/**
 * Mount a preset's looping DOM preview into a 270×480 design-space stage.
 * Returns the timeline so the caller can kill it on cleanup.
 */
export function mountPreset(
  stage: HTMLElement,
  presetId: string,
  values: PresetValues
): Timeline | null {
  stage.innerHTML = '';
  const preset = getPreset(presetId);
  if (!preset?.mount) return null;
  return preset.mount(stage, values ?? {});
}
