/**
 * init/args.ts — `provision init`'s command line (spec §1.2) and the constants the trampoline
 * shares (init/constants.ts). Pure; no host.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INIT_FLAGS, initUsageLines, parseInitArgs } from '../src/provision/init/args';
import {
  BUN_HANDOVER_FLAGS,
  EMPTY_BUNFIG_NAME,
  INIT_FLAGS_HANDOVER,
  KEPT_DIR_NAME,
  RERUN_ENV_NAME,
  SOURCE_MANIFEST,
  STAGE_DIR_NAME,
} from '../src/provision/init/constants';
import type { InitArgs } from '../src/provision/init/types';

const REPO = join(import.meta.dir, '..', '..', '..');
const SHA = 'a'.repeat(64);

function ok(argv: string[]): InitArgs {
  const parsed = parseInitArgs(argv);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
}

function error(argv: string[]): string {
  const parsed = parseInitArgs(argv);
  if (!('error' in parsed)) throw new Error(`accepted ${JSON.stringify(argv)}`);
  return parsed.error;
}

describe('parseInitArgs', () => {
  test('defaults: only the instance', () => {
    expect(ok(['test'])).toEqual({
      instance: 'test',
      draft: null,
      source: null,
      sourceDigestConfirmed: null,
      bunArchive: null,
      bunSums: null,
      yes: false,
      decide: new Map(),
      resume: false,
      dryRun: false,
      pairName: 'test',
      noPair: false,
    });
  });

  test("the trampoline's full hand-over plus operator flags", () => {
    const args = ok([
      'test',
      '--draft',
      '/var/lib/dedalo_publication_host_init/test/stage/draft.json',
      '--source',
      '/var/lib/dedalo_publication_host_init/test/stage/source',
      '--source-digest-confirmed',
      SHA,
      '--bun-archive',
      '/var/lib/dedalo_publication_host_init/test/stage/bun/bun-linux-x64.zip',
      '--bun-sums',
      '/var/lib/dedalo_publication_host_init/test/stage/bun/SHASUMS256.txt',
      '--yes',
      '--decide',
      'declaration.layout=system',
      '--decide',
      'web.vhost.0a1b2c3d=act',
      '--pair-name',
      'museum_a',
    ]);
    expect(args.source).toBe('/var/lib/dedalo_publication_host_init/test/stage/source');
    expect(args.sourceDigestConfirmed).toBe(SHA);
    expect(args.yes).toBe(true);
    expect([...args.decide]).toEqual([
      ['declaration.layout', 'system'],
      ['web.vhost.0a1b2c3d', 'act'],
    ]);
    expect(args.pairName).toBe('museum_a');
  });

  test.each([
    [['test', '--declaration', '/etc/x.json'], 'init writes the declaration; give the draft with --draft'],
    [[], 'no instance'],
    [['Test'], "instance 'Test' must match"],
    [['test', 'extra'], "unexpected argument 'extra'"],
    [['test', '--force'], "unknown flag '--force'"],
    [['test', '--yes', '--yes'], '--yes given twice'],
    [['test', '--draft'], '--draft needs <file>'],
    [['test', '--draft', '--yes'], '--draft needs <file>'],
    [['test', '--draft', 'relative.json'], '--draft needs a clean absolute path'],
    [['test', '--bun-archive', '/a/../b.zip'], '--bun-archive needs a clean absolute path'],
    [['test', '--draft', '/a', '--draft', '/b'], '--draft given twice'],
    [['test', '--source', '/stage/source'], '--source and --source-digest-confirmed go together'],
    [['test', '--source-digest-confirmed', SHA], '--source and --source-digest-confirmed go together'],
    [['test', '--source', '/s', '--source-digest-confirmed', 'abc'], '--source-digest-confirmed needs a sha256'],
    [['test', '--bun-sums', '/s.txt'], '--bun-sums needs --bun-archive'],
    [['test', '--decide', 'noequals'], '--decide needs <item-id>=<option>'],
    [['test', '--decide', 'Bad=act'], '--decide needs <item-id>=<option>'],
    [['test', '--decide', 'x=Act!'], '--decide needs <item-id>=<option>'],
    [['test', '--decide', 'a=act', '--decide', 'a=skip'], '--decide a given twice'],
    [['test', '--pair-name', 'pairing_x'], '--pair-name must match'],
    [['test', '--pair-name', 'x'], '--pair-name must match'],
    [['test', '--pair-name', 'abc', '--no-pair'], '--pair-name and --no-pair exclude each other'],
    [['test', '--dry-run', '--resume'], '--dry-run writes nothing; it cannot --resume'],
  ] as const)('%p → USAGE: %p', (argv, message) => {
    expect(error([...argv])).toContain(message);
  });

  test('every flag of INIT_FLAGS parses (none is listed but unreachable)', () => {
    for (const flag of INIT_FLAGS) {
      const argv = ['test', flag.flag];
      if (flag.value !== null) argv.push(flag.flag === '--decide' ? 'a.b=c' : flag.flag === '--pair-name' ? 'abc' : '/x');
      if (flag.flag === '--source') argv.push('--source-digest-confirmed', SHA);
      if (flag.flag === '--source-digest-confirmed') argv.push('--source', '/s');
      if (flag.flag === '--bun-sums') argv.push('--bun-archive', '/b.zip');
      if (flag.flag === '--source-digest-confirmed') argv.splice(2, 1, SHA);
      expect(parseInitArgs(argv)).not.toHaveProperty('error');
    }
  });

  test('the usage names every flag', () => {
    const usage = initUsageLines().join('\n');
    for (const flag of INIT_FLAGS) expect(usage).toContain(flag.flag);
    expect(initUsageLines()[0]).toStartWith('usage: provision init <instance>');
  });
});

describe('the trampoline constants (init/constants.ts)', () => {
  test("the hand-over flags are INIT_FLAGS members, the trampoline's subset", () => {
    const flags = INIT_FLAGS.map(f => f.flag);
    for (const flag of INIT_FLAGS_HANDOVER) expect(flags).toContain(flag);
    expect(INIT_FLAGS_HANDOVER).not.toContain('--yes');
    expect(BUN_HANDOVER_FLAGS).toEqual(['--no-env-file', '--no-install']);
  });

  test('SOURCE_MANIFEST names exactly the source layout (spec S2), and every entry exists in this checkout', () => {
    expect(SOURCE_MANIFEST.map(entry => entry.path)).toEqual([
      '.bun-version',
      '.bun-sha256',
      'publication/host_agent',
      'publication/server_api/v2/.env.example',
      'publication/server_api/v1/config_api/sample.server_config_api.php',
    ]);
    for (const entry of SOURCE_MANIFEST) {
      expect(entry.path).not.toMatch(/(^|\/)\.\.(\/|$)|^\/|^\.\//);
      for (const excluded of entry.exclude) expect(excluded.startsWith(`${entry.path}/`)).toBe(true);
      // .bun-sha256 is P5's (generated by scripts/ci/bun_pin_hashes.ts); every other entry is here today.
      if (entry.path !== '.bun-sha256') expect(existsSync(join(REPO, entry.path))).toBe(true);
    }
    expect(SOURCE_MANIFEST.find(e => e.path === 'publication/host_agent')?.exclude).toEqual(['publication/host_agent/.test-tmp']);
  });

  test('the stage names', () => {
    expect([EMPTY_BUNFIG_NAME, STAGE_DIR_NAME, RERUN_ENV_NAME, KEPT_DIR_NAME]).toEqual([
      'empty.bunfig.toml',
      'stage',
      'rerun.env',
      'kept',
    ]);
  });
});
