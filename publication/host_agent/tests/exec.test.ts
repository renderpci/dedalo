import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { config } from '../src/config';
import { ConflictError, HostActionFailedError, ValidationError } from '../src/errors';
import {
  CHILD_PATH,
  type Exec,
  type ExecResult,
  type SpawnOptions,
  type Spawner,
  SCRATCH_LINK,
  SUDO,
  SYSTEMCTL,
  WEB_CONFIGTEST_CANDIDATES,
  createExec,
  exec,
  execOverrideAllowed,
  setExecForTests,
  v2ScratchUnit,
} from '../src/exec';
import { V2_SCRATCH_TEMPLATE_SUFFIX } from '../src/provision/layout';
import { freshScratch } from './fixtures/instance';

const PACKAGE_DIR = join(import.meta.dir, '..');
const SRC = join(PACKAGE_DIR, 'src');

/** Files under src/ allowed to start a process, each with its reason. */
const SPAWNERS: Record<string, string> = {
  'exec.ts': 'the one spawner: named commands, fixed argv, fixed env',
};

const SPAWN_PATTERNS: readonly RegExp[] = [
  /\bBun\s*(\?\.|\.)\s*(spawn(Sync)?\b|\$)/,
  /\bspawnSync\b/,
  /\bspawn_sync\b/,
  /child_process/,
  // Every way to reach the 'bun' module's spawning exports without spelling `Bun.spawn`.
  /import\s+(type\s+)?\{[^}]*\b(spawn|spawnSync)\b[^}]*\}\s*from\s*['"`]bun['"`]/,
  /import\s*\{[^}]*\$[^}]*\}\s*from\s*['"`]bun['"`]/,
  /import\s*\*\s*as\s*[\w$]+\s*from\s*['"`]bun['"`]/,
  /import\s+[\w$]+\s*(,\s*\{[^}]*\})?\s*from\s*['"`]bun['"`]/,
  /\bimport\s*\(\s*['"`]bun['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]bun['"`]\s*\)/,
  // Aliasing the global: computed access, `= Bun`, passing it, destructuring it off the global.
  /\bBun\s*(\?\.)?\s*\[/,
  /[=(,]\s*(globalThis\s*(\?\.|\.)\s*)?Bun\s*[;,)\]}\n]/,
  /[=(,]\s*(globalThis\s*(\?\.|\.)\s*)?Bun\s*$/m,
  /\[\s*['"`]Bun['"`]\s*\]/,
  /\{[^}]*\bBun\b[^}]*\}\s*=/,
];

/** Ways to start a process outside exec.ts — every one must trip the gate. */
const SPAWN_BYPASSES = [
  "Bun.spawn(['/bin/sh', '-c', 'id']);",
  "Bun.spawnSync(['id']);",
  "Bun?.spawn(['id']);",
  'await Bun.$`id`;',
  "import { spawn } from 'bun';\nspawn(['/bin/sh', '-c', 'id']);",
  "import { spawn as s } from 'bun';",
  "import { spawnSync } from 'bun';",
  "import { $ } from 'bun';",
  "import { file, spawn } from \"bun\";",
  "import * as B from 'bun';\nB.spawn(['id']);",
  "import B from 'bun';",
  "const B = await import('bun');",
  "const B = require('bun');",
  "import { spawn } from 'node:child_process';",
  "const cp = require('child_process');",
  "const s = Bun['spawn'];",
  "const s = Bun?.['spawn'];",
  'const b = Bun;',
  'const b = Bun\nb.spawn([])',
  'const { spawn } = Bun;',
  'const b = globalThis.Bun;',
  "const b = globalThis['Bun'];",
  'const { Bun: b } = globalThis;',
  'const { Bun } = globalThis;',
  'run(Bun);',
  "const e = Reflect.get(Bun, 'spawn');",
  'const e = Object.entries(Bun);',
];

/** What other modules legitimately do — none may match. */
const SPAWN_INNOCENT = [
  'const f = Bun.file(path);',
  "const h = new Bun.CryptoHasher('sha256');",
  'const server = Bun.serve(options);',
  "import type { ServeOptions } from 'bun';",
  "import { describe } from 'bun:test';",
  '// (Bun types unix and host:port shapes apart)',
  '// a spawn that throws is a failed step',
  "const m = await import('./exec');",
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

  test.each(SPAWN_BYPASSES)('the gate catches %p', snippet => {
    expect(SPAWN_PATTERNS.some(p => p.test(snippet))).toBe(true);
  });

  test.each(SPAWN_INNOCENT)('the gate lets %p through', snippet => {
    expect(SPAWN_PATTERNS.some(p => p.test(snippet))).toBe(false);
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
  argv: readonly string[];
  options: SpawnOptions;
}

/** Records every argv; `fail` names argv[1] verbs that exit 1 (a polkit/systemd refusal). */
function recordingSpawner(fail: readonly string[] = []): { spawner: Spawner; calls: Recorded[] } {
  const calls: Recorded[] = [];
  return {
    calls,
    spawner: {
      async run(argv, options) {
        calls.push({ argv, options });
        const refused = fail.includes(argv[1] as string);
        const result: ExecResult = { code: refused ? 1 : 0, stdout: '', stderr: refused ? 'Access denied\nmore' : '' };
        return result;
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
    const cfg = { ...config, STATE_ROOT: root, WEB_SERVER: 'nginx' as const, WEB_UNIT: 'nginx', WEB_CONFIGTEST_BIN: '/usr/sbin/nginx', V2_UNIT: 'dedalo-v2-test', PHP_BIN: '/usr/bin/php' };
    const x = createExec(cfg, spawner);
    await x.webConfigtest();
    await x.webReload();
    await x.v2Restart();
    await x.phpLint(php);
    expect(calls.map(c => c.argv)).toEqual([
      [SUDO, '-n', '/usr/sbin/nginx', '-t'],
      [SYSTEMCTL, 'reload', 'nginx'],
      [SYSTEMCTL, 'restart', 'dedalo-v2-test'],
      ['/usr/bin/php', '-l', realpathSync(php)],
    ]);
    // No PATH lookup ever: every program is named by an absolute path (the sudoers rule and
    // Task 11's container stand-ins depend on exactly these paths).
    for (const c of calls) expect(isAbsolute(c.argv[0] as string)).toBe(true);
    for (const c of calls) expect(c.options.env).toEqual({ PATH: CHILD_PATH, LANG: 'C' });
    expect([SUDO, SYSTEMCTL, WEB_CONFIGTEST_CANDIDATES]).toEqual([
      '/usr/bin/sudo',
      '/usr/bin/systemctl',
      { apache: ['/usr/sbin/apache2ctl', '/usr/sbin/apachectl'], nginx: ['/usr/sbin/nginx'] },
    ]);
  });

  test('apache configtest runs the configured candidate: apache2ctl (Debian/Ubuntu) or apachectl (RHEL)', async () => {
    for (const bin of ['/usr/sbin/apache2ctl', '/usr/sbin/apachectl']) {
      const { spawner, calls } = recordingSpawner();
      await createExec({ ...config, WEB_SERVER: 'apache', WEB_CONFIGTEST_BIN: bin }, spawner).webConfigtest();
      expect(calls[0]!.argv).toEqual([SUDO, '-n', bin, '-t']);
    }
  });

  test('a configtest binary outside the closed list is refused before spawning', () => {
    for (const [server, bin] of [['apache', '/usr/sbin/nginx'], ['nginx', '/usr/sbin/apache2ctl'], ['apache', '/opt/evil/apachectl']] as const) {
      const { spawner, calls } = recordingSpawner();
      expect(() => createExec({ ...config, WEB_SERVER: server, WEB_CONFIGTEST_BIN: bin }, spawner).webConfigtest()).toThrow(
        /is not a (apache|nginx) configtest binary/,
      );
      expect(calls).toEqual([]);
    }
  });

  test('phpLint refuses a file outside STATE_ROOT, or a missing one, before spawning', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_php');
    const x = createExec({ ...config, STATE_ROOT: root }, spawner);
    await expect(x.phpLint('/etc/hosts')).rejects.toBeInstanceOf(ValidationError);
    await expect(x.phpLint(join(root, 'missing.php'))).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  test('v2ScratchBoot: only a directory directly under v2/releases, port range, v2.env present — refused before anything runs', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_v2');
    const v2 = join(root, 'publication_api', 'v2');
    const committed = join(v2, 'releases', COMMITTED);
    const x = createExec({ ...config, STATE_ROOT: root }, spawner);

    await expect(x.v2ScratchBoot(committed, 3200)).rejects.toBeInstanceOf(ConflictError); // no v2.env yet
    writeFileSync(join(v2, 'shared', 'v2.env'), 'DB_NAME="web_test"\nPORT="9"\n');
    await expect(x.v2ScratchBoot(committed, 80)).rejects.toBeInstanceOf(ValidationError);
    await expect(x.v2ScratchBoot(committed, 70000)).rejects.toBeInstanceOf(ValidationError);
    // staging/ is agent-only (Task 8 MODES): a STAGED tree is never scratch-booted, only a
    // committed releases/<id> (Task 7 boots it before the sha record and the promote)
    await expect(x.v2ScratchBoot(join(v2, 'staging', STAGED), 3200)).rejects.toBeInstanceOf(ValidationError);
    await expect(x.v2ScratchBoot(join(v2, 'releases'), 3200)).rejects.toBeInstanceOf(ValidationError);
    await expect(x.v2ScratchBoot(join(root, 'rules'), 3200)).rejects.toBeInstanceOf(ValidationError);
    await expect(x.v2ScratchBoot('/tmp', 3200)).rejects.toBeInstanceOf(ValidationError);
    writeFileSync(join(v2, 'releases', 'loose_file'), '');
    await expect(x.v2ScratchBoot(join(v2, 'releases', 'loose_file'), 3200)).rejects.toBeInstanceOf(ValidationError);
    // a link under releases/ resolves elsewhere: refused by realpath
    symlinkSync(join(v2, 'staging', STAGED), join(v2, 'releases', '7.0.4_bbbbbbb'));
    await expect(x.v2ScratchBoot(join(v2, 'releases', '7.0.4_bbbbbbb'), 3200)).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  test('v2ScratchBoot STARTS THE TEMPLATE UNIT (v2 user, polkit), never release code as the agent', async () => {
    const { spawner, calls } = recordingSpawner();
    const root = await stateTree('ex_v2_unit');
    const v2 = join(root, 'publication_api', 'v2');
    const committed = join(v2, 'releases', COMMITTED);
    writeFileSync(join(v2, 'shared', 'v2.env'), 'DB_NAME="web_test"\n');
    const cfg = { ...config, STATE_ROOT: root, V2_UNIT: 'dedalo-v2-test' };
    const x = createExec(cfg, spawner);

    const scratch = await x.v2ScratchBoot(committed, 3200);
    const unit = 'dedalo-v2-test-scratch@3200.service';
    expect(scratch.unit).toBe(unit);
    // the unit's WorkingDirectory is <v2>/scratch: repointed at the release under test
    expect(readlinkSync(join(v2, SCRATCH_LINK))).toBe(realpathSync(committed));
    await scratch.stop();
    await scratch.stop(); // idempotent: one systemctl stop
    expect(calls).toEqual([
      { argv: [SYSTEMCTL, 'start', unit], options: { env: { PATH: CHILD_PATH, LANG: 'C' } } },
      { argv: [SYSTEMCTL, 'stop', unit], options: { env: { PATH: CHILD_PATH, LANG: 'C' } } },
    ]);
    // a second boot repoints the same link (atomic rename over it, no leftover .next)
    mkdirSync(join(v2, 'releases', '7.0.4_ccccccc'));
    await x.v2ScratchBoot(join(v2, 'releases', '7.0.4_ccccccc'), 3201);
    expect(readlinkSync(join(v2, SCRATCH_LINK))).toBe(realpathSync(join(v2, 'releases', '7.0.4_ccccccc')));
    expect(readdirSync(v2).sort()).toEqual(['releases', 'scratch', 'shared', 'staging']);
    // THE INVARIANT (spec §2.5): no named command ever runs Bun — pushed code runs only
    // under the v2 user's unit, never as a child holding the agent's grants, key and bearer.
    // The agent config has no Bun path to run (no BUN_BIN key), and no argv names one.
    expect(Object.keys(config)).not.toContain('BUN_BIN');
    for (const c of calls) {
      expect(c.argv.some(arg => /(^|\/)bun$/.test(arg) || arg === process.execPath)).toBe(false);
      expect(c.options.cwd).toBeUndefined();
    }
    // the name is the one the polkit rule's regex grants (render/polkit.ts)
    expect(v2ScratchUnit('dedalo-v2-test', 3200)).toBe(`dedalo-v2-test${V2_SCRATCH_TEMPLATE_SUFFIX}3200.service`);
  });

  test('v2ScratchBoot: a refused start is a 503 scratch_start_failed (stop attempted); a refused stop is loud', async () => {
    const root = await stateTree('ex_v2_fail');
    const v2 = join(root, 'publication_api', 'v2');
    const committed = join(v2, 'releases', COMMITTED);
    writeFileSync(join(v2, 'shared', 'v2.env'), 'DB_NAME="web_test"\n');
    const cfg = { ...config, STATE_ROOT: root, V2_UNIT: 'dedalo-v2-test' };

    const startRefused = recordingSpawner(['start']);
    const error = await createExec(cfg, startRefused.spawner).v2ScratchBoot(committed, 3200).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HostActionFailedError);
    expect((error as HostActionFailedError).extensions).toEqual({ reason: 'scratch_start_failed' });
    expect((error as Error).message).toContain('Access denied');
    expect((error as Error).message).not.toContain('more');
    expect(startRefused.calls.map(c => c.argv[1])).toEqual(['start', 'stop']);

    const stopRefused = recordingSpawner(['stop']);
    const scratch = await createExec(cfg, stopRefused.spawner).v2ScratchBoot(committed, 3200);
    await expect(scratch.stop()).rejects.toBeInstanceOf(HostActionFailedError);
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
      v2ScratchBoot: async () => ({ unit: 'stand-in', stop: async () => {} }),
    };
    const restore = setExecForTests(standIn);
    expect(exec()).toBe(standIn);
    expect((await exec().webConfigtest()).stderr).toBe('stand-in');
    restore();
    expect(exec()).toBe(before);
  });
});
