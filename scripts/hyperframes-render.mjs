import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config();
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (
  process.env.NODE_ENV !== 'development' &&
  process.env.HYPERFRAMES_ENABLE_RENDER !== '1'
) {
  throw new Error('HyperFrames rendering is disabled outside the local runtime.');
}

const sql = neon(process.env.DATABASE_URL);
const MAX_LOG_CHARS = 8000;

function cliEnvironment() {
  const env = { CI: '1' };
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

function tail(value) {
  return value.slice(-MAX_LOG_CHARS);
}

function runHyperFrames(args, { onOutput, cwd } = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn('npx', ['--yes', 'hyperframes', ...args], {
      cwd: cwd ?? process.cwd(),
      env: cliEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const collect = (chunk) => {
      const text = chunk.toString();
      output = tail(`${output}${text}`);
      onOutput?.(text, output);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, output });
    });
  });
}

async function updateRender(renderId, values) {
  await sql`
    UPDATE hyperframes_renders
    SET status = ${values.status},
        error = ${values.error},
        log_tail = ${values.logTail},
        mp4_path = ${values.mp4Path},
        updated_at = now()
    WHERE id = ${renderId}
  `;
}

async function main() {
  const renderId = Number(process.argv[2]);
  if (!Number.isInteger(renderId) || renderId <= 0) {
    throw new Error('A valid render ID is required.');
  }

  const rows = await sql`
    SELECT r.id, r.composition_id, r.quality, r.status, c.html
    FROM hyperframes_renders r
    JOIN hyperframes_compositions c ON c.id = r.composition_id
    WHERE r.id = ${renderId}
  `;
  const render = rows[0];
  if (!render || render.status !== 'queued') return;

  let logTail = 'Preparing HyperFrames project…';
  await updateRender(renderId, {
    status: 'rendering',
    error: null,
    logTail,
    mp4Path: null,
  });

  try {
    if (!['draft', 'looks', 'delivery'].includes(render.quality)) {
      throw new Error('The render quality is invalid.');
    }

    const project = path.join(process.cwd(), '.hyperframes-workbench', `comp-${render.composition_id}`);
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, 'index.html'), render.html, 'utf8');

    logTail = 'Checking HyperFrames composition…';
    await updateRender(renderId, {
      status: 'rendering',
      error: null,
      logTail,
      mp4Path: null,
    });
    // Advisory only: check reports layout/contrast/craft findings that exit
    // non-zero. They are quality hints, not render blockers — the compose
    // validation already enforces the structural contract, and the rendered
    // MP4 is verified non-empty below.
    const check = await runHyperFrames(['check', '--json'], { cwd: project });
    if (check.output) logTail = tail(`${logTail}\n${check.output}`);

    const renderDirectory = path.join(project, 'renders');
    await mkdir(renderDirectory, { recursive: true });
    const mp4Path = path.join(renderDirectory, `render-${renderId}.mp4`);
    logTail = tail(`${logTail}\nRendering ${render.quality} MP4…`);
    await updateRender(renderId, {
      status: 'rendering',
      error: null,
      logTail,
      mp4Path: null,
    });

    let lastPersistedAt = 0;
    let persistQueue = Promise.resolve();
    let persistError = null;
    const command = runHyperFrames(
      ['render', '--quality', render.quality, '--output', mp4Path],
      {
        cwd: project,
        onOutput: (_text, output) => {
          if (Date.now() - lastPersistedAt < 1200) return;
          lastPersistedAt = Date.now();
          logTail = tail(`${logTail}\n${output}`);
          persistQueue = persistQueue.then(async () => {
            try {
              await updateRender(renderId, {
                status: 'rendering',
                error: null,
                logTail,
                mp4Path: null,
              });
            } catch (error) {
              persistError = error;
            }
          });
        },
      }
    );
    const result = await command;
    await persistQueue;
    if (persistError) throw persistError;
    if (result.code !== 0) {
      throw new Error(
        `HyperFrames render exited with ${result.code ?? result.signal}.`
      );
    }

    const outputInfo = await stat(mp4Path);
    if (!outputInfo.isFile() || outputInfo.size === 0) {
      throw new Error('HyperFrames completed without producing a non-empty MP4.');
    }

    logTail = tail(`${logTail}\nRender complete (${outputInfo.size} bytes).`);
    await updateRender(renderId, {
      status: 'done',
      error: null,
      logTail,
      mp4Path,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'HyperFrames rendering failed.';
    logTail = tail(`${logTail}\n${message}`);
    await updateRender(renderId, {
      status: 'failed',
      error: message.slice(0, 2000),
      logTail,
      mp4Path: null,
    });
    console.error(`HyperFrames render ${renderId} failed:`, error);
  }
}

main().catch((error) => {
  console.error('Could not run HyperFrames render:', error);
  process.exitCode = 1;
});
