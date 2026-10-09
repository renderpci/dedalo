/**
 * rules.map — the agent's half of the host-wide nginx map (src/rules/map.ts, src/routes/rules_map.ts).
 *
 * SEAMS (named, spec §9): the suite's own config is an Apache host, so the nginx `conf_d` facts,
 * the scratch host-map directory and the uid this agent runs as arrive through
 * setRulesDepsForTests; foreign uids are MODELLED through its injected lstat. `startHostMap`
 * (src/exec.ts) is a fake that either runs ROOT'S REAL RENDERER (runHostMap over the same
 * scratch directory, a fake lock and a scripted nginx) or writes a scripted result.json — so
 * "the agent answers from root's result" is observed on real files.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAudit } from '../src/audit';
import { config } from '../src/config';
import { ApiError } from '../src/errors';
import { type Exec, type ExecResult, setExecForTests } from '../src/exec';
import type { LockIo } from '../src/provision/lock';
import { routeRequest } from '../src/router';
import { handleRulesMap } from '../src/routes/rules_map';
import { type RulesDeps, setRulesDepsForTests } from '../src/rules/apply';
import { envelopePcre, MAP_GRAMMAR } from '../src/rules/directives';
import { canonicalRecord, type HostMapResult, renderHostMap } from '../src/rules/host_map';
import { hostMapIo, runHostMap } from '../src/rules/host_map_main';
import { applyMap, hostMapStatus, MAX_MAP_BYTES } from '../src/rules/map';
import { ACTOR_HEADER } from '../src/security/auth';
import { resetInstance, scratchPath } from './fixtures/instance';


const BASE = scratchPath('rules_map');
const MAP_DIR = join(BASE, 'nginx_map');
const CONTRIB = join(MAP_DIR, 'contrib');
const IDENTITIES = join(BASE, 'identities.json');
const RESULT = join(MAP_DIR, 'result.json');
const LIVE = join(MAP_DIR, 'dedalo_media_map.nginx.conf');
const OWN = join(CONTRIB, `${config.INSTANCE}.json`);
const ME = typeof process.getuid === 'function' ? process.getuid() : 0;
const ACTOR = 'publisher';
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const ENV_A = envelopePcre('media', 'image');
const ENV_B = envelopePcre('media_b', 'image');

const mapText = (hash = H1, envelope = ENV_A) => renderHostMap([{ hash, envelope, pinsId: 'pins-1' }]).text;

let uids = new Map<string, number>();
let starts = 0;
let startScript: (() => Promise<ExecResult>) | null = null;
let nginx: { configtest: number[]; reload: number[] } = { configtest: [], reload: [] };
let restore: (() => void)[] = [];

function lock(): LockIo {
  return {
    openLockFile: () => 1,
    tryFlock: () => true,
    unlock() {},
    readOwner: () => null,
    writeOwner() {},
    holderFromProcLocks: () => null,
    lstat: () => null,
    mkdir() {},
    now: () => 0,
    sleepSync() {},
    async sleep() {},
  };
}

/** Root's real renderer over the scratch directory (what `systemctl start` runs on a host). */
async function rootRender(): Promise<ExecResult> {
  const result = await runHostMap({
    mapDir: MAP_DIR,
    locksDir: join(BASE, 'locks'),
    identitiesPath: IDENTITIES,
    lockIo: lock(),
    exec: {
      webConfigtest: async () => ({ code: nginx.configtest.shift() ?? 0, stdout: '', stderr: '' }),
      webReload: async () => ({ code: nginx.reload.shift() ?? 0, stdout: '', stderr: '' }),
    },
    io: hostMapIo(),
    now: () => new Date(),
    log: () => {},
  });
  return { code: ['applied', 'unchanged', 'empty'].includes(result.outcome) ? 0 : 1, stdout: '', stderr: '' };
}

function install(options: { server?: 'apache' | 'nginx'; mode?: 'conf_d' | 'none' } = {}): void {
  const deps: RulesDeps = {
    instance: config.INSTANCE,
    webServer: options.server ?? 'nginx',
    nginxMapMode: options.mode ?? 'conf_d',
    lockIo: lock(),
    locksDir: join(BASE, 'locks'),
    lockUid: 0,
    nginxMapDir: MAP_DIR,
    uid: ME,
    lstat(path) {
      const facts = hostMapIo().lstat(path);
      const uid = uids.get(path);
      return facts === null ? null : { type: facts.type, uid: uid ?? facts.uid };
    },
  };
  const exec: Exec = {
    startTrust: async () => {
      throw new Error('rules.map never starts the trust unit');
    },
    webConfigtest: async () => {
      throw new Error('rules.map never runs the agent configtest');
    },
    webReload: async () => {
      throw new Error('rules.map never reloads itself');
    },
    v2Restart: async () => {
      throw new Error('no');
    },
    phpLint: async () => {
      throw new Error('no');
    },
    v2ScratchBoot: () => {
      throw new Error('no');
    },
    async startHostMap(...args: unknown[]): Promise<ExecResult> {
      expect(args).toEqual([]);
      starts++;
      return startScript === null ? rootRender() : startScript();
    },
  };
  for (const undo of restore) undo();
  restore = [setRulesDepsForTests(deps), setExecForTests(exec)];
}

function writeResult(result: Partial<HostMapResult>): void {
  const previous = existsSync(RESULT) ? (JSON.parse(readFileSync(RESULT, 'utf8')) as HostMapResult) : null;
  const full: HostMapResult = {
    v: 1,
    seq: (previous?.seq ?? 0) + 1,
    at: 'now',
    outcome: 'applied',
    host_hash: H1,
    contributions: [],
    refused: [],
    invalid: 0,
    ...result,
  };
  writeFileSync(RESULT, canonicalRecord(full as unknown as Record<string, unknown>));
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

const map = (text = mapText(), hash = H1) => applyMap({ text, hash, actor: ACTOR });

async function audits(): Promise<string[]> {
  return (await readAudit())
    .filter(entry => entry.action === 'rules.map')
    .map(entry => `${entry.outcome}:${String(entry.detail?.result)}`)
    .sort();
}

beforeEach(async () => {
  await resetInstance();
  rmSync(BASE, { recursive: true, force: true });
  mkdirSync(CONTRIB, { recursive: true });
  writeFileSync(IDENTITIES, JSON.stringify({ [config.INSTANCE]: ME, other: ME + 1 }));
  uids = new Map();
  starts = 0;
  startScript = null;
  nginx = { configtest: [], reload: [] };
  install();
});
afterEach(async () => {
  for (const undo of restore) undo();
  restore = [];
  rmSync(BASE, { recursive: true, force: true });
  await resetInstance();
});

describe('applyMap — through root', () => {
  test('writes its own contribution atomically (0640, no temp left), starts the renderer once, answers from result.json', async () => {
    expect(await map()).toEqual({ hash: H1, host_hash: H1, contributions: 1, reloaded: true });
    expect(JSON.parse(readFileSync(OWN, 'utf8'))).toEqual({
      v: 1,
      grammar: 1,
      instance: config.INSTANCE,
      hash: H1,
      envelope: ENV_A,
      pinsId: 'pins-1',
    });
    expect(statSync(OWN).mode & 0o777).toBe(0o640);
    expect(readdirSync(CONTRIB)).toEqual([`${config.INSTANCE}.json`]);
    expect(starts).toBe(1);
    expect(readFileSync(LIVE, 'utf8')).toBe(mapText());
    expect(await audits()).toEqual(['ok:applied']);
    const [entry] = await readAudit();
    expect(entry).toMatchObject({ actor: ACTOR, action: 'rules.map', outcome: 'ok', detail: { host_hash: H1, contributions: 1 } });
  });

  test('a second identical push is unchanged; a sibling makes the host hash differ while ours is still loaded', async () => {
    await map();
    expect(await map()).toMatchObject({ host_hash: H1, contributions: 1 });
    expect(await audits()).toEqual(['ok:applied', 'ok:unchanged']);
    writeFileSync(join(CONTRIB, 'other.json'), JSON.stringify({ v: 1, grammar: 1, instance: 'other', hash: H2, envelope: ENV_B, pinsId: 'pins-1' }));
    uids.set(join(CONTRIB, 'other.json'), ME + 1);
    // root's real renderer reads uids from the real fs: the sibling is ours on this machine, so model it there too
    writeFileSync(IDENTITIES, JSON.stringify({ [config.INSTANCE]: ME, other: ME }));
    const answer = await map();
    expect(answer.contributions).toBe(2);
    expect(answer.host_hash).not.toBe(H1);
    expect(hostMapStatus()).toMatchObject({ managed: true, hash: H1, host_hash: answer.host_hash, contributions: 2 });
  });

  test('root refuses a rebind: 409 map_envelope_rebind, and the bound envelope is still served', async () => {
    await map();
    const error = await caught(map(mapText(H2, ENV_B), H2));
    expect(error.status).toBe(409);
    expect(error.extensions).toEqual({ reason: 'map_envelope_rebind' });
    expect(readFileSync(LIVE, 'utf8')).toBe(mapText());
    expect(hostMapStatus()).toMatchObject({ refused: 'map_envelope_rebind', hash: H1 });
  });

  test('nginx configtest failure: 422 configtest_failed; reload failure: 503 reload_failed', async () => {
    nginx.configtest = [1, 0];
    const configtest = await caught(map());
    expect(configtest.status).toBe(422);
    expect(configtest.extensions).toEqual({ reason: 'configtest_failed' });
    nginx.reload = [1];
    const reload = await caught(map());
    expect(reload.status).toBe(503);
    expect(reload.extensions).toEqual({ reason: 'reload_failed', reload_pending: true });
    expect(hostMapStatus()).toMatchObject({ host_hash: null, hash: null });
    expect(await audits()).toEqual(['failed:configtest_failed', 'failed:reload_failed']);
  });

  test('an instance root does not know (identities.json lacks it) is map_renderer_missing', async () => {
    writeFileSync(IDENTITIES, JSON.stringify({ other: ME }));
    const error = await caught(map());
    expect(error.status).toBe(409);
    expect(error.extensions).toEqual({ reason: 'map_renderer_missing' });
  });
});

describe('applyMap — answers from scripted results', () => {
  test('a newer contribution elsewhere: 409 map_contribution_newer naming the instance and its grammar', async () => {
    startScript = async () => {
      writeResult({
        outcome: 'map_contribution_newer',
        refused: [{ instance: 'other', reason: 'map_contribution_newer', grammar: MAP_GRAMMAR + 1, pins_id: 'pins-2' }],
      });
      return { code: 1, stdout: '', stderr: '' };
    };
    const error = await caught(map());
    expect(error.status).toBe(409);
    expect(error.extensions).toEqual({ reason: 'map_contribution_newer', instance: 'other', grammar: MAP_GRAMMAR + 1 });
    expect(error.message).toContain("'other'");
  });

  test('root refused this instance as foreign or malformed', async () => {
    for (const [reason, status] of [
      ['map_contribution_foreign', 409],
      ['map_refused', 422],
    ] as const) {
      startScript = async () => {
        writeResult({ outcome: 'unchanged', refused: [{ instance: config.INSTANCE, reason }] });
        return { code: 0, stdout: '', stderr: '' };
      };
      const error = await caught(map());
      expect(error.status).toBe(status);
      expect(error.extensions).toEqual({ reason });
    }
  });

  test('host_busy (503), lock_missing and identities_invalid (409 map_renderer_missing)', async () => {
    const cases: [HostMapResult['outcome'], number, string][] = [
      ['host_busy', 503, 'host_busy'],
      ['lock_missing', 409, 'map_renderer_missing'],
      ['identities_invalid', 409, 'map_renderer_missing'],
    ];
    for (const [outcome, status, reason] of cases) {
      startScript = async () => {
        writeResult({ outcome });
        return { code: 1, stdout: '', stderr: '' };
      };
      const error = await caught(map());
      expect(error.status).toBe(status);
      expect(error.extensions).toEqual({ reason });
    }
  });

  test('a start with no fresh result: exit 5 is map_renderer_missing; exit 0 or another code is reload_failed', async () => {
    startScript = async () => ({ code: 5, stdout: '', stderr: 'Unit dedalo-pubhost-map.service not found.' });
    expect((await caught(map())).extensions).toEqual({ reason: 'map_renderer_missing' });
    expect(starts).toBe(1);
    starts = 0;
    startScript = async () => ({ code: 0, stdout: '', stderr: '' });
    expect((await caught(map())).extensions).toEqual({ reason: 'reload_failed', renderer_exit: 0 });
    expect(starts).toBe(2);
    startScript = async () => {
      throw new Error('spawn ENOENT');
    };
    expect((await caught(map())).extensions).toEqual({ reason: 'reload_failed', renderer_exit: -1 });
  });

  test('a result without our new contribution (a run already under way) is retried once, then succeeds', async () => {
    let calls = 0;
    startScript = async () => {
      calls++;
      writeResult(
        calls === 1
          ? { contributions: [{ instance: config.INSTANCE, hash: H2, grammar: 1, pins_id: 'pins-1', envelope: ENV_A }] }
          : { contributions: [{ instance: config.INSTANCE, hash: H1, grammar: 1, pins_id: 'pins-1', envelope: ENV_A }] },
      );
      return { code: 0, stdout: '', stderr: '' };
    };
    expect(await map()).toEqual({ hash: H1, host_hash: H1, contributions: 1, reloaded: true });
    expect(calls).toBe(2);
  });

  test('still stale after the retry: 503 reload_failed (renderer_result stale)', async () => {
    startScript = async () => {
      writeResult({ contributions: [] });
      return { code: 0, stdout: '', stderr: '' };
    };
    expect((await caught(map())).extensions).toEqual({ reason: 'reload_failed', renderer_result: 'stale' });
    expect(starts).toBe(2);
  });
});

describe('applyMap — refusals before any write', () => {
  test('map_unmanaged (409) when NGINX_MAP_MODE=none; server_mismatch (422) on apache', async () => {
    install({ mode: 'none' });
    const unmanaged = await caught(map());
    expect(unmanaged.status).toBe(409);
    expect(unmanaged.extensions).toEqual({ reason: 'map_unmanaged' });
    install({ server: 'apache', mode: 'none' });
    const apache = await caught(map());
    expect(apache.status).toBe(422);
    expect(apache.extensions).toEqual({ reason: 'server_mismatch' });
    expect(starts).toBe(0);
    expect(existsSync(OWN)).toBe(false);
  });

  test('the shape refusals, the grammar (line + directive) and one envelope', async () => {
    const two = renderHostMap([
      { hash: H1, envelope: ENV_A, pinsId: 'pins-1' },
      { hash: H1, envelope: ENV_B, pinsId: 'pins-1' },
    ]).text;
    const cases: [string, string, Record<string, unknown>][] = [
      [mapText(), H1.toUpperCase(), { reason: 'hash_invalid' }],
      [`${mapText()}#${'x'.repeat(MAX_MAP_BYTES)}`, H1, { reason: 'rules_too_large' }],
      [`${mapText()}#\0`, H1, { reason: 'rules_nul_byte' }],
      [mapText().replace(/^# config-hash: .*\n/m, ''), H1, { reason: 'stamp_missing' }],
      [mapText(), H2, { reason: 'hash_mismatch' }],
      [`${mapText()}include /etc/shadow;\n`, H1, { reason: 'map_refused', line: 25, directive: 'include' }],
      [two, H1, { reason: 'map_refused' }],
    ];
    for (const [text, hash, extensions] of cases) {
      const error = await caught(map(text, hash));
      expect(error.status).toBe(422);
      expect(error.extensions).toEqual(extensions);
    }
    expect((await caught(map(two, H1))).message).toBe('a contribution carries one envelope');
    expect(starts).toBe(0);
    expect(existsSync(OWN)).toBe(false);
  });

  test('a contribution file of our name owned by another uid (or a temp) is map_contribution_foreign, never touched', async () => {
    writeFileSync(OWN, 'squatted');
    uids.set(OWN, ME + 7);
    const error = await caught(map());
    expect(error.status).toBe(409);
    expect(error.extensions).toEqual({ reason: 'map_contribution_foreign' });
    expect(readFileSync(OWN, 'utf8')).toBe('squatted');
    rmSync(OWN);
    const temp = join(CONTRIB, `.${config.INSTANCE}.json.tmp`);
    writeFileSync(temp, 'x');
    uids.set(temp, ME + 7);
    expect((await caught(map())).extensions).toEqual({ reason: 'map_contribution_foreign' });
    expect(starts).toBe(0);
    expect(await audits()).toEqual(['refused:map_contribution_foreign', 'refused:map_contribution_foreign']);
  });
});

describe('hostMapStatus', () => {
  test('null on apache, {managed:false} when placed by hand', () => {
    install({ server: 'apache', mode: 'none' });
    expect(hostMapStatus()).toBeNull();
    install({ mode: 'none' });
    expect(hostMapStatus()).toEqual({ managed: false });
  });

  test('nothing pushed yet: managed, nothing loaded', () => {
    expect(hostMapStatus()).toEqual({ managed: true, hash: null, host_hash: null, contributions: 0, invalid: 0, refused: null });
  });

  test('our hash only while our contribution is in the LOADED file', async () => {
    await map();
    expect(hostMapStatus()).toEqual({ managed: true, hash: H1, host_hash: H1, contributions: 1, invalid: 0, refused: null });
    writeFileSync(`${LIVE}.reload-pending`, 'x\n');
    expect(hostMapStatus()).toMatchObject({ hash: null, host_hash: null });
  });
});

describe('POST /v1/rules/map', () => {
  const URL_ = new URL('http://agent.test/publication/host_agent/v1/rules/map');
  const post = (body: unknown, actor: string | null = ACTOR, extra: Record<string, string> = {}) =>
    new Request(URL_.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(actor === null ? {} : { [ACTOR_HEADER]: actor }), ...extra },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  test('through the router (bearer, actor): 200 with the fixed answer shape', async () => {
    const response = await routeRequest(post({ text: mapText(), hash: H1 }, 'curator.ana', { authorization: `Bearer ${config.SERVICE_TOKEN}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hash: H1, host_hash: H1, contributions: 1, reloaded: true });
    expect((await readAudit())[0]).toMatchObject({ actor: 'curator.ana', action: 'rules.map' });
  });

  test('no bearer is 401; shape errors are 400 before anything runs', async () => {
    expect((await routeRequest(post({ text: mapText(), hash: H1 }))).status).toBe(401);
    const bad: [Request, string][] = [
      [post({ text: mapText(), hash: H1 }, null), 'actor_missing'],
      [post('nope'), 'body_invalid'],
      [post({ text: 1, hash: H1 }), 'body_invalid'],
      [post({ text: mapText(), hash: 1 }), 'body_invalid'],
    ];
    for (const [request, reason] of bad) {
      const error = await caught(Promise.resolve().then(() => handleRulesMap(request, URL_)));
      expect(error.status).toBe(400);
      expect(error.extensions).toEqual({ reason });
    }
    expect(starts).toBe(0);
  });
});

