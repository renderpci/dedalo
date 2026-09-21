/**
 * SPAWN DISCIPLINE — the one place this daemon executes an external binary.
 *
 * Adapted from src/core/media/engine/spawn.ts (the engine's rule): `Bun.spawn` with
 * ARGV ARRAYS and NO SHELL — arguments never traverse a shell parser, so there is
 * nothing to escape and injection is structurally impossible. No `sh -c`, no `.sh`
 * files, no string interpolation of user values. git, rsync, bun and the agent CLIs are
 * all invoked this way.
 *
 * Two differences from the media version, both deliberate for this service:
 *   - The child environment is CONSTRUCTED, never inherited. A build or agent child
 *     gets exactly the keys the caller passes (drivers/build build a tight allowlist);
 *     spreading process.env would hand a coding agent this daemon's SERVICE_TOKEN and
 *     LLM keys. `env` here REPLACES the environment rather than merging over it.
 *   - No `nice` prefix — the site host is not the shared media box.
 */

import { resolve, sep } from 'node:path';
import { config } from '../config';

/**
 * THE TOKEN THAT SAYS "THIS ARGV WAS ALREADY CONFINED".
 *
 * A command whose working directory is inside a SITE WORKSPACE is a command over
 * agent-authored bytes: a build spec the turn rewrote, a `package.json` whose lifecycle
 * scripts `bun install` executes, a `.git` a turn can replace hooks and filters in. Running
 * one as the DAEMON hands text a language model wrote the daemon's uid — which is PUB-01
 * verbatim, one door over from the turn the confinement already closed.
 *
 * So the rule is enforced HERE, at the one place a process is created, rather than asserted
 * about call sites: `runBinary` REFUSES a cwd inside `SITES_ROOT` unless the caller carries
 * this token, and the only module that has it is `drivers/confinement.ts` (`runConfined`),
 * which obtains it by wrapping the argv under the agent uid first. A new call site cannot
 * forget the rule; it can only fail loudly at the first run.
 */
export const CONFINED_ARGV: unique symbol = Symbol('runBinary: argv already confined');

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SpawnOptions {
  /** Milliseconds before the child is killed (SIGKILL). Required — no silent default. */
  timeoutMs: number;
  /** Working directory for the child. */
  cwd?: string;
  /**
   * The child's COMPLETE environment. Not merged with process.env — what you pass is
   * all the child sees. Omit for an empty environment (rare; most children need PATH).
   */
  env?: Record<string, string>;
  /** Called with each decoded stdout chunk (line-oriented agent stream parsing). */
  onStdout?: (chunk: string) => void;
  /** Called with each decoded stderr chunk. */
  onStderr?: (chunk: string) => void;
  /**
   * Proof that this argv is already wrapped by `drivers/confinement.ts`. Required — and
   * only accepted — for a cwd inside a site workspace. Never pass it from anywhere else:
   * the token is what makes the confinement a door rather than a convention.
   */
  confined?: typeof CONFINED_ARGV;
}

/**
 * Run a binary with an argv array. `argv[0]` is the binary (name resolved via the
 * child's PATH, or an absolute path); the rest are literal arguments, never
 * shell-parsed. Never throws on non-zero exit — the caller inspects
 * `exitCode`/`stderr`.
 */
export async function runBinary(argv: readonly string[], options: SpawnOptions): Promise<SpawnResult> {
  if (argv.length === 0) {
    throw new Error('runBinary: empty argv');
  }
  assertConfinedInsideWorkspaces(argv, options);

  const child = Bun.spawn(argv as string[], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    cwd: options.cwd,
    // A constructed environment, or none. This is the secrets boundary.
    env: options.env ?? {},
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill(9);
  }, options.timeoutMs);

  try {
    const [stdout, stderr] = await Promise.all([
      drain(child.stdout as ReadableStream<Uint8Array>, options.onStdout),
      drain(child.stderr as ReadableStream<Uint8Array>, options.onStderr),
    ]);
    const exitCode = await child.exited;
    return { exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A COMMAND THAT RUNS IN A SITE WORKSPACE RUNS AS THE AGENT, OR IT DOES NOT RUN.
 *
 * The check is on the RESOLVED path, so `…/workspaces/../workspaces/site-a` and a relative
 * cwd are the same question. It refuses rather than confines here on purpose: this module
 * must not import the confinement (the confinement imports it), and a spawn silently
 * rewritten under another uid would be a worse surprise than a loud stop.
 */
function assertConfinedInsideWorkspaces(argv: readonly string[], options: SpawnOptions): void {
  if (options.confined === CONFINED_ARGV) return;
  if (!options.cwd) return;
  const cwd = resolve(options.cwd);
  const root = resolve(config.SITES_ROOT);
  if (cwd !== root && !cwd.startsWith(root + sep)) return;
  throw new Error(
    `runBinary: '${argv[0]}' would run in '${cwd}', inside the site workspaces, as this ` +
      `daemon's own uid. Everything under that root is agent-authored — a build spec, a ` +
      `package script, a git hook — so it goes through runConfined() (drivers/confinement.ts), ` +
      `which runs it as the agent uid under this museum's transient-unit grant. Nothing was ` +
      `spawned.`,
  );
}

/** Read a stream to a utf-8 string, invoking `onChunk` per decoded chunk if given. */
async function drain(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const text = decoder.decode(value, { stream: true });
      out += text;
      onChunk?.(text);
    }
  }
  const tail = decoder.decode();
  if (tail) {
    out += tail;
    onChunk?.(tail);
  }
  return out;
}
