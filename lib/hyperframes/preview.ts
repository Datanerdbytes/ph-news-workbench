import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { syncProject, projectDir } from './project';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const START_TIMEOUT_MS = 90_000;

type PreviewEntry = {
  directory: string;
  url: string;
  port: number;
  ready: Promise<string>;
  idleTimer: NodeJS.Timeout | null;
};

type PreviewGlobal = typeof globalThis & {
  __hyperframesPreviewServers?: Map<number, PreviewEntry>;
};

const globalState = globalThis as PreviewGlobal;
const previewServers =
  globalState.__hyperframesPreviewServers ??
  (globalState.__hyperframesPreviewServers = new Map<number, PreviewEntry>());

function npmCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function cliEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    CI: '1',
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  };
  for (const key of [
    'PATH',
    'PATHEXT',
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'NODE_ENV',
    'NPM_CONFIG_CACHE',
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate a local HyperFrames preview port.');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function armIdleTimer(compositionId: number, entry: PreviewEntry) {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    void stopPreviewServer(compositionId).catch((error) => {
      console.error(`Could not stop idle HyperFrames preview ${compositionId}:`, error);
    });
  }, IDLE_TIMEOUT_MS);
  entry.idleTimer.unref();
}

async function waitForPreview(
  child: ReturnType<typeof spawn>,
  port: number,
  output: () => string
): Promise<void> {
  const state: {
    closed: { code: number | null; signal: NodeJS.Signals | null } | null;
  } = { closed: null };
  child.once('close', (code, signal) => {
    state.closed = { code, signal };
  });
  child.once('error', (error) => {
    state.closed = { code: 1, signal: null };
    console.error('Could not start HyperFrames preview:', error);
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // The local preview server is not ready yet.
    }

    if (state.closed) {
      throw new Error(
        `HyperFrames preview exited before becoming ready: ${output().slice(-2000) || `exit ${state.closed.code ?? state.closed.signal}`}`
      );
    }
    await sleep(350);
  }
  throw new Error(`HyperFrames preview did not start in time: ${output().slice(-2000)}`);
}

type CliPreviewStatus = {
  ok?: boolean;
  result?: {
    state?: string;
    port?: number;
    serverUrl?: string;
    studioUrl?: string;
    ready?: boolean;
  };
};

/**
 * The CLI keeps one background preview per project and refuses to start a
 * second on a different port, so always ask it for an existing server before
 * spawning our own.
 */
async function existingCliPreview(
  directory: string
): Promise<{ port: number; studioUrl: string | null } | null> {
  const output = await new Promise<string>((resolve) => {
    const child = spawn(
      npmCommand(),
      ['--yes', 'hyperframes', 'preview', '--status', '--json'],
      {
        cwd: directory,
        env: cliEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.once('error', () => resolve(''));
    child.once('close', () => resolve(stdout));
  });

  const start = output.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(output.slice(start)) as CliPreviewStatus;
    if (
      parsed.ok &&
      parsed.result?.state === 'running' &&
      typeof parsed.result.port === 'number'
    ) {
      return { port: parsed.result.port, studioUrl: parsed.result.studioUrl ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

export async function ensurePreviewServer(
  compositionId: number,
  html: string
): Promise<string> {
  const existing = previewServers.get(compositionId);
  if (existing) {
    await existing.ready;
    await syncProject(compositionId, html);
    armIdleTimer(compositionId, existing);
    return existing.url;
  }

  const directory = projectDir(compositionId);
  await syncProject(compositionId, html);

  const adopted = await existingCliPreview(directory);
  if (adopted) {
    const entry: PreviewEntry = {
      directory,
      url:
        adopted.studioUrl ??
        `http://localhost:${adopted.port}/#project/${path.basename(directory)}`,
      port: adopted.port,
      ready: Promise.resolve(''),
      idleTimer: null,
    };
    previewServers.set(compositionId, entry);
    armIdleTimer(compositionId, entry);
    return entry.url;
  }

  const entry: PreviewEntry = {
    directory,
    url: '',
    port: 0,
    ready: Promise.resolve(''),
    idleTimer: null,
  };
  previewServers.set(compositionId, entry);
  entry.ready = (async () => {
    entry.directory = await syncProject(compositionId, html);
    entry.port = await freePort();
    const projectName = path.basename(entry.directory);
    entry.url = `http://localhost:${entry.port}/#project/${encodeURIComponent(projectName)}`;

    let output = '';
    const child = spawn(
      npmCommand(),
      [
        '--yes',
        'hyperframes',
        'preview',
        '--background',
        '--no-open',
        '--port',
        String(entry.port),
      ],
      {
        cwd: entry.directory,
        env: cliEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-8000);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-8000);
    });

    await waitForPreview(child, entry.port, () => output);
    return entry.url;
  })();

  try {
    const url = await entry.ready;
    armIdleTimer(compositionId, entry);
    return url;
  } catch (error) {
    if (previewServers.get(compositionId) === entry) {
      previewServers.delete(compositionId);
    }
    if (entry.port) {
      await stopCliPreview(entry.directory).catch((stopError) => {
        console.error(`Could not clean up failed preview ${compositionId}:`, stopError);
      });
    }
    throw error;
  }
}

async function stopCliPreview(directory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCommand(), ['--yes', 'hyperframes', 'preview', '--stop'], {
      cwd: directory,
      env: cliEnvironment(),
      stdio: 'ignore',
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Timed out while stopping HyperFrames preview.'));
    }, 10_000);
    timeout.unref();
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`HyperFrames preview stop exited with code ${code}.`));
    });
  });
}

export async function stopPreviewServer(compositionId: number): Promise<void> {
  const entry = previewServers.get(compositionId);
  if (!entry) return;

  try {
    await entry.ready;
  } catch {
    if (previewServers.get(compositionId) === entry) {
      previewServers.delete(compositionId);
    }
    return;
  }
  if (previewServers.get(compositionId) !== entry) return;

  previewServers.delete(compositionId);
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  try {
    await stopCliPreview(entry.directory);
  } catch (error) {
    previewServers.set(compositionId, entry);
    armIdleTimer(compositionId, entry);
    throw error;
  }
}
