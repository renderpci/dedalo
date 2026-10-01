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
 * AND NOTHING HERE SPAWNS ANYTHING. Every turn goes through `confineTurn()`
 * (./confinement.ts), which decides what the turn runs AS and hands back one `ConfinedChild`
 * to consume: an instance of the unit root rendered for the turn's SITE (its own identity, its
 * own network namespace whose only way out is the site's egress gate, its own caps), relayed
 * over the connection the daemon made to the site's socket — or, only where the daemon was
 * explicitly configured `AGENT_CONFINEMENT=none`, a plain child of this daemon that ANNOUNCES
 * itself into the session's durable log. There is no third possibility and no silent
 * fallback: a host that cannot confine refuses the turn.
 */

import { confineTurn, RunAbortedError, type ConfinedChild, type ConfinementPolicy } from './confinement';
import type { AgentEvent, AgentProcess, SessionStartOptions } from './types';

export interface TurnPlan {
  argv: string[];
  /** Maps one line of stdout to zero or more events. */
  parseLine: (line: string) => AgentEvent[];
  /**
   * What the driver's setup left on disk that must not outlive the turn.
   *
   * Every driver writes an MCP configuration into the agent's own working tree, and every
   * one of them used to leave it there. Under `systemd_scope` it no longer carries the
   * museum's Publication API key (the egress gate adds that on the daemon's side); under a
   * declared `none` it still does. The turn needs the file; nothing after the turn does.
   * Run on EVERY exit path, success, failure, timeout and interrupt alike.
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

  let confined: ConfinedChild | null = null;
  let started = false;
  let sawResult = false;
  // An interrupt can land BEFORE the run has opened (setup — writing the MCP config — is
  // async). Record the request so the open path can honor it immediately; otherwise a
  // stop in that window would be silently lost and the agent would run to completion.
  let interruptRequested = false;
  // Reaches INTO confineTurn: an interrupt landing while it opens the gate starts nothing.
  const abort = new AbortController();

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

    // THE CONFINEMENT DECISION, BEFORE THE RUN EXISTS. A refusal here (no identity, a site
    // still busy, a unit PID 1 loaded differently) is a normalized error event and NOT a turn
    // that ran as this daemon: the whole point of the setting is that it has no degraded mode.
    // The run's egress gate opens inside confineTurn() and is closed by `confined.cleanup()`
    // on every path below — or by confineTurn() itself when it refuses after opening it.
    try {
      confined = await confineTurn(
        {
          door: 'turn',
          slug: opts.slug,
          argv: plan.argv,
          cwd: opts.workspace,
          env: opts.env,
          timeoutMs: opts.timeoutMs,
          driver: opts.driver,
          mcpUpstream: opts.mcpUpstream,
          // A blocked host is a line in the session's own durable log, never a silent hang.
          onEgress: line => queue.push({ type: 'text', text: line }),
          signal: abort.signal,
        },
        // The seam first (a gate stating its host), then the policy the manager CHECKED this
        // turn against — never a third, fresh read of the config between the two.
        policy ?? opts.confinement,
      );
    } catch (error) {
      if (error instanceof RunAbortedError) {
        queue.push({ type: 'error', message: 'interrupted before start', retriable: true });
        await runCleanup(plan);
        queue.close();
        return;
      }
      queue.push({ type: 'error', message: `confinement refused: ${errText(error)}`, retriable: false });
      await runCleanup(plan);
      queue.close();
      return;
    }

    // A turn that is NOT confined says so, in the session's own durable log, before it
    // produces a single line of output. An unconfined run is a fact in the audit or it is
    // nothing at all.
    // Interrupted WHILE confineTurn ran (it opens the gate and writes the env file — several
    // awaits): there is still no child for interrupt() to kill, so a stop landing here would
    // otherwise be lost and the whole turn would run. Undo what confineTurn opened; spawn nothing.
    if (interruptRequested) {
      queue.push({ type: 'error', message: 'interrupted before start', retriable: true });
      await teardown(confined, plan, queue);
      return;
    }

    if (confined.announcement) queue.push({ type: 'text', text: confined.announcement });
    started = true;
    const run = confined;

    const timeout = setTimeout(() => {
      queue.push({ type: 'error', message: 'turn timed out', retriable: true });
      // Awaited inside: the run is ended through the connection AND PID 1 (RuntimeMaxSec is
      // the backstop behind both, for the case this process is gone too).
      void run.stop();
    }, opts.timeoutMs);

    const stderrChunks: string[] = [];
    try {
      await Promise.all([
        readLines(run.stdout, line => {
          for (const event of plan.parseLine(line)) {
            if (event.type === 'result') sawResult = true;
            queue.push(event);
          }
        }),
        readAll(run.stderr, chunk => stderrChunks.push(chunk)),
      ]);
      const exit = await run.exited;
      const exitCode = exit.exitCode;

      if (exit.failure && !sawResult) {
        // No status of record: never a success, whatever was printed.
        queue.push({ type: 'error', message: `the turn's unit ended without an exit status (${exit.failure})`, retriable: true });
      } else if (exitCode !== 0 && !sawResult) {
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
      // The run's gate and its site's run slot go here, on every path — including the
      // timeout above and the interrupt below.
      await teardown(confined, plan, queue);
    }
  })();

  return {
    get pid(): number {
      return confined?.pid ?? -1;
    },
    events: queue,
    async interrupt(): Promise<void> {
      interruptRequested = true;
      abort.abort();
      // A confined turn is a unit PID 1 owns: stop() ends it through its connection and asks
      // PID 1 too (the rule's stop grant); a declared-unconfined child gets SIGINT, then
      // SIGKILL after a grace. Awaited either way.
      if (started && confined) await confined.stop().catch(() => {});
      // Not started yet: the flag above stops the open path before it starts. Either way,
      // wait for the run to settle so the caller observes a terminated turn.
      await running;
    },
  };
}

/**
 * EVERYTHING A TURN OPENED, UNDONE — each step on its own. The gate's close can reject (an
 * unlink the host refuses), and a rejection here used to skip the driver's cleanup and
 * `queue.close()`: the manager's `for await` never ended and the session sat in 'running'.
 * A gate that did not close is a line in the session's own log, never a silence.
 */
async function teardown(confined: ConfinedChild | null, plan: TurnPlan, queue: EventQueue): Promise<void> {
  try {
    await confined?.cleanup();
  } catch (error) {
    queue.push({
      type: 'text',
      text: `[egress] this run's egress gate did not close cleanly (${errText(error)}); its per-run directory may remain under the daemon's runtime directory.`,
    });
    console.error('[agent] a turn egress gate failed to close:', error);
  }
  await runCleanup(plan);
  queue.close();
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
async function readLines(stream: AsyncIterable<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const value of stream) {
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
async function readAll(stream: AsyncIterable<Uint8Array>, onChunk: (chunk: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  for await (const value of stream) {
    if (value) onChunk(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}
