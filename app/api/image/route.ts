import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/session';

export async function POST(req: Request) {
  if (!(await requireUser(req))) return unauthorized();
  const { prompt } = await req.json();
  const model = process.env.NIM_IMAGE_MODEL ?? 'stabilityai/stable-diffusion-3-medium';
  const res = await fetch(`${process.env.NIM_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NIM_API_KEY}` },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = await res.json();
  const url = data.data?.[0]?.url ?? data.data?.[0]?.b64_json;
  return NextResponse.json({ url });
}