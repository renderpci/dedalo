/**
 * THE PROCESS ENTRY, end to end: `bun run src/index.ts` under NODE_ENV=test boots against
 * the fixture's state root, serves /health on its unix socket at 0660, and on SIGTERM
 * drains, removes the socket and exits 0.
 */
import { expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../src/config';
import { BASE_PATH } from '../src/router';
import { resetInstance } from './fixtures/instance';

const PACKAGE_DIR = join(import.meta.dir, '..');

test('boots, serves, and drains on SIGTERM', async () => {
  expect(config.LISTEN_KIND).toBe('unix'); // .env.test contract (Task 1)
  const socket = config.SOCKET_PATH as string;
  await resetInstance(); // marked state root + empty socket directory

  const child = Bun.spawn([process.execPath, 'run', 'src/index.ts'], {
    cwd: PACKAGE_DIR,
    env: { NODE_ENV: 'test', PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  try {
    let status = 0;
    for (let i = 0; i < 100 && status !== 200; i++) {
      try {
        status = (await fetch(`http://localhost${BASE_PATH}/health`, { unix: socket })).status;
      } catch {
        await Bun.sleep(50);
      }
    }
    expect(status).toBe(200);
    expect(statSync(socket).mode & 0o777).toBe(0o660);

    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
    expect(existsSync(socket)).toBe(false);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}, 15_000);
