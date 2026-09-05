/**
 * Shared agent-process supervision — the one place a driver's CLI is spawned and its
 * output turned into the normalized AgentEvent stream.
 *
 * Every driver differs only in two things: the argv it wants run, and how it maps a line
 * of that command's stdout to AgentEvents. spawnAgentProcess takes exactly those (via a
 * setup thunk) and handles everything common: line-buffering stdout, pushing parsed
 * events onto an async queue the session manager consumes, synthesizing a terminal
 * result/error, and interrupt() (SIGINT then SIGKILL). The git-derived file_change
 * backstop lives in the manager (runTurn), alongside the commit, so it applies uniformly
 * to every driver.
 *
 * The environment handed to the turn is exactly SessionStartOptions.env — the driver's
 * allowlist. No inheritance.
 *
 * AND NOTHING HERE SPAWNS A DRIVER'S ARGV DIRECTLY. Every turn goes through
 * `confineTurn()` (./confinement.ts), which decides what the turn runs AS: a transient
 * systemd unit under the agent's own uid, with its own egress policy and its own caps, or —
 * only where the daemon was explicitly configured `AGENT_CONFINEMENT=none` — a plain child
 * of this daemon that ANNOUNCES itself into the session's durable log. There is no third
 * possibility and no silent fallback: a host that cannot confine refuses the turn.
 */

import { confineTurn, type ConfinedTurn, type ConfinementPolicy } from './confinement';
import type { AgentEvent, AgentProcess, SessionStartOptions } from './types';

const INTERRUPT_GRACE_MS = 5000;

export interface TurnPlan {
  argv: string[];
  /** Maps one line of stdout to zero or more events. */
  parseLine: (line: string) => AgentEvent[];
  /**
   * What the driver's setup left on disk that must not outlive the turn.
   *
   * Every driver writes an MCP configuration carrying the museum's Publication API key into
   * the agent's own working tree, and every one of them used to leave it there — a
   * credential resident, in a directory an agent writes to, from the first turn until
   * somebody deleted the site. The turn needs it; nothing after the turn does. Run on EVERY
   * exit path, success, failure, timeout and interrupt alike.
   */
  cleanup?: () => Promise<void>;
}

/**
 * An async queue: producers push, a single consumer awaits via the async iterator. Closed
 * exactly once; after close the iterator drains buffered items then ends.
 */
class EventQueue implements AsyncIterable<AgentEvent> {
  private buffer: AgentEvent[] = [];
  private resolvers: Array<(r: IteratorResult<AgentEvent>) => void> = [];
  private closed = false;

  /**
   * Deliver an event. If a consumer is already parked in `next()`, hand it over
   * directly; otherwise buffer it for the next `next()` call. A push after close is
   * dropped — the terminal result/error has already been emitted.
   */
  push(event: AgentEvent): void {
    if (this.closed) return;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value: event, done: false });
    else this.buffer.push(event);
  }

  /**
   * Signal end-of-stream. Idempotent (only the first call takes effect), so the spawn
   * flow can close in its `finally` without guarding against a double close. Any parked
   * consumers are resolved `done`; buffered events already handed out stay drainable.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.resolvers) resolve({ value: undefined, done: true });
    this.resolvers = [];
  }

  /**
   * The single-consumer async iterator. Serves a buffered event immediately, ends if the
   * queue is already closed and drained, otherwise parks a resolver until the next push
   * or close. Buffered events are always drained before `done` is reported, so no event
   * emitted before close is lost.
   */
  [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    return {
      next: (): Promise<IteratorResult<AgentEvent>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift() as AgentEvent, done: false });
        }
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise(resolve => this.resolvers.push(resolve));
      },
    };
  }
}

/**
 * Spawn one agent turn and expose it as an AgentProcess. `setup` is the per-driver thunk
 * that (possibly after writing an MCP config) returns the argv and line parser; running it
 * inside the async body means a setup failure surfaces as a normalized `error` event, not a
 * throw the manager cannot see. The supervisor guarantees the stream always terminates with
 * exactly one result or error: a non-zero exit with no result seen becomes an `error`
 * (retriable when killed by signal/timeout, i.e. exitCode === null), and a clean exit that
 * emitted no terminal frame gets a synthesized `result` — so the manager's `for await` never
 * hangs waiting for a terminal event the driver forgot to print.
 */
export function spawnAgentProcess(
  opts: SessionStartOptions,
  setup: () => Promise<TurnPlan>,
  /**
   * The confinement policy, defaulted to this daemon's own.
   *
   * A parameter for one reason: the CONFINED path cannot run on a machine without systemd,
   * and a supervisor that read the policy for itself could only ever be exercised in the mode
   * the suite's host happens to be in. With the seam, the gate spawns a real turn through a
   * stand-in runner and observes what this function does around it — the per-turn secret file
   * created and then removed, the wrapper argv actually spawned — instead of describing it.
   */
  policy?: ConfinementPolicy,
): AgentProcess {
  const queue = new EventQueue();

  let child: ReturnType<typeof Bun.spawn> | null = null;
  let confined: ConfinedTurn | null = null;
  let sawResult = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  // An interrupt can land BEFORE Bun.spawn has run (setup — writing the MCP config — is
  // async). Record the request so the spawn path can honor it immediately; otherwise a
  // stop in that window would be silently lost and the agent would run to completion.
  let interruptRequested = false;

  // Kicked off immediately; the returned AgentProcess exposes the live queue.
  const running = (async () => {
    let plan: TurnPlan;
    try {
      plan = await setup();
    } catch (error) {
      queue.push({ type: 'error', message: `setup failed: ${errText(error)}`, retriable: false });
      queue.close();
      return;
    }

    // Interrupted while setup ran: do not spawn at all.
    if (interruptRequested) {
      queue.push({ type: 'error', message: 'interrupted before start', retriable: true });
      queue.close();
      return;
    }

    // THE CONFINEMENT DECISION, BEFORE ANY BYTE IS SPAWNED. A refusal here (no runner, no
    // agent uid, no runtime directory) is a normalized error event and NOT a turn that ran
    // as this daemon: the whole point of the setting is that it has no degraded mode.
    try {
      confined = await confineTurn(
        {
          argv: plan.argv,
          cwd: opts.workspace,
          env: opts.env,
          timeoutMs: opts.timeoutMs,
        },
        policy,
      );
    } catch (error) {
      queue.push({ type: 'error', message: `confinement refused: ${errText(error)}`, retriable: false });
      await runCleanup(plan);
      queue.close();
      return;
    }

    // A turn that is NOT confined says so, in the session's own durable log, before it
    // produces a single line of output. An unconfined run is a fact in the audit or it is
    // nothing at all.
    if (confined.announcement) queue.push({ type: 'text', text: confined.announcement });

    try {
      child = Bun.spawn(confined.argv, {
        cwd: opts.workspace,
        env: confined.env,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });
    } catch (error) {
      queue.push({ type: 'error', message: `spawn failed: ${errText(error)}`, retriable: false });
      await confined.cleanup();
      await runCleanup(plan);
      queue.close();
      return;
    }

    const timeout = setTimeout(() => {
      queue.push({ type: 'error', message: 'turn timed out', retriable: true });
      child?.kill(9);
      // Killing the client does not kill a transient unit; PID 1 owns it. (Its own
      // RuntimeMaxSec is the backstop behind this, for the case this process is gone too.)
      confined?.stop();
    }, opts.timeoutMs);

    const stderrChunks: string[] = [];
    try {
      await Promise.all([
        readLines(child.stdout as ReadableStream<Uint8Array>, line => {
          for (const event of plan.parseLine(line)) {
            if (event.type === 'result') sawResult = true;
            queue.push(event);
          }
        }),
        readAll(child.stderr as ReadableStream<Uint8Array>, chunk => stderrChunks.push(chunk)),
      ]);
      const exitCode = await child.exited;

      if (exitCode !== 0 && !sawResult) {
        queue.push({
          type: 'error',
          message: stderrChunks.join('').trim().slice(-500) || `agent exited ${exitCode}`,
          retriable: exitCode === null, // killed by signal/timeout → retriable
        });
      } else if (!sawResult) {
        // Clean exit but the driver never emitted a terminal result — synthesize one.
        queue.push({ type: 'result', ok: true, durationMs: 0 });
      }
    } catch (error) {
      queue.push({ type: 'error', message: errText(error), retriable: true });
    } finally {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      // The per-turn credential residence goes away here, on every path — including the
      // timeout above and the interrupt below, which are the two paths a `rm` written after
      // the read loop would never reach.
      await confined?.cleanup();
      await runCleanup(plan);
      queue.close();
    }
  })();

  return {
    get pid(): number {
      return child?.pid ?? -1;
    },
    events: queue,
    async interrupt(): Promise<void> {
      interruptRequested = true;
      if (child) {
        child.kill('SIGINT');
        // Escalate if it does not exit on its own.
        killTimer = setTimeout(() => child?.kill(9), INTERRUPT_GRACE_MS);
        // A confined turn is not this child — it is a unit PID 1 owns, and killing the
        // client that is waiting on it does not stop it. Ask PID 1, through the same grant
        // that started it.
        confined?.stop();
      }
      // No child yet: the flag above stops the spawn path before it starts. Either way,
      // wait for the run to settle so the caller observes a terminated turn.
      await running;
    },
  };
}

/** The driver's own teardown. A failing cleanup must never fail the turn it belongs to. */
async function runCleanup(plan: TurnPlan): Promise<void> {
  if (!plan.cleanup) return;
  try {
    await plan.cleanup();
  } catch (error) {
    console.error('[agent] a turn cleanup failed; a per-turn credential may be resident:', error);
  }
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads a byte stream, splitting into lines, invoking onLine per complete line. */
async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.length > 0) onLine(buffer);
}

/** Reads a byte stream to exhaustion, decoding each chunk (used to capture stderr). */
async function readAll(stream: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}
