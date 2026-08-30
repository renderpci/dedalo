import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { provisionSite, resetInstance, workspacePath } from './fixtures/instance';
import { createSite } from '../src/sites/workspace';
import { __setTestDriver } from '../src/drivers/registry';
import { startSession, sendMessage, stopSession, getSessionState } from '../src/sessions/manager';
import { sessionEventStream } from '../src/sessions/sse';
import { readMeta, listSessions } from '../src/sessions/store';
import { startBuild, getBuild } from '../src/build/builder';
import { readManifest, writeManifest } from '../src/sites/manifest';
import type { AgentDriver, AgentEvent, AgentProcess, SessionStartOptions } from '../src/drivers/types';
import type { StoredEvent } from '../src/sessions/events';
import { config } from '../src/config';
import { LimitExceededError } from '../src/errors';

const ACTOR = { user_id: 9, username: 'agent-tester' };

/** A site with both halves in place: a provisioned webspace and a created workspace. */
async function makeSite(slug: string, name: string): Promise<void> {
  const { domain } = await provisionSite(slug);
  await createSite({ slug, name, domain, actor: ACTOR });
}

/** Polls `predicate` until true or the timeout elapses. */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition never met');
    await new Promise(r => setTimeout(r, 15));
  }
}

beforeEach(resetInstance);
afterEach(async () => {
  __setTestDriver('claude_code', null);
  await resetInstance();
});

/** A fake driver that writes a file into the workspace then emits a scripted stream. */
function fakeDriver(script: AgentEvent[], opts?: { writeFile?: { name: string; content: string }; hang?: boolean }): AgentDriver {
  return {
    id: 'claude_code',
    capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
    async detect() {
      return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
    },
    startTurn(start: SessionStartOptions): AgentProcess {
      let interrupted = false;
      const events = (async function* (): AsyncIterable<AgentEvent> {
        if (opts?.writeFile) {
          await writeFile(join(start.workspace, opts.writeFile.name), opts.writeFile.content, 'utf8');
        }
        for (const event of script) {
          if (interrupted) return;
          yield event;
        }
        if (opts?.hang) {
          // Simulate a long-running turn until interrupted.
          while (!interrupted) await new Promise(r => setTimeout(r, 10));
        }
      })();
      return {
        pid: 4242,
        events,
        async interrupt() {
          interrupted = true;
        },
      };
    },
  };
}

/** Reads an SSE Response body to completion, returning the parsed StoredEvents. */
async function collectStream(res: Response): Promise<StoredEvent[]> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: StoredEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)) as StoredEvent);
          } catch {
            // heartbeat/comment or the event:error frame — skip for this assertion
          }
        }
      }
    }
  }
  return events;
}

describe('session flow', () => {
  test('a turn streams events, persists them, commits the workspace and updates meta', async () => {
    await makeSite('flow', 'Flow');
    __setTestDriver(
      'claude_code',
      fakeDriver(
        [
          { type: 'text', text: 'Adding an index page.' },
          { type: 'tool', name: 'Write', summary: 'Write: index.html' },
          { type: 'result', ok: true, resumeToken: 'resume-1', durationMs: 1000 },
        ],
        { writeFile: { name: 'NEW_PAGE.txt', content: 'hello' } },
      ),
    );

    const { session_id } = await startSession('flow', 'build an index page');
    const events = await collectStream(sessionEventStream('flow', session_id, -1));

    const bodies = events.map(e => e.body);
    expect(bodies[0]).toMatchObject({ type: 'turn_start', turn: 1 });
    expect(bodies).toContainEqual({ type: 'text', text: 'Adding an index page.' });
    expect(bodies.some(b => b.type === 'file_change')).toBe(true); // git backstop
    expect(bodies.some(b => b.type === 'result')).toBe(true);
    expect(bodies.at(-1)).toMatchObject({ type: 'turn_end', state: 'idle' });

    // seq is monotonic across the log.
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }

    // Meta records the completed turn and the resume token.
    const meta = await readMeta('flow', session_id);
    expect(meta?.state).toBe('idle');
    expect(meta?.turns).toBe(1);
    expect(meta?.resume_token).toBe('resume-1');

    // The agent's file was committed (working tree clean afterwards).
    expect(existsSync(workspacePath('flow', 'NEW_PAGE.txt'))).toBe(true);
    expect(getSessionState('flow').state).toBe('idle');
  });

  test('a follow-up message runs a second turn with the resume token', async () => {
    await makeSite('multi', 'Multi');
    __setTestDriver(
      'claude_code',
      fakeDriver([{ type: 'result', ok: true, resumeToken: 'r1', durationMs: 1 }]),
    );
    const { session_id } = await startSession('multi', 'first');
    await collectStream(sessionEventStream('multi', session_id, -1));

    // Second turn.
    __setTestDriver(
      'claude_code',
      fakeDriver([{ type: 'text', text: 'second turn' }, { type: 'result', ok: true, resumeToken: 'r2', durationMs: 1 }]),
    );
    await sendMessage(session_id, 'now add a footer');
    const events = await collectStream(sessionEventStream('multi', session_id, -1));

    // Replay from -1 returns BOTH turns' events.
    const turnStarts = events.filter(e => e.body.type === 'turn_start');
    expect(turnStarts.length).toBe(2);
    const meta = await readMeta('multi', session_id);
    expect(meta?.turns).toBe(2);
    expect(meta?.resume_token).toBe('r2');
  });

  test('two concurrent starts on the same site: the second is a conflict', async () => {
    await makeSite('lock', 'Lock');
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }], { hang: true }));

    const first = await startSession('lock', 'go');
    expect(first.session_id).toBeTruthy();
    // While the first hangs, a second start must be refused.
    await expect(startSession('lock', 'again')).rejects.toThrow();

    // stopSession only REQUESTS the interrupt: the wind-down (interrupt → git commit →
    // writeMeta → persist turn_end) continues asynchronously. Without this poll the turn
    // outlives the test and races afterEach's rm -rf, so it writes into a deleted
    // workspace — ENOENT on the .meta.json.tmp, logged by the manager's guarded catch
    // (seen on CI 2026-08-14). Worse than the noise: the wind-down can land DURING a
    // later test, releasing a global slot and mutating running-state bookkeeping the
    // mutual-exclusion tests below assert on. Settle it here, as the two tests below do.
    await stopSession(first.session_id);
    await waitFor(() => getSessionState('lock').state !== 'running');
  });

  test('stop interrupts a running turn and marks it done', async () => {
    await makeSite('stoppable', 'Stoppable');
    __setTestDriver('claude_code', fakeDriver([{ type: 'text', text: 'working…' }], { hang: true }));

    const { session_id } = await startSession('stoppable', 'long task');
    await waitFor(() => getSessionState('stoppable').state === 'running');
    expect(getSessionState('stoppable').state).toBe('running');

    await stopSession(session_id);
    // The turn wind-down (interrupt → git commit → finalize) is not instantaneous; poll.
    await waitFor(() => getSessionState('stoppable').state !== 'running');
    expect(getSessionState('stoppable').state).toBe('interrupted');

    const sessions = await listSessions('stoppable');
    expect(sessions.length).toBe(1);
  });

  test('replaying a finished session with after=0 returns history and closes', async () => {
    await makeSite('replay', 'Replay');
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }]));
    const { session_id } = await startSession('replay', 'quick');
    await collectStream(sessionEventStream('replay', session_id, -1));

    // A fresh reader after completion still gets the full history and the stream ends.
    const events = await collectStream(sessionEventStream('replay', session_id, -1));
    expect(events.some(e => e.body.type === 'turn_start')).toBe(true);
    expect(events.at(-1)?.body.type).toBe('turn_end');
  });
});

describe('workspace mutual exclusion (turns vs builds)', () => {
  test('a build is refused while an agent turn is running', async () => {
    await makeSite('excl-a', 'Excl A');
    __setTestDriver('claude_code', fakeDriver([{ type: 'text', text: 'working…' }], { hang: true }));

    const { session_id } = await startSession('excl-a', 'go');
    await waitFor(() => getSessionState('excl-a').state === 'running');

    await expect(startBuild('excl-a')).rejects.toThrow(/session is running/);

    await stopSession(session_id);
    await waitFor(() => getSessionState('excl-a').state !== 'running');
  });

  test('an agent turn is refused while a build is running, and allowed after it settles', async () => {
    await makeSite('excl-b', 'Excl B');
    // A build slow enough to hold the reservation while we try to start a session.
    const manifest = await readManifest('excl-b');
    manifest.build = { install: 'sleep 1', build: 'true', output: 'src' };
    await writeManifest(manifest);

    const { build_id } = await startBuild('excl-b');
    await expect(startSession('excl-b', 'while building')).rejects.toThrow(/build is running/);

    // Once the build settles the reservation is released and a session may start.
    const start = Date.now();
    for (;;) {
      const record = await getBuild('excl-b', build_id);
      if (record && record.outcome !== 'running') break;
      if (Date.now() - start > 8000) throw new Error('build never settled');
      await new Promise(r => setTimeout(r, 25));
    }
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }]));
    const { session_id } = await startSession('excl-b', 'after build');
    expect(session_id).toBeTruthy();
    await collectStream(sessionEventStream('excl-b', session_id, -1));
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * THE FOUR THINGS THAT BOUND A TURN
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Each of these was stated in `src/sessions/manager.ts` and held by nothing — disarming any
 * one of them left the suite green:
 *
 *   - the FOLLOW-UP path's reservation ("same synchronous reservation as startSession
 *     (cross-exclusive with builds)"). The exclusion block above covers `startSession`
 *     only, so a `sendMessage` landing during a build raced the working tree the build was
 *     reading.
 *   - the GLOBAL cap ("at most MAX_CONCURRENT_SESSIONS turns across all sites") — the only
 *     thing bounding fleet-wide provider spend and process pressure.
 *   - the 32 KiB PROMPT cap.
 *   - the PRE-TURN QUOTA gate ("a turn that cannot be published is not a turn worth
 *     starting").
 */
describe('what a turn is bounded by', () => {
  test('a FOLLOW-UP message is refused while a build is running, exactly like a start', async () => {
    await makeSite('followup', 'Follow Up');
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }]));
    const { session_id } = await startSession('followup', 'first turn');
    await waitFor(() => getSessionState('followup').state !== 'running');

    // A build slow enough to still hold the reservation when the follow-up arrives.
    const manifest = await readManifest('followup');
    manifest.build = { install: 'sleep 1', build: 'true', output: 'src' };
    await writeManifest(manifest);
    const { build_id } = await startBuild('followup');

    await expect(sendMessage(session_id, 'a second turn, mid-build')).rejects.toThrow(
      /build is running/,
    );

    const start = Date.now();
    for (;;) {
      const record = await getBuild('followup', build_id);
      if (record && record.outcome !== 'running') break;
      if (Date.now() - start > 8000) throw new Error('build never settled');
      await new Promise(r => setTimeout(r, 25));
    }
  });

  test('a follow-up is refused while THIS site already has a turn running', async () => {
    await makeSite('followup-b', 'Follow Up B');
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }]));
    const { session_id } = await startSession('followup-b', 'first');
    await waitFor(() => getSessionState('followup-b').state !== 'running');

    __setTestDriver('claude_code', fakeDriver([{ type: 'text', text: 'working…' }], { hang: true }));
    const second = sendMessage(session_id, 'second');
    await waitFor(() => getSessionState('followup-b').state === 'running');

    await expect(sendMessage(session_id, 'third, while the second runs')).rejects.toThrow(
      /turn is already running/,
    );

    await stopSession(session_id);
    await waitFor(() => getSessionState('followup-b').state !== 'running');
    await second;
  });

  test('the global cap bounds turns ACROSS sites, not just within one', async () => {
    // The per-site reservation cannot see this: every site here is a different one, so only
    // the fleet-wide semaphore can refuse. The cap is read from the config rather than
    // spelled, so the test states the rule and not a number.
    const cap = config.MAX_CONCURRENT_SESSIONS;
    const slugs = Array.from({ length: cap + 1 }, (_, i) => `capped-${i}`);
    for (const slug of slugs) await makeSite(slug, slug);
    __setTestDriver('claude_code', fakeDriver([{ type: 'text', text: 'working…' }], { hang: true }));

    const started: string[] = [];
    try {
      for (let i = 0; i < cap; i++) {
        const { session_id } = await startSession(slugs[i] as string, 'go');
        started.push(session_id);
        await waitFor(() => getSessionState(slugs[i] as string).state === 'running');
      }

      await expect(startSession(slugs[cap] as string, 'one too many')).rejects.toThrow(
        /Too many concurrent sessions/,
      );
      // And the refusal did not leave the extra site reserved: it is free once a slot is.
      expect(getSessionState(slugs[cap] as string).state).not.toBe('running');
    } finally {
      for (const id of started) await stopSession(id).catch(() => undefined);
      for (const slug of slugs) {
        await waitFor(() => getSessionState(slug).state !== 'running').catch(() => undefined);
      }
    }
  });

  test('a prompt over 32 KiB is refused before anything is reserved or spawned', async () => {
    await makeSite('verbose', 'Verbose');
    let sawTurn = false;
    __setTestDriver('claude_code', {
      id: 'claude_code',
      capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
      async detect() {
        return { id: 'claude_code', binPath: 'fake', version: '1.0.0' };
      },
      startTurn() {
        sawTurn = true;
        throw new Error('the driver must never be reached');
      },
    });

    await expect(startSession('verbose', 'x'.repeat(32 * 1024 + 1))).rejects.toThrow(/32 KiB/);
    expect(sawTurn).toBe(false);
    // The site is not left reserved by a refusal.
    expect(getSessionState('verbose').state).not.toBe('running');
    // And one byte under the cap is NOT refused for its size — otherwise this test would
    // pass against a `validatePrompt` that refused everything.
    await startSession('verbose', 'x'.repeat(32 * 1024));
    await waitFor(() => sawTurn);
  });

  test('a site already over its disk quota gets no turn at all', async () => {
    // "A turn that cannot be published is not a turn worth starting" — and the releases are
    // the half of a site's footprint a museum cannot see.
    await makeSite('bloated', 'Bloated');
    __setTestDriver('claude_code', fakeDriver([{ type: 'result', ok: true, durationMs: 1 }]));
    await writeFile(
      join(workspacePath('bloated'), 'huge.bin'),
      'x'.repeat((config.SITE_DISK_QUOTA_MB + 2) * 1024 * 1024),
      'utf8',
    );

    await expect(startSession('bloated', 'go')).rejects.toThrow(LimitExceededError);
    expect(getSessionState('bloated').state).not.toBe('running');
  });
});
