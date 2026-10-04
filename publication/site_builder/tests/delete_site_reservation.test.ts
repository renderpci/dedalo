/**
 * A DELETE NEVER LEAVES A HUSK — the site's reservation covers its removal too.
 *
 * `deleteSite` took no reservation: a DELETE that landed while a turn ran `rm -rf`'d the
 * workspace under it, and the turn's own persistence (`appendEvent` / `writeMeta` → the
 * store's `mkdirPrivate`) re-created `<slug>/.builder/sessions/` — a directory with no
 * site.json and no repository. Its commit failed, `recovery_pending` was persisted into it,
 * the exclusive create (`mkdirSharedFresh`) then answered 409 `workspace_exists` for that slug
 * on every retry, and every boot retried a recovery commit that could never succeed. (Review
 * of f3521612eb, S2, three refuters.)
 *
 * The outcomes held here:
 *   - a delete while anything holds the site is refused, typed, with the holder's reason, and
 *     removes nothing; a delete HOLDS the site (`site_deleting`) until its workspace and driver
 *     record are gone;
 *   - a turn or a build admitted while a delete completed is refused 404 under its hold, and
 *     re-creates nothing;
 *   - the session store never creates a workspace — only the levels below an existing one;
 *   - the boot sweep sweeps SITES: a husk left by the old race is left alone, not retried.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBuild } from '../src/build/builder';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentDriver, AgentEvent, AgentProcess, SessionStartOptions } from '../src/drivers/types';
import { getSessionState, startSession, sweepOnBoot } from '../src/sessions/manager';
import { appendEvent, readMeta, writeMeta } from '../src/sessions/store';
import { DRIVER_RECORDS_DIR } from '../src/sites/driver_record';
import { createSite, deleteSite, siteExists } from '../src/sites/workspace';
import * as tree from '../src/util/shared_tree';
import { busyReason, end, type ReservationKind, tryBegin } from '../src/workspace_activity';
import { provisionSite, resetInstance, roots, workspacePath } from './fixtures/instance';
import { caught, reasonOf, statusOf, sweepScratch } from './support/lead1b_contract';
import { type GatePolicy, lead1bPolicy, waitUntil } from './support/lead1b_host';

const ACTOR = { user_id: 7, username: 'delete-gate' };

beforeEach(resetInstance);
afterAll(resetInstance);

const hosts: GatePolicy[] = [];
afterEach(async () => {
  __setTestDriver('claude_code', null);
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  sweepScratch();
});

async function makeSite(slug: string): Promise<string> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name: slug, domain, actor: ACTOR, driver: 'claude_code' });
  return domain;
}

function driverRecordPath(slug: string): string {
  return join(roots.sitesRoot, DRIVER_RECORDS_DIR, `${slug}.json`);
}

/** Is anything at all at the workspace path — a site, or a husk? */
function standing(slug: string): boolean {
  try {
    lstatSync(workspacePath(slug));
    return true;
  } catch {
    return false;
  }
}

/** A driver whose turn runs until `release()`, and (optionally) whose admission parks until `admit()`. */
function gatedDriver(): {
  driver: AgentDriver;
  release: () => void;
  admit: () => void;
  parked: () => boolean;
  started: SessionStartOptions[];
} {
  let release: () => void = () => {};
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  let admit: () => void = () => {};
  const admitted = new Promise<void>(resolve => {
    admit = resolve;
  });
  let inAdmission = false;
  const started: SessionStartOptions[] = [];
  const driver: AgentDriver = {
    id: 'claude_code',
    capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
    async detect() {
      return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
    },
    async admit() {
      inAdmission = true;
      await admitted;
    },
    startTurn(start: SessionStartOptions): AgentProcess {
      started.push(start);
      const events = (async function* (): AsyncIterable<AgentEvent> {
        await released;
        yield { type: 'result', ok: true, resumeToken: 'resume-1', durationMs: 1 };
      })();
      return { pid: 0, events, async interrupt() {} };
    },
  };
  return { driver, release, admit, parked: () => inAdmission, started };
}

describe('deleteSite holds the site', () => {
  test('a DELETE during a running turn is 409 session_running and removes nothing; after the turn no husk stands, the delete succeeds, and the slug can be created again', async () => {
    const domain = await makeSite('busy');
    const gated = gatedDriver();
    gated.admit();
    __setTestDriver('claude_code', gated.driver);
    await startSession('busy', 'make a page');
    await waitUntil(() => gated.started.length === 1, 8_000, 'the turn to start');

    const refused = await caught(() => deleteSite('busy', false));
    const duringTurn = { site: siteExists('busy'), record: existsSync(driverRecordPath('busy')) };

    gated.release();
    await waitUntil(() => busyReason('busy') === null && getSessionState('busy').state !== 'running', 8_000, 'the turn to end');
    // The finding's state: a directory at the slug that is not a site.
    const husk = standing('busy') && !siteExists('busy');

    expect({ status: statusOf(refused), reason: reasonOf(refused), duringTurn, husk }).toEqual({
      status: 409,
      reason: 'session_running',
      duringTurn: { site: true, record: true },
      husk: false,
    });

    // Idle now: the delete goes through and leaves nothing behind…
    await deleteSite('busy', false);
    expect({ standing: standing('busy'), record: existsSync(driverRecordPath('busy')), busy: busyReason('busy') }).toEqual({
      standing: false,
      record: false,
      busy: null,
    });
    // …so the same slug is creatable again.
    const again = await caught(() => createSite({ slug: 'busy', name: 'busy again', domain, actor: ACTOR, driver: 'claude_code' }));
    expect({ status: statusOf(again), reason: reasonOf(again), exists: siteExists('busy') }).toEqual({
      status: null,
      reason: '',
      exists: true,
    });
  }, 30_000);

  test('every holder refuses a delete with its own reason, and the delete removes nothing', async () => {
    await makeSite('held');
    const kinds: Array<[ReservationKind, string]> = [
      ['turn', 'session_running'],
      ['build', 'build_running'],
      ['init', 'site_initializing'],
      ['recovery', 'site_recovering'],
      ['git', 'git_running'],
    ];
    const seen: Array<{ kind: string; status: number | null; reason: string; site: boolean; record: boolean }> = [];
    for (const [kind] of kinds) {
      expect(tryBegin('held', kind)).toBe(true);
      try {
        const refused = await caught(() => deleteSite('held', true));
        seen.push({
          kind,
          status: statusOf(refused),
          reason: reasonOf(refused),
          site: siteExists('held'),
          record: existsSync(driverRecordPath('held')),
        });
      } finally {
        end('held', kind);
      }
    }
    expect(seen).toEqual(kinds.map(([kind, reason]) => ({ kind, status: 409, reason, site: true, record: true })));
  }, 30_000);

  test('the delete holds site_deleting from its first synchronous step until the workspace and the driver record are gone, then releases', async () => {
    await makeSite('doomed');
    // Weight, so the removal takes many turns of the event loop.
    for (let i = 0; i < 200; i++) writeFileSync(workspacePath('doomed', `f${i}.txt`), 'x');
    let settled = false;
    const deleting = deleteSite('doomed', false).finally(() => {
      settled = true;
    });
    const atCall = busyReason('doomed');
    const violations: string[] = [];
    let polls = 0;
    while (!settled) {
      const leftovers = existsSync(workspacePath('doomed')) || existsSync(driverRecordPath('doomed'));
      const reason = busyReason('doomed');
      if (leftovers && reason !== 'site_deleting') violations.push(`leftovers while held by ${reason}`);
      polls++;
      await new Promise(resolve => setImmediate(resolve));
    }
    await deleting;
    expect({ atCall, violations, polledWhileRunning: polls > 1, after: busyReason('doomed'), standing: standing('doomed') }).toEqual({
      atCall: 'site_deleting',
      violations: [],
      polledWhileRunning: true,
      after: null,
      standing: false,
    });
  }, 30_000);

  test('a turn admitted while a delete completed is 404 under its hold, and re-creates nothing', async () => {
    await makeSite('raced');
    const gated = gatedDriver();
    __setTestDriver('claude_code', gated.driver);
    // The turn passes its existence check and parks in the driver's admission.
    const turn = caught(() => startSession('raced', 'make a page'));
    await waitUntil(gated.parked, 8_000, 'the turn to park in admission');
    await deleteSite('raced', false);
    gated.admit();
    gated.release();
    const refused = await turn;
    expect({
      status: statusOf(refused),
      standing: standing('raced'),
      turns: gated.started.length,
      busy: busyReason('raced'),
    }).toEqual({ status: 404, standing: false, turns: 0, busy: null });
  }, 30_000);

  test('a build admitted while a delete completed is 404 under its hold, and re-creates nothing', async () => {
    await makeSite('rebuilt');
    let entered = false;
    let open: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      open = resolve;
    });
    let real: GatePolicy | null = null;
    const host = await lead1bPolicy({
      identities: new Map([['rebuilt', 1]]),
      hostOverrides: {
        systemctl: async (args: readonly string[]) => {
          entered = true;
          await gate;
          return (real as GatePolicy).standIn.systemctl(args);
        },
      },
    });
    real = host;
    hosts.push(host);
    // The build passes its existence check and its surface check, and parks in admission.
    const build = caught(() => startBuild('rebuilt', host.policy as never));
    await waitUntil(() => entered, 8_000, 'the build to park in admission');
    await deleteSite('rebuilt', false);
    open();
    const refused = await build;
    expect({
      status: statusOf(refused),
      standing: standing('rebuilt'),
      connects: host.standIn.connects.length,
      busy: busyReason('rebuilt'),
    }).toEqual({ status: 404, standing: false, connects: 0, busy: null });
  }, 30_000);
});

describe('the session store never creates a workspace', () => {
  const SID = '00000000-0000-4000-8000-00000000d001';

  test('appendEvent and writeMeta on a slug with no workspace are refused and create nothing', async () => {
    const appended = await caught(() => appendEvent('ghost', SID, { type: 'turn_start', turn: 1, prompt: 'x' }));
    const written = await caught(() =>
      writeMeta({
        session_id: SID,
        slug: 'ghost',
        driver: 'claude_code',
        started_at: new Date().toISOString(),
        turns: 1,
        state: 'idle',
        resume_token: null,
      }),
    );
    expect({
      appended: appended instanceof tree.AbsentDirectoryError,
      written: written instanceof tree.AbsentDirectoryError,
      standing: standing('ghost'),
    }).toEqual({ appended: true, written: true, standing: false });
  });

  test('on an existing site the store still creates its own levels below the workspace (control)', async () => {
    await makeSite('kept');
    rmSync(workspacePath('kept', '.builder'), { recursive: true, force: true });
    await appendEvent('kept', SID, { type: 'turn_start', turn: 1, prompt: 'x' });
    expect({
      sessions: statSync(workspacePath('kept', '.builder', 'sessions')).mode & 0o7777,
      log: existsSync(workspacePath('kept', '.builder', 'sessions', `${SID}.jsonl`)),
    }).toEqual({ sessions: 0o700, log: true });
  });
});

describe('mkdirPrivate existingLevels — proves a prefix, never creates it', () => {
  async function inScratch(body: (dir: string) => Promise<void>): Promise<void> {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'existing-')));
    try {
      await body(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('an absent prefix is AbsentDirectoryError and nothing is made; a present one gets only its children', async () => {
    await inScratch(async dir => {
      const refused = await caught(() => tree.mkdirPrivate(dir, join('ws', '.builder', 'sessions'), { existingLevels: 1 }));
      const absent = { typed: refused instanceof tree.AbsentDirectoryError, made: existsSync(join(dir, 'ws')) };
      mkdirSync(join(dir, 'ws'), { mode: 0o755 });
      await tree.mkdirPrivate(dir, join('ws', '.builder', 'sessions'), { existingLevels: 1 });
      expect({
        absent,
        ws: statSync(join(dir, 'ws')).mode & 0o7777,
        sessions: statSync(join(dir, 'ws', '.builder', 'sessions')).mode & 0o7777,
      }).toEqual({ absent: { typed: true, made: false }, ws: 0o755, sessions: 0o700 });
    });
  });

  test('a link at the proved prefix is refused and nothing is created through it', async () => {
    await inScratch(async dir => {
      mkdirSync(join(dir, 'elsewhere'));
      symlinkSync(join(dir, 'elsewhere'), join(dir, 'ws'));
      const refused = await caught(() => tree.mkdirPrivate(dir, join('ws', '.builder'), { existingLevels: 1 }));
      expect({ planted: refused instanceof tree.PlantedSymlinkError, through: existsSync(join(dir, 'elsewhere', '.builder')) }).toEqual({
        planted: true,
        through: false,
      });
    });
  });
});

describe('the boot sweep sweeps sites, not husks', () => {
  test('a husk with an owed recovery is left untouched, and a real site’s owed recovery is still made', async () => {
    // What the old race left: <slug>/.builder/sessions/<id>.meta.json, recovery owed, no site.json.
    const huskId = '00000000-0000-4000-8000-00000000d002';
    const metaPath = workspacePath('husk', '.builder', 'sessions', `${huskId}.meta.json`);
    mkdirSync(workspacePath('husk', '.builder', 'sessions'), { recursive: true, mode: 0o700 });
    writeFileSync(
      metaPath,
      `${JSON.stringify({
        session_id: huskId,
        slug: 'husk',
        driver: 'claude_code',
        started_at: new Date().toISOString(),
        turns: 1,
        state: 'running',
        resume_token: null,
        recovery_pending: true,
      })}\n`,
      { mode: 0o600 },
    );
    const before = { body: readFileSync(metaPath, 'utf8'), ino: statSync(metaPath).ino };

    // Anti-vacuity: a real site with owed work in the same sweep.
    await makeSite('alive');
    const aliveId = '00000000-0000-4000-8000-00000000d003';
    await writeMeta({
      session_id: aliveId,
      slug: 'alive',
      driver: 'claude_code',
      started_at: new Date().toISOString(),
      turns: 1,
      state: 'idle',
      resume_token: null,
      recovery_pending: true,
    });
    writeFileSync(workspacePath('alive', 'OWED.txt'), 'uncommitted\n');

    await sweepOnBoot();

    const aliveMeta = await readMeta('alive', aliveId);
    expect({
      huskBody: readFileSync(metaPath, 'utf8') === before.body,
      huskIno: statSync(metaPath).ino === before.ino,
      huskLog: existsSync(workspacePath('husk', '.builder', 'sessions', `${huskId}.jsonl`)),
      aliveOwed: aliveMeta?.recovery_pending ?? 'absent',
    }).toEqual({ huskBody: true, huskIno: true, huskLog: false, aliveOwed: 'absent' });
  }, 30_000);
});
