/**
 * SPAWN DISCIPLINE — the one place media binaries are executed.
 *
 * Every media transform shells out to an external binary (ImageMagick, ffmpeg,
 * pdftotext, …). PHP built shell strings and relied on escapeshellarg/cmd. This
 * rewrite uses `Bun.spawn` with ARGV ARRAYS and NO SHELL — arguments never
 * traverse a shell parser, so there is nothing to escape and injection is
 * structurally impossible (engineering/MEDIA_SPEC.md §5.3, categorically stronger than
 * PHP). No `sh -c`, no `.sh` files, no string interpolation of user values.
 *
 * `nice -n 19` is preserved (shared-host courtesy — the PHP server, the DB and
 * this process share the box). Outputs are written to a temp name and atomically
 * renamed by callers so a coexisting PHP reader never sees a partial derivative.
 */

import { existsSync } from 'node:fs';

/** Result of a spawned command. */
export interface SpawnResult {
	/** Process exit code (null when killed by signal/timeout). */
	exitCode: number | null;
	/** Captured stdout (utf-8). */
	stdout: string;
	/** Captured stderr (utf-8). */
	stderr: string;
	/** True when the command was killed by the timeout. */
	timedOut: boolean;
}

/** Options for a single spawn. */
export interface SpawnOptions {
	/** Milliseconds before the child is killed (default 10 min — long ffmpeg two-pass jobs). */
	timeoutMs?: number;
	/** Prefix the command with `nice -n 19` (default true; matches PHP). */
	nice?: boolean;
	/** Working directory. */
	cwd?: string;
	/** Called with each stdout chunk (for ffmpeg -progress streaming). */
	onStdout?: (chunk: string) => void;
	/** Extra environment variables merged OVER process.env (e.g. MAGICK_CONFIGURE_PATH). */
	env?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Run a binary with an argv array. `argv[0]` is the absolute binary path; the
 * rest are literal arguments (never shell-parsed). Returns the captured output.
 * Never throws on a non-zero exit — the caller inspects `exitCode`/`stderr`
 * (PHP's media commands treat non-zero exits as advisory, keying on output text).
 */
export async function runBinary(
	argv: readonly string[],
	options: SpawnOptions = {},
): Promise<SpawnResult> {
	if (argv.length === 0) {
		throw new Error('runBinary: empty argv');
	}
	// MEDIA-05 argument-as-flag guard: every media file arg is an ABSOLUTE path
	// under MEDIA_ROOT today, so a positional file never starts with '-'. If a
	// future caller ever passes a '-'-leading path that actually exists, a
	// converter would parse it as an OPTION (e.g. ImageMagick -write, ffmpeg -vf).
	// Real flags ('-density', '-i') do not exist as files, so this never fires for them.
	for (const token of argv.slice(1)) {
		if (token.startsWith('-') && existsSync(token)) {
			throw new Error(
				`runBinary: refusing a '-'-leading argv token that is an existing path (argument-injection guard): ${token}`,
			);
		}
	}
	const nice = options.nice ?? true;
	// `nice -n 19 <binary> <args…>` — nice is a real argv prefix, not a shell string.
	const finalArgv = nice ? ['nice', '-n', '19', ...argv] : [...argv];
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	// Subprocess env passthrough (allowlisted, config_env_tripwire S2-21): media
	// binaries inherit the whole env, plus any per-call overrides (MAGICK_CONFIGURE_PATH).
	const baseEnv = process.env as Record<string, string>;
	const child = Bun.spawn(finalArgv as string[], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: options.cwd,
		env: options.env !== undefined ? { ...baseEnv, ...options.env } : baseEnv,
	});

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill(9);
	}, timeoutMs);

	try {
		const stdoutPromise = options.onStdout
			? drainWithCallback(child.stdout as ReadableStream<Uint8Array>, options.onStdout)
			: readAll(child.stdout as ReadableStream<Uint8Array>);
		const stderrPromise = readAll(child.stderr as ReadableStream<Uint8Array>);
		const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
		const exitCode = await child.exited;
		return { exitCode, stdout, stderr, timedOut };
	} finally {
		clearTimeout(timer);
	}
}

/** Read a whole readable stream to a utf-8 string. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let out = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) out += decoder.decode(value, { stream: true });
	}
	out += decoder.decode();
	return out;
}

/** Read a stream, invoking `onChunk` per decoded chunk (progress), and return the whole. */
async function drainWithCallback(
	stream: ReadableStream<Uint8Array>,
	onChunk: (chunk: string) => void,
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
			onChunk(text);
		}
	}
	const tail = decoder.decode();
	if (tail) {
		out += tail;
		onChunk(tail);
	}
	return out;
}
