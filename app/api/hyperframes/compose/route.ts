import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { chatCompletion, resolveComposerLlm } from '@/lib/llm';
import { stopPreviewServer } from '@/lib/hyperframes/preview';
import { requireWorkspace, unauthorized } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DURATION = 3;
const MAX_DURATION = 90;
const MAX_BRIEF = 2000;
const MAX_OUTPUT_TOKENS = 8000;
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

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
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
  brief: string
): { duration: number } | { error: string } {
  if (!/^(?:<!doctype html\s*)?<html[\s>]/i.test(html)) {
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
  if (duration !== expectedDuration) {
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
  if (
    /<(?:iframe|object|embed|link|base|video|audio)\b/i.test(html) ||
    /\bsrcset\s*=|\bposter\s*=/i.test(html) ||
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

  return { duration };
}

export async function POST(request: Request) {
  const access = await requireWorkspace(request);
  if (!access) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    brief?: unknown;
    durationSeconds?: unknown;
    compositionId?: unknown;
  } | null;

  const brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  if (brief.length < 10 || brief.length > MAX_BRIEF) {
    return NextResponse.json(
      { error: `Describe the reel in 10–${MAX_BRIEF} characters.` },
      { status: 400 }
    );
  }

  const durationSeconds =
    typeof body?.durationSeconds === 'number' ? body.durationSeconds : 30;
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < MIN_DURATION ||
    durationSeconds > MAX_DURATION
  ) {
    return NextResponse.json(
      { error: `Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION} seconds.` },
      { status: 400 }
    );
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
- Use fromTo (never from). Never call tl.play(), use timers, randomness, network APIs, event handlers, or browser storage. Every visual change must be a function of timeline time.
- Keep type inside the action-safe band (x=90–990, y=168–1330), use large legible type, strong contrast, and a visible hook at frame zero.
- This is a news reel for a Filipino news page. Never invent media URLs; use typography, color, and shapes when no URL is supplied.

Return ONLY the HTML document, no explanation, no markdown fences.`;

  let result: { content: string };
  try {
    result = await chatCompletion({
      llm,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Create a ${durationSeconds}-second reel composition.\n\nBrief: ${brief}` },
      ],
      maxTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'The composition could not be generated.',
      },
      { status: 502 }
    );
  }

  const html = extractHtml(result.content);
  const validation = validateComposition(html, durationSeconds, brief);
  if ('error' in validation) {
    return NextResponse.json({ error: validation.error }, { status: 502 });
  }

  const regenerateId =
    typeof body?.compositionId === 'number' ? body.compositionId : null;
  if (body?.compositionId !== undefined && regenerateId === null) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
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
        return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
      }
      await stopPreviewServer(regenerateId);
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

    return NextResponse.json({
      id: rows[0].id,
      html,
      durationSeconds: validation.duration,
      provider: llm.providerLabel,
      model: llm.model,
    });
  } catch (error) {
    console.error('Could not save HyperFrames composition:', error);
    return NextResponse.json(
      { error: 'The composition could not be saved.' },
      { status: 500 }
    );
  }
}
