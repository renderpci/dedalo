/**
 * G-W2 — A TURN'S ERROR EVENT CARRIES A MACHINE REASON, NEVER THE DAEMON'S PROSE (WIRE-MAP, stream door).
 *
 * Before: every error a turn produced was an untyped sentence — `setup failed: <message>`,
 * `confinement refused: <message>`, the agent's stderr tail, `turn timed out` — pushed as
 * `{type:'error', message, retriable}` into the session's durable log and relayed byte-for-byte
 * to the browser. The machine `reason` the control door carries (`DAEMON_REASONS`) never reached
 * the stream, so the engine could not map a turn's refusal onto a registered code, and the
 * daemon's sentence (paths, uids, a CLI's stderr) became the browser's error text.
 *
 * After (outcomes, held here on the REAL supervisor `spawnAgentProcess`):
 *
 *   (a) every `DAEMON_REASONS` entry, raised by its REAL class in a turn's setup, becomes one
 *       error event whose `reason` IS that entry — with no `message` and none of the prose;
 *   (b) a setup throw that carries no reason is `turn_setup_failed`; a setup that outlives the
 *       deadline is `turn_timeout`; an interrupt before the start is `turn_interrupted`; an agent
 *       that exits non-zero is `turn_agent_exited` with its stderr as LABELLED `agent_output`
 *       (bounded at 500 characters), one killed by a signal is `turn_agent_killed`;
 *   (c) the control door: `problem()` emits a `reason` only when it is a daemon reason — a cast
 *       `zz_unknown` serializes with none.
 *
 * The reasons and their shapes are spelled HERE, not imported from the fix: a list that is only
 * compared with itself cannot be wrong.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { policyFromConfig, type ConfinementPolicy } from '../src/drivers/confinement';
import { spawnAgentProcess, type TurnPlan } from '../src/drivers/process';
import type { AgentEvent, SessionStartOptions } from '../src/drivers/types';
import * as daemonErrors from '../src/errors';
import { WebspaceError } from '../src/sites/site_table';
import { problem } from '../src/util/response';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** The daemon's prose — present in every thrown value, absent from every event. */
const SENTINEL = 'ZZ_DAEMON_PROSE_7f3a';

/** The turn faults the design adds (no daemon class raises them; the supervisor does). */
const TURN_FAULTS = ['turn_timeout', 'turn_interrupted', 'turn_setup_failed', 'turn_unit_lost', 'turn_agent_killed', 'turn_agent_exited', 'turn_failed'] as const;

const lists = daemonErrors as unknown as Record<string, readonly string[] | undefined>;
const DAEMON_REASONS: readonly string[] = lists.DAEMON_REASONS ?? [];

/** The value the daemon raises for one reason — its REAL class, as its throw sites do. */
function daemonThrowFor(reason: string): Error {
  const detail = `${SENTINEL} refused for ${reason}`;
  if (reason === 'webspace_unavailable') return new WebspaceError(detail);
  if (reason === 'confinement_unavailable') return new daemonErrors.ConfinementUnavailableError(detail);
  if (reason.startsWith('confinement.')) {
    return new daemonErrors.ConfinementRefusedError(reason.slice('confinement.'.length) as daemonErrors.ConfinementCode, detail);
  }
  if ((lists.LIMIT_REASONS ?? []).includes(reason)) return new daemonErrors.LimitExceededError(detail, reason as never);
  return new daemonErrors.ConflictError(detail, reason as never);
}

function nonePolicy(): ConfinementPolicy {
  return { ...policyFromConfig(), mode: 'none', agentStateRoot: scratchDir('turn-errors-state-') };
}

function options(timeoutMs = 10_000): SessionStartOptions {
  return {
    workspace: scratchDir('turn-errors-ws-'),
    prompt: 'go',
    mcp: { name: 'dedalo_publication', url: 'http://127.0.0.1:9/mcp' },
    env: { PATH: '/usr/bin:/bin' },
    timeoutMs,
  };
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

/** The ONE error event a turn ended with, as the session log would store it (loosely read: the fix's type is not HEAD's). */
function errorOf(events: AgentEvent[]): Record<string, unknown> {
  const errors = events.filter(event => event.type === 'error') as unknown as Array<Record<string, unknown>>;
  return errors.length === 1 ? (errors[0] as Record<string, unknown>) : { errors: errors.length };
}

/** What a reasoned error event must look like: the reason, a boolean retriable, no prose field. */
function shape(event: Record<string, unknown>): Record<string, unknown> {
  return {
    reason: event.reason ?? '(no reason)',
    retriable: typeof event.retriable,
    message: Object.hasOwn(event, 'message') ? 'present' : 'absent',
    prose: JSON.stringify(event).includes(SENTINEL) ? 'present' : 'absent',
  };
}

const plan = (argv: string[]): TurnPlan => ({ argv, parseLine: () => [] });

describe('G-W2 (a) — every daemon reason, raised by its real class in a turn’s setup, is the event’s reason', () => {
  test('the daemon exports its reason list (the census the stream door is gated over)', () => {
    expect(DAEMON_REASONS.length).toBeGreaterThan(20);
  });

  for (const reason of DAEMON_REASONS) {
    test(`'${reason}': one error event, reason '${reason}', no message, no prose`, async () => {
      const events = await drain(
        spawnAgentProcess(
          options(),
          async () => {
            throw daemonThrowFor(reason);
          },
          nonePolicy(),
        ).events,
      );
      expect({ reason, ...shape(errorOf(events)) } as Record<string, unknown>).toEqual({ reason, retriable: 'boolean', message: 'absent', prose: 'absent' });
    });
  }
});

describe('G-W2 (b) — the supervisor’s own faults are reasons too', () => {
  test('a setup throw with no reason (a plain Error) → turn_setup_failed, prose off the event', async () => {
    const events = await drain(
      spawnAgentProcess(
        options(),
        async () => {
          throw new Error(`${SENTINEL} EACCES /srv/secret/path`);
        },
        nonePolicy(),
      ).events,
    );
    expect(shape(errorOf(events))).toEqual({ reason: 'turn_setup_failed', retriable: 'boolean', message: 'absent', prose: 'absent' });
  });

  test('a setup that outlives the turn’s deadline → turn_timeout', async () => {
    const events = await drain(spawnAgentProcess(options(150), () => new Promise<TurnPlan>(() => {}), nonePolicy()).events);
    expect(shape(errorOf(events))).toEqual({ reason: 'turn_timeout', retriable: 'boolean', message: 'absent', prose: 'absent' });
  });

  test('an interrupt before the start → turn_interrupted', async () => {
    const proc = spawnAgentProcess(options(), () => new Promise<TurnPlan>(() => {}), nonePolicy());
    const drained = drain(proc.events);
    await proc.interrupt();
    expect(shape(errorOf(await drained))).toEqual({ reason: 'turn_interrupted', retriable: 'boolean', message: 'absent', prose: 'absent' });
  });

  test('an agent that exits non-zero → turn_agent_exited, its stderr as labelled, bounded agent_output', async () => {
    const tail = `${'x'.repeat(700)}AGENT_STDERR_TAIL`;
    const events = await drain(
      spawnAgentProcess(options(), async () => plan(['/bin/sh', '-c', `printf '%s' '${tail}' >&2; exit 3`]), nonePolicy()).events,
    );
    const event = errorOf(events);
    expect({ reason: event.reason ?? '(no reason)', retriable: event.retriable, message: Object.hasOwn(event, 'message') ? 'present' : 'absent' }).toEqual({
      reason: 'turn_agent_exited',
      retriable: false,
      message: 'absent',
    });
    const output = String(event.agent_output ?? '');
    expect({ labelled: output.endsWith('AGENT_STDERR_TAIL'), bounded: output.length <= 500 }).toEqual({ labelled: true, bounded: true });
  });

  test('an agent killed by a signal → turn_agent_killed', async () => {
    const events = await drain(spawnAgentProcess(options(), async () => plan(['/bin/sh', '-c', 'kill -9 $$']), nonePolicy()).events);
    expect(shape(errorOf(events))).toEqual({ reason: 'turn_agent_killed', retriable: 'boolean', message: 'absent', prose: 'absent' });
  });

  /** Every error event of a turn, as {reason}: a terminal fault is ONE error, never two. */
  const reasons = (events: AgentEvent[]) =>
    (events.filter(event => event.type === 'error') as unknown as Array<Record<string, unknown>>).map(event => ({
      ...shape(event),
    }));
  const one = (reason: string) => [{ reason, retriable: 'boolean', message: 'absent', prose: 'absent' }];

  test('a RUN that outlives the turn’s deadline → exactly ONE error, turn_timeout (never also the kill it caused)', async () => {
    // `exec`: the deadline's stop (SIGINT) reaches the sleeping agent itself, so it dies of a
    // signal — the exit that, without the one-terminal guard, would be a second error.
    const events = await drain(spawnAgentProcess(options(300), async () => plan(['/bin/sh', '-c', 'exec sleep 30']), nonePolicy()).events);
    expect(reasons(events)).toEqual(one('turn_timeout'));
  }, 15_000);

  test('an interrupt AFTER the agent started → exactly ONE error, turn_interrupted (not the signal death it caused)', async () => {
    const proc = spawnAgentProcess(options(), async () => plan(['/bin/sh', '-c', 'exec sleep 30']), nonePolicy());
    const events: AgentEvent[] = [];
    const drained = (async () => {
      for await (const event of proc.events) events.push(event);
    })();
    // Started: the declared-unconfined run announces itself before any output.
    const begun = Date.now();
    while (!events.some(event => event.type === 'text' && event.text.includes('[confinement]'))) {
      if (Date.now() - begun > 5_000) throw new Error('the run never started');
      await Bun.sleep(10);
    }
    await proc.interrupt();
    await drained;
    expect(reasons(events)).toEqual(one('turn_interrupted'));
  }, 15_000);

  test('a run whose output cannot be read (the line parser throws) → exactly ONE error, turn_failed, its prose in the log only', async () => {
    const events = await drain(
      spawnAgentProcess(
        options(),
        async () => ({
          argv: ['/bin/sh', '-c', 'echo one line'],
          parseLine: () => {
            throw new Error(`${SENTINEL} parser blew up at /srv/secret`);
          },
        }),
        nonePolicy(),
      ).events,
    );
    expect(reasons(events)).toEqual(one('turn_failed'));
  });

  test('a setup throw whose reason a CAST smuggled past the type (zz_unknown) → the step’s fallback, turn_setup_failed', async () => {
    const events = await drain(
      spawnAgentProcess(
        options(),
        async () => {
          throw new daemonErrors.ConflictError(SENTINEL, 'zz_unknown' as never);
        },
        nonePolicy(),
      ).events,
    );
    expect(reasons(events)).toEqual(one('turn_setup_failed'));
  });

  test('the turn faults are the design’s closed list (none is a daemon reason)', () => {
    for (const fault of TURN_FAULTS) expect({ fault, daemon: DAEMON_REASONS.includes(fault) }).toEqual({ fault, daemon: false });
  });
});

describe('G-W2 (c) — the control door emits a reason only when it is a daemon reason', () => {
  test('a cast zz_unknown reason serializes with NO reason; a real one keeps it', async () => {
    const unknown = await problem(new daemonErrors.ConflictError(`${SENTINEL} detail`, 'zz_unknown' as never)).json();
    expect({ reason: (unknown as Record<string, unknown>).reason ?? '(none)' }).toEqual({ reason: '(none)' });
    const known = await problem(new daemonErrors.ConflictError('detail', 'slug_exists')).json();
    expect((known as Record<string, unknown>).reason).toBe('slug_exists');
  });
});
