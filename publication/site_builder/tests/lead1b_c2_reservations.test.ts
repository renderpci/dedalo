/**
 * LEAD-1b G15 (commit C2) — createSite AND sweepOnBoot HOLD THE SITE WHILE THEIR GIT RUNS.
 *
 * Written BEFORE the implementation (audits/2026-09-26_full/LEAD-1b_SPEC.md §6); every row
 * is red on the pre-LEAD-1b HEAD, and says why.
 *
 * `createSite` takes an `init` reservation across `initRepo`, and `sweepOnBoot` a `recovery`
 * one across its commit: they were the only two paths that ran agent-authored git outside a
 * reservation — outside the lease that, under LEAD-1b, serializes a site's identity.
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
 * G15 — the two paths that ran git outside a reservation
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('G15 — createSite and sweepOnBoot hold the site while their git runs', () => {
  test('a turn asked for during initRepo is 409 site_initializing, and the reservation is released after', async () => {
    const { domain } = await provisionSite('racing');
    const started: SessionStartOptions[] = [];
    __setTestDriver('claude_code', recordingDriver(started));
    slowGit();
    const creating = createSite({ slug: 'racing', name: 'racing', domain, actor: ACTOR });
    // The manifest lands before initRepo: from then on the site EXISTS, and git is running.
    await waitUntil(() => siteExists('racing'), 8_000, 'the manifest to land');
    const during: string | null = busyReason('racing');
    const refused = await caught(() => startSession('racing', 'build me a page'));
    await creating;
    expect({ during, status: statusOf(refused), reason: reasonOf(refused), turns: started.length }).toEqual({
      during: 'site_initializing',
      status: 409,
      reason: 'site_initializing',
      turns: 0,
    });
    expect(busyReason('racing')).toBe(null);
  }, 30_000);

  test('sweepOnBoot commits a dead turn’s work under a recovery reservation', async () => {
    await makeSite('recovered');
    const sessionId = '00000000-0000-4000-8000-00000000b001';
    await writeMeta({
      session_id: sessionId,
      slug: 'recovered',
      driver: 'claude_code',
      started_at: new Date().toISOString(),
      turns: 1,
      state: 'running',
      resume_token: null,
    });
    writeFileSync(workspacePath('recovered', 'LEFT_BEHIND.txt'), 'uncommitted work\n');
    slowGit();
    const seen = new Set<string | null>();
    const reasonNow = (): string | null => busyReason('recovered');
    let done = false;
    const sweeping = sweepOnBoot().finally(() => {
      done = true;
    });
    while (!done) {
      seen.add(reasonNow());
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await sweeping;
    expect([...seen]).toContain('site_recovering');
    expect(busyReason('recovered')).toBe(null);
  }, 30_000);
});

