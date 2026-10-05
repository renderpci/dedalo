/**
 * A DEPLOYED CHECKOUT NEVER BOOTS IN TEST MODE FROM THE COMMITTED .env.test (Task 1 residual
 * risk #6, closed in Task 8). `.env.test` ships in every checkout (public dummy token, roots
 * under ./.test-tmp/); under NODE_ENV=test with DEDALO_HOST_AGENT_ENV_FILE unset the config
 * falls back to it ONLY when `<package>/.test-tmp/` declares itself the suite's — a real
 * directory owned by this uid holding a real instance marker, which tests/preload.ts plants
 * before any test module loads. Proved two ways:
 *   - the pure door (defaultEnvFilePath with an injected package dir) refuses every
 *     undeclared shape and accepts the declared one;
 *   - END TO END: a copy of the agent's code + .env.test, laid out like a deployed checkout
 *     (no .test-tmp), started with NODE_ENV=test, exits 1 naming the env-file variable, and
 *     the same copy takes its own .env.test once the scratch tree is declared.
 * The provisioner's half (an agent_dir holding .test-tmp is refused) is
 * tests/provision_plan.test.ts + tests/provision_host_io.test.ts.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigError, ENV_FILE_VAR, TEST_SCRATCH_DIR, TEST_SCRATCH_MARKER, defaultEnvFilePath } from '../src/config';
import { INSTANCE_MARKER, markerContent } from '../src/instance/roots';
import { TEST_SCRATCH_DIR as PLAN_TEST_SCRATCH_DIR } from '../src/provision/plan';
import { INSTANCE, SCRATCH_DIR_NAME, scratchPath } from './fixtures/instance';
import { PRELOAD_INSTANCE } from './preload';

const PACKAGE_DIR = join(import.meta.dir, '..');
const GATE = scratchPath('dtm');

afterAll(() => rmSync(GATE, { recursive: true, force: true }));

function fresh(name: string): string {
  const dir = join(GATE, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function declare(dir: string): void {
  mkdirSync(join(dir, TEST_SCRATCH_DIR), { recursive: true });
  writeFileSync(join(dir, TEST_SCRATCH_MARKER), markerContent('test'));
}

function refusal(packageDir: string): string {
  try {
    defaultEnvFilePath({ NODE_ENV: 'test' }, packageDir);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error('defaultEnvFilePath accepted an undeclared checkout');
}

describe('one spelling of the scratch tree', () => {
  test('config, plan, the fixture and the preload name the same tree, marker and instance', () => {
    expect(TEST_SCRATCH_DIR).toBe('.test-tmp');
    expect(PLAN_TEST_SCRATCH_DIR).toBe(TEST_SCRATCH_DIR);
    expect(SCRATCH_DIR_NAME).toBe(TEST_SCRATCH_DIR);
    expect(TEST_SCRATCH_MARKER).toBe(join(TEST_SCRATCH_DIR, INSTANCE_MARKER));
    expect(PRELOAD_INSTANCE).toBe(INSTANCE);
  });
});

describe('defaultEnvFilePath: the .env.test fallback needs a declared checkout', () => {
  test('no scratch tree → refused, naming the env-file variable', () => {
    const message = refusal(fresh('none'));
    expect(message).toContain(ENV_FILE_VAR);
    expect(message).toContain("no '.test-tmp' scratch tree");
  });

  test('a scratch tree without a marker, with a linked marker, or with a bogus one → refused', () => {
    const dir = fresh('shapes');
    mkdirSync(join(dir, TEST_SCRATCH_DIR));
    expect(refusal(dir)).toContain('is missing');
    const elsewhere = join(fresh('elsewhere'), 'marker');
    writeFileSync(elsewhere, markerContent('test'));
    symlinkSync(elsewhere, join(dir, TEST_SCRATCH_MARKER));
    expect(refusal(dir)).toContain('is not a regular file');
    rmSync(join(dir, TEST_SCRATCH_MARKER));
    writeFileSync(join(dir, TEST_SCRATCH_MARKER), 'whoever\nelse\n');
    expect(refusal(dir)).toContain('names no instance');
  });

  test('a linked scratch tree → refused (a link can point at any declared tree)', () => {
    const real = fresh('real');
    declare(real);
    const dir = fresh('linked');
    symlinkSync(join(real, TEST_SCRATCH_DIR), join(dir, TEST_SCRATCH_DIR));
    expect(refusal(dir)).toContain('is not a real directory');
  });

  test('a declared checkout → its own .env.test', () => {
    const dir = fresh('declared');
    declare(dir);
    expect(defaultEnvFilePath({ NODE_ENV: 'test' }, dir)).toBe(join(dir, '.env.test'));
  });

  test('a named env file never needs the scratch tree', () => {
    expect(defaultEnvFilePath({ NODE_ENV: 'test', [ENV_FILE_VAR]: '/etc/x/agent.env' }, fresh('named'))).toBe(
      '/etc/x/agent.env',
    );
  });
});

describe('end to end: a deployed-shaped copy of the agent', () => {
  test('NODE_ENV=test, no env file named, no scratch tree → exit 1; declared → its .env.test is read', () => {
    const copy = fresh('c');
    cpSync(join(PACKAGE_DIR, 'src'), join(copy, 'src'), { recursive: true });
    cpSync(join(PACKAGE_DIR, '.env.test'), join(copy, '.env.test'));
    cpSync(join(PACKAGE_DIR, 'package.json'), join(copy, 'package.json'));
    symlinkSync(join(PACKAGE_DIR, 'node_modules'), join(copy, 'node_modules'));
    const load = () =>
      Bun.spawnSync({
        cmd: [process.execPath, '-e', "const m = await import('./src/config.ts'); console.log(m.config.NODE_ENV);"],
        cwd: copy,
        env: { NODE_ENV: 'test', PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
        stdout: 'pipe',
        stderr: 'pipe',
      });

    const refused = load();
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toBe('');
    expect(refused.stderr.toString()).toContain(ENV_FILE_VAR);
    expect(refused.stderr.toString()).toContain("no '.test-tmp' scratch tree");

    declare(copy);
    const booted = load();
    const stderr = booted.stderr.toString();
    // The fallback was TAKEN: the copy's own .env.test was selected (and is what any later
    // law speaks about). It may still refuse on a later law — the copy's relative
    // SOCKET_PATH resolves deeper than the package's and can exceed sun_path in a long
    // checkout path — but never on the scratch-tree door.
    expect(stderr).not.toContain('scratch tree');
    if (booted.exitCode === 0) {
      expect(booted.stdout.toString().trim()).toBe('test');
    } else {
      expect(stderr).toContain(`'${join(copy, '.env.test')}'`);
    }
  });
});
