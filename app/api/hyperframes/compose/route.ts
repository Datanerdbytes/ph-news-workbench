import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { chatCompletion, resolveComposerLlm, type ChatMessage } from '@/lib/llm';
import { adoptFootage, localRuntimeEnabled } from '@/lib/hyperframes/project';
import {
  probeVideoDurationSeconds,
  transcodeToReelFootage,
} from '@/lib/hyperframes/media';
import { stopPreviewServer } from '@/lib/hyperframes/preview';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DURATION = 3;
const MAX_DURATION = 90;
const MAX_BRIEF = 2000;
const MAX_OUTPUT_TOKENS = 8000;
const MAX_FOOTAGE_BYTES = 100 * 1024 * 1024;
const FOOTAGE_SRC = 'assets/footage.mp4';
const GSAP_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js';

function extractHtml(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i);
  if (fence) text = fence[1].trim();
  const docStart = text.search(/<!doctype html|<html[\s>]/i);
  if (docStart > 0) text = text.slice(docStart);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) text = text.slice(0, end + 7);
  return text.trim();
}

/**
 * Models keep omitting required attributes on the footage tag; patch them in
 * deterministically instead of burning another LLM round-trip on rejection.
 */
function normalizeFootageTag(html: string): string {
  return html.replace(/<video\b[^>]*>/i, (tag) => {
    let fixed = tag;
    const append = (attrs: string) => fixed.replace(/(\/?>)$/, ` ${attrs}$1`);
    if (attribute(fixed, 'src') === null) {
      fixed = append(`src="${FOOTAGE_SRC}"`);
    } else if (attribute(fixed, 'src') !== FOOTAGE_SRC) {
      fixed = fixed.replace(/\ssrc\s*=\s*(["'])[^"']*\1/i, ` src="${FOOTAGE_SRC}"`);
    }
    if (attribute(fixed, 'id') === null) {
      fixed = append('id="footage"');
    }
    if (!hasAttribute(fixed, 'playsinline')) {
      fixed = append('playsinline');
    }
    if (
      attribute(fixed, 'data-has-audio') !== 'true' &&
      !hasAttribute(fixed, 'muted')
    ) {
      fixed = append('data-has-audio="true"');
    }
    fixed = fixed.replace(/\s+crossorigin(=\s*(["']).*?\2)?(?=[\s>])/gi, '');
    return fixed;
  });
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

// Boolean HTML attributes (playsinline, muted) carry no =value, so they need
// a presence check rather than the attribute() value matcher.
function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}(?![\\w-])`, 'i').test(tag);
}

function briefUrls(brief: string): Set<string> {
  return new Set(
    (brief.match(/https:\/\/[^\s"'<>]+/gi) ?? []).map((url) =>
      url.replace(/[),.;!?]+$/, '')
    )
  );
}

function validateComposition(
  html: string,
  expectedDuration: number,
  brief: string,
  footage: boolean
): { duration: number } | { error: string } {
  if (!/^(?:<!doctype html\s*>\s*)?<html[\s>]/i.test(html)) {
    return { error: 'The model did not return an HTML document. Try again.' };
  }
  const rootTag = html.match(
    /<([a-z][\w:-]*)\b(?=[^>]*\bid\s*=\s*(["'])root\2)[^>]*>/i
  )?.[0];
  if (!rootTag || attribute(rootTag, 'data-composition-id') !== 'main') {
    return { error: 'The composition is missing its HyperFrames root. Try again.' };
  }
  const rawDuration = attribute(rootTag, 'data-duration');
  const duration = Number(rawDuration);
  if (
    rawDuration === null ||
    !Number.isFinite(duration) ||
    duration < MIN_DURATION ||
    duration > MAX_DURATION
  ) {
    return { error: 'The composition is missing data-duration. Try again.' };
  }
  if (Math.abs(duration - expectedDuration) > 0.11) {
    return {
      error: `The composition must be exactly ${expectedDuration} seconds long. Try again.`,
    };
  }
  if (
    attribute(rootTag, 'data-start') === null ||
    Number(attribute(rootTag, 'data-start')) !== 0 ||
    attribute(rootTag, 'data-width') !== '1080' ||
    attribute(rootTag, 'data-height') !== '1920'
  ) {
    return { error: 'The composition must use a 1080×1920 portrait root. Try again.' };
  }
  if (!/window\.__timelines\s*\[\s*["']main["']\s*\]\s*=/i.test(html)) {
    return { error: 'The composition is missing its paused HyperFrames timeline. Try again.' };
  }
  const videoTags = [...html.matchAll(/<video\b[^>]*>/gi)].map((m) => m[0]);
  if (footage) {
    if (videoTags.length !== 1) {
      return {
        error: `With footage attached, use exactly one <video> element referencing ${FOOTAGE_SRC} as the full-bleed background. Try again.`,
      };
    }
    const videoTag = videoTags[0];
    if (attribute(videoTag, 'src') !== FOOTAGE_SRC) {
      return { error: `The footage video must use src="${FOOTAGE_SRC}". Try again.` };
    }
    if (attribute(videoTag, 'crossorigin') !== null) {
      return { error: 'The footage video must not set crossorigin. Try again.' };
    }
    if (!hasAttribute(videoTag, 'playsinline')) {
      return { error: 'The footage video must include playsinline. Try again.' };
    }
    if (
      attribute(videoTag, 'data-has-audio') !== 'true' &&
      !hasAttribute(videoTag, 'muted')
    ) {
      return {
        error: 'The footage video must set data-has-audio="true" or muted. Try again.',
      };
    }
  } else if (videoTags.length) {
    return {
      error:
        'Your brief asks for video footage, but none is attached. Choose your video with the "Attach footage" picker above the brief, then generate again.',
    };
  }
  if (
    /<(?:iframe|object|embed|link|base|audio)\b/i.test(html) ||
    /\bsrcset\s*=|\bposter\s*=|\bcrossorigin\b/i.test(html) ||
    /\bon[a-z]+\s*=/i.test(html) ||
    /@import\b|@font-face\b|url\s*\(|javascript:|data:text\/html/i.test(html)
  ) {
    return {
      error: 'The composition must be self-contained and cannot load external code or media.',
    };
  }

  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  const scriptSources = scriptTags
    .map((tag) => attribute(tag, 'src'))
    .filter((source): source is string => source !== null);
  if (
    scriptSources.length !== 1 ||
    scriptSources[0] !== GSAP_SCRIPT_URL ||
    html.indexOf(scriptTags.find((tag) => attribute(tag, 'src') === GSAP_SCRIPT_URL) ?? '') >
      html.search(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i)
  ) {
    return {
      error: 'Include only the documented GSAP runtime before the animation script.',
    };
  }

  const allowedImages = briefUrls(brief);
  const tags = html.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi);
  const ids = new Set<string>();
  for (const match of tags) {
    const tagName = match[1].toLowerCase();
    const tag = match[0];
    const source = attribute(tag, 'src');
    const href = attribute(tag, 'href') ?? attribute(tag, 'xlink:href');
    if (href && !href.startsWith('#')) {
      return { error: 'Composition links must stay inside the document. Try again.' };
    }
    if (/\bsrc\s*=\s*(?!["'])/i.test(tag)) {
      return { error: 'Composition asset URLs must be quoted.' };
    }
    if (source) {
      if (tagName === 'script' && source === GSAP_SCRIPT_URL) continue;
      if (tagName === 'video' && source === FOOTAGE_SRC) continue;
      let isHttps = false;
      try {
        isHttps = new URL(source).protocol === 'https:';
      } catch {
        isHttps = false;
      }
      if (tagName !== 'img' || !isHttps || !allowedImages.has(source)) {
        return {
          error: 'Only HTTPS image URLs included in the brief can be used. Try again.',
        };
      }
    }

    const id = attribute(tag, 'id');
    if (id) {
      if (ids.has(id)) {
        return { error: 'Composition element IDs must be unique. Try again.' };
      }
      ids.add(id);
    }

    const className = attribute(tag, 'class') ?? '';
    const start = attribute(tag, 'data-start');
    const clipDuration = attribute(tag, 'data-duration');
    if (
      (start !== null || clipDuration !== null) &&
      tag !== rootTag &&
      !className.split(/\s+/).includes('clip')
    ) {
      return { error: 'Every timed element must use the HyperFrames clip format. Try again.' };
    }
    if (className.split(/\s+/).includes('clip')) {
      const startSeconds = Number(start);
      const durationSeconds = Number(clipDuration);
      if (!id) {
        return { error: 'Every timed clip must have a stable ID. Try again.' };
      }
      if (
        start === null ||
        clipDuration === null ||
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(durationSeconds) ||
        startSeconds < 0 ||
        durationSeconds <= 0
      ) {
        return { error: 'A timed clip is missing valid data-start or data-duration values.' };
      }
      if (startSeconds + durationSeconds > duration + 0.001) {
        return { error: 'A timed clip extends past the requested composition duration.' };
      }
    }
  }

  const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (
    scriptBodies.some((script) =>
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|localStorage|sessionStorage|Image|Audio|createElement|requestAnimationFrame|setTimeout|setInterval)\b|document\.cookie|(?:window|document)\.location|Math\.random|Date\.now/i.test(
        script[1]
      )
    )
  ) {
    return { error: 'Composition scripts may only define deterministic timeline animation.' };
  }

  // The live preview opens paused at t=0, so frame zero must already show
  // composed content. Flag the "everything fades in from nothing" opening:
  // every clip whose window includes t=0 getting an opacity-0 entrance at the
  // very start of the timeline leaves the first frame blank.
  const timelineScript = scriptBodies
    .map((script) => script[1])
    .join('\n');
  const clipsAtZero = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)]
    .filter(
      (match) =>
        match[1].toLowerCase() !== 'div' ||
        !/data-composition-id/i.test(match[0])
    )
    .map((match) => match[0])
    .filter(
      (tag) =>
        (attribute(tag, 'class') ?? '').split(/\s+/).includes('clip') &&
        Number(attribute(tag, 'data-start')) === 0
    )
    .map((tag) => attribute(tag, 'id'))
    .filter((id): id is string => Boolean(id));

  if (clipsAtZero.length) {
    const fadesInFromNothing = (id: string): boolean => {
      const callPattern = new RegExp(
        `tl\\.fromTo\\(\\s*["']#${id}["'][^;]{0,500}?\\)\\s*;`,
        'i'
      );
      const call = timelineScript.match(callPattern);
      if (!call) return false;
      const body = call[0];
      // The first {...} after the target is the tween's "from" state.
      const fromObject = body.match(/\{[\s\S]*?\}/);
      if (!fromObject || !/opacity\s*:\s*0(?![.\d])/i.test(fromObject[0])) {
        return false;
      }
      // gsap defaults the tween position to 0 when omitted; only a tween
      // starting at the very beginning blanks frame zero.
      const tail = body.slice(body.lastIndexOf('}') + 1);
      const positionMatch = tail.match(/,\s*([\d.]+)\s*\)\s*;$/);
      const position = positionMatch ? Number(positionMatch[1]) : 0;
      return position < 0.05;
    };
    if (clipsAtZero.every(fadesInFromNothing)) {
      return {
        error:
          'The first frame would be blank: every opening clip fades in from opacity 0. Keep the background and headline fully visible at t=0.',
      };
    }
  }

  return { duration };
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: 'Send the composition request as multipart form data.' },
      { status: 400 }
    );
  }

  const brief = String(form.get('brief') ?? '').trim();
  if (brief.length < 10 || brief.length > MAX_BRIEF) {
    return NextResponse.json(
      { error: `Describe the reel in 10–${MAX_BRIEF} characters.` },
      { status: 400 }
    );
  }

  const rawCompositionId = Number(form.get('compositionId'));
  const regenerateId =
    Number.isInteger(rawCompositionId) && rawCompositionId > 0
      ? rawCompositionId
      : null;
  if (form.get('compositionId') !== null && regenerateId === null) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }

  const requestedDuration = Number(form.get('durationSeconds'));
  const footage = form.get('footage');

  // A brief that asks for footage but arrives without one makes the model
  // invent a CSS illustration instead of the real video — reject early.
  const mentionsFootage = /\bfootage\b|\buploaded\s+(video|clip)\b|\bmy\s+(video|clip)\b/i.test(
    brief
  );
  const hasFootage = footage instanceof File && footage.size > 0;
  if (mentionsFootage && !hasFootage) {
    return NextResponse.json(
      {
        error:
          'Your brief asks for video footage, but none is attached. Choose your video with the "Attach footage" picker above the brief (re-attach after every page reload), then generate again.',
      },
      { status: 400 }
    );
  }

  let footageTempPath: string | null = null;
  let durationSeconds: number;
  let cleanupFootage: () => void = () => {};

  if (hasFootage) {
    if (!localRuntimeEnabled()) {
      return NextResponse.json(
        {
          error:
            'Footage reels are processed locally. Run the app on your machine (or set HYPERFRAMES_ENABLE_RENDER=1).',
        },
        { status: 400 }
      );
    }
    const footageFile = footage as File;
    const looksLikeVideo =
      footageFile.type === 'video/mp4' ||
      footageFile.type === 'video/quicktime' ||
      (!footageFile.type && /\.(mp4|mov)$/i.test(footageFile.name));
    if (!looksLikeVideo) {
      return NextResponse.json(
        { error: 'Footage must be an MP4 or MOV file.' },
        { status: 400 }
      );
    }
    if (footageFile.size > MAX_FOOTAGE_BYTES) {
      return NextResponse.json(
        { error: 'Footage must be 100 MB or smaller.' },
        { status: 400 }
      );
    }

    let tempInput: string | null = null;
    let tempOutput: string | null = null;
    try {
      const workDir = await mkdtemp(path.join(tmpdir(), 'hf-footage-'));
      tempInput = path.join(workDir, 'input.mp4');
      tempOutput = path.join(workDir, 'footage.mp4');
      cleanupFootage = () => void rm(workDir, { recursive: true, force: true });
      await writeFile(tempInput, Buffer.from(await footageFile.arrayBuffer()));

      const probed = await probeVideoDurationSeconds(tempInput);
      if (probed === null) {
        return NextResponse.json(
          { error: 'Could not read the footage duration. Is it a valid video file?' },
          { status: 400 }
        );
      }
      if (probed < MIN_DURATION || probed > MAX_DURATION) {
        return NextResponse.json(
          {
            error: `Footage must be between ${MIN_DURATION} and ${MAX_DURATION} seconds for a reel (this one is ${probed.toFixed(1)}s).`,
          },
          { status: 400 }
        );
      }

      await transcodeToReelFootage(tempInput, tempOutput);
      footageTempPath = tempOutput;
      durationSeconds = Math.round(probed * 100) / 100;
    } catch (error) {
      cleanupFootage();
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The footage could not be processed.',
        },
        { status: 500 }
      );
    }
  } else {
    durationSeconds = Number.isInteger(requestedDuration) ? requestedDuration : 30;
    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < MIN_DURATION ||
      durationSeconds > MAX_DURATION
    ) {
      return NextResponse.json(
        {
          error: `Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION} seconds.`,
        },
        { status: 400 }
      );
    }
  }

  let llm: Awaited<ReturnType<typeof resolveComposerLlm>>;
  try {
    llm = await resolveComposerLlm(access.workspace.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Composer LLM settings are invalid.' },
      { status: 409 }
    );
  }
  if (!llm) {
    return NextResponse.json(
      {
        error:
          'No composer LLM is configured. Add one in Settings → Video composer LLM.',
        code: 'llm_not_configured',
      },
      { status: 409 }
    );
  }

  const system = `You generate HyperFrames video compositions: single-file HTML documents rendered frame-by-frame to MP4.

Rules for the document you return:
- One complete HTML file. The only external script allowed is exactly <script src="${GSAP_SCRIPT_URL}"></script>, before the animation script. Other external requests are forbidden except HTTPS image URLs explicitly supplied in the brief. No external links, CSS imports, remote fonts, or media.
- Use only bundled fonts by name: Inter, Montserrat, Outfit, Nunito, Oswald, League Gothic, Archivo Black, Space Mono, IBM Plex Mono, JetBrains Mono, EB Garamond, Playfair Display, Source Code Pro, Noto Sans JP, Roboto, Open Sans, Lato, or Poppins.
- Body contains a portrait root: <div id="root" data-composition-id="main" data-start="0" data-duration="${durationSeconds}" data-width="1080" data-height="1920">…</div>.
- Every timed child (text, shapes, images) uses class="clip", a unique id, data-start and data-duration in seconds. Use absolute positioning and z-index for paint order. Keep the story moving across the full duration.
- Animate with one paused GSAP timeline registered after all tweens:
  <script src="${GSAP_SCRIPT_URL}"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#some-id", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.2);
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
  </script>
- Use fromTo (never from). When one element needs more than one fromTo (for example an entrance and a later exit), add immediateRender: false to every fromTo except the earliest-positioned one, so seeks before the first tween keep the element's CSS state. Never call tl.play(), use timers, randomness, network APIs, event handlers, or browser storage. Every visual change must be a function of timeline time.
- FIRST FRAME RULE: at t=0 the canvas must already show the fully composed opening — background AND the primary headline (or key visual) at full opacity. Never begin with a blank, black, or near-empty canvas. The hero element must have data-start="0" so it is on the canvas from the first frame, and must not get an entrance tween starting from opacity 0 at or near position 0 (entrances are for SECONDARY elements only). The first impression must read as a finished design, not a fade-in from nothing.
- Keep something visibly changing at least every ~2.5 seconds across the whole duration (a move, a highlight, a counter, a shape). Never hold one static frame longer than that.
- Keep type inside the action-safe band (x=90–990, y=168–1330), use large legible type, and strong contrast.
- This is a news reel for a Filipino news page. Never invent media URLs; use typography, color, and shapes when no URL is supplied.
${
  hasFootage
    ? `- FOOTAGE MODE: the project ships a local video at src="${FOOTAGE_SRC}" (${durationSeconds}s, 1080×1920, with sound). It MUST be the full-bleed background, written exactly like this (no extra attributes, no styling transforms):
  <video id="footage" class="clip" data-start="0" data-duration="${durationSeconds}" data-track-index="0" data-has-audio="true" playsinline src="${FOOTAGE_SRC}" style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover;"></video>
  Never animate or transform the video element itself — build overlay elements above it (z-index 1+) that stay readable over moving footage: a dark gradient scrim behind every text area, then the headline, badges, and accent shapes. The footage stays visible to the last frame (exit only the overlays); the film keeps the footage's own audio, so add no audio elements.`
    : ''
}

Return ONLY the HTML document, no explanation, no markdown fences.`;

  const baseMessages: ChatMessage[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Create a ${durationSeconds}-second reel composition.\n\nBrief: ${brief}`,
    },
  ];
  const chatOptions = {
    maxTokens: MAX_OUTPUT_TOKENS,
    ...(llm.providerId === 'nim' &&
    llm.model === 'nvidia/nemotron-3.5-super-vl-120b-a12b'
      ? { chatTemplateKwargs: { enable_thinking: false } }
      : {}),
  } as const;

  // Models rarely nail every composition contract on the first pass, so give
  // the validation verdict back to the model and let it correct itself once.
  let html = '';
  let validation: ReturnType<typeof validateComposition> = {
    error: 'The composition could not be generated.',
  };
  let messages: ChatMessage[] = baseMessages;

  for (let attempt = 0; attempt < 2; attempt++) {
    let result: { content: string };
    try {
      result = await chatCompletion({ llm, messages, ...chatOptions });
    } catch (error) {
      cleanupFootage();
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The composition could not be generated.',
        },
        { status: 502 }
      );
    }

    const candidate = hasFootage
      ? normalizeFootageTag(extractHtml(result.content))
      : extractHtml(result.content);
    const check = validateComposition(
      candidate,
      durationSeconds,
      brief,
      hasFootage
    );
    if (!('error' in check)) {
      html = candidate;
      validation = check;
      break;
    }

    messages = [
      ...messages,
      { role: 'assistant', content: result.content },
      {
        role: 'user',
        content: `Your document failed validation: ${check.error}\nReturn the corrected, complete HTML document only — no explanation, no markdown fences.`,
      },
    ];
  }

  if ('error' in validation) {
    cleanupFootage();
    return NextResponse.json({ error: validation.error }, { status: 502 });
  }

  try {
    if (regenerateId !== null) {
      const rows = (await sql`
        UPDATE hyperframes_compositions
        SET brief = ${brief}, html = ${html}, provider = ${llm.providerId},
            model = ${llm.model}, created_by = ${access.user.id}
        WHERE id = ${regenerateId}
          AND workspace_id = ${access.workspace.id}
        RETURNING id
      `) as unknown as { id: number }[];
      if (!rows[0]) {
        cleanupFootage();
        return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
      }
      await stopPreviewServer(regenerateId);
      if (footageTempPath) await adoptFootage(footageTempPath, rows[0].id);
      cleanupFootage();
      return NextResponse.json({
        id: rows[0].id,
        html,
        durationSeconds: validation.duration,
        provider: llm.providerLabel,
        model: llm.model,
      });
    }

    const rows = (await sql`
      INSERT INTO hyperframes_compositions
        (workspace_id, brief, html, provider, model, created_by)
      VALUES
        (${access.workspace.id}, ${brief}, ${html}, ${llm.providerId},
         ${llm.model}, ${access.user.id})
      RETURNING id
    `) as unknown as { id: number }[];

    if (footageTempPath) await adoptFootage(footageTempPath, rows[0].id);
    cleanupFootage();

    return NextResponse.json({
      id: rows[0].id,
      html,
      durationSeconds: validation.duration,
      provider: llm.providerLabel,
      model: llm.model,
    });
  } catch (error) {
    cleanupFootage();
    console.error('Could not save HyperFrames composition:', error);
    return NextResponse.json(
      { error: 'The composition could not be saved.' },
      { status: 500 }
    );
  }
}
