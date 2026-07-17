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
 * The environment handed to Bun.spawn is exactly SessionStartOptions.env — the driver's
 * allowlist. No inheritance.
 */

import type { AgentEvent, AgentProcess, SessionStartOptions } from './types';

const INTERRUPT_GRACE_MS = 5000;

export interface TurnPlan {
  argv: string[];
  /** Maps one line of stdout to zero or more events. */
  parseLine: (line: string) => AgentEvent[];
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
): AgentProcess {
  const queue = new EventQueue();

  let child: ReturnType<typeof Bun.spawn> | null = null;
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

    try {
      child = Bun.spawn(plan.argv, {
        cwd: opts.workspace,
        env: opts.env,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });
    } catch (error) {
      queue.push({ type: 'error', message: `spawn failed: ${errText(error)}`, retriable: false });
      queue.close();
      return;
    }

    const timeout = setTimeout(() => {
      queue.push({ type: 'error', message: 'turn timed out', retriable: true });
      child?.kill(9);
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
      }
      // No child yet: the flag above stops the spawn path before it starts. Either way,
      // wait for the run to settle so the caller observes a terminated turn.
      await running;
    },
  };
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
