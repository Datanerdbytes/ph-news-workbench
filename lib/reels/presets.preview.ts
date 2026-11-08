import { gsap } from 'gsap';
import {
  REEL_PRESETS,
  headline,
  breaking,
  lowerthird,
  captionpop,
  quote,
  stat,
  punchzoom,
  logosting,
  endcard,
  getPreset,
  type PresetValues,
  type ReelPreset,
} from './presets';

type Timeline = ReturnType<typeof gsap.timeline>;

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

/** Simulated footage background shared by every DOM preview. Bright enough
 * that the translucent panels read the way they will over real footage. */
function addStageBg(stage: HTMLElement): HTMLDivElement {
  stage.style.fontFamily = 'Manrope, sans-serif';
  return div(
    stage,
    'position:absolute;inset:0;background:radial-gradient(120% 90% at 22% 10%, #93b1bd 0%, #5e7d8a 46%, #365661 100%);'
  );
}

/** Masked word: clipped container + inner span that GSAP slides in from below. */
function maskedWord(parent: HTMLElement, css: string, text: string): HTMLDivElement {
  const mask = div(parent, 'display:block;overflow:hidden;');
  return div(mask, css, text);
}

/* --------------------------------- mounts ---------------------------------- */

const headlineMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
  addStageBg(stage);
  const wrap = div(stage, 'position:absolute;left:20px;right:20px;top:52px;');
  const bar = div(
    wrap,
    'position:absolute;top:-14px;left:0;width:34px;height:5px;background:#d92d20;border-radius:2px;'
  );
  const words = (v.text || '')
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const wordEls = words.map((w) =>
    maskedWord(
      wrap,
      'font-weight:800;font-size:30px;line-height:1.14;letter-spacing:-.3px;color:#fff;text-transform:uppercase;text-shadow:0 2px 16px rgba(0,0,0,.38);',
      w
    )
  );
  return loop((tl) => {
    tl.from(bar, { scaleX: 0, transformOrigin: '0 50%', duration: 0.35, ease: 'power3.out' })
      .from(wordEls, { yPercent: 118, duration: 0.55, stagger: 0.16, ease: 'power4.out' }, '-=0.1')
      .to(wordEls, { yPercent: -118, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, '+=1.1')
      .to(bar, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.3, ease: 'power2.in' }, '-=0.35');
  });
};

const breakingMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
  addStageBg(stage);
  const tag = div(
    stage,
    'position:absolute;top:18px;left:16px;background:#d92d20;color:#fff;font-size:10px;font-weight:800;letter-spacing:.12em;padding:4px 9px;border-radius:3px;',
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
};

const lowerthirdMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
  addStageBg(stage);
  const wrap = div(
    stage,
    'position:absolute;left:14px;bottom:64px;display:flex;align-items:stretch;'
  );
  div(wrap, 'width:4px;background:#d92d20;');
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
};

const captionpopMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
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
};

const quoteMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
  addStageBg(stage);
  const card = div(
    stage,
    'position:absolute;left:22px;right:22px;top:44%;background:rgba(10,14,18,.62);border-left:3px solid #d92d20;border-radius:10px;padding:16px 16px 13px;'
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
};

const statMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
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
    'width:46px;height:4px;background:#d92d20;border-radius:2px;margin:12px auto 0;'
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
};

const punchzoomMount = (stage: HTMLElement): Timeline | null => {
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
};

const logostingMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
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
};

const endcardMount = (stage: HTMLElement, v: PresetValues): Timeline | null => {
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
    'display:inline-block;margin-top:14px;background:#d92d20;color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.06em;padding:8px 18px;border-radius:999px;',
    'Follow'
  );
  return loop((tl) => {
    tl.from(ov, { opacity: 0, duration: 0.4 })
      .from(title, { yPercent: 120, duration: 0.5, ease: 'power4.out' }, '-=0.1')
      .from(btn, { scale: 0, duration: 0.35, ease: 'back.out(2.2)' }, '-=0.2')
      .to([ov, wrap], { opacity: 0, duration: 0.4 }, '+=1.6');
  });
};

// Attach the GSAP mount functions to the preset objects (core is GSAP-free).
(headline as ReelPreset).mount = headlineMount;
(breaking as ReelPreset).mount = breakingMount;
(lowerthird as ReelPreset).mount = lowerthirdMount;
(captionpop as ReelPreset).mount = captionpopMount;
(quote as ReelPreset).mount = quoteMount;
(stat as ReelPreset).mount = statMount;
(punchzoom as ReelPreset).mount = punchzoomMount;
(logosting as ReelPreset).mount = logostingMount;
(endcard as ReelPreset).mount = endcardMount;

/**
 * Mount a preset's looping DOM preview into a 270×480 design-space stage.
 * Returns the timeline so the caller can kill it on cleanup.
 */
export function mountPreset(
  stage: HTMLElement,
  presetId: string,
  values: PresetValues
): Timeline | null {
  const preset = getPreset(presetId);
  if (!preset?.mount) return null;
  return preset.mount(stage, values ?? {}) as Timeline | null;
}
