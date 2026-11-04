import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/session';

type EditResponse = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
};

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function POST(req: Request) {
  if (!(await requireUser(req))) return unauthorized();
  const { prompt, model, imageBase64 } = await req.json();

  if (!imageBase64) {
    return NextResponse.json(
      { error: 'Attach an image before editing.' },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(imageBase64, 'base64');

  if (process.env.OPENAI_API_KEY?.trim()) {
    return editWithOpenAi(prompt, bytes);
  }

  if (!process.env.NIM_BASE_URL?.trim()) {
    return NextResponse.json(
      {
        error:
          'Image editing is not configured. Add OPENAI_API_KEY to enable AI edits.',
      },
      { status: 501 }
    );
  }

  return editWithNim(prompt, model, bytes);
}

async function editWithOpenAi(prompt: string, bytes: Buffer) {
  const fd = new FormData();
  fd.append('model', process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1');
  fd.append('prompt', prompt);
  fd.append('size', '1024x1024');
  fd.append('image', new Blob([toArrayBuffer(bytes)], { type: 'image/png' }), 'input.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: fd,
  });

  const data = (await res.json().catch(() => null)) as EditResponse | null;

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? 'The image could not be edited.' },
      { status: res.status }
    );
  }

  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) {
    return NextResponse.json(
      { error: 'The image provider returned no image.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: `data:image/png;base64,${base64}` });
}

async function editWithNim(prompt: string, model: string | undefined, bytes: Buffer) {
  const base = process.env.NIM_BASE_URL!.trim().replace(/\/$/, '');
  const fd = new FormData();
  fd.append(
    'model',
    model ?? process.env.NIM_IMAGE_MODEL ?? 'stabilityai/stable-diffusion-3-medium'
  );
  fd.append('prompt', prompt);
  fd.append('image', new Blob([toArrayBuffer(bytes)], { type: 'image/png' }), 'input.png');

  const res = await fetch(`${base}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NIM_API_KEY}` },
    body: fd,
  });

  // The hosted NVIDIA API only serves /images/generations; editing needs a
  // self-hosted FLUX.1 Kontext NIM or another provider with an edits endpoint.
  if (res.status === 404) {
    return NextResponse.json(
      {
        error:
          'This image provider has no editing endpoint. Add OPENAI_API_KEY to edit images, or keep using the upload as-is.',
      },
      { status: 501 }
    );
  }

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }

  const data = (await res.json()) as EditResponse;
  const url = data.data?.[0]?.url ?? data.data?.[0]?.b64_json;
  return NextResponse.json({ url });
}
