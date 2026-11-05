import { spawn } from 'node:child_process';

function run(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timer.unref();
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, output });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

export async function probeVideoDurationSeconds(
  file: string
): Promise<number | null> {
  const { code, output } = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      file,
    ],
    15_000
  );
  if (code !== 0) return null;
  try {
    const parsed = JSON.parse(output) as { format?: { duration?: string } };
    const duration = Number(parsed.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/**
 * Normalize uploaded reel videos to what Facebook and every browser expect:
 * H.264/AAC, exactly 1080×1920 (cover-cropped), faststart MP4.
 */
export async function transcodeToReelFootage(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const { code, output } = await run(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      inputPath,
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      '-c:v',
      'libx264',
      '-crf',
      '20',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    180_000
  );
  if (code !== 0) {
    throw new Error(
      `Could not process the footage: ${output.slice(-300) || 'ffmpeg failed'}`
    );
  }
}

/**
 * FFmpeg transcoding spawns local processes — only ever legal where the app
 * runs on the user's own machine, never on Vercel. Dev runs qualify;
 * production requires an explicit opt-in.
 */
export function localRuntimeEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.ENABLE_LOCAL_VIDEO_PROCESSING === '1' ||
    process.env.HYPERFRAMES_ENABLE_RENDER === '1'
  );
}
