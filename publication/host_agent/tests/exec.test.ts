import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { config } from '../src/config';
import { ConflictError, ValidationError } from '../src/errors';
import {
  CHILD_PATH,
  type Exec,
  type ExecResult,
  type SpawnOptions,
  type Spawner,
  SUDO,
  SYSTEMCTL,
  WEB_CONFIGTEST_BINARY,
  createExec,
  exec,
  execOverrideAllowed,
  setExecForTests,
} from '../src/exec';
import { freshScratch } from './fixtures/instance';

const PACKAGE_DIR = join(import.meta.dir, '..');
const SRC = join(PACKAGE_DIR, 'src');

/** Files under src/ allowed to start a process, each with its reason. */
const SPAWNERS: Record<string, string> = {
  'exec.ts': 'the one spawner: named commands, fixed argv, fixed env',
};

const SPAWN_PATTERNS: readonly RegExp[] = [
  /\bBun\s*\.\s*spawn(Sync)?\b/,
  /\bspawnSync\b/,
  /child_process/,
  /\bBun\s*\.\s*\$/,
  /import\s*\{[^}]*\$[^}]*\}\s*from\s*['"]bun['"]/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('the spawner tripwire', () => {
  test('no src/ file but the named spawners starts a process', () => {
    const offenders = sourceFiles(SRC)
      .map(file => relative(SRC, file))
      .filter(file => !(file in SPAWNERS))
      .filter(file => SPAWN_PATTERNS.some(p => p.test(readFileSync(join(SRC, file), 'utf8'))));
    expect(offenders).toEqual([]);
  });

  test('the gate is not vacuous: it sees the spawn in exec.ts', () => {
    const body = readFileSync(join(SRC, 'exec.ts'), 'utf8');
    expect(SPAWN_PATTERNS.some(p => p.test(body))).toBe(true);
  });

  test('importing exec.ts does not resolve the agent configuration', async () => {
    // No NODE_ENV, no env file: resolving src/config.ts here would exit 1.
    const child = Bun.spawn([process.execPath, '-e', `await import(${JSON.stringify(join(SRC, 'exec.ts'))});`], {
      cwd: '/',
      env: { PATH: CHILD_PATH },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await child.exited).toBe(0);
  });
});

interface Recorded {
  kind: 'run' | 'start';
  argv: readonly string[];
  options: SpawnOptions;
}

function recordingSpawner(): { spawner: Spawner; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const ok: ExecResult = { code: 0, stdout: '', stderr: '' };
  return {
    calls,
    spawner: {
      async run(argv, options) {
        calls.push({ kind: 'run', argv, options });
        return ok;
      },
      start(argv, options) {
        calls.push({ kind: 'start', argv, options });
        return { stop: async () => {} };
      },
    },
  };
}

const STAGED = 'stage-a1b2c3';
const COMMITTED = '7.0.3_a1b2c3d';

/** A state root with a staged v2 extraction and a committed release, under a fresh scratch corner. */
async function stateTree(name: string): Promise<string> {
  const root = await freshScratch(name);
  for (const dir of [
    `publication_api/v2/staging/${STAGED}`,
    `publication_api/v2/releases/${COMMITTED}`,
    'publication_api/v2/shared',
    'publication_api/v1',
    'rules',
    'audit',
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}

describe('the named commands', () => {
  test('argv is fixed per command, argv[0] is always absolute, and the env is the fixed child env', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_argv');
    const php = join(root, 'publication_api', 'v1', 'index.php');
    writeFileSync(php, '<?php\n');
    const cfg = { ...config, STATE_ROOT: root, WEB_SERVER: 'nginx' as const, WEB_UNIT: 'nginx', V2_UNIT: 'dedalo-v2-test', PHP_BIN: '/usr/bin/php' };
    const x = createExec(cfg, spawner);
    await x.webConfigtest();
    await x.webReload();
    await x.v2Restart();
    await x.phpLint(php);
    expect(calls.map(c => c.argv)).toEqual([
      [SUDO, '-n', WEB_CONFIGTEST_BINARY.nginx, '-t'],
      [SYSTEMCTL, 'reload', 'nginx'],
      [SYSTEMCTL, 'restart', 'dedalo-v2-test'],
      ['/usr/bin/php', '-l', realpathSync(php)],
    ]);
    // No PATH lookup ever: every program is named by an absolute path (the sudoers rule and
    // Task 11's container stand-ins depend on exactly these paths).
    for (const c of calls) expect(isAbsolute(c.argv[0] as string)).toBe(true);
    for (const c of calls) expect(c.options.env).toEqual({ PATH: CHILD_PATH, LANG: 'C' });
    expect([SUDO, SYSTEMCTL, WEB_CONFIGTEST_BINARY]).toEqual([
      '/usr/bin/sudo',
      '/usr/bin/systemctl',
      { apache: '/usr/sbin/apachectl', nginx: '/usr/sbin/nginx' },
    ]);
  });

  test('apache configtest names apachectl', async () => {
    const { spawner, calls } = recordingSpawner();
    await createExec({ ...config, WEB_SERVER: 'apache' }, spawner).webConfigtest();
    expect(calls[0]!.argv).toEqual([SUDO, '-n', '/usr/sbin/apachectl', '-t']);
  });

  test('phpLint refuses a file outside STATE_ROOT, or a missing one, before spawning', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_php');
    const x = createExec({ ...config, STATE_ROOT: root }, spawner);
    await expect(x.phpLint('/etc/hosts')).rejects.toBeInstanceOf(ValidationError);
    await expect(x.phpLint(join(root, 'missing.php'))).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  test('v2ScratchBoot: only a directory directly under v2/releases, port range, env = shared/v2.env + HOST/PORT', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_v2');
    const v2 = join(root, 'publication_api', 'v2');
    const committed = join(v2, 'releases', COMMITTED);
    const x = createExec({ ...config, STATE_ROOT: root, BUN_BIN: '/opt/bun/bin/bun' }, spawner);

    expect(() => x.v2ScratchBoot(committed, 3200)).toThrow(ConflictError); // no v2.env yet
    writeFileSync(join(v2, 'shared', 'v2.env'), 'DB_NAME="web_test"\nPORT="9"\n');
    expect(() => x.v2ScratchBoot(committed, 80)).toThrow(ValidationError);
    // staging/ is agent-only (Task 8 MODES): a STAGED tree is never scratch-booted, only a
    // committed releases/<id> (Task 7 boots it before the sha record and the promote)
    expect(() => x.v2ScratchBoot(join(v2, 'staging', STAGED), 3200)).toThrow(ValidationError);
    expect(() => x.v2ScratchBoot(join(v2, 'releases'), 3200)).toThrow(ValidationError);
    expect(() => x.v2ScratchBoot(join(root, 'rules'), 3200)).toThrow(ValidationError);
    expect(() => x.v2ScratchBoot('/tmp', 3200)).toThrow(ValidationError);
    writeFileSync(join(v2, 'releases', 'loose_file'), '');
    expect(() => x.v2ScratchBoot(join(v2, 'releases', 'loose_file'), 3200)).toThrow(ValidationError);
    // a link under releases/ resolves elsewhere: refused by realpath
    symlinkSync(join(v2, 'staging', STAGED), join(v2, 'releases', '7.0.4_bbbbbbb'));
    expect(() => x.v2ScratchBoot(join(v2, 'releases', '7.0.4_bbbbbbb'), 3200)).toThrow(ValidationError);
    expect(calls).toEqual([]);

    x.v2ScratchBoot(committed, 3200);
    expect(calls).toEqual([
      {
        kind: 'start',
        argv: ['/opt/bun/bin/bun', 'run', 'src/index.ts'],
        options: { cwd: realpathSync(committed), env: { PATH: CHILD_PATH, DB_NAME: 'web_test', HOST: '127.0.0.1', PORT: '3200' } },
      },
    ]);
  });
});

describe('the real spawner', () => {
  test('phpLint runs PHP_BIN and returns its code and output; a missing binary is 127', async () => {
    const root = await stateTree('ex_real');
    const fakePhp = join(root, 'fake_php.sh');
    writeFileSync(fakePhp, '#!/bin/sh\necho "No syntax errors detected in $2"\nexit 0\n');
    chmodSync(fakePhp, 0o755);
    const target = join(root, 'rules', 'x.php');
    writeFileSync(target, '<?php\n');
    const ok = await createExec({ ...config, STATE_ROOT: root, PHP_BIN: fakePhp }).phpLint(target);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('No syntax errors detected');
    const missing = await createExec({ ...config, STATE_ROOT: root, PHP_BIN: join(root, 'no_such_php') }).phpLint(target);
    expect(missing.code).toBe(127);
  });

  test('v2ScratchBoot starts the committed release with only its own env, and stop() ends it', async () => {
    const root = await stateTree('ex_boot');
    const staged = join(root, 'publication_api', 'v2', 'releases', COMMITTED);
    mkdirSync(join(staged, 'src'), { recursive: true });
    writeFileSync(
      join(staged, 'src', 'index.ts'),
      "Bun.serve({ hostname: process.env.HOST, port: Number(process.env.PORT), fetch: () => Response.json({ keys: Object.keys(process.env), probe: process.env.V2_PROBE ?? null }) });\n",
    );
    writeFileSync(join(root, 'publication_api', 'v2', 'shared', 'v2.env'), 'V2_PROBE="from-shared"\n');
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
    const port = probe.port as number;
    probe.stop(true);

    const child = createExec({ ...config, STATE_ROOT: root, BUN_BIN: process.execPath }).v2ScratchBoot(staged, port);
    let body: { keys: string[]; probe: string | null } | null = null;
    for (let i = 0; i < 100 && body === null; i++) {
      try {
        body = (await (await fetch(`http://127.0.0.1:${port}/`)).json()) as { keys: string[]; probe: string | null };
      } catch {
        await Bun.sleep(50);
      }
    }
    await child.stop();
    expect(body?.probe).toBe('from-shared');
    expect(body?.keys).not.toContain('SERVICE_TOKEN');
    expect(body?.keys).toContain('PORT');
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    await child.stop(); // a second stop on an exited child is a no-op
  });
});

describe('the test override', () => {
  test('is allowed only under NODE_ENV=test', () => {
    expect(execOverrideAllowed('test')).toBe(true);
    expect(execOverrideAllowed('production')).toBe(false);
  });

  test('setExecForTests swaps exec() and the restore puts it back', async () => {
    const before = exec();
    const standIn: Exec = {
      webConfigtest: async () => ({ code: 1, stdout: '', stderr: 'stand-in' }),
      webReload: async () => ({ code: 0, stdout: '', stderr: '' }),
      v2Restart: async () => ({ code: 0, stdout: '', stderr: '' }),
      phpLint: async () => ({ code: 0, stdout: '', stderr: '' }),
      v2ScratchBoot: () => ({ stop: async () => {} }),
    };
    const restore = setExecForTests(standIn);
    expect(exec()).toBe(standIn);
    expect((await exec().webConfigtest()).stderr).toBe('stand-in');
    restore();
    expect(exec()).toBe(before);
  });
});
