/**
 * LEAD-1b G7 (daemon half) + G8 (run leg) + G9 + G10 + G11 + G12 + G14 (policy half) + G17
 * (commit C4) — THE DAEMON STARTS NOTHING: IT CONNECTS, ONCE, TO A SOCKET ROOT RENDERED, AND
 * FREES A SITE ONLY WHEN PID 1 SAYS ITS RUN IS DEAD.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §2.3–§2.8, §6).
 * Every run here goes through the REAL `runConfined()` against `support/lead1b_host.ts`: a
 * stand-in that listens on the real per-(site, door) unix paths with PID 1's MaxConnections
 * semantics, speaks the frame protocol from the wire's side, and answers `systemctl`.
 *
 * G10 — the lease: reservation first; one run per site (a second is `site_busy`, and opens
 *   nothing); a live instance left over is stopped (awaited) and, if it will not die,
 *   QUARANTINES its identity; the site is freed only once PID 1 reports the unit dead; two
 *   sites run at once on their own sockets; exactly ONE connect() per run, failure included.
 * G7 — a connection that ends without X is a FAILURE, never exit 0.
 * G8 — after a run, `<runtime>/turns` does not exist: no per-run file was written for PID 1.
 * G9 — what PID 1 LOADED is checked against what this daemon expects (unit files silently
 *   ignore keys a systemd does not know); a mismatch refuses naming the property.
 * G11 — boot reconciles from PID 1 before sweeping or listening.
 * G12 — the egress gate's directory and sockets are chgrp'd to the SITE's private group before
 *   a socket is served; two sites, two groups.
 * G14 — no identity, no run: 503 `identity_missing`, and no fallback to the legacy agent.
 * G17 — what a unit executes first is trusted against EVERY identity, not one.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { endBuild, tryBeginBuild } from '../src/workspace_activity';
import { resetInstance, workspacePath } from './fixtures/instance';
import {
  caught,
  contractExport,
  describeError,
  hasConfinementCode,
  shortScratch,
  sweepScratch,
  type Door,
} from './support/lead1b_contract';
import {
  BUS_TIMEOUT,
  conformingShow,
  GATE_IDS,
  type GatePolicy,
  lead1bPolicy,
  TRAVERSABLE_STAT,
  parseShow,
  plantShow,
  type ShowFixtures,
  socketPathFor,
  waitUntil,
} from './support/lead1b_host';

const sleep = (ms: number) => new Promise<void>(resolveSleep => setTimeout(resolveSleep, ms));

beforeAll(resetInstance);
afterAll(resetInstance);

const hosts: GatePolicy[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  for (const slug of ['alpha', 'beta']) endBuild(slug);
  sweepScratch();
});

async function hostWith(
  entries: Array<[string, number]>,
  options: { version?: number; hostOverrides?: Record<string, unknown>; overrides?: Record<string, unknown> } = {},
): Promise<GatePolicy> {
  const host = await lead1bPolicy({ identities: new Map(entries), ...options });
  hosts.push(host);
  // With its repository: the TURN unit masks `<workspace>/.git` and does not start without it.
  for (const [slug] of entries) mkdirSync(join(workspacePath(slug), '.git'), { recursive: true });
  return host;
}

interface RunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** One confined run through the REAL door. `slug` is the CONTRACT's new field (spec §2.4). */
async function run(host: GatePolicy, slug: string, door: Door, extra: Record<string, unknown> = {}): Promise<RunResult> {
  const { runConfined } = await import('../src/drivers/confinement');
  return (runConfined as unknown as (opts: Record<string, unknown>, policy: unknown) => Promise<RunResult>)(
    {
      door,
      slug,
      argv: door === 'git' ? ['git', 'status', '--porcelain'] : ['bun', 'install'],
      cwd: workspacePath(slug),
      env: { PATH: '/usr/bin:/bin' },
      timeoutMs: 20_000,
      label: `a ${door} run`,
      ...extra,
    },
    host.policy,
  );
}

/** Run with the site's reservation held, as every real caller does (spec §2.4). */
async function reserved<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  expect(tryBeginBuild(slug)).toBe(true);
  try {
    return await fn();
  } finally {
    endBuild(slug);
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * G10 — the lease
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G10 — one run per site, one connect per run, freed only on proven death', () => {
  test('(a) with the reservation: one connect to the site’s own socket, output relayed, exit from X; without it: refused, nothing opened', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'exit', code: 0, stdout: 'hello', stderr: 'careful' });
    const seen: string[] = [];
    const ok = await reserved('alpha', () => run(host, 'alpha', 'git', { onStdout: (chunk: string) => seen.push(chunk) }));
    expect({ exitCode: ok.exitCode, stdout: ok.stdout, stderr: ok.stderr.includes('careful'), relayed: seen.join('').includes('hello'), connects: host.standIn.connects }).toEqual({
      exitCode: 0,
      stdout: 'hello',
      stderr: true,
      relayed: true,
      connects: [socketPathFor(host.agentSocketDir, 1, 'git')],
    });
    // G8: no per-run environment file was written anywhere PID 1 could be pointed at.
    expect(existsSync(join(host.runtimeDir, 'turns'))).toBe(false);

    const refused = await caught(() => run(host, 'alpha', 'git'));
    expect(refused instanceof Error && !/expected a refusal/.test(refused.message)).toBe(true);
    expect(host.standIn.connects.length).toBe(1);
  });

  test('(b) a second concurrent run on one site is 503 site_busy — no connect, no gate', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'hang' });
    expect(tryBeginBuild('alpha')).toBe(true);
    const first = run(host, 'alpha', 'build');
    await waitUntil(() => host.standIn.specs.length === 1, 8_000, 'the first run to reach the unit');
    const chownsBefore = host.chowns.length;
    const second = await caught(() => run(host, 'alpha', 'build'));
    expect(describeError(second)).toMatchObject({ status: 503 });
    expect(hasConfinementCode(second, 'site_busy')).toBe(true);
    expect({ connects: host.standIn.connects.length, chowns: host.chowns.length }).toEqual({ connects: 1, chowns: chownsBefore });
    host.standIn.release();
    expect((await first).exitCode).toBe(0);
    endBuild('alpha');
  }, 30_000);

  test('(c) a live leftover is STOPPED (awaited) before the connect; one that will not die quarantines the identity', async () => {
    const host = await hostWith([['alpha', 1]]);
    const leftover = host.standIn.plantLive(1, 'git');
    const ok = await reserved('alpha', () => run(host, 'alpha', 'git'));
    const stopAt = host.standIn.log.findIndex(line => line.startsWith('systemctl') && line.includes(' stop ') && line.includes(leftover.name));
    const connectAt = host.standIn.log.findIndex(line => line.startsWith('connect '));
    expect({ exitCode: ok.exitCode, stopped: stopAt >= 0, stopBeforeConnect: stopAt < connectAt }).toEqual({ exitCode: 0, stopped: true, stopBeforeConnect: true });

    const stuck = await hostWith([['alpha', 1]]);
    stuck.standIn.plantLive(1, 'git', { stubborn: true });
    const refused = await reserved('alpha', () => caught(() => run(stuck, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'identity_quarantined')).toBe(true);
    expect({ connects: stuck.standIn.connects.length, stopAsked: stuck.standIn.systemctlCalls.some(argv => argv.includes('stop')) }).toEqual({
      connects: 0,
      stopAsked: true,
    });
  }, 60_000);

  test('(d) the site is freed only when PID 1 says the unit is dead: a unit that outlives its run keeps the identity quarantined', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.stubborn = true;
    await reserved('alpha', () => run(host, 'alpha', 'git'));
    // The unit did not die: the next run must not reach it (MaxConnections would drop it anyway).
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'identity_quarantined')).toBe(true);
    expect(host.standIn.connects.length).toBe(1);
    // PID 1 reaps it; the background re-probe frees the identity.
    host.standIn.stubborn = false;
    host.standIn.reap();
    let freed: RunResult | null = null;
    const start = Date.now();
    while (freed === null && Date.now() - start < 20_000) {
      try {
        freed = await reserved('alpha', () => run(host, 'alpha', 'git'));
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    expect(freed?.exitCode).toBe(0);
  }, 60_000);

  test("(d') the lease rule ITSELF holds it: after a run whose unit will not die, the slot is still held — by a quarantine naming the site — before any next run is asked", async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.stubborn = true;
    await reserved('alpha', () => run(host, 'alpha', 'git'));
    // No second run: the next run's idle proof would refuse anyway and hide a release that came
    // too early. The lease is read as it stands.
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
  }, 30_000);

  test('(d\'\') control: a run whose unit dies frees the slot, and quarantines nothing', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    await reserved('alpha', () => run(host, 'alpha', 'git'));
    expect(leaseSnapshot(host.policy as never)).toEqual({ runs: [], quarantined: [] });
  });

  /**
   * DEAD MEANS AN EMPTY CGROUP. A stop that skipped SIGKILL (`SendSIGKILL=no`, a catchable
   * `FinalKillSignal=` — a drop-in conformance now refuses, but a run started before it is not
   * undone by refusing the next) ends with PID 1 reporting the unit FAILED and releasing
   * MaxConnections while the run's processes keep running as the site's uid. State alone said
   * "dead", the lease was freed, and the site's next run — another door, another HOME — started
   * beside the survivor under the same uid.
   */
  test('(j) a unit PID 1 reports FAILED with processes still in its cgroup is NOT dead: the slot stays held (quarantined, the site named); the next run of the site — another door — connects nothing; freed when the cgroup empties', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.survivors = 2;
    await reserved('alpha', () => run(host, 'alpha', 'git'));
    const [instance] = [...host.standIn.instances.values()];
    expect({ state: instance?.state, tasks: instance?.tasks, slotFree: host.standIn.live(1, 'git').length }).toEqual({ state: 'failed', tasks: 2, slotFree: 0 });
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    host.standIn.survivors = 0;
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'build')));
    expect({ code: hasConfinementCode(refused, 'identity_quarantined'), connects: host.standIn.connects.length }).toEqual({ code: true, connects: 1 });
    // The survivors die (PID 1 prunes the cgroup): the background re-probe frees the site.
    host.standIn.reap();
    let freed: RunResult | null = null;
    const start = Date.now();
    while (freed === null && Date.now() - start < 20_000) {
      try {
        freed = await reserved('alpha', () => run(host, 'alpha', 'build'));
      } catch {
        await sleep(100);
      }
    }
    expect(freed?.exitCode).toBe(0);
  }, 60_000);

  test('(k) the IDLE PROOF asks the cgroup too: a leftover PID 1 lists as failed but populated quarantines the site before any connect, naming it', async () => {
    const host = await hostWith([['alpha', 1]]);
    const leftover = host.standIn.plantLeftover(1, 'turn', 3);
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect({
      code: hasConfinementCode(refused, 'identity_quarantined'),
      named: String((refused as Error).message).includes(leftover.name),
      connects: host.standIn.connects.length,
    }).toEqual({ code: true, named: true, connects: 0 });
    // Control: the same unit once its cgroup is empty is not a leftover at all.
    const clean = await hostWith([['alpha', 1]]);
    clean.standIn.reap(clean.standIn.plantLeftover(1, 'turn', 3));
    expect((await reserved('alpha', () => run(clean, 'alpha', 'git'))).exitCode).toBe(0);
  }, 30_000);

  test('(l) REFUSED AFTER CONNECT with no hello (the instance never named): a unit that died FAILED but populated still holds the slot', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.survivors = 1;
    host.standIn.script = () => ({ kind: 'mute' });
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'unit_refused')).toBe(true);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
  }, 30_000);

  test('(g) REFUSED AFTER CONNECT: a unit that took the connection, said nothing and did not die holds the slot (quarantined, the site named) — never released', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.stubborn = true;
    host.standIn.script = () => ({ kind: 'mute' });
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'unit_refused')).toBe(true);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });

    // Control: the same refusal from a unit that DID die releases the slot.
    const clean = await hostWith([['alpha', 1]]);
    clean.standIn.script = () => ({ kind: 'mute' });
    const refusedClean = await reserved('alpha', () => caught(() => run(clean, 'alpha', 'git')));
    expect(hasConfinementCode(refusedClean, 'unit_refused')).toBe(true);
    expect(leaseSnapshot(clean.policy as never)).toEqual({ runs: [], quarantined: [] });
  }, 30_000);

  /**
   * THE SOCKET HALF OF BOTH PROOFS. Death is the instance gone AND the door socket counting no
   * connection; idle is no live instance AND no socket counting one. The count is the backstop
   * for an instance the unit list does not show (a spelling the regex does not know, a race at
   * the stop) — so each half is a row of its own, with the instance list saying "dead/empty"
   * and only the socket saying otherwise.
   */
  test('(m) DEATH needs the socket too: the instance gone, its door socket still counting a connection — the slot stays held (quarantined); freed when the count drops', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = (k, door) => {
      host.standIn.connectionsOverride.set(`${k}:${door}`, 1);
      return { kind: 'exit', code: 0 };
    };
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    expect(host.standIn.allLive()).toEqual([]);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    host.standIn.script = () => ({ kind: 'exit', code: 0 });
    host.standIn.connectionsOverride.clear();
    let freed: RunResult | null = null;
    const start = Date.now();
    while (freed === null && Date.now() - start < 20_000) {
      try {
        freed = await reserved('alpha', () => run(host, 'alpha', 'git'));
      } catch {
        await sleep(100);
      }
    }
    expect(freed?.exitCode).toBe(0);
  }, 60_000);

  test('(n) IDLE needs the sockets too: no unit listed, but a door socket counting a connection — refused, quarantined naming the socket, nothing connected', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.connectionsOverride.set('1:build', 1);
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect({
      code: hasConfinementCode(refused, 'identity_quarantined'),
      named: String((refused as Error).message).includes('busy sockets: build'),
      connects: host.standIn.connects.length,
    }).toEqual({ code: true, named: true, connects: 0 });
  }, 30_000);

  /**
   * "PID 1 CANNOT SAY" IS NEVER "IDLE" OR "DEAD". A systemctl timeout, a D-Bus or polkit hiccup
   * (`systemctlVia` makes each a non-zero code), a `show` that answers without the property
   * asked for: each must hold the slot and quarantine, never release it early. The stand-in
   * used to answer code 0 with every property for every allowed verb, so eight fail-open
   * mutations of the idle and death proofs survived the whole package suite; each row below
   * names the mutation it turns red.
   */
  const SLOW_PROBE = { reprobeWindowMs: 300, pollMs: 20, helloTimeoutMs: 3_000, deathGraceMs: 150, quarantinePollMs: 1_000 };
  const isInstance = (unit: string) => /@\d/.test(unit);
  const isSocket = (unit: string) => unit.endsWith('.socket');

  for (const [what, fault] of [
    ['answers non-zero (a bus timeout)', BUS_TIMEOUT],
    ['never answers (the wrapper throws)', 'throw'],
  ] as const) {
    test(`(o) IDLE: list-units ${what} → refused identity_quarantined, nothing connected — never read as "no live unit" (mutations: idleState live===null → idle; liveInstancesOf code≠0 → [])`, async () => {
      const { leaseSnapshot } = await import('../src/drivers/confinement');
      const host = await hostWith([['alpha', 1]]);
      host.standIn.fault = verb => (verb === 'list-units' ? fault : null);
      const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
      expect({
        code: hasConfinementCode(refused, 'identity_quarantined'),
        named: String((refused as Error).message).includes('could not list'),
        connects: host.standIn.connects.length,
        lease: leaseSnapshot(host.policy as never).quarantined.map(entry => entry.k),
      }).toEqual({ code: true, named: true, connects: 0, lease: [1] });
      // …and once PID 1 answers again, the background probe frees it.
      host.standIn.fault = () => null;
      await waitUntil(() => leaseSnapshot(host.policy as never).quarantined.length === 0, 5_000, 'the quarantine to lift');
    }, 30_000);
  }

  test('(p) IDLE: a door socket whose NConnections PID 1 does not report → refused, quarantined, nothing connected (mutations: idleState skips an unreadable socket; connectionsOf reads it as 0)', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.fault = (verb, units) => (verb === 'show' && units.some(isSocket) ? { drop: ['NConnections'] } : null);
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect({
      code: hasConfinementCode(refused, 'identity_quarantined'),
      named: String((refused as Error).message).includes('could not report'),
      connects: host.standIn.connects.length,
    }).toEqual({ code: true, named: true, connects: 0 });
  }, 30_000);

  test('(q) DEATH: the instance’s `show` fails → the slot stays held (quarantined, the site named); freed only once PID 1 answers (mutation: awaitDeath counts a failed show as dead)', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]], { overrides: { timing: SLOW_PROBE } });
    host.standIn.fault = (verb, units) => (verb === 'show' && units.some(isInstance) ? BUS_TIMEOUT : null);
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    host.standIn.fault = () => null;
    await waitUntil(() => leaseSnapshot(host.policy as never).runs.length === 0, 5_000, 'the slot to be freed');
  }, 30_000);

  test('(r) DEATH: an inactive instance whose `show` has NO TasksCurrent is not proved empty → held, quarantined (mutation: tasksGone(undefined) → gone)', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]], { overrides: { timing: SLOW_PROBE } });
    host.standIn.fault = (verb, units) => (verb === 'show' && units.some(isInstance) ? { drop: ['TasksCurrent'] } : null);
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    // Freed by the background probe's own READABLE answer (the unit is no longer listed and no
    // socket counts a connection), never by the unreadable one.
    await waitUntil(() => leaseSnapshot(host.policy as never).runs.length === 0, 5_000, 'the slot to be freed');
  }, 30_000);

  test('(s) DEATH: the door socket’s NConnections unreadable after the run → held, quarantined; freed once it reads 0 (mutation: awaitDeath reads null NConnections as 0)', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => {
      host.standIn.fault = (verb, units) => (verb === 'show' && units.some(isSocket) ? { drop: ['NConnections'] } : null);
      return { kind: 'exit', code: 0 };
    };
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    host.standIn.fault = () => null;
    await waitUntil(() => leaseSnapshot(host.policy as never).runs.length === 0, 5_000, 'the slot to be freed');
  }, 30_000);

  test('(t) DEATH with no hello: the site’s unit list unreadable → held, quarantined; freed once PID 1 lists again (mutation: awaitDeath’s no-hello branch reads a null list as dead)', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => {
      host.standIn.fault = verb => (verb === 'list-units' ? BUS_TIMEOUT : null);
      return { kind: 'mute' };
    };
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'unit_refused')).toBe(true);
    expect(leaseSnapshot(host.policy as never)).toMatchObject({ runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] });
    host.standIn.fault = () => null;
    await waitUntil(() => leaseSnapshot(host.policy as never).runs.length === 0, 5_000, 'the slot to be freed');
  }, 30_000);

  test('(u) a STOP PID 1 REFUSES (the polkit grant not in effect) is named — in the refusal and the quarantine — never an unexplained "still alive"', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    const leftover = host.standIn.plantLive(1, 'git');
    // Denied for the LIVE run only: a host that denies every stop is refused earlier, at admission,
    // by the grant probe (round 6, the describe below) — this is the runtime layer behind it (a
    // grant withdrawn between the probe and the stop).
    host.standIn.fault = (verb, units) =>
      verb === 'stop' && units.includes(leftover.name) ? { code: 4, stderr: `Failed to stop ${leftover.name}: Access denied` } : null;
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    const message = String((refused as Error).message);
    const reason = leaseSnapshot(host.policy as never).quarantined[0]?.reason ?? '';
    expect({
      code: hasConfinementCode(refused, 'identity_quarantined'),
      refusedNamed: /REFUSED by PID 1 \(exit 4: Failed to stop .*Access denied\)/.test(message),
      polkit: message.includes('polkit'),
      quarantineNamed: reason.includes('Access denied'),
      connects: host.standIn.connects.length,
    }).toEqual({ code: true, refusedNamed: true, polkit: true, quarantineNamed: true, connects: 0 });
  }, 30_000);

  /**
   * THE WORKSPACE BIND SOURCE. `ReadWritePaths=<SITES_ROOT>/<slug>` is resolved by PID 1 AS ROOT
   * when it builds the unit's namespace, and SITES_ROOT is the service user's (2770): a link
   * left where the workspace was would be bound read-write — any host directory, a /home the
   * daemon's own unit hides included. conformance() compares only the string; this row holds
   * the daemon's own lstat before it connects. (A COMPROMISED daemon skips its own check — the
   * accepted residual in engineering/SITE_BUILDER_INSTANCES.md.)
   */
  test('(v) a workspace that is a SYMLINK (or not a directory) is refused before anything connects — typed, naming it; the real directory runs', async () => {
    const host = await hostWith([['alpha', 1]]);
    const workspace = workspacePath('alpha');
    const elsewhere = shortScratch('elsewhere');
    rmSync(workspace, { recursive: true, force: true });
    symlinkSync(elsewhere, workspace);
    try {
      const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
      expect({
        code: hasConfinementCode(refused, 'unavailable'),
        named: /symbolic link/.test(String((refused as Error)?.message ?? '')),
        connects: host.standIn.connects.length,
      }).toEqual({ code: true, named: true, connects: 0 });
      rmSync(workspace, { force: true });
      writeFileSync(workspace, 'not a directory');
      const file = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
      expect({ code: hasConfinementCode(file, 'unavailable'), connects: host.standIn.connects.length }).toEqual({ code: true, connects: 0 });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      mkdirSync(workspace, { recursive: true });
    }
    // Control: the real directory runs.
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
  }, 30_000);

  for (const [what, spelling] of [
    ['systemd >= 258 (`<nr>-<cookie>-<pid>_<pidfd id>-<uid>`)', (nr: number, uid: number) => `${nr}-17-${4000 + nr}_5678-${uid}`],
    ['systemd >= 258 without a pidfd id (`<nr>-<cookie>-<pid>-<uid>`)', (nr: number, uid: number) => `${nr}-17-${4000 + nr}-${uid}`],
  ] as const) {
    test(`(h) a run on ${what} is recognised: hello accepted, exit relayed; a leftover of that spelling is stopped`, async () => {
      const host = await hostWith([['alpha', 1]]);
      host.standIn.spelling = spelling;
      expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
      const leftover = host.standIn.plantLive(1, 'build');
      expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
      expect(host.standIn.systemctlCalls.some(argv => argv.includes('stop') && argv.includes(leftover.name))).toBe(true);
    }, 30_000);
  }

  test('(i) a PRE-LEAD-1b transient run of this museum still alive: no site is idle — refused, nothing connected — until PID 1 reports it gone', async () => {
    const host = await hostWith([['alpha', 1]]);
    const legacy = `${host.policy.unitPrefix}0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.service`;
    host.standIn.legacyLive.add(legacy);
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect({ code: hasConfinementCode(refused, 'identity_quarantined'), names: String((refused as Error).message).includes(legacy), connects: host.standIn.connects.length }).toEqual({
      code: true,
      names: true,
      connects: 0,
    });
    host.standIn.legacyLive.clear();
    let freed = false;
    const start = Date.now();
    while (!freed && Date.now() - start < 10_000) {
      try {
        freed = (await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode === 0;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    expect(freed).toBe(true);

    // Control: a unit named like a legacy run but of ANOTHER museum (longer prefix) is not counted.
    const other = await hostWith([['alpha', 1]]);
    other.standIn.legacyLive.add(`${other.policy.unitPrefix}x-agent-0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.service`);
    expect((await reserved('alpha', () => run(other, 'alpha', 'git'))).exitCode).toBe(0);
  }, 30_000);

  test('(e) two sites run at once, each on ITS socket (slug → its ordinal)', async () => {
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    host.standIn.script = () => ({ kind: 'hang' });
    expect(tryBeginBuild('alpha')).toBe(true);
    expect(tryBeginBuild('beta')).toBe(true);
    const both = [run(host, 'alpha', 'git'), run(host, 'beta', 'git')];
    await waitUntil(() => host.standIn.specs.length === 2, 8_000, 'both runs to reach their units');
    expect([...host.standIn.connects].sort()).toEqual([socketPathFor(host.agentSocketDir, 1, 'git'), socketPathFor(host.agentSocketDir, 2, 'git')].sort());
    expect(host.standIn.specs.map(({ k }) => k).sort()).toEqual([1, 2]);
    host.standIn.release();
    expect((await Promise.all(both)).map(result => result.exitCode)).toEqual([0, 0]);
  }, 30_000);

  test('(f) exactly ONE connect per run — a unit that never says hello is 503 unit_refused, diagnosed, never retried', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'refuse' });
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'unit_refused')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    const connectAt = host.standIn.log.findIndex(line => line.startsWith('connect '));
    expect({
      connects: host.standIn.connects.length,
      diagnosed: host.standIn.log.slice(connectAt).some(line => line.startsWith('systemctl') && line.includes(' show ')),
    }).toEqual({ connects: 1, diagnosed: true });
  }, 30_000);

  test("(j) the BACKGROUND PROBE frees only on proven death: a unit that will not die keeps the slot through several probes; reaped, it frees within a bound", async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    host.standIn.stubborn = true;
    await reserved('alpha', () => run(host, 'alpha', 'git'));
    const pollMs = host.policy.timing.quarantinePollMs as number;
    const probes = () => host.standIn.systemctlCalls.filter(argv => argv.includes('list-units')).length;
    const before = probes();
    // No run is asked for: only the probe can touch the lease while we wait.
    await sleep(6 * pollMs);
    const held = leaseSnapshot(host.policy as never);
    expect({ probed: probes() - before >= 3, held }).toMatchObject({ probed: true, held: { runs: ['alpha'], quarantined: [{ k: 1, heldSlug: 'alpha' }] } });
    // PID 1 reaps it: the probe (and only the probe — still no run) frees the site.
    host.standIn.reap();
    await waitUntil(() => leaseSnapshot(host.policy as never).quarantined.length === 0, 20 * pollMs, 'the probe to free the reaped site');
    expect(leaseSnapshot(host.policy as never)).toEqual({ runs: [], quarantined: [] });
  }, 30_000);

  test('(k) NEVER RETRIED, a failed connect included: the first connect() rejects → exactly one attempt, 503 unit_refused, the slot freed (nothing reached PID 1)', async () => {
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const attempts: string[] = [];
    const host = await hostWith([['alpha', 1]], {
      hostOverrides: {
        connect: async (path: string) => {
          attempts.push(path);
          throw Object.assign(new Error('connect ECONNREFUSED (gate)'), { code: 'ECONNREFUSED' });
        },
      },
    });
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    await sleep(200);
    expect({ code: hasConfinementCode(refused, 'unit_refused'), status: describeError(refused).status, attempts, lease: leaseSnapshot(host.policy as never) }).toEqual({
      code: true,
      status: 503,
      attempts: [socketPathFor(host.agentSocketDir, 1, 'git')],
      lease: { runs: [], quarantined: [] },
    });
  }, 30_000);

  test('(l) control: a shim whose hello tells the truth (the lying-hello script with nothing overridden) runs', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'hello' });
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    expect(host.standIn.specs.length).toBe(1);
  });

  for (const [what, lie] of [
    ['another DOOR', (_prefix: string) => ({ door: 'build' })],
    ["another SITE's instance (s2)", (prefix: string) => ({ unit: `${prefix}s2-git@1-4001-${GATE_IDS.serviceUid}.service` })],
    ["this site's OTHER door's instance", (prefix: string) => ({ unit: `${prefix}s1-build@1-4001-${GATE_IDS.serviceUid}.service` })],
    ['a transient-style (pre-LEAD-1b) name', (prefix: string) => ({ unit: `${prefix}0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.service` })],
    ['a name outside the instance grammar (@probe)', (prefix: string) => ({ unit: `${prefix}s1-git@probe.service` })],
    ["another museum's prefix", (prefix: string) => ({ unit: `${prefix}x-agent-s1-git@1-4001-${GATE_IDS.serviceUid}.service` })],
  ] as const) {
    test(`(l) a hello naming ${what} is not this run's unit: 503 unit_refused, one connect, NO spec sent, freed only as PID 1 reports`, async () => {
      const { leaseSnapshot } = await import('../src/drivers/confinement');
      const host = await hostWith([['alpha', 1]]);
      host.standIn.script = () => ({ kind: 'hello', ...lie(host.policy.unitPrefix as string) });
      const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
      await sleep(200);
      expect({
        what,
        code: hasConfinementCode(refused, 'unit_refused'),
        connects: host.standIn.connects.length,
        specs: host.standIn.specs.length,
        // The stand-in's instance died with the dropped connection: PID 1 reports the socket idle.
        lease: leaseSnapshot(host.policy as never),
      }).toEqual({ what, code: true, connects: 1, specs: 0, lease: { runs: [], quarantined: [] } });
    }, 30_000);
  }

  test('G7 — a connection that ends WITHOUT an X frame is a failure (exitCode null, unit_ended_without_exit_frame), never 0', async () => {
    const host = await hostWith([['alpha', 1]]);
    host.standIn.script = () => ({ kind: 'noExit', stdout: 'partial' });
    const outcome = await reserved('alpha', () =>
      run(host, 'alpha', 'git').then(
        result => ({ resolved: true, exitCode: result.exitCode, text: JSON.stringify(result) }),
        error => ({ resolved: false, exitCode: null, text: String((error as Error).message) }),
      ),
    );
    expect({ exitCode: outcome.exitCode, reason: outcome.text.includes('unit_ended_without_exit_frame') }).toEqual({ exitCode: null, reason: true });
    expect(host.standIn.connects.length).toBe(1);
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G12 — the egress gate belongs to the site's private group
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G12 — the gate’s directory is ROOT’s (the site’s group), its sockets the site’s group; anything else opens nothing', () => {
  test('through the daemon: two sites, two private groups — the directory is never created or chgrp’d by the daemon, every socket is', async () => {
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    const events: Record<number, string[]> = {};
    await reserved('alpha', () => run(host, 'alpha', 'build'));
    events[1] = host.gateEvents.splice(0);
    await reserved('beta', () => run(host, 'beta', 'build'));
    events[2] = host.gateEvents.splice(0);
    for (const k of [1, 2]) {
      const dir = join(host.agentSocketDir, 'egress', `s${k}`);
      const log = events[k] as string[];
      const socketChowns = log.filter(line => line.startsWith(`chown ${dir}/`));
      expect({
        k,
        dirChowned: log.some(line => line === `chown ${dir} ${GATE_IDS.privateGid(k)}` || line.startsWith(`chown ${dir} `)),
        served: log.some(line => line.startsWith('serve ')),
        socketsChgrpd: socketChowns.length > 0 && socketChowns.every(line => line.endsWith(` ${GATE_IDS.privateGid(k)}`)),
        // Root's directory outlives the run; the run's sockets do not.
        dirLeft: existsSync(dir),
        socketsLeft: existsSync(dir) ? readdirSync(dir) : null,
      }).toEqual({ k, dirChowned: false, served: true, socketsChgrpd: true, dirLeft: true, socketsLeft: [] });
    }
  }, 30_000);

  /** A provisioned directory on the real filesystem: `<scratch>/egress/s1`, 0770, the runner's group. */
  function provisioned(tag: string): { dir: string; group: number; owner: number } {
    const base = join(shortScratch(tag), 'egress');
    mkdirSync(join(base, 's1'), { recursive: true });
    chmodSync(base, 0o755);
    chmodSync(join(base, 's1'), 0o770);
    // The group the directory really has (BSD inherits the parent's, Linux takes the runner's):
    // the gate is asked for exactly that one, as the daemon asks for the site's.
    return { dir: join(base, 's1'), group: statSync(join(base, 's1')).gid, owner: process.getuid?.() as number };
  }
  const PLAN = { hosts: ['registry.npmjs.org'], mcp: false };
  const OPEN_REST = { plan: PLAN, publicationApiUrl: '', apiKey: '', sink: () => {} };

  test('the real filesystem: a provisioned directory 0770 is served in; sockets 0660, the group asked for; close leaves the directory, not the sockets', async () => {
    const { openEgressGate } = await import('../src/egress/gate');
    const open = openEgressGate as unknown as (opts: Record<string, unknown>) => Promise<{ close(): Promise<void> }>;
    const { dir, group, owner } = provisioned('gate');
    const gate = await open({ dir, group, owner, ...OPEN_REST });
    try {
      const dirStat = statSync(dir);
      const sockStat = statSync(join(dir, 'proxy.sock'));
      expect({ dir: dirStat.mode & 0o7777, dirGid: dirStat.gid, sock: sockStat.mode & 0o777, sockGid: sockStat.gid }).toEqual({
        dir: 0o770,
        dirGid: group,
        sock: 0o660,
        sockGid: group,
      });
    } finally {
      await gate.close();
    }
    expect({ dirLeft: existsSync(dir), entries: readdirSync(dir) }).toEqual({ dirLeft: true, entries: [] });
  });

  /**
   * NO GROUP IS NAMED AS SUCH, and the refusal is the guard's own — not an incidental throw
   * further down. A permissive chgrp seam and a directory that "is" any group make every later
   * step accept `undefined`; the named refusal must still come first, and nothing is served.
   */
  test('no group = refused BY NAME, even when every later step would accept it; nothing is served', async () => {
    const { openEgressGate } = await import('../src/egress/gate');
    const open = openEgressGate as unknown as (opts: Record<string, unknown>) => Promise<{ close(): Promise<void> }>;
    for (const seams of [undefined, { chown: () => {}, lstat: (path: string) => ({ kind: 'dir', uid: process.getuid?.() ?? 0, gid: undefined as unknown as number, mode: path.endsWith('/s1') ? 0o770 : 0o755 }) }]) {
      const { dir, owner } = provisioned('gate-nogroup');
      const refused = await caught(() => open({ dir, owner, ...OPEN_REST, ...(seams ? { seams } : {}) }));
      expect({ seams: seams !== undefined, named: String((refused as Error)?.message ?? '').includes('no site group was given'), entries: readdirSync(dir) }).toEqual({
        seams: seams !== undefined,
        named: true,
        entries: [],
      });
    }
  });

  /**
   * THE DIRECTORY IS THE SOURCE OF A BIND PID 1 RESOLVES AS ROOT: the gate serves in nothing but
   * what root provisioned. Each deviation on its own is refused, naming it, and nothing is served.
   */
  test('REFUSED, nothing served: a missing, symlinked, foreign-owned, wrong-group or wrong-mode directory, a writable ancestor, a foreign entry', async () => {
    const { openEgressGate } = await import('../src/egress/gate');
    const open = openEgressGate as unknown as (opts: Record<string, unknown>) => Promise<{ close(): Promise<void> }>;
    const rows: Array<[string, (p: { dir: string; group: number; owner: number }) => Record<string, unknown>, string]> = [
      ['missing', p => { rmSync(p.dir, { recursive: true }); return {}; }, 'does not exist'],
      ['symlink', p => { const real = `${p.dir}-real`; rmSync(p.dir, { recursive: true }); mkdirSync(real, { mode: 0o770 }); symlinkSync(real, p.dir); return {}; }, 'is a symlink'],
      ['another owner', p => ({ owner: p.owner + 1 }), 'not the provisioner'],
      ['another group', p => ({ group: p.group + 1 }), 'not the site'],
      ['mode 0750', p => { chmodSync(p.dir, 0o750); return {}; }, 'mode 0750'],
      ['mode 0777', p => { chmodSync(p.dir, 0o777); return {}; }, 'mode 0777'],
      ['ancestor 0775', p => { chmodSync(dirname(p.dir), 0o775); return {}; }, 'writable by others'],
      ['foreign entry', p => { writeFileSync(join(p.dir, 'planted'), 'x'); return {}; }, "'planted'"],
    ];
    const survived: string[] = [];
    for (const [label, mutate, named] of rows) {
      const p = provisioned('gate-refuse');
      const overrides = mutate(p);
      const refused = await caught(() => open({ dir: p.dir, group: p.group, owner: p.owner, ...OPEN_REST, ...overrides }));
      const message = String((refused as Error)?.message ?? '');
      const served = existsSync(join(p.dir, 'proxy.sock'));
      if (!message.includes(named) || served) survived.push(`${label}: ${message || '(opened)'}`);
    }
    expect(survived).toEqual([]);
    // Control: a stale socket of a killed run is NOT foreign — it is unlinked and served over.
    const p = provisioned('gate-stale');
    writeFileSync(join(p.dir, 'proxy.sock'), '');
    const gate = await open({ dir: p.dir, group: p.group, owner: p.owner, ...OPEN_REST });
    expect(statSync(join(p.dir, 'proxy.sock')).isSocket()).toBe(true);
    await gate.close();
  });

  test('the daemon refuses a run whose site directory root did not provision — before anything connects', async () => {
    const host = await hostWith([['alpha', 1]]);
    const dir = join(host.agentSocketDir, 'egress', 's1');
    chmodSync(dir, 0o777);
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'build')));
    // The daemon's own check, typed (503 confinement_unavailable, naming the repair) — not the
    // gate's untyped refusal one step later, which is its second layer.
    expect({
      code: hasConfinementCode(refused, 'unavailable'),
      named: String((refused as Error)?.message ?? '').includes('mode 0777') && String((refused as Error)?.message ?? '').includes('provision apply'),
      gateOpened: host.gateEvents.length,
      connects: host.standIn.connects,
    }).toEqual({ code: true, named: true, gateOpened: 0, connects: [] });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G9 — what PID 1 loaded
 * ──────────────────────────────────────────────────────────────────────────────────── */


describe('G9 — conformance: what PID 1 loaded is what this daemon expects, strictly', () => {
  type Conformance = (k: number, door: Door, policy: unknown) => Promise<{ warnings: string[] }>;

  for (const [version, door] of [
    [255, 'git'],
    [255, 'build'],
    [257, 'git'],
  ] as const) {
    test(`control: a conforming ${door} unit at ${version} passes, with no PrivatePIDs warning`, async () => {
      const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
      const host = await hostWith([['alpha', 1]], { version });
      plantShow(host, 1, door, conformingShow(host, workspacePath('alpha'), 1, door, version));
      const result = await conformance(1, door, host.policy);
      expect((result?.warnings ?? []).filter(line => line.includes('PrivatePIDs'))).toEqual([]);
    });
  }

  /**
   * EVERY COMPARISON HAS A ROW. The table is DERIVED from the conforming fixture: each property
   * it states, weakened on its own (its value replaced), must be refused naming that property —
   * so no single comparison in `conformance()` can be dropped without a red. Then every
   * property that must be UNSET (the exported lists), set on its own, likewise. The floor stops
   * the table from shrinking with the fixture.
   */
  const ALIASES: Readonly<Record<string, string>> = { CPUQuotaPerSecUSec: 'CPUQuota' };
  const weaken = (text: string, key: string) => text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=WRONG`);
  const keysOf = (text: string) => text.split('\n').map(line => line.slice(0, line.indexOf('='))).filter(Boolean);

  test('the table is exhaustive: every property the conforming fixture states is a row (floor)', async () => {
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const fixtures = conformingShow(host, workspacePath('alpha'), 1, 'turn', 255);
    expect({
      service: keysOf(fixtures.service).length >= 40,
      socket: keysOf(fixtures.socket).length >= 10,
      target: keysOf(fixtures.target).length >= 3,
    }).toEqual({ service: true, socket: true, target: true });
  });

  // EVERY DOOR: a comparison that holds only on the proxy doors (`proxy && …`) is a git unit
  // accepted with the egress dir bound in, loopback allowed or AF_INET added — so each door's own
  // conforming fixture is weakened key by key, and the floor is per door.
  for (const door of ['turn', 'build', 'git'] as const) {
    for (const part of ['service', 'socket', 'target'] as const) {
      test(`REFUSED, naming it: each ${part} property of the ${door} unit weakened on its own`, async () => {
        const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
        const host = await hostWith([['alpha', 1]], { version: 255 });
        const conforming = conformingShow(host, workspacePath('alpha'), 1, door, 255);
        const survived: string[] = [];
        const keys = keysOf(conforming[part]);
        expect(keys.length).toBeGreaterThanOrEqual(part === 'service' ? 40 : part === 'socket' ? 10 : 3);
        for (const key of keys) {
          // The one named exemption: the git target orders after NOTHING, and a target's After=
          // is compared includes-all (PID 1 adds implicit orderings) — an extra ordering widens
          // nothing, so there is no value to weaken. Its members are rows on the other doors.
          if (door === 'git' && part === 'target' && key === 'After') continue;
          plantShow(host, 1, door, { ...conforming, [part]: weaken(conforming[part], key) });
          const refused = await caught(() => conformance(1, door, host.policy));
          const named = String((refused as Error)?.message ?? '').includes(ALIASES[key] ?? key);
          if (!hasConfinementCode(refused, 'unit_nonconformant') || !named) survived.push(key);
        }
        expect(survived).toEqual([]);
      });
    }
  }

  test('REFUSED, naming it: the git unit WIDENED to a proxy door’s reach, one key at a time (egress bind, loopback, AF_INET, a HOME bind)', async () => {
    const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const git = conformingShow(host, workspacePath('alpha'), 1, 'git', 255);
    const turn = conformingShow(host, workspacePath('alpha'), 1, 'turn', 255);
    const survived: string[] = [];
    const keys = ['BindReadOnlyPaths', 'IPAddressAllow', 'RestrictAddressFamilies', 'BindPaths'];
    for (const key of keys) {
      const widened = (turn.service.match(new RegExp(`^${key}=.*$`, 'm')) as RegExpMatchArray)[0];
      expect(widened.length).toBeGreaterThan(key.length + 1);
      plantShow(host, 1, 'git', { ...git, service: git.service.replace(new RegExp(`^${key}=.*$`, 'm'), widened) });
      const refused = await caught(() => conformance(1, 'git', host.policy));
      if (!hasConfinementCode(refused, 'unit_nonconformant') || !String((refused as Error)?.message ?? '').includes(key)) survived.push(key);
    }
    expect({ rows: keys.length, survived }).toEqual({ rows: 4, survived: [] });
  });

  test('REFUSED, naming it: each property that must be UNSET (exec hooks, groups, capabilities, namespaces, credentials), set on its own', async () => {
    const confinement = await import('../src/drivers/confinement');
    const conformance = confinement.conformance as unknown as Conformance;
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const conforming = conformingShow(host, workspacePath('alpha'), 1, 'turn', 255);
    const rows: Array<[keyof ShowFixtures, string]> = [
      ...confinement.UNIT_UNSET_EXEC.map(key => ['service', key] as [keyof ShowFixtures, string]),
      ...confinement.UNIT_UNSET_WIDENING.map(key => ['service', key] as [keyof ShowFixtures, string]),
      ...confinement.SOCKET_UNSET_EXEC.map(key => ['socket', key] as [keyof ShowFixtures, string]),
      ['service', 'Group'],
    ];
    // 12 exec hooks + 29 widening keys (the ENVFILE class: OpenFile, MountImages,
    // ExtensionImages, ExtensionDirectories, the pinned-BPF paths, LogNamespace among them)
    // + 4 socket hooks + Group.
    expect(rows.length).toBeGreaterThanOrEqual(46);
    const survived: string[] = [];
    for (const [part, key] of rows) {
      plantShow(host, 1, 'turn', { ...conforming, [part]: `${conforming[part]}\n${key}=WRONG` });
      const refused = await caught(() => conformance(1, 'turn', host.policy));
      if (!hasConfinementCode(refused, 'unit_nonconformant') || !String((refused as Error)?.message ?? '').includes(key)) survived.push(`${part}:${key}`);
    }
    expect(survived).toEqual([]);
    // Controls: EMPTY is unset (`systemctl show` prints an unset list empty with --all), and a
    // Group= that names the instance group is the identity's own primary group.
    plantShow(host, 1, 'turn', { ...conforming, service: `${conforming.service}\nSupplementaryGroups=\nGroup=${host.policy.instanceGroup}` });
    expect(await conformance(1, 'turn', host.policy)).toEqual({ warnings: [] });
    // …and a widening key `systemctl show` prints at its default when nobody set it.
    plantShow(host, 1, 'turn', { ...conforming, service: `${conforming.service}\nPrivateUsers=no` });
    expect(await conformance(1, 'turn', host.policy)).toEqual({ warnings: [] });
  });

  /**
   * WHAT IS EXECUTED, AND AS WHOM — not only the argv. A root-authored drop-in `ExecStart=!<bun>
   * <shim>` keeps the argv, `User=` and the shim's netns proof, and runs the agent as ROOT; an
   * `@` prefix runs another binary behind the same argv. `systemctl show` states the first in
   * ExecStartEx's `flags=` and the second in `path=`: each is a row.
   */
  test('REFUSED, naming it: another binary behind the argv (`@`), a privileged prefix (`+ ! !!`), a missing ExecStartEx, two commands', async () => {
    const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const conforming = conformingShow(host, workspacePath('alpha'), 1, 'turn', 255);
    const runtime = host.policy.unitExec.runtime as string;
    const exLine = (conforming.service.match(/^ExecStartEx=.*$/m) as RegExpMatchArray)[0];
    const startLine = (conforming.service.match(/^ExecStart=.*$/m) as RegExpMatchArray)[0];
    const rows: Array<[string, string, string]> = [
      ['@ on ExecStart', conforming.service.replace(startLine, startLine.replace(`path=${runtime}`, 'path=/bin/sh')), 'ExecStart path'],
      ['@ on ExecStartEx', conforming.service.replace(exLine, exLine.replace(`path=${runtime}`, 'path=/bin/sh')), 'ExecStartEx'],
      ['+', conforming.service.replace(exLine, exLine.replace('flags= ;', 'flags=privileged ;')), 'ExecStartEx flags'],
      ['!', conforming.service.replace(exLine, exLine.replace('flags= ;', 'flags=no-setuid ;')), 'ExecStartEx flags'],
      ['!!', conforming.service.replace(exLine, exLine.replace('flags= ;', 'flags=ambient ;')), 'ExecStartEx flags'],
      ['no flags field', conforming.service.replace(exLine, exLine.replace(' flags= ;', '')), 'ExecStartEx flags'],
      ['no ExecStartEx', conforming.service.replace(`${exLine}\n`, ''), 'ExecStartEx'],
      ['two commands', conforming.service.replace(startLine, `${startLine} ${startLine.slice('ExecStart='.length)}`), 'ExecStart'],
    ];
    const survived: string[] = [];
    for (const [label, service, named] of rows) {
      plantShow(host, 1, 'turn', { ...conforming, service });
      const refused = await caught(() => conformance(1, 'turn', host.policy));
      if (!hasConfinementCode(refused, 'unit_nonconformant') || !String((refused as Error)?.message ?? '').includes(`${named} —`)) survived.push(label);
    }
    expect(survived).toEqual([]);
    plantShow(host, 1, 'turn', conforming);
    expect(await conformance(1, 'turn', host.policy)).toEqual({ warnings: [] });
  });

  /**
   * EVERY MEMBER OF EVERY LIST-VALUED DEPENDENCY. The whole-value rows above cannot see a
   * comparison that checks only PART of a list (`others.slice(1)`): a target whose Conflicts=
   * lost ONE door lets two doors of one site run at once, as one uid. So each member is dropped
   * on its own, on the doors whose lists differ, and must be refused naming the property.
   */
  test('REFUSED, naming it: each MEMBER of Conflicts=, the target’s After=, BindsTo=, After= and the socket’s PartOf= dropped on its own (floor)', async () => {
    const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const survived: string[] = [];
    let rows = 0;
    for (const door of ['turn', 'build', 'git'] as const) {
      const conforming = conformingShow(host, workspacePath('alpha'), 1, door, 255);
      for (const [part, key] of [
        ['target', 'Conflicts'],
        ['target', 'After'],
        ['service', 'BindsTo'],
        ['service', 'After'],
        ['socket', 'PartOf'],
      ] as const) {
        const members = String(parseShow(conforming[part])[key] ?? '').split(/\s+/).filter(Boolean);
        for (const member of members) {
          rows += 1;
          const dropped = conforming[part].replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${members.filter(each => each !== member).join(' ')}`);
          plantShow(host, 1, door, { ...conforming, [part]: dropped });
          const refused = await caught(() => conformance(1, door, host.policy));
          const message = String((refused as Error)?.message ?? '');
          const named = part === 'target' && key === 'After' ? message.includes('target After') : message.includes(`${key} —`);
          if (!hasConfinementCode(refused, 'unit_nonconformant') || !named) survived.push(`${door} ${part}:${key} without ${member}`);
        }
      }
      plantShow(host, 1, door, conforming);
    }
    // turn 9 + build 8 + git 7 (the git target orders after nothing).
    expect({ rows: rows >= 24, survived }).toEqual({ rows: true, survived: [] });
  });

  test('a symlinked runtime is named as such: the refusal says to declare the resolved path', async () => {
    const { symlinkSync } = await import('node:fs');
    const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const link = join(shortScratch('bunlink'), 'bun');
    symlinkSync(host.policy.unitExec.runtime, link);
    const conforming = conformingShow(host, workspacePath('alpha'), 1, 'turn', 255);
    plantShow(host, 1, 'turn', { ...conforming, service: conforming.service.replaceAll(host.policy.unitExec.runtime, link) });
    const refused = await caught(() => conformance(1, 'turn', host.policy));
    expect({ code: hasConfinementCode(refused, 'unit_nonconformant'), hint: /declare engine\.bun_bin/.test(String((refused as Error).message)) }).toEqual({ code: true, hint: true });
  });

  test('PrivatePIDs absent on a 257 host is a WARNING, not a refusal', async () => {
    const conformance = await contractExport<Conformance>('drivers/confinement.ts', 'conformance');
    const host = await hostWith([['alpha', 1]], { version: 257 });
    const fixtures = conformingShow(host, workspacePath('alpha'), 1, 'git', 257);
    plantShow(host, 1, 'git', { ...fixtures, service: fixtures.service.replace(/^PrivatePIDs=yes\n/m, '') });
    const result = await conformance(1, 'git', host.policy);
    expect((result?.warnings ?? []).some(line => line.includes('PrivatePIDs'))).toBe(true);
  });

  test('the run path asks it: a nonconformant unit is never connected to', async () => {
    const host = await hostWith([['alpha', 1]], { version: 255 });
    const fixtures = conformingShow(host, workspacePath('alpha'), 1, 'git', 255);
    plantShow(host, 1, 'git', { ...fixtures, service: fixtures.service.replace(/^User=.*$/m, 'User=root') });
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect(hasConfinementCode(refused, 'unit_nonconformant')).toBe(true);
    expect(host.standIn.connects).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G11 — boot reconciles from PID 1 first
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** A listen target nothing serves (a path that does not exist): the claim's listener half passes. */
const UNHELD = () => ({ kind: 'unix' as const, path: join(shortScratch('unheld'), 'absent.sock') });


describe('G11 — boot: reconcile (from PID 1) → sweep → listen', () => {
  test('bootSequence runs the steps in that order, and never listens before reconciling', async () => {
    const bootSequence = await contractExport<(steps: Record<string, () => unknown>) => Promise<void>>('boot.ts', 'bootSequence');
    const order: string[] = [];
    await bootSequence({
      preflight: () => void order.push('preflight'),
      claimInstance: async () => void order.push('claim'),
      reconcileAgentUnits: async () => void order.push('reconcile'),
      sweepOnBoot: async () => void order.push('sweep'),
      listen: async () => void order.push('listen'),
    });
    expect(order).toEqual(['preflight', 'claim', 'reconcile', 'sweep', 'listen']);
  });

  test('the daemon’s reconcile STEP (daemonBootSteps, what index.ts boots) reconciles the policy it is handed: a stubborn s2-build is asked to stop and quarantines site 2 — BEFORE any run', async () => {
    const { daemonBootSteps } = await import('../src/boot');
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    const leftover = host.standIn.plantLive(2, 'build', { stubborn: true });
    const steps = daemonBootSteps({ policy: () => host.policy as never, preflight: () => {}, listenTarget: UNHELD, sweepOnBoot: async () => {}, listen: async () => {} });
    await steps.reconcileAgentUnits();
    // Read straight after the step: no run has asked anything, so nothing but the step acted.
    const lease = leaseSnapshot(host.policy as never);
    expect({
      quarantined: lease.quarantined.map(({ k, heldSlug }) => ({ k, heldSlug })),
      runs: lease.runs,
      stopAsked: host.standIn.systemctlCalls.some(argv => argv.includes('stop') && argv.includes(leftover.name)),
      connects: host.standIn.connects.length,
    }).toEqual({ quarantined: [{ k: 2, heldSlug: null }], runs: [], stopAsked: true, connects: 0 });
  }, 30_000);

  test('control: a leftover that DOES die is stopped by the step, and nothing is quarantined', async () => {
    const { daemonBootSteps } = await import('../src/boot');
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    const leftover = host.standIn.plantLive(2, 'build');
    await daemonBootSteps({ policy: () => host.policy as never, preflight: () => {}, listenTarget: UNHELD, sweepOnBoot: async () => {}, listen: async () => {} }).reconcileAgentUnits();
    expect({ state: leftover.state, lease: leaseSnapshot(host.policy as never) }).toEqual({ state: 'inactive', lease: { runs: [], quarantined: [] } });
  }, 30_000);

  test('THE BOOT, whole: bootSequence(daemonBootSteps(…)) has quarantined the leftover’s site by the time the sweep runs, and listens last', async () => {
    const { bootSequence, daemonBootSteps } = await import('../src/boot');
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    host.standIn.plantLive(2, 'git', { stubborn: true });
    const seen: string[] = [];
    await bootSequence(
      daemonBootSteps({
        listenTarget: UNHELD,
        policy: () => host.policy as never,
        preflight: () => void seen.push('preflight'),
        sweepOnBoot: async () => void seen.push(`sweep sees quarantined ${JSON.stringify(leaseSnapshot(host.policy as never).quarantined.map(({ k }) => k))}`),
        listen: async () => void seen.push('listen'),
      }),
    );
    expect(seen).toEqual(['preflight', 'sweep sees quarantined [2]', 'listen']);
  }, 30_000);

  test('a reconciliation that throws does not stop the boot: it is reported, and the sweep and the listen still run', async () => {
    const { bootSequence, daemonBootSteps } = await import('../src/boot');
    const seen: string[] = [];
    await bootSequence(
      daemonBootSteps({
        listenTarget: UNHELD,
        policy: () => {
          throw new Error('no policy (gate)');
        },
        preflight: () => {},
        sweepOnBoot: async () => void seen.push('sweep'),
        listen: async () => void seen.push('listen'),
        report: message => void seen.push(message),
      }),
    ).catch(error => seen.push(`boot threw: ${String(error)}`));
    expect(seen).toEqual(['[boot] the confinement probe failed; every run asks again and refuses on failure:', '[boot] agent unit reconciliation failed:', 'sweep', 'listen']);
  });

  /**
   * A MISPROVISIONED HOST IS SAID AT BOOT. The boot probed the agent CLI and reconciled units, and
   * never asked the host-level questions every run asks (`confinementProblems`): PID 1 below the
   * floor or unreadable, no identity, an identity that does not resolve, the daemon outside a
   * private group… — so such a host booted green and failed its first request. Never stops the
   * boot; a provisioned host says nothing.
   */
  test('1c: a host that cannot confine is REPORTED before reconcile — naming why — and the boot still listens; a provisioned one says nothing', async () => {
    const { bootSequence, daemonBootSteps } = await import('../src/boot');
    for (const [what, options, needle] of [
      ['PID 1 unreadable', { hostOverrides: { pid1Version: () => null } }, 'cannot be read'],
      ['no site identity resolves', { hostOverrides: { resolveAgent: () => null } }, 'does not exist on this host'],
      ['the daemon outside a private group', { hostOverrides: { ownGroups: () => [GATE_IDS.instanceGid] } }, 'not (yet) in the private group'],
    ] as const) {
      const host = await hostWith([['alpha', 1]], options);
      const seen: string[] = [];
      await bootSequence(
        daemonBootSteps({
          listenTarget: UNHELD,
          policy: () => host.policy as never,
          preflight: () => {},
          sweepOnBoot: async () => void seen.push('sweep'),
          listen: async () => void seen.push('listen'),
          report: (message, detail) => void seen.push(`${message} ${String(detail)}`),
        }),
      );
      expect({ what, said: seen.some(line => line.startsWith('[boot] this host cannot run a confined agent run') && line.includes(needle)), tail: seen.slice(-2) }).toEqual({
        what,
        said: true,
        tail: ['sweep', 'listen'],
      });
    }
    const clean = await hostWith([['alpha', 1]]);
    const said: string[] = [];
    await bootSequence(
      daemonBootSteps({
        listenTarget: UNHELD,
        policy: () => clean.policy as never,
        preflight: () => {},
        sweepOnBoot: async () => {},
        listen: async () => {},
        report: message => void said.push(message),
      }),
    );
    expect(said).toEqual([]);
  }, 30_000);

  test('the daemon’s entry point boots and stops THROUGH the factories — it names neither the reconciler nor the refusal itself', () => {
    // index.ts is the process entry (top-level await, a bound server) and cannot be imported;
    // the steps' OUTCOMES are the rows above. What is held here is only that the entry point
    // has no way to substitute them: it imports neither symbol, and hands its steps to the
    // factories, once each.
    const source = readFileSync(join(import.meta.dir, '..', 'src', 'index.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect({
      boots: [...code.matchAll(/\bbootSequence\(\s*daemonBootSteps\(\{/g)].length,
      stops: [...code.matchAll(/\bshutdownSequence\(\s*daemonShutdownSteps\(\{/g)].length,
      namesReconciler: /\breconcileAgentUnits\b/.test(code),
      namesRefusal: /\bstopOpeningRuns\b/.test(code),
      sweepsDirectly: /\bsweepOnBoot\s*\(/.test(code),
    }).toEqual({ boots: 1, stops: 1, namesReconciler: false, namesRefusal: false, sweepsDirectly: false });
  });

  test('a live s2-build left by a dead daemon quarantines site 2 (only) until PID 1 reports it dead', async () => {
    const reconcileAgentUnits = await contractExport<(policy: unknown) => Promise<void>>('drivers/confinement.ts', 'reconcileAgentUnits');
    const { leaseSnapshot } = await import('../src/drivers/confinement');
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    const leftover = host.standIn.plantLive(2, 'build', { stubborn: true });
    await reconcileAgentUnits(host.policy);
    // Straight after reconcile, before any run: its OWN effect (a run's idle proof would mask it).
    expect({
      quarantined: leaseSnapshot(host.policy as never).quarantined.map(({ k }) => k),
      stopAsked: host.standIn.systemctlCalls.some(argv => argv.includes('stop') && argv.includes(leftover.name)),
    }).toEqual({ quarantined: [2], stopAsked: true });
    const refused = await reserved('beta', () => caught(() => run(host, 'beta', 'git')));
    expect(hasConfinementCode(refused, 'identity_quarantined')).toBe(true);
    expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
    host.standIn.reap(leftover);
    let freed = false;
    const start = Date.now();
    while (!freed && Date.now() - start < 20_000) {
      try {
        freed = (await reserved('beta', () => run(host, 'beta', 'git'))).exitCode === 0;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    expect(freed).toBe(true);
  }, 60_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G11b — THE INSTANCE CLAIM comes before anything that stops a unit or writes
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A SECOND PROCESS OF THE SAME INSTANCE (an operator's hand run as the service user, beside the
 * unit's daemon) used to reach `reconcileAgentUnits` — which STOPS every live agent run of the
 * instance's sites, through the polkit grant this uid holds — and then the sweep, which marks the
 * serving daemon's 'running' sessions interrupted and recovery-commits them, before the listen
 * step finally noticed the socket was served and exited 1. The claim now comes first: PID 1 must
 * name THIS process as the daemon unit's main process (systemd_scope), and the listen target must
 * not already be served (every mode). Each row is the serving daemon's outcome: its live turn
 * still active, no stop, no list, no sweep, no listen.
 */
describe('G11b — the instance claim precedes reconcile, sweep and listen', () => {
  const DAEMON_UNIT = 'dedalo-site-builder@test.service';

  async function bootAsSecond(host: GatePolicy, target: () => { kind: 'unix'; path: string } | { kind: 'tcp'; hostname: string; port: number } = UNHELD) {
    const { bootSequence, daemonBootSteps } = await import('../src/boot');
    const seen: string[] = [];
    const refused = await caught(() =>
      bootSequence(
        daemonBootSteps({
          listenTarget: target,
          policy: () => host.policy as never,
          preflight: () => void seen.push('preflight'),
          sweepOnBoot: async () => void seen.push('sweep'),
          listen: async () => void seen.push('listen'),
          refuse: message => void seen.push(`refused: ${message}`),
        }),
      ),
    );
    const systemctl = host.standIn.systemctlCalls;
    return {
      refused: refused instanceof Error && !/expected a refusal/.test(refused.message),
      seen: seen.map(line => (line.startsWith('refused: ') ? 'refused' : line)),
      said: seen.find(line => line.startsWith('refused: ')) ?? '',
      stops: systemctl.filter(argv => argv.includes('stop')).length,
      lists: systemctl.filter(argv => argv.includes('list-units')).length,
    };
  }

  test('PID 1 names ANOTHER main process for the daemon unit: refused at the claim — the serving daemon’s live turn is not stopped, nothing is listed, swept or listened', async () => {
    const host = await hostWith([['alpha', 1]]);
    const serving = host.standIn.plantLive(1, 'turn');
    host.standIn.daemonMainPid = process.pid + 1;
    const outcome = await bootAsSecond(host);
    expect({ ...outcome, said: /main process is PID \d+, not this process/.test(outcome.said), turn: serving.state }).toEqual({
      refused: true,
      seen: ['preflight', 'refused'],
      said: true,
      stops: 0,
      lists: 0,
      turn: 'active',
    });
  });

  test('“PID 1 cannot say” is never “mine”: the unit not running, a show that throws, fails or omits MainPID — each refused before reconcile', async () => {
    const cases: Array<[string, (host: GatePolicy) => void]> = [
      ['not running (MainPID=0)', host => void (host.standIn.daemonMainPid = 0)],
      ['the bus never answered', host => void (host.standIn.fault = (verb, units) => (verb === 'show' && units.includes(DAEMON_UNIT) ? 'throw' : null))],
      ['show failed', host => void (host.standIn.fault = (verb, units) => (verb === 'show' && units.includes(DAEMON_UNIT) ? BUS_TIMEOUT : null))],
      ['MainPID absent', host => void (host.standIn.fault = (verb, units) => (verb === 'show' && units.includes(DAEMON_UNIT) ? { drop: ['MainPID'] } : null))],
    ];
    for (const [what, plant] of cases) {
      const host = await hostWith([['alpha', 1]]);
      const serving = host.standIn.plantLive(1, 'turn');
      plant(host);
      const outcome = await bootAsSecond(host);
      expect({ what, refused: outcome.refused, seen: outcome.seen, stops: outcome.stops, lists: outcome.lists, turn: serving.state }).toEqual({
        what,
        refused: true,
        seen: ['preflight', 'refused'],
        stops: 0,
        lists: 0,
        turn: 'active',
      });
    }
  });

  test('the claim asks PID 1 about THIS instance’s daemon unit, by name', async () => {
    const host = await hostWith([['alpha', 1]]);
    await bootAsSecond(host);
    expect(host.standIn.systemctlCalls.some(argv => argv.includes('show') && argv.includes(DAEMON_UNIT) && argv.join(' ').includes('MainPID'))).toBe(true);
  });

  test('the listen target already SERVED (unix socket, tcp port): refused before reconcile, even with PID 1 naming this process', async () => {
    const dir = shortScratch('held');
    const path = join(dir, 'daemon.sock');
    const unix = Bun.listen({ unix: path, socket: { data() {} } });
    const tcp = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
    try {
      for (const target of [() => ({ kind: 'unix' as const, path }), () => ({ kind: 'tcp' as const, hostname: '127.0.0.1', port: tcp.port })]) {
        const host = await hostWith([['alpha', 1]]);
        const serving = host.standIn.plantLive(1, 'turn');
        const outcome = await bootAsSecond(host, target);
        expect({ kind: target().kind, refused: outcome.refused, seen: outcome.seen, served: /already being served/.test(outcome.said), stops: outcome.stops, turn: serving.state }).toEqual({
          kind: target().kind,
          refused: true,
          seen: ['preflight', 'refused'],
          served: true,
          stops: 0,
          turn: 'active',
        });
      }
    } finally {
      unix.stop(true);
      tcp.stop(true);
    }
  });

  test('the listener half alone: a served socket/port is held; an absent path, a non-socket file and a closed port are not', async () => {
    const listenTargetHeld = await contractExport<(target: unknown) => Promise<string | null>>('instance/listen_target.ts', 'listenTargetHeld');
    const dir = shortScratch('lt');
    const path = join(dir, 'd.sock');
    const unix = Bun.listen({ unix: path, socket: { data() {} } });
    const tcp = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
    const port = tcp.port;
    const file = join(dir, 'not-a-socket');
    writeFileSync(file, '');
    const held = {
      unix: (await listenTargetHeld({ kind: 'unix', path })) !== null,
      tcp: (await listenTargetHeld({ kind: 'tcp', hostname: '127.0.0.1', port })) !== null,
      absent: (await listenTargetHeld({ kind: 'unix', path: join(dir, 'absent.sock') })) !== null,
      file: (await listenTargetHeld({ kind: 'unix', path: file })) !== null,
    };
    unix.stop(true);
    tcp.stop(true);
    const closed = (await listenTargetHeld({ kind: 'tcp', hostname: '127.0.0.1', port })) !== null;
    expect({ ...held, closed }).toEqual({ unix: true, tcp: true, absent: false, file: false, closed: false });
  });

  test('control: PID 1 names THIS process — the claim passes and reconcile then stops the leftover (claim first, in the log)', async () => {
    const host = await hostWith([['alpha', 1]]);
    const leftover = host.standIn.plantLive(1, 'build');
    const outcome = await bootAsSecond(host);
    const log = host.standIn.log;
    const claimAt = log.findIndex(line => line.startsWith('systemctl show') && line.includes(DAEMON_UNIT));
    const firstList = log.findIndex(line => line.includes('list-units'));
    expect({ refused: outcome.refused, seen: outcome.seen, leftover: leftover.state, claimFirst: claimAt > -1 && claimAt < firstList }).toEqual({
      refused: false,
      seen: ['preflight', 'sweep', 'listen'],
      leftover: 'inactive',
      claimFirst: true,
    });
  }, 30_000);

  test('a policy the claim could not build is never built later in the same boot: reconcile stops nothing unclaimed', async () => {
    const { bootSequence, daemonBootSteps } = await import('../src/boot');
    const host = await hostWith([['alpha', 1]]);
    const serving = host.standIn.plantLive(1, 'turn');
    host.standIn.daemonMainPid = process.pid + 1;
    let asked = 0;
    const seen: string[] = [];
    await bootSequence(
      daemonBootSteps({
        listenTarget: UNHELD,
        // Fails the FIRST time only — the claim's ask — and would hand reconcile a policy after.
        policy: () => {
          asked++;
          if (asked === 1) throw new Error('transient (gate)');
          return host.policy as never;
        },
        preflight: () => {},
        sweepOnBoot: async () => void seen.push('sweep'),
        listen: async () => void seen.push('listen'),
        report: message => void seen.push(message),
      }),
    );
    expect({ asked, stops: host.standIn.systemctlCalls.filter(argv => argv.includes('stop')).length, turn: serving.state }).toEqual({ asked: 1, stops: 0, turn: 'active' });
  });

  test('mode none (declared unconfined, nothing is ever stopped): PID 1 is not asked — a host without systemd still boots', async () => {
    const host = await hostWith([['alpha', 1]], { overrides: { mode: 'none' } });
    host.standIn.daemonMainPid = 0;
    const outcome = await bootAsSecond(host);
    expect({ refused: outcome.refused, seen: outcome.seen, asked: host.standIn.systemctlCalls.length }).toEqual({ refused: false, seen: ['preflight', 'sweep', 'listen'], asked: 0 });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * SHUTDOWN — no connect once the daemon is stopping (a socket start would cancel its stop)
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('shutdown — the FIRST step refuses every new confined run: nothing connects after SIGTERM', () => {
  const TURNABLE = { egressFacts: { driver: 'claude_code', providerHosts: ['api.anthropic.com'], registryHosts: ['registry.npmjs.org'] } };

  test('a turn live at SIGTERM finishes; its commit and another site’s build during the drain are 503 daemon_stopping — no connect, nothing started', async () => {
    const { daemonShutdownSteps, shutdownSequence } = await import('../src/boot');
    const host = await hostWith(
      [
        ['alpha', 1],
        ['beta', 2],
      ],
      { overrides: TURNABLE },
    );
    host.standIn.script = () => ({ kind: 'hang' });
    expect(tryBeginBuild('alpha')).toBe(true);
    const turn = run(host, 'alpha', 'turn', { driver: 'claude_code' });
    await waitUntil(() => host.standIn.specs.length === 1, 8_000, 'the turn to reach its unit');
    const outcome: Record<string, unknown> = {};
    await shutdownSequence(
      daemonShutdownSteps({
        policy: () => host.policy as never,
        drain: async () => {
          const connectsAtSigterm = host.standIn.connects.length;
          // The live turn ends inside the drain…
          host.standIn.release();
          outcome.turn = (await turn).exitCode;
          endBuild('alpha');
          // …and what would follow it (its commit), and another site's request, are refused —
          // before they ask PID 1 anything or open a gate: refused at the door, not at the connect.
          const asked = host.standIn.systemctlCalls.length;
          const gated = host.gateEvents.length;
          outcome.commit = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
          outcome.build = await reserved('beta', () => caught(() => run(host, 'beta', 'build')));
          outcome.connectsAfter = host.standIn.connects.length - connectsAtSigterm;
          outcome.askedAfter = host.standIn.systemctlCalls.length - asked;
          outcome.gatedAfter = host.gateEvents.length - gated;
        },
        interrupt: async () => {},
        cleanup: () => {},
      }),
    );
    expect({
      turn: outcome.turn,
      commit: [hasConfinementCode(outcome.commit, 'daemon_stopping'), describeError(outcome.commit).status],
      build: [hasConfinementCode(outcome.build, 'daemon_stopping'), describeError(outcome.build).status],
      connectsAfter: outcome.connectsAfter,
      askedAfter: outcome.askedAfter,
      gatedAfter: outcome.gatedAfter,
      specs: host.standIn.specs.map(({ door }) => door),
    }).toEqual({ turn: 0, commit: [true, 503], build: [true, 503], connectsAfter: 0, askedAfter: 0, gatedAfter: 0, specs: ['turn'] });
  }, 30_000);

  test('the order: refuseNewRuns runs FIRST and synchronously — before the drain’s first await', async () => {
    const { shutdownSequence } = await import('../src/boot');
    const order: string[] = [];
    await shutdownSequence({
      refuseNewRuns: () => void order.push('refuse'),
      drain: async () => void order.push('drain'),
      interrupt: async () => void order.push('interrupt'),
      cleanup: () => void order.push('cleanup'),
    });
    expect(order).toEqual(['refuse', 'drain', 'interrupt', 'cleanup']);
  });

  test('a run already past admission when the shutdown lands is refused AT THE CONNECT (asked again after every await), and its slot freed', async () => {
    const { leaseSnapshot, stopOpeningRuns } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    // SIGTERM lands while the run is being opened (between its conformance and its connect).
    const inner = host.policy.host.systemctl as (args: readonly string[]) => Promise<unknown>;
    host.policy.host.systemctl = async (args: readonly string[]) => {
      if (args.some(arg => arg.endsWith('@probe.service'))) stopOpeningRuns(host.policy as never);
      return inner(args);
    };
    const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
    expect({ code: hasConfinementCode(refused, 'daemon_stopping'), connects: host.standIn.connects.length, lease: leaseSnapshot(host.policy as never) }).toEqual({
      code: true,
      connects: 0,
      lease: { runs: [], quarantined: [] },
    });
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G14 (policy half) — no identity, no run, no fallback
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G14 — a site without an identity does not run, and nothing falls back to the legacy agent', () => {
  test('an empty AGENT_IDENTITIES is named by confinementProblems', async () => {
    const { confinementProblems } = await import('../src/drivers/confinement');
    const host = await hostWith([]);
    expect((await confinementProblems(host.policy, 'git')).some(problem => problem.includes('AGENT_IDENTITIES'))).toBe(true);
  });

  for (const door of ['turn', 'build', 'git'] as const) {
    test(`a declared site with no identity: its ${door} run is 503 identity_missing — no systemctl, no connect, no legacy uid`, async () => {
      const host = await hostWith([['alpha', 1]]);
      mkdirSync(workspacePath('beta'), { recursive: true });
      // Control: the site WITH an identity runs.
      expect((await reserved('alpha', () => run(host, 'alpha', 'git'))).exitCode).toBe(0);
      const connects = host.standIn.connects.length;
      const refused = await reserved('beta', () => caught(() => run(host, 'beta', door)));
      expect(hasConfinementCode(refused, 'identity_missing')).toBe(true);
      expect({ connects: host.standIn.connects.length, legacy: host.resolved.filter(name => name.startsWith('dedalo-agent-')) }).toEqual({ connects, legacy: [] });
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G2 / G14 (daemon half) — the identities PID 1 will run are PROVED on every run
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G2/G14 daemon half — confinementProblems proves every identity, every run, against the host as it is NOW', () => {
  const uidOf = GATE_IDS.identityUid;
  const clean = (name: string, k: number) =>
    Object.freeze({ uid: uidOf(k), gid: GATE_IDS.instanceGid, gids: Object.freeze([GATE_IDS.instanceGid, GATE_IDS.privateGid(k)]) });
  const kOf = (name: string) => Number(/_(\d+)$/.exec(name)?.[1] ?? NaN);
  /** The gate host's own databases (support/lead1b_host.ts), for rows that add ONE entry. */
  const HOST_ACCOUNTS = [
    { name: 'root', id: 0, gid: 0 },
    { name: 'dedalo-site-test', id: GATE_IDS.serviceUid, gid: GATE_IDS.instanceGid },
    { name: 'dedalo-a-test_1', id: uidOf(1), gid: GATE_IDS.instanceGid },
    { name: 'dedalo-a-test_2', id: uidOf(2), gid: GATE_IDS.instanceGid },
  ];
  const HOST_GROUPS = [
    { name: 'root', id: 0 },
    { name: 'dedalo-site-test', id: GATE_IDS.instanceGid },
    { name: 'dedalo-a-test_1', id: GATE_IDS.privateGid(1) },
    { name: 'dedalo-a-test_2', id: GATE_IDS.privateGid(2) },
  ];

  /** One host fault, the problem that must name it, and whether a run is refused before any connect. */
  const faults: Array<[string, Record<string, unknown>, RegExp]> = [
    ['an identity with uid 0', { resolveAgent: (name: string) => (kOf(name) === 1 ? { ...clean(name, 1), uid: 0 } : clean(name, kOf(name))) }, /dedalo-a-test_1' of site 'alpha' has uid 0/],
    [
      'an identity with this daemon’s own uid',
      { resolveAgent: (name: string) => (kOf(name) === 2 ? { ...clean(name, 2), uid: process.getuid?.() ?? -1 } : clean(name, kOf(name))) },
      /dedalo-a-test_2' of site 'beta' has uid \d+ — root's or this daemon's own/,
    ],
    ['two identities sharing one uid (R1c)', { resolveAgent: (name: string) => ({ ...clean(name, kOf(name)), uid: uidOf(1) }) }, /'dedalo-a-test_1' and 'dedalo-a-test_2' share uid/],
    ['a primary gid that is not the instance group', { resolveAgent: (name: string) => (kOf(name) === 2 ? { ...clean(name, 2), gid: 12345 } : clean(name, kOf(name))) }, /dedalo-a-test_2' has primary gid 12345/],
    ['an identity outside its private group', { resolveAgent: (name: string) => (kOf(name) === 1 ? { ...clean(name, 1), gids: [GATE_IDS.instanceGid] } : clean(name, kOf(name))) }, /dedalo-a-test_1' is not in its private group/],
    // Round 5: a SUPERSET passed (`includes`) — an extra host group (adm 4, another museum's
    // instance group) rides into every run under User= (initgroups). Exactly {instance, private}.
    [
      'an identity in a group beyond {instance, private} (usermod -aG adm)',
      { resolveAgent: (name: string) => (kOf(name) === 1 ? { ...clean(name, 1), gids: [GATE_IDS.instanceGid, GATE_IDS.privateGid(1), 4] } : clean(name, kOf(name))) },
      /dedalo-a-test_1' is also in group\(s\) 4/,
    ],
    [
      'a foreign member in a private group',
      { groupMembers: (name: string) => (kOf(name) === 2 ? ['dedalo-site-test', name, 'dedalo-a-test_1'] : ['dedalo-site-test', name]) },
      /private group 'dedalo-a-test_2' must hold exactly/,
    ],
    ['this daemon outside a private group', { ownGroups: () => [GATE_IDS.instanceGid, GATE_IDS.privateGid(1)] }, /not \(yet\) in the private group 'dedalo-a-test_2'/],
    // HOST-WIDE: not only this instance's identities may not share a uid — no account may.
    [
      "another MUSEUM's identity holding site 1's uid (a merged /etc/passwd)",
      { listAccounts: () => [...HOST_ACCOUNTS, { name: 'dedalo-a-museob_1', id: uidOf(1), gid: 4242 }] },
      /'dedalo-a-test_1' has uid \d+, which 'dedalo-a-museob_1' also holds/,
    ],
    ['nobody holding site 2’s uid', { listAccounts: () => [...HOST_ACCOUNTS, { name: 'nobody2', id: uidOf(2), gid: 65534 }] }, /'dedalo-a-test_2' has uid \d+, which 'nobody2' also holds/],
    [
      'another group holding a private gid',
      { listGroups: () => [...HOST_GROUPS, { name: 'staff', id: GATE_IDS.privateGid(1) }] },
      /private group 'dedalo-a-test_1' has gid \d+, which 'staff' also has/,
    ],
    ['two private groups sharing one gid', { listGroups: () => [...HOST_GROUPS.filter(group => group.name !== 'dedalo-a-test_2'), { name: 'dedalo-a-test_2', id: GATE_IDS.privateGid(1) }], groupGid: (name: string) => (name === 'dedalo-a-test_2' ? GATE_IDS.privateGid(1) : name.endsWith('_1') ? GATE_IDS.privateGid(1) : name === 'dedalo-site-test' ? GATE_IDS.instanceGid : null) }, /private group 'dedalo-a-test_\d' has gid \d+, which 'dedalo-a-test_\d' also has/],
    // THE MEMBERSHIP NO GROUP LINE LISTS: an LDAP account whose gidNumber is site 1's private gid.
    [
      'an account whose PRIMARY gid is a private group’s (LDAP gidNumber)',
      { listAccounts: () => [...HOST_ACCOUNTS, { name: 'ldapuser', id: 5555, gid: GATE_IDS.privateGid(1) }] },
      /private group 'dedalo-a-test_1' \(gid \d+\) is the PRIMARY group of 'ldapuser'/,
    ],
    [
      'a sibling identity whose PRIMARY gid is the other site’s private group',
      { listAccounts: () => [...HOST_ACCOUNTS.filter(account => account.name !== 'dedalo-a-test_2'), { name: 'dedalo-a-test_2', id: uidOf(2), gid: GATE_IDS.privateGid(1) }] },
      /private group 'dedalo-a-test_1' \(gid \d+\) is the PRIMARY group of 'dedalo-a-test_2'/,
    ],
    ['an account database that cannot be enumerated', { listAccounts: () => null }, /account database cannot be enumerated/],
  ];

  test('control: a clean host names none of these faults', async () => {
    const { confinementProblems } = await import('../src/drivers/confinement');
    const host = await hostWith([
      ['alpha', 1],
      ['beta', 2],
    ]);
    const problems = (await confinementProblems(host.policy, 'git'));
    expect(faults.map(([what, , pattern]) => [what, problems.some(problem => pattern.test(problem))]).filter(([, hit]) => hit)).toEqual([]);
  });

  for (const [what, hostOverrides, pattern] of faults) {
    test(`named, and the run refused before any connect: ${what}`, async () => {
      const { confinementProblems } = await import('../src/drivers/confinement');
      const host = await hostWith(
        [
          ['alpha', 1],
          ['beta', 2],
        ],
        { hostOverrides },
      );
      const problems = (await confinementProblems(host.policy, 'git'));
      expect({ what, named: problems.some(problem => pattern.test(problem)) }).toEqual({ what, named: true });
      const refused = await reserved('alpha', () => caught(() => run(host, 'alpha', 'git')));
      expect({ what, status: describeError(refused).status, connects: host.standIn.connects.length }).toEqual({ what, status: 503, connects: 0 });
    });
  }

  test('the real enumeration reads the PRIMARY gid (passwd field 4), and refuses a passwd it cannot read it from', async () => {
    const { parseGetentList } = await import('../src/drivers/confinement');
    expect(parseGetentList('passwd', 'root:x:0:0:root:/root:/bin/bash\nldapuser:*:5555:997:LDAP:/home/l:/bin/sh\n')).toEqual([
      { name: 'root', id: 0, gid: 0 },
      { name: 'ldapuser', id: 5555, gid: 997 },
    ]);
    // A primary gid that cannot be read is an account that cannot be proved outside every private group.
    expect(parseGetentList('passwd', 'root:x:0:0:root:/root:/bin/bash\nodd:x:5556::x:/:/bin/sh')).toBeNull();
  });

  test('NON-BLOCKING: an identity lookup never holds the event loop — a slow NSS delays that run, not every stream', async () => {
    const { resolveAgentIdentity } = await import('../src/drivers/confinement');
    const dir = shortScratch('slowid');
    const idBin = join(dir, 'id');
    const { writeFileSync, chmodSync } = await import('node:fs');
    // Each question takes 1 s: a blocking or sequential lookup (three spawns) takes >= 3 s, a
    // concurrent one ~1 s — the 2 s bound sits between them with room for a loaded host.
    writeFileSync(idBin, `#!/bin/sh\nsleep 1\ncase "$1" in -u) echo 4000001001;; -g) echo 4000000100;; -G) echo 4000000100 4000002001;; esac\n`);
    chmodSync(idBin, 0o755);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 20);
    const started = performance.now();
    const pending = resolveAgentIdentity('dedalo-a-test_1', idBin);
    const heldFor = performance.now() - started;
    const identity = await pending;
    const total = performance.now() - started;
    clearInterval(timer);
    expect({ uid: identity?.uid, loopHeldUnder100ms: heldFor < 100, loopRan: ticks >= 5, concurrent: total < 2000 }).toEqual({
      uid: 4000001001,
      loopHeldUnder100ms: true,
      loopRan: true,
      concurrent: true,
    });
  }, 15_000);

  test('NO CACHE: the host is asked again on every run — a uid that drifts after first use is seen', async () => {
    const { resolveAgentIdentity } = await import('../src/drivers/confinement');
    const dir = shortScratch('id');
    const answers = join(dir, 'uid');
    const idBin = join(dir, 'id');
    const { writeFileSync, chmodSync } = await import('node:fs');
    writeFileSync(answers, '4000001001');
    writeFileSync(idBin, `#!/bin/sh\ncase "$1" in -u) cat ${JSON.stringify(answers)};; -g) echo 4000000100;; -G) echo 4000000100 4000002001;; esac\n`);
    chmodSync(idBin, 0o755);
    const first = (await resolveAgentIdentity('dedalo-a-test_1', idBin));
    writeFileSync(answers, '4000001002');
    const second = (await resolveAgentIdentity('dedalo-a-test_1', idBin));
    expect({ first: first?.uid, second: second?.uid }).toEqual({ first: 4000001001, second: 4000001002 });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G17 — trust against every identity
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G17 — what a unit executes first may not be ANY identity’s to change', () => {
  const shimDir = () => dirname(realpathSync(join(import.meta.dir, '..', 'src', 'drivers', 'egress_shim.ts')));
  const targets = () => [
    ['the runtime', realpathSync(process.execPath)],
    ['the shim', join(shimDir(), 'egress_shim.ts')],
    ['the network leaf', join(shimDir(), 'network_profile.ts')],
    ['the frame leaf', join(shimDir(), 'unit_frames.ts')],
    ['the property leaf', join(shimDir(), 'unit_properties.ts')],
  ] as const;

  async function problemsWith(stat: (path: string) => { uid: number; gid: number; mode: number } | null): Promise<string[]> {
    const { confinementProblems } = await import('../src/drivers/confinement');
    const host = await hostWith(
      [
        ['alpha', 1],
        ['beta', 2],
      ],
      { hostOverrides: { stat: (path: string) => stat(path) ?? TRAVERSABLE_STAT(path) } },
    );
    return (await confinementProblems(host.policy, 'git'));
  }

  test('control: with honest ownership, no executable is refused on account of an identity', async () => {
    const problems = await problemsWith(() => null);
    const identityUids = [1, 2].map(k => String(GATE_IDS.identityUid(k)));
    expect(problems.filter(problem => identityUids.some(uid => problem.includes(uid)))).toEqual([]);
  });

  for (const [label, path] of targets()) {
    test(`${label} owned by identity #2 (not #1) is refused, naming both the file and the identity`, async () => {
      const problems = await problemsWith(asked => (asked === path ? { uid: GATE_IDS.identityUid(2), gid: GATE_IDS.instanceGid, mode: 0o644 } : null));
      const name = path.split('/').pop() as string;
      const hit = problems.filter(problem => problem.includes(name) && (problem.includes(String(GATE_IDS.identityUid(2))) || problem.includes('_2')));
      expect({ label, refused: hit.length > 0 }).toEqual({ label, refused: true });
    });
  }

  test('an ancestor the identities cannot TRAVERSE (0750, a group none is in) is refused, naming the directory (round 6)', async () => {
    const dir = dirname(shimDir());
    const problems = await problemsWith(asked => (asked === dir ? { uid: 0, gid: 4_000_009_999, mode: 0o40750 } : null));
    expect(problems.some(problem => problem.includes(`'${dir}'`) && /search|traverse/.test(problem))).toBe(true);
    // Control: the same directory 0755 is no problem of traversal.
    const open = await problemsWith(asked => (asked === dir ? { uid: 0, gid: 4_000_009_999, mode: 0o40755 } : null));
    expect(open.filter(problem => problem.includes(`'${dir}'`))).toEqual([]);
  });

  test('CLAUDE_CODE_BIN is held to the same rule on the TURN door — a CLI under a daemon-only 0700 directory is refused at admission (and said at boot); the git door does not ask', async () => {
    const { confinementProblems, bootConfinementProblems } = await import('../src/drivers/confinement');
    const dir = shortScratch('cli');
    const bin = join(dir, 'claude');
    writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    chmodSync(bin, 0o755);
    const real = realpathSync(bin);
    const stat = (asked: string) => (asked === dirname(real) ? { uid: GATE_IDS.serviceUid, gid: GATE_IDS.serviceUid, mode: 0o40700 } : null);
    const host = await hostWith([['alpha', 1]], { hostOverrides: { stat: (path: string) => stat(path) ?? TRAVERSABLE_STAT(path) } });
    const policy = { ...host.policy, unitExec: { ...host.policy.unitExec, agentClis: { claude_code: bin } } };
    const named = (problems: readonly string[]) => problems.some(problem => problem.includes('CLAUDE_CODE_BIN') && problem.includes(dirname(real)));
    expect({
      turn: named(await confinementProblems(policy as never, 'turn', 'claude_code')),
      boot: named(await bootConfinementProblems(policy as never)),
      git: named(await confinementProblems(policy as never, 'git')),
    }).toEqual({ turn: true, boot: true, git: false });
    // Control: a traversable directory is no refusal.
    const fine = await hostWith([['beta', 2]]);
    const finePolicy = { ...fine.policy, unitExec: { ...fine.policy.unitExec, agentClis: { claude_code: bin } } };
    expect(named(await confinementProblems(finePolicy as never, 'turn', 'claude_code'))).toBe(false);
  });

  test('the shim in a directory identity #2 can write (its private group, 0775) is refused', async () => {
    const dir = shimDir();
    const problems = await problemsWith(asked => (asked === dir ? { uid: 0, gid: GATE_IDS.privateGid(2), mode: 0o40775 } : null));
    expect(problems.some(problem => problem.includes(dir) && (problem.includes(String(GATE_IDS.identityUid(2))) || problem.includes('_2')))).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The polkit stop grant — PROVED before work, not discovered at the first interrupt (round 6)
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the polkit STOP grant is proved at boot and admission, not discovered at the first interrupt', () => {
  const DENIED = { code: 4, stderr: 'Failed to stop dedalo-site-test-agent-s1-git@0-0-0.service: Access denied' };

  test('a PID 1 that DENIES the stop (rule removed, polkitd masked or absent) is a named problem on every door and at boot — before any run starts', async () => {
    const { confinementProblems, bootConfinementProblems } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    const probed: string[][] = [];
    host.standIn.fault = (verb, units) => {
      if (verb !== 'stop') return null;
      probed.push([...units]);
      return DENIED;
    };
    const named = (problems: readonly string[]) => problems.some(problem => /polkit/.test(problem) && problem.includes('@0-0-0.service'));
    expect({
      git: named(await confinementProblems(host.policy, 'git')),
      turn: named(await confinementProblems(host.policy, 'turn')),
      boot: named(await bootConfinementProblems(host.policy)),
    }).toEqual({ git: true, turn: true, boot: true });
    // The probe is a no-op stop of a never-instantiated instance of a DECLARED site (pid 0, uid 0:
    // no real run is ever that), inside the rule's grammar — never a live run, never a start.
    expect([...new Set(probed.flat())]).toEqual([`${host.policy.unitPrefix}s1-git@0-0-0.service`]);
    // …and it is refused at admission, typed, with nothing connected.
    const { assertConfinementAvailable } = await import('../src/drivers/confinement');
    const refused = await caught(() => assertConfinementAvailable('git', host.policy, undefined, 'alpha'));
    expect({ typed: (refused as Error | null)?.name, polkit: /polkit/.test(String((refused as Error | null)?.message)), connects: host.standIn.connects.length }).toEqual({
      typed: 'ConfinementUnavailableError',
      polkit: true,
      connects: 0,
    });
  });

  test('a GRANTED stop is believed briefly (no probe per run); a refusal is never remembered', async () => {
    const { confinementProblems } = await import('../src/drivers/confinement');
    const host = await hostWith([['alpha', 1]]);
    let stops = 0;
    let deny = false;
    host.standIn.fault = verb => {
      if (verb !== 'stop') return null;
      stops++;
      return deny ? DENIED : null;
    };
    const polkit = (problems: readonly string[]) => problems.some(problem => /polkit/.test(problem));
    expect(polkit(await confinementProblems(host.policy, 'git'))).toBe(false);
    expect(polkit(await confinementProblems(host.policy, 'git'))).toBe(false);
    expect(stops).toBe(1);
    // A refusal on a fresh host is asked again on the next run, and recovers the moment it holds.
    const other = await hostWith([['beta', 2]]);
    let otherStops = 0;
    other.standIn.fault = verb => {
      if (verb !== 'stop') return null;
      otherStops++;
      return deny ? DENIED : null;
    };
    deny = true;
    expect(polkit(await confinementProblems(other.policy, 'git'))).toBe(true);
    deny = false;
    expect(polkit(await confinementProblems(other.policy, 'git'))).toBe(false);
    expect(otherStops).toBe(2);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The control plane — PID 1's release re-read; systemctl never blocks the event loop
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the control plane: PID 1’s release is re-read, and systemctl does not freeze the daemon', () => {
  async function fakeSystemctl(body: string): Promise<{ bin: string; answer: string }> {
    const { writeFileSync, chmodSync } = await import('node:fs');
    const dir = shortScratch('sysctl');
    const answer = join(dir, 'answer');
    const bin = join(dir, 'systemctl');
    writeFileSync(bin, body.replaceAll('$ANSWER', JSON.stringify(answer)));
    chmodSync(bin, 0o755);
    return { bin, answer };
  }

  test('an upgraded + re-executed PID 1 (255 → 257) is seen once the reading is PID1_VERSION_TTL_MS old — no restart; a failed read is never remembered', async () => {
    const { pid1VersionVia, PID1_VERSION_TTL_MS } = await import('../src/drivers/confinement');
    const { writeFileSync } = await import('node:fs');
    const { bin, answer } = await fakeSystemctl('#!/bin/sh\n[ -s $ANSWER ] || exit 1\ncat $ANSWER\n');
    let clock = 1_000_000;
    const read = pid1VersionVia(bin, () => clock);
    writeFileSync(answer, '255 (255.4-1ubuntu8)\n');
    const first = read();
    writeFileSync(answer, '257 (257.9-1)\n'); // apt upgrade + daemon-reexec
    clock += 1_000;
    const within = read();
    clock += PID1_VERSION_TTL_MS;
    const after = read();
    writeFileSync(answer, '');
    clock += PID1_VERSION_TTL_MS;
    const failed = read();
    writeFileSync(answer, '258 (258.1-1)\n');
    const again = read(); // same instant: the failure was not cached
    expect({ first, within, after, failed, again }).toEqual({ first: 255, within: 255, after: 257, failed: null, again: 258 });
  });

  test('the version PID 1 reports is what the next run is checked against: a stubbed PID 1 upgraded between two runs flips the PrivatePIDs warning', async () => {
    const conformance = await contractExport<(k: number, door: Door, policy: unknown) => Promise<{ warnings: string[] }>>('drivers/confinement.ts', 'conformance');
    let version = 255;
    const host = await hostWith([['alpha', 1]], { hostOverrides: { pid1Version: () => version } });
    // The unit PID 1 loaded does not change (rendered for 255, no PrivatePIDs); PID 1 does.
    const first = await conformance(1, 'git', host.policy);
    version = 257;
    const second = await conformance(1, 'git', host.policy);
    const warned = (result: { warnings: string[] }) => result.warnings.some(line => line.includes('PrivatePIDs'));
    expect({ first: warned(first), second: warned(second) }).toEqual({ first: false, second: true });
  });

  test('systemctl is awaited WITHOUT blocking the event loop: timers keep firing while PID 1 is slow', async () => {
    const { hostFacts } = await import('../src/drivers/confinement');
    const { bin } = await fakeSystemctl('#!/bin/sh\nsleep 0.4\necho ActiveState=active\n');
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 20);
    try {
      const answer = await hostFacts(bin).systemctl(['show', '-p', 'ActiveState', 'x.service']);
      expect({ code: answer.code, stdout: answer.stdout.trim(), loopRan: ticks >= 5 }).toEqual({ code: 0, stdout: 'ActiveState=active', loopRan: true });
    } finally {
      clearInterval(timer);
    }
    // And a non-zero exit is reported as PID 1's answer, not thrown.
    const { bin: failing } = await fakeSystemctl('#!/bin/sh\necho nope >&2\nexit 4\n');
    expect(await hostFacts(failing).systemctl(['stop', 'x.service'])).toEqual({ code: 4, stdout: '', stderr: 'nope\n' });
  });
});
