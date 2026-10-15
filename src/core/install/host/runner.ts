/**
 * THE ONE SPAWNER OF THE HOST STEPS (terminal installer phase 4, 2026-10-12) —
 * every command a host step runs goes through a CommandRunner, and nothing
 * under host/ spawns otherwise (model: publication/host_agent/src/exec.ts).
 *
 *  - ABSOLUTE BINARIES ONLY: argv[0] comes from the OS row's closed binary
 *    table (os_support.ts) or a path this install placed; the runner refuses a
 *    relative argv[0] — nothing is ever looked up on PATH.
 *  - A FIXED ENVIRONMENT: PATH, LANG, LC_ALL and HOME only (plus what the
 *    command names explicitly, e.g. DEBIAN_FRONTEND). The operator's
 *    environment — every DEDALO_INSTALL_* secret included — never reaches a
 *    child.
 *  - SECRETS ON STDIN, NEVER ARGV (a command's argv is printed on the Review and
 *    logged; stdin is not).
 *  - BOUNDED: output capped per stream, a timeout per command (SIGKILL), every
 *    child registered in the run's child set so ctrl+c stops apt, dnf and
 *    certbot too (the executor kills the set on SIGINT/SIGTERM).
 *  - REDACTED: every supplied secret is masked in what comes back.
 *
 * THE RECORDING RUNNER (gates, the scratch drill): answers each argv from a
 * response table — first matching prefix wins; a response may require an
 * earlier command in the log (`after`), which is how a scratch run's verify
 * sees the effect of its own run (`getent passwd ded_x` fails until `useradd`
 * ran) — and appends every request to a log. Armed in a subprocess by
 * DEDALO_INSTALL_HOST_ROOT (host/scratch.ts), injected directly in-process.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { Subprocess } from 'bun';
import { redactSecrets } from '../run_files_core.ts';
import { hostRefuse } from './refuse.ts';

export interface RunRequest {
	/** argv[0] absolute; a `runuser -u <user> --` prefix is already in it (host/execute.ts). */
	readonly argv: readonly string[];
	/** Text written to stdin (secrets travel only here). */
	readonly stdin?: string;
	readonly cwd?: string;
	/** Extra environment entries (never a secret). */
	readonly env?: Readonly<Record<string, string>>;
	readonly timeoutMs?: number;
	/** Called with each stdout line as it arrives (the engine child's event stream). */
	readonly onStdoutLine?: (line: string) => void;
	/** Called with each stderr line as it arrives (a BuildKit build's progress). */
	readonly onStderrLine?: (line: string) => void;
}

export interface RunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export interface CommandRunner {
	run(request: RunRequest): Promise<RunResult>;
}

/** The environment every child gets (and nothing else from this process). */
export const FIXED_CHILD_ENV: Readonly<Record<string, string>> = Object.freeze({
	PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
	LANG: 'C.UTF-8',
	LC_ALL: 'C.UTF-8',
	HOME: '/root',
});

/** Per-stream cap: an `nginx -T` of a busy host fits; a runaway child does not. */
export const OUTPUT_CAP_BYTES = 4 * 1024 * 1024;

/** The default bound of one command (a package transaction can be long). */
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** argv[0] must be absolute: the runner never searches PATH. */
function assertAbsolute(argv: readonly string[]): void {
	if (!isAbsolute(argv[0] ?? '')) {
		hostRefuse(
			'install.step_failed',
			`host command '${argv[0] ?? ''}' is not an absolute path — the installer never searches PATH`,
		);
	}
}

/** Splits arriving text into complete lines for a listener (the tail kept until it ends). */
function lineSplitter(onLine: ((line: string) => void) | undefined): {
	push(piece: string): void;
	end(): void;
} {
	let pending = '';
	return {
		push: (piece) => {
			if (onLine === undefined) return;
			const lines = (pending + piece).split('\n');
			pending = lines.pop() ?? '';
			for (const line of lines) onLine(line);
		},
		end: () => {
			if (onLine !== undefined && pending !== '') onLine(pending);
		},
	};
}

/** A stream read to text, capped; each complete line handed to `onLine`. */
async function readCapped(
	stream: ReadableStream<Uint8Array>,
	onLine?: (line: string) => void,
): Promise<string> {
	const decoder = new TextDecoder();
	const lines = lineSplitter(onLine);
	let text = '';
	for await (const chunk of stream) {
		const piece = decoder.decode(chunk, { stream: true });
		if (text.length < OUTPUT_CAP_BYTES) text += piece.slice(0, OUTPUT_CAP_BYTES - text.length);
		lines.push(piece);
	}
	lines.end();
	return text;
}

/** The child's environment: the fixed one plus the command's own entries. */
function childEnv(request: RunRequest): Record<string, string> {
	return { ...FIXED_CHILD_ENV, ...(request.env ?? {}) };
}

/** Write stdin (if any) and close it. */
function feedStdin(child: Subprocess<'pipe', 'pipe', 'pipe'>, text: string | undefined): void {
	if (text !== undefined) child.stdin.write(text);
	child.stdin.end();
}

/**
 * THE REAL RUNNER: Bun.spawn, async (the front end stays responsive to
 * ctrl+c), every child in `children` while it lives.
 */
export function systemRunner(options: {
	children: Set<Subprocess>;
	redactions: () => readonly string[];
}): CommandRunner {
	return {
		run: async (request) => {
			assertAbsolute(request.argv);
			const child = Bun.spawn([...request.argv], {
				cwd: request.cwd ?? '/',
				env: childEnv(request),
				stdin: 'pipe',
				stdout: 'pipe',
				stderr: 'pipe',
			});
			options.children.add(child);
			feedStdin(child, request.stdin);
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill('SIGKILL');
			}, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
			try {
				const [stdout, stderr, exitCode] = await Promise.all([
					readCapped(child.stdout, request.onStdoutLine),
					readCapped(child.stderr, request.onStderrLine),
					child.exited,
				]);
				const secrets = options.redactions();
				return {
					exitCode,
					stdout: redactSecrets(stdout, secrets),
					stderr: redactSecrets(stderr, secrets),
					timedOut,
				};
			} finally {
				clearTimeout(timer);
				options.children.delete(child);
			}
		},
	};
}

// ── the recording runner ─────────────────────────────────────────────────────

/** One canned answer of the recording runner. */
export interface RecordedResponse {
	/** The joined argv must START with this. */
	match: string;
	/** Applies only once a logged command started with this (the effect of an earlier run). */
	after?: string;
	/** Applies only while NO logged command started with this (the effect is undone). */
	until?: string;
	/**
	 * Applies only once a logged command EQUALED this — for a command whose argv
	 * is a prefix of a probe's (psql's CREATE on stdin vs its `-c SELECT` probes),
	 * which `after` cannot tell apart.
	 */
	afterExact?: string;
	/**
	 * Applies only while this HOST path exists (scratch root) — a command whose
	 * real counterpart reads a file (a2ensite refuses a site that is not written).
	 */
	whenPath?: string;
	/** Applies only once `match` itself was logged at least this many times before (a retried probe). */
	afterCount?: number;
	exit?: number;
	stdout?: string;
	stderr?: string;
	/** The command was killed at its timeout (a registry that never answers — C3i-F2). */
	timedOut?: boolean;
	/**
	 * Host paths the command "creates" (scratch root only): a path ending in `/`
	 * becomes a directory, any other an empty file — how a scratch run's verify
	 * sees a real command's effect on the filesystem (`tar -x` → package.json).
	 */
	creates?: (string | { path: string; content: string })[];
}

/** One logged request (stdin is NEVER kept — it may carry secrets; only whether there was one). */
export interface RecordedRequest {
	argv: string[];
	cwd: string | null;
	env: Record<string, string>;
	stdin: boolean;
}

/** The joined form a response's `match` / `after` / `until` is compared with. */
export function joinedArgv(argv: readonly string[]): string {
	return argv.join(' ');
}

/** Did a logged command start with `prefix` (absent prefix: the condition is void → `absent`)? */
function logged(log: readonly string[], prefix: string | undefined, absent: boolean): boolean {
	return prefix === undefined ? absent : log.some((line) => line.startsWith(prefix));
}

/** The log conditions of a response: after / until / afterExact. */
function logAllows(response: RecordedResponse, log: readonly string[]): boolean {
	const exact = response.afterExact;
	return (
		logged(log, response.after, true) &&
		!logged(log, response.until, false) &&
		(exact === undefined || log.includes(exact))
	);
}

/** The scratch conditions of a response: whenPath (the root's paths) and afterCount (retries). */
function stateAllows(
	response: RecordedResponse,
	log: readonly string[],
	pathExists: (path: string) => boolean,
): boolean {
	const count = response.afterCount ?? 0;
	return (
		(response.whenPath === undefined || pathExists(response.whenPath)) &&
		log.filter((line) => line.startsWith(response.match)).length >= count
	);
}

/** Does `response` apply to `joined`, given the log so far (and the scratch root's paths)? */
function applies(
	response: RecordedResponse,
	joined: string,
	log: readonly string[],
	pathExists: (path: string) => boolean,
): boolean {
	return (
		joined.startsWith(response.match) &&
		logAllows(response, log) &&
		stateAllows(response, log, pathExists)
	);
}

/** A request as the log keeps it (stdin only as a yes/no). */
function logEntry(request: RunRequest): RecordedRequest {
	return {
		argv: [...request.argv],
		cwd: request.cwd ?? null,
		env: { ...(request.env ?? {}) },
		stdin: request.stdin !== undefined,
	};
}

/** Hand a canned output to a line listener, line by line. */
function replayLines(listener: ((line: string) => void) | undefined, text: string): void {
	if (listener === undefined) return;
	for (const line of text.split('\n')) if (line !== '') listener(line);
}

/** The canned answer as a run result (default: exit 0, no output). */
function resultOf(response: RecordedResponse | undefined): RunResult {
	return {
		exitCode: response?.exit ?? 0,
		stdout: response?.stdout ?? '',
		stderr: response?.stderr ?? '',
		timedOut: response?.timedOut ?? false,
	};
}

/**
 * A runner that executes nothing: each request is logged, and answered from
 * `responses` (default: exit 0, no output). `onLog` sees every logged request.
 */
export function recordingRunner(options: {
	responses: () => readonly RecordedResponse[];
	onLog?: (entry: RecordedRequest) => void;
	/** Applies a matched response's `creates` (the scratch runner's root). */
	onCreates?: (paths: NonNullable<RecordedResponse['creates']>) => void;
	/** Answers a response's `whenPath` (absent: no path exists). */
	pathExists?: (path: string) => boolean;
}): CommandRunner & { log: RecordedRequest[] } {
	const log: RecordedRequest[] = [];
	return {
		log,
		run: async (request) => {
			assertAbsolute(request.argv);
			const joined = joinedArgv(request.argv);
			const seen = log.map((item) => joinedArgv(item.argv));
			const entry = logEntry(request);
			log.push(entry);
			options.onLog?.(entry);
			const exists = options.pathExists ?? (() => false);
			const response = options.responses().find((item) => applies(item, joined, seen, exists));
			if (response?.creates !== undefined) options.onCreates?.(response.creates);
			const result = resultOf(response);
			replayLines(request.onStdoutLine, result.stdout);
			replayLines(request.onStderrLine, result.stderr);
			return result;
		},
	};
}

/**
 * The scratch root's recording runner (a SUBPROCESS armed by
 * DEDALO_INSTALL_HOST_ROOT — host/scratch.ts): responses from
 * `<marker dir>/responses.json`, every request appended to `<marker dir>/argv.log`
 * (one JSON line each) — and every EARLIER run's log counts for `after`/`until`,
 * so a resumed process sees what the killed one did.
 */
/** One created path under a scratch root: a directory for `…/`, else a file (empty, or `content`). */
function createOne(root: string, item: string | { path: string; content: string }): void {
	const path = typeof item === 'string' ? item : item.path;
	const real = join(root, path);
	if (path.endsWith('/')) {
		mkdirSync(real, { recursive: true });
		return;
	}
	mkdirSync(dirname(real), { recursive: true });
	writeFileSync(real, typeof item === 'string' ? '' : item.content);
}

/** A scratch root's `creates` (under the root only). */
function createUnder(root: string, items: NonNullable<RecordedResponse['creates']>): void {
	for (const item of items) createOne(root, item);
}

export function scratchRunner(markerDir: string): CommandRunner {
	const responsesPath = `${markerDir}/responses.json`;
	const logPath = `${markerDir}/argv.log`;
	const earlier = existsSync(logPath)
		? readFileSync(logPath, 'utf8')
				.split('\n')
				.filter((line) => line !== '')
				.map((line) => JSON.parse(line) as RecordedRequest)
		: [];
	const runner = recordingRunner({
		responses: () =>
			existsSync(responsesPath)
				? (JSON.parse(readFileSync(responsesPath, 'utf8')) as RecordedResponse[])
				: [],
		onLog: (entry) => appendFileSync(logPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 }),
		onCreates: (paths) => createUnder(dirname(markerDir), paths),
		pathExists: (path) => existsSync(join(dirname(markerDir), path)),
	});
	runner.log.push(...earlier);
	return runner;
}
