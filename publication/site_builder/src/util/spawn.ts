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
