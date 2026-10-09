/**
 * THE AGENT'S TRIGGER OF THE FAPOLICYD TRUST ONESHOT (src/releases/trust.ts, install.ts): on a
 * fapolicyd host the agent starts the root oneshot — never naming what to trust — at the moments
 * the derived set must already hold the release that is about to run:
 *   - install: after the commit, BEFORE the scratch boot (the new release is then the store's
 *     `previous`), and once more after the swap (recorded in the audit);
 *   - a reused release: stamped newest first, so it is the derived `previous` before it is promoted;
 *   - rollback: BEFORE the swap (the target is the derived `previous`).
 * The fake oneshot runs the REAL derivation (fapolicyd_trust.ts deriveTrust) over this agent's
 * state root at the moment it is started, so "trusted before it ran" is measured, not assumed.
 * A failing oneshot refuses with `trust_failed` and leaves the previous release serving.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readAudit } from '../src/audit';
import { config } from '../src/config';
import type { ApiError } from '../src/errors';
import { setExecForTests } from '../src/exec';
import type { TrustOutcome, TrustRoots } from '../src/provision/fapolicyd_trust';
import { deriveTrust, realTrustIo, renderTrustResult } from '../src/provision/fapolicyd_trust';
import { installRelease, rollbackRelease, setInstallSeamsForTests } from '../src/releases/install';
import { apiLayout, currentRelease } from '../src/releases/store';
import { readTrustRecord, setTrustSeamForTests, triggerTrust, trustUnit } from '../src/releases/trust';
import { buildStatus } from '../src/routes/status';
import type { ApiName } from '../src/releases/ustar';
import { resetInstance, scratchPath } from './fixtures/instance';
import { FAST_TIMING, V2_TREE, fakeReleaseHost, makeBundle, prepareReleaseRoots, sha256Hex } from './fixtures/release_host';
import { streamOf } from './fixtures/ustar_writer';

const A = '7.0.3_aaaaaaa';
const B = '7.0.4_bbbbbbb';
const C = '7.0.5_ccccccc';
const DIR = scratchPath('release_trust');
const RESULT = join(DIR, 'fapolicyd_trust.json');
const UNIT = 'dedalo-pubhost-trust-test';

const host = fakeReleaseHost();
let restore: (() => void)[] = [];
/** What the derivation trusted at each start, in order. */
let seen: string[][] = [];
let answer: { code: number; outcome: TrustOutcome; omit?: string } = { code: 0, outcome: 'applied' };

function roots(): TrustRoots {
  return {
    instance: 'test',
    stateRoot: config.STATE_ROOT,
    bunBin: join(DIR, 'bun'),
    agentDir: join(DIR, 'agent'),
    rendererBun: null,
    apis: (['v1', 'v2'] as const).map(api => ({ api, root: apiLayout(api).root, releases: apiLayout(api).releases, current: apiLayout(api).current })),
  };
}

/** The root oneshot, played: the REAL derivation over the agent's state root, its record written. */
async function oneshot() {
  const derived = deriveTrust(roots(), realTrustIo());
  seen.push(derived.kind === 'ok' ? [...derived.releases] : [`refused: ${derived.reasons.join('; ')}`]);
  const refused = derived.kind === 'refused' || answer.outcome === 'refused';
  writeFileSync(
    RESULT,
    renderTrustResult({
      v: 1,
      at: new Date().toISOString(),
      outcome: refused ? 'refused' : answer.outcome,
      entries: derived.kind === 'ok' ? derived.entries.length : null,
      skipped_links: derived.kind === 'ok' ? derived.skippedLinks : 0,
      releases: derived.kind === 'ok' ? derived.releases.filter(release => release !== answer.omit) : [],
      reasons: refused ? ['agent_dir: a tree it cannot verify'] : answer.omit === undefined ? [] : [`${answer.omit}: hard-linked — not trusted`],
    }),
  );
  return { code: refused ? 1 : answer.code, stdout: '', stderr: '' };
}

beforeAll(() => {
  restore = [
    setExecForTests(host.exec),
    setInstallSeamsForTests({ timing: FAST_TIMING, v2HealthUrl: host.healthUrl }),
    setTrustSeamForTests({ unit: UNIT, resultFile: RESULT }),
  ];
});
afterAll(() => {
  for (const undo of restore.reverse()) undo();
  host.close();
  rmSync(DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetInstance();
  await prepareReleaseRoots();
  host.reset();
  host.state.onTrust = oneshot;
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(join(DIR, 'agent'), { recursive: true });
  writeFileSync(join(DIR, 'bun'), 'BUN');
  writeFileSync(join(DIR, 'agent', 'index.ts'), 'export {};');
  seen = [];
  answer = { code: 0, outcome: 'applied' };
  for (const id of [A, B, C]) {
    host.state.scratchHealthy.add(id);
    host.state.liveHealthy.add(id);
  }
});

function install(api: ApiName, id: string) {
  const bytes = makeBundle({ ...V2_TREE, 'src/marker.ts': `// ${id}` });
  return installRelease({ api, releaseId: id, sha256: sha256Hex(bytes), actor: 'tester', body: streamOf(bytes) });
}
async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected a refusal');
}

describe('install: the new release is trusted BEFORE it runs', () => {
  test('first install: one start before the scratch boot (the release is the derived previous), one after the swap', async () => {
    await install('v2', A);
    expect(host.state.trustCalls).toEqual([
      { current: null, scratchBoots: 0, restarts: 0 },
      { current: A, scratchBoots: 1, restarts: 1 },
    ]);
    expect(seen).toEqual([[`v2:${A}`], [`v2:${A}`]]);
    const last = (await readAudit()).at(-1);
    expect(last?.detail).toMatchObject({ trust: { code: 0, outcome: 'applied', releases: [`v2:${A}`] } });
  });

  test('an upgrade: current and the release under test, both, before the scratch boot', async () => {
    await install('v2', A);
    host.state.trustCalls.length = 0;
    seen = [];
    await install('v2', B);
    expect(host.state.trustCalls[0]).toEqual({ current: A, scratchBoots: 1, restarts: 1 });
    expect(seen[0]).toEqual([`v2:${A}`, `v2:${B}`]);
    expect(seen[1]).toEqual([`v2:${B}`, `v2:${A}`]);
  });

  test('a failing oneshot refuses trust_failed: no scratch boot, the release removed, current unchanged', async () => {
    await install('v2', A);
    answer = { code: 1, outcome: 'refused' };
    const error = await refusal(install('v2', B));
    expect(error.extensions?.reason).toBe('trust_failed');
    expect(error.message).toContain(`${UNIT}.service exited 1 (refused: agent_dir: a tree it cannot verify)`);
    expect(host.state.scratchBoots).toEqual([A]);
    expect(currentRelease('v2')).toBe(A);
    expect((await readdir(apiLayout('v2').releases)).sort()).toEqual([A]);
  });

  test('the set applied but WITHOUT this release (left out by the derivation): refused by name', async () => {
    await install('v2', A);
    answer = { code: 0, outcome: 'applied', omit: `v2:${B}` };
    const error = await refusal(install('v2', B));
    expect(error.extensions?.reason).toBe('trust_failed');
    expect(error.message).toContain(`v2:${B} is not among the trusted releases; v2:${B}: hard-linked — not trusted`);
    expect(host.state.scratchBoots).toEqual([A]);
    expect(currentRelease('v2')).toBe(A);
  });

  test('exit 0 without a readable record is no proof: refused', async () => {
    await install('v2', A);
    host.state.onTrust = async () => {
      rmSync(RESULT, { force: true });
      return { code: 0, stdout: '', stderr: '' };
    };
    expect((await refusal(install('v2', B))).extensions?.reason).toBe('trust_failed');
  });

  test('a reused release is stamped newest first: the derived previous before it is promoted', async () => {
    await install('v2', A);
    await install('v2', B);
    await install('v2', C);
    seen = [];
    host.state.trustCalls.length = 0;
    const result = await install('v2', A);
    expect(result.reused).toBe(true);
    expect(host.state.trustCalls[0]?.current).toBe(C);
    expect(seen[0]).toEqual([`v2:${C}`, `v2:${A}`]);
  });
});

describe('rollback: the target is trusted BEFORE the swap', () => {
  test('one start before the promote (current, and the target as previous), one after', async () => {
    await install('v2', A);
    await install('v2', B);
    seen = [];
    host.state.trustCalls.length = 0;
    expect(await rollbackRelease('v2', 'tester')).toEqual({ from: B, to: A });
    expect(host.state.trustCalls[0]?.current).toBe(B);
    expect(seen[0]).toEqual([`v2:${B}`, `v2:${A}`]);
    expect(host.state.trustCalls[1]?.current).toBe(A);
    expect((await readAudit()).at(-1)?.detail).toMatchObject({ trust: { outcome: 'applied' } });
  });

  test('a failing oneshot refuses the rollback before anything moved', async () => {
    await install('v2', A);
    await install('v2', B);
    const restarts = host.state.restarts;
    answer = { code: 1, outcome: 'failed' };
    expect((await refusal(rollbackRelease('v2', 'tester'))).extensions?.reason).toBe('trust_failed');
    expect(currentRelease('v2')).toBe(B);
    expect(host.state.restarts).toBe(restarts);
  });
});

describe('status and the seam', () => {
  test('status carries the unit and the last record; a host without fapolicyd says null', async () => {
    await install('v2', A);
    const status = await buildStatus();
    expect(status.trust).toEqual({ unit: UNIT, record: readTrustRecord() });
    expect(status.trust?.record?.outcome).toBe('applied');
    const undo = setTrustSeamForTests(null);
    try {
      expect(trustUnit()).toBeNull();
      expect((await buildStatus()).trust).toBeNull();
      expect(await triggerTrust()).toBeNull();
      expect(readTrustRecord()).toBeNull();
    } finally {
      undo();
    }
  });
});
