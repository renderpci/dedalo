/**
 * LEAD-1b G13 + G14 (config half) + G19 (commit C4) — HOME IS THE UNIT’S; THE RETIRED KEYS
 * REFUSE; A RESUME TOKEN FROM THE OLD IDENTITY IS DROPPED.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * G13 — the spec frames the three real call sites send (turn, build, git) carry no HOME; the
 *   unit fixes it. Replaces the spelling gate at `agent_boundary.test.ts:71-79`.
 * G14 — AGENT_USER, SYSTEMD_RUN_BIN and AGENT_HOME are RETIRED with a loud refusal (the
 *   AGENT_EGRESS_ALLOW precedent), and a malformed AGENT_IDENTITIES does not boot.
 * G19 — a resume token stored under another identity epoch is DROPPED, with a typed event:
 *   the agent's state now lives in a different HOME, owned by a different uid.
 *
 * Written red-first against 75ccb35a38 (the pre-LEAD-1b HEAD); parked as `.gate.ts` until
 * the implementation it gates landed, and renamed into the suite by that same change.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, resolveConfig } from '../src/config';
import { __setTestDriver } from '../src/drivers/registry';
import type { AgentDriver, AgentEvent, AgentProcess, SessionStartOptions } from '../src/drivers/types';
import { buildStartOptions, getSessionState, sendMessage, startSession, sweepOnBoot } from '../src/sessions/manager';
import { readMeta, replayEvents, writeMeta } from '../src/sessions/store';
import { createSite, siteExists } from '../src/sites/workspace';
import { busyReason, endTurn, tryBeginTurn } from '../src/workspace_activity';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { caught, reasonOf, shortScratch, statusOf, sweepScratch } from './support/lead1b_contract';
import { type GatePolicy, lead1bPolicy, waitUntil } from './support/lead1b_host';

const ACTOR = { user_id: 7, username: 'lead1b-gate' };

beforeEach(resetInstance);
afterAll(resetInstance);

const hosts: GatePolicy[] = [];
const PATH_BEFORE = process.env.PATH;
afterEach(async () => {
  process.env.PATH = PATH_BEFORE;
  __setTestDriver('claude_code', null);
  for (const host of hosts.splice(0)) {
    host.standIn.release();
    await host.standIn.close();
  }
  sweepScratch();
});

async function makeSite(slug: string): Promise<void> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name: slug, domain, actor: ACTOR });
}

/** A `git` that is the real one, slowed down — the window in which a reservation must be held. */
function slowGit(delaySeconds = 0.3): void {
  const dir = shortScratch('git');
  const real = ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'].find(candidate => existsSync(candidate));
  writeFileSync(join(dir, 'git'), `#!/bin/sh\nsleep ${delaySeconds}\nexec ${real ?? 'git'} "$@"\n`);
  chmodSync(join(dir, 'git'), 0o755);
  process.env.PATH = `${dir}:${PATH_BEFORE ?? '/usr/bin:/bin'}`;
}

/** A driver that records what each turn was started with, and answers with a resume token. */
function recordingDriver(started: SessionStartOptions[], token = 'resume-new'): AgentDriver {
  return {
    id: 'claude_code',
    capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
    async detect() {
      return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
    },
    startTurn(start: SessionStartOptions): AgentProcess {
      started.push(start);
      const events = (async function* (): AsyncIterable<AgentEvent> {
        yield { type: 'result', ok: true, resumeToken: token, durationMs: 1 };
      })();
      return { pid: 0, events, async interrupt() {} };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * G13 — HOME is the unit's
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G13 — no caller hands a run its HOME; the unit fixes it', () => {
  test('the turn’s start options carry no HOME, in either confinement mode', () => {
    for (const mode of ['systemd_scope', 'none'] as const) {
      const env = buildStartOptions('alpha', 'claude_code', 'hello', undefined, mode).env;
      expect({ mode, hasHome: 'HOME' in env }).toEqual({ mode, hasHome: false });
    }
  });

  test('the spec frames the three real call sites send (turn, build, git) carry no HOME', async () => {
    await makeSite('alpha');
    const host = await lead1bPolicy({ identities: new Map([['alpha', 1]]) });
    hosts.push(host);
    const policy = host.policy;

    // git — the door every commit goes through.
    const { commitAll } = await import('../src/sites/git');
    await (commitAll as (slug: string, message: string, policy: unknown) => Promise<boolean>)('alpha', 'gate commit', policy).catch(() => false);

    // build — the detached pipeline, through its public entry.
    const { startBuild } = await import('../src/build/builder');
    await (startBuild as (slug: string, policy: unknown) => Promise<unknown>)('alpha', policy).catch(() => null);
    await waitUntil(() => host.standIn.specs.some(entry => entry.door === 'build'), 8_000, 'a build spec').catch(() => {});
    await waitUntil(() => busyReason('alpha') === null, 15_000, 'the build to end').catch(() => {});

    // turn — through the supervisor, with the reservation a real turn holds.
    const { spawnAgentProcess } = await import('../src/drivers/process');
    expect(tryBeginTurn('alpha')).toBe(true);
    try {
      const options = { ...buildStartOptions('alpha', 'claude_code', 'hi', undefined, 'systemd_scope'), slug: 'alpha' } as SessionStartOptions;
      const proc = (spawnAgentProcess as (o: unknown, s: () => Promise<unknown>, p: unknown) => AgentProcess)(
        options,
        async () => ({ argv: ['claude', '-p', 'hi'], parseLine: () => [] }),
        policy,
      );
      for await (const _event of proc.events) {
        // drain
      }
    } finally {
      endTurn('alpha');
    }

    const doors = new Set(host.standIn.specs.map(entry => entry.door));
    expect([...doors].sort()).toEqual(['build', 'git', 'turn']);
    const withHome = host.standIn.specs.filter(entry => entry.spec?.env && 'HOME' in entry.spec.env).map(entry => entry.door);
    expect(withHome).toEqual([]);
  }, 60_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G14 — the configuration
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G14 — the retired keys refuse loudly; AGENT_IDENTITIES must parse', () => {
  function envFile(values: Record<string, string>): string {
    const dir = shortScratch('cfg');
    const path = join(dir, 'site.env');
    writeFileSync(path, `${Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n')}\n`);
    return path;
  }

  /** The smallest LEAD-1b env that resolves: roots, table, the new agent keys — no retired ones. */
  function base(patch: Record<string, string> = {}): Record<string, string> {
    return {
      DEDALO_SITE_INSTANCE: 'gate',
      SERVICE_TOKEN: 'x'.repeat(40),
      SITES_ROOT: '/srv/gate/workspaces',
      AUDIT_DIR: '/srv/gate/audit',
      WEBSPACE_BASE: '/srv/gate/webspaces',
      SITE_TABLE_FILE: '/srv/gate/config/sites.json',
      PUBLICATION_API_URL: 'http://127.0.0.1:3100/publication/server_api/v2',
      AGENT_CONFINEMENT: 'systemd_scope',
      AGENT_UNIT_PREFIX: 'dedalo-site-gate-agent-',
      AGENT_IDENTITIES: '{"alpha":1,"beta":2}',
      AGENT_SOCKET_DIR: '/run/dedalo-sites/gate-agents',
      AGENT_STATE_ROOT: '/srv/gate/agents',
      SYSTEMCTL_BIN: '/usr/bin/systemctl',
      AGENT_IDENTITY_EPOCH: '1',
      GIT_TIMEOUT_MS: '30000',
      ...patch,
    };
  }

  const resolve = (values: Record<string, string>) => resolveConfig({ envFilePath: envFile(values), ambient: {}, credentialsDir: null });

  /** What resolving `values` says: 'resolved', or the refusal's text. */
  const verdict = (values: Record<string, string>): string => {
    try {
      resolve(values);
      return 'resolved';
    } catch (error) {
      return String((error as Error).message);
    }
  };

  test('control: the LEAD-1b env (no AGENT_USER, no SYSTEMD_RUN_BIN, no AGENT_HOME) resolves', () => {
    const resolved = resolve(base());
    expect({
      identities: JSON.stringify((resolved.config as Record<string, unknown>).AGENT_IDENTITIES),
      epoch: Number((resolved.config as Record<string, unknown>).AGENT_IDENTITY_EPOCH),
    }).toEqual({ identities: expect.stringContaining('alpha'), epoch: 1 });
  });

  for (const [key, value] of [
    ['AGENT_USER', 'dedalo-agent-gate'],
    ['SYSTEMD_RUN_BIN', '/usr/bin/systemd-run'],
    ['AGENT_HOME', '/srv/gate/home'],
  ] as const) {
    test(`${key} is retired: a non-empty value stops the daemon at parse, naming what replaced it`, () => {
      // The control first: without the key the same env resolves, so the refusal is THE KEY's.
      expect(verdict(base())).toBe('resolved');
      const refused = verdict(base({ [key]: value }));
      expect(refused).toContain(key);
      expect(refused).toMatch(/retired/i);
      expect(refused).toContain('AGENT_IDENTITIES');
    });
  }

  for (const [what, value] of [
    ['not JSON', 'alpha=1'],
    ['an ordinal of 0', '{"alpha":0}'],
    ['an ordinal over 999', '{"alpha":1000}'],
    ['two sites on one ordinal', '{"alpha":1,"beta":1}'],
    ['a slug outside the grammar', '{"Not A Slug":1}'],
    ['a non-integer ordinal', '{"alpha":1.5}'],
  ] as const) {
    test(`AGENT_IDENTITIES refused: ${what}`, () => {
      expect(verdict(base())).toBe('resolved');
      expect(verdict(base({ AGENT_IDENTITIES: value }))).toContain('AGENT_IDENTITIES');
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G19 — the resume epoch
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G19 — a resume token from another identity epoch is dropped, with a typed event', () => {
  test('stamped on the session; kept under the same epoch; dropped (and said) under another', async () => {
    const current = (config as Record<string, unknown>).AGENT_IDENTITY_EPOCH;
    expect({ epochIsConfigured: typeof current === 'number' || (typeof current === 'string' && current !== '') }).toEqual({ epochIsConfigured: true });
    const epoch = Number(current);

    await makeSite('resumer');
    const started: SessionStartOptions[] = [];
    __setTestDriver('claude_code', recordingDriver(started, 'resume-1'));
    const { session_id } = await startSession('resumer', 'first');
    await waitUntil(() => getSessionState('resumer').state !== 'running', 8_000, 'turn 1 to end');
    const stamped = (await readMeta('resumer', session_id)) as unknown as Record<string, unknown>;
    expect({ epoch: stamped.identity_epoch, token: stamped.resume_token }).toEqual({ epoch, token: 'resume-1' });

    // Same epoch: the token is used.
    await sendMessage(session_id, 'second');
    await waitUntil(() => started.length === 2 && getSessionState('resumer').state !== 'running', 8_000, 'turn 2 to end');
    expect(started[1]?.resumeToken).toBe('resume-1');

    // Another epoch (the identity was migrated since the token was minted): dropped.
    const meta = (await readMeta('resumer', session_id)) as unknown as Record<string, unknown>;
    await writeMeta({ ...meta, identity_epoch: epoch + 1, resume_token: 'resume-from-the-old-uid' } as never);
    await sendMessage(session_id, 'third');
    await waitUntil(() => started.length === 3 && getSessionState('resumer').state !== 'running', 8_000, 'turn 3 to end');
    const events = await replayEvents('resumer', session_id, -1);
    const after = (await readMeta('resumer', session_id)) as unknown as Record<string, unknown>;
    expect({
      resumedWith: started[2]?.resumeToken,
      event: events.map(event => event.body as Record<string, unknown>).find(body => body.type === 'resume_unavailable'),
      epoch: after.identity_epoch,
      keptOldToken: after.resume_token === 'resume-from-the-old-uid',
    }).toEqual({
      resumedWith: undefined,
      event: { type: 'resume_unavailable', reason: 'agent identity migrated' },
      epoch,
      keptOldToken: false,
    });
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G19 — the owner-decided ONE-TIME reset: a pre-LEAD-1b session (no epoch at all)
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G19 — a session from before LEAD-1b (no identity_epoch) resumes nothing', () => {
  test('its token is dropped, resume_unavailable persisted, and the meta re-stamped with the current epoch', async () => {
    const epoch = Number((config as Record<string, unknown>).AGENT_IDENTITY_EPOCH);
    // The reset only means something where the epoch has moved off zero — as every LEAD-1b env has.
    expect(epoch).toBeGreaterThanOrEqual(1);
    await makeSite('legacy');
    const started: SessionStartOptions[] = [];
    __setTestDriver('claude_code', recordingDriver(started, 'resume-new'));
    const { session_id } = await startSession('legacy', 'first');
    await waitUntil(() => getSessionState('legacy').state !== 'running', 8_000, 'turn 1 to end');
    // What a pre-LEAD-1b daemon wrote: a token minted by the shared agent uid, and no epoch field.
    const meta = { ...((await readMeta('legacy', session_id)) as unknown as Record<string, unknown>) };
    delete meta.identity_epoch;
    await writeMeta({ ...meta, resume_token: 'resume-from-the-shared-agent' } as never);
    expect('identity_epoch' in ((await readMeta('legacy', session_id)) as unknown as Record<string, unknown>)).toBe(false);

    await sendMessage(session_id, 'second');
    await waitUntil(() => started.length === 2 && getSessionState('legacy').state !== 'running', 8_000, 'turn 2 to end');
    const events = await replayEvents('legacy', session_id, -1);
    const after = (await readMeta('legacy', session_id)) as unknown as Record<string, unknown>;
    expect({
      resumedWith: started[1]?.resumeToken,
      event: events.map(event => event.body as Record<string, unknown>).find(body => body.type === 'resume_unavailable'),
      epoch: after.identity_epoch,
      keptOldToken: after.resume_token === 'resume-from-the-shared-agent',
    }).toEqual({
      resumedWith: undefined,
      event: { type: 'resume_unavailable', reason: 'agent identity migrated' },
      epoch,
      keptOldToken: false,
    });
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * G14 — the SITE's own admission is asked before anything is reserved
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G14 — a site that cannot run is refused BEFORE its reservation (503, nothing reserved, nothing written)', () => {
  /** A host that CAN confine a turn (its driver's provider is named): what is refused is the SITE. */
  const TURNABLE = { egressFacts: { driver: 'claude_code', providerHosts: ['api.anthropic.com'], registryHosts: ['registry.npmjs.org'] } };

  async function refusedBefore(slug: string, host: GatePolicy, code: string, entry: 'session' | 'build'): Promise<void> {
    const { startBuild } = await import('../src/build/builder');
    const attempt =
      entry === 'session'
        ? () => startSession(slug, 'hello', undefined, host.policy as never)
        : () => (startBuild as (s: string, p: unknown) => Promise<unknown>)(slug, host.policy);
    const refused = await caught(attempt);
    expect({ entry, status: statusOf(refused), reason: reasonOf(refused), busy: busyReason(slug), connects: host.standIn.connects.length }).toEqual({
      entry,
      status: 503,
      reason: `confinement.${code}`,
      busy: null,
      connects: 0,
    });
  }

  test('create: a site the provisioner declared but this daemon has no identity for (apply ran, no restart yet) → identity_missing, and NO workspace ever appears', async () => {
    const { domain } = await provisionSite('fresh');
    const host = await lead1bPolicy({ identities: new Map([['someone-else', 1]]), overrides: TURNABLE });
    hosts.push(host);
    // Watch the workspace for the whole call, not only after it: a scaffold rolled back by
    // `rm -rf` leaves the same empty result as a refusal that wrote nothing.
    let appeared = false;
    const watcher = setInterval(() => {
      if (existsSync(workspacePath('fresh'))) appeared = true;
    }, 1);
    slowGit(0.3);
    let refused: unknown;
    try {
      refused = await caught(() => createSite({ slug: 'fresh', name: 'fresh', domain, actor: ACTOR }, host.policy as never));
    } finally {
      clearInterval(watcher);
    }
    expect({
      status: statusOf(refused),
      reason: reasonOf(refused),
      busy: busyReason('fresh'),
      exists: siteExists('fresh') || existsSync(workspacePath('fresh')),
      appeared,
      connects: host.standIn.connects.length,
    }).toEqual({ status: 503, reason: 'confinement.identity_missing', busy: null, exists: false, appeared: false, connects: 0 });
  });

  for (const entry of ['session', 'build'] as const) {
    test(`${entry}: a declared site missing from AGENT_IDENTITIES → identity_missing`, async () => {
      await makeSite('orphan');
      const host = await lead1bPolicy({ identities: new Map([['someone-else', 1]]), overrides: TURNABLE });
      hosts.push(host);
      await refusedBefore('orphan', host, 'identity_missing', entry);
    });

    test(`${entry}: a site whose identity is quarantined → identity_quarantined`, async () => {
      await makeSite('stuck');
      const host = await lead1bPolicy({ identities: new Map([['stuck', 1]]), overrides: TURNABLE });
      hosts.push(host);
      // A run PID 1 cannot kill keeps the quarantine standing while the request is made.
      host.standIn.plantLive(1, 'git', { stubborn: true });
      const { quarantine } = await import('../src/drivers/confinement');
      quarantine(host.policy as never, 1, 'a gate planted a run that will not die');
      await refusedBefore('stuck', host, 'identity_quarantined', entry);
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * SHUTDOWN — a turn whose commit the stopping daemon refused is recovered at the next boot
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('shutdown — a turn ending while the daemon stops: its commit is refused (no connect), and the next boot commits it', () => {
  const TURNABLE = { egressFacts: { driver: 'claude_code', providerHosts: ['api.anthropic.com'], registryHosts: ['registry.npmjs.org'] } };

  test('recovery_pending is set by the refused commit, and cleared by sweepOnBoot’s recovery commit — which records the work', async () => {
    const { spawnSync } = await import('node:child_process');
    const { stopOpeningRuns } = await import('../src/drivers/confinement');
    await makeSite('stopper');
    const host = await lead1bPolicy({ identities: new Map([['stopper', 1]]), overrides: TURNABLE });
    hosts.push(host);
    let finish: () => void = () => {};
    const ended = new Promise<void>(resolveEnded => {
      finish = resolveEnded;
    });
    __setTestDriver('claude_code', {
      ...recordingDriver([]),
      startTurn(): AgentProcess {
        const events = (async function* (): AsyncIterable<AgentEvent> {
          await ended;
          yield { type: 'result', ok: true, resumeToken: 'resume-x', durationMs: 1 };
        })();
        return { pid: 0, events, async interrupt() {} };
      },
    });
    const { session_id } = await startSession('stopper', 'write a page', undefined, host.policy as never);
    // The agent writes; then SIGTERM lands before its turn ends.
    writeFileSync(join(workspacePath('stopper'), 'recovered.html'), '<p>work</p>\n');
    stopOpeningRuns(host.policy as never);
    finish();
    await waitUntil(() => getSessionState('stopper').state !== 'running', 8_000, 'the turn to end');
    const marked = (await readMeta('stopper', session_id)) as unknown as Record<string, unknown>;
    expect({ pending: marked.recovery_pending, gitConnects: host.standIn.connects.length }).toEqual({ pending: true, gitConnects: 0 });

    // The next boot (this suite's daemon: declared unconfined, the real git).
    await sweepOnBoot();
    const after = (await readMeta('stopper', session_id)) as unknown as Record<string, unknown>;
    const git = (...args: string[]) => String(spawnSync('git', args, { cwd: workspacePath('stopper'), encoding: 'utf8' }).stdout).trim();
    expect({
      pending: 'recovery_pending' in after,
      state: after.state,
      subject: git('log', '-1', '--format=%s'),
      committed: git('ls-files', 'recovered.html'),
      clean: git('status', '--porcelain', '--', 'recovered.html'),
    }).toEqual({
      pending: false,
      state: marked.state,
      subject: `agent: recovered after restart (session ${session_id})`,
      committed: 'recovered.html',
      clean: '',
    });
  }, 30_000);
});
