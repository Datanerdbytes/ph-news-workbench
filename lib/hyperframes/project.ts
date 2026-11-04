import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Compositions live outside the Next.js tree so `next build` never watches them.
export function workbenchRoot(): string {
  return path.join(process.cwd(), '.hyperframes-workbench');
}

export function projectDir(compositionId: number): string {
  return path.join(workbenchRoot(), `comp-${compositionId}`);
}

export function compositionFile(compositionId: number): string {
  return path.join(projectDir(compositionId), 'index.html');
}

export function footageFile(compositionId: number): string {
  return path.join(projectDir(compositionId), 'assets', 'footage.mp4');
}

/**
 * Materialize the DB-stored HTML into the project entry point read by the CLI.
 */
export async function syncProject(compositionId: number, html: string) {
  const dir = projectDir(compositionId);
  await mkdir(dir, { recursive: true });
  await writeFile(compositionFile(compositionId), html, 'utf8');
  return dir;
}

/**
 * Move a transcoded footage file (usually a temp transcode output) into the
 * composition project so `assets/footage.mp4` references resolve.
 */
export async function adoptFootage(
  tempPath: string,
  compositionId: number
): Promise<string> {
  const target = footageFile(compositionId);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await rename(tempPath, target);
  } catch {
    await copyFile(tempPath, target);
    await rm(tempPath, { force: true });
  }
  return target;
}

/**
 * Rendering and previewing spawn local processes (headless Chrome, FFmpeg) —
 * only ever legal where the app runs on the user's own machine, never on
 * Vercel. Dev runs qualify; production requires an explicit opt-in.
 */
export function localRuntimeEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.HYPERFRAMES_ENABLE_RENDER === '1'
  );
}
