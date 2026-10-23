/**
 * THE PROBE CLIENT (terminal installer phase 2, 2026-10-12) — the
 * InstallProbes the interactive front end uses, each one a run of the probe
 * child (install_probe.ts) in a process of its own: the front end stays
 * config-free (front_end.ts header).
 *
 * The request — the plain answers so far and the ONE secret the probe needs —
 * is written to the child's STDIN only: never its argv (visible in `ps`) and
 * never its environment. The child gets this process's LIVE environment
 * (liveProcessEnv — an explicit `env`: Bun's default spawn env is the ORIGINAL
 * environ, deletes ignored), from which scripts/install.ts already removed every
 * DEDALO_INSTALL_* secret.
 * Every message that comes back is redacted again here (defence in depth), the
 * child's stderr is redacted and dropped (shown only when the child gave no
 * answer), and a child that outlives its probe's timeout is killed. A child that
 * exits before reading its request (EPIPE) fails its probe: an answer to an
 * unread request answers nothing, and the front end never crashes on the pipe.
 *
 * Async spawn only (Bun.spawn): the front end must stay responsive to Ctrl-C.
 * The spawn is injectable — a gate records the request without a process.
 *
 * A PROBE WRITES NO SERVER STATE (campaign 3 C3-20): the child's state file
 * and session store (DEDALO_TS_STATE_PATH / DEDALO_SESSION_DB_PATH) point into
 * a throwaway directory made for the one probe and removed after it — the
 * engine modules a probe imports create both at import, and a System check
 * under sudo left a root-owned ../private behind on a host that then installed
 * nothing (the update smoke boot's precedent: src/core/update/smoke_boot.ts).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveProcessEnv } from '../../config/env.ts';
import type { CatalogProbeResult, InstallProbes } from './front_end.ts';
import type { InstallRoute } from './install_plan.ts';
import type { ProbeName, ProbeRequest } from './install_probe.ts';
import { redactSecrets } from './run_files.ts';
import type { ProbeOutcome } from './screen_model.ts';

/** The child entrypoint (a spawn target the entrypoint census sees). */
const CHILD_PATH = fileURLToPath(new URL('./install_probe.ts', import.meta.url));

/** What a probe child process must offer (Bun.spawn's shape, narrowed). */
export interface ProbeProcess {
	stdin: { write(text: string): unknown; end(): unknown };
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	exited: Promise<number>;
	kill(signal?: number | NodeJS.Signals): void;
}

/** The spawn seam: argv + options → a process. */
export type ProbeSpawn = (
	argv: string[],
	options: {
		cwd: string;
		stdin: 'pipe';
		stdout: 'pipe';
		stderr: 'pipe';
		/** The child's WHOLE environment (always explicit — see the header). */
		env: Record<string, string>;
	},
) => ProbeProcess;

export interface ChildProbeOptions {
	/** The bun binary (process.execPath). */
	execPath: string;
	/** The checkout root the child runs in. */
	cwd: string;
	/** Per-probe timeouts override (ms). */
	timeoutMs?: Partial<Record<ProbeName, number>>;
	/** Test seam; default Bun.spawn. */
	spawn?: ProbeSpawn;
	/**
	 * Told of every child started (the full-screen UI kills a running probe
	 * when it closes: in raw mode a Ctrl-C reaches no child by itself).
	 */
	onSpawn?: (child: ProbeProcess) => void;
}

/**
 * The bound of each probe: a catalog fetch (a server manifest) or a test mail
 * can legitimately take longer than a local check.
 */
export const PROBE_TIMEOUT_MS: Readonly<Record<ProbeName, number>> = Object.freeze({
	system: 30_000,
	identity: 60_000,
	db: 30_000,
	media: 10_000,
	diffusion: 30_000,
	mailer: 60_000,
	catalog: 120_000,
});

const defaultSpawn: ProbeSpawn = (argv, options) =>
	Bun.spawn(argv, options) as unknown as ProbeProcess;

/** Every form a secret takes in a child's output (as typed, JSON-escaped). */
function forms(secrets: ProbeRequest['secrets']): string[] {
	return Object.values(secrets)
		.filter((value): value is string => typeof value === 'string' && value !== '')
		.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]);
}

/** Redact `detail` (and `rows[].detail`) of a child's answer. */
function redactOutcome<T>(value: T, secrets: readonly string[]): T {
	return JSON.parse(redactSecrets(JSON.stringify(value), secrets)) as T;
}

/** The child's last non-empty stdout line, parsed — or null. */
function answerLine(stdout: string): unknown {
	const line = stdout.trim().split('\n').at(-1) ?? '';
	try {
		return line === '' ? null : JSON.parse(line);
	} catch {
		return null;
	}
}

/** The probe's timeout (an override, else PROBE_TIMEOUT_MS). */
function boundOf(options: ChildProbeOptions, probe: ProbeName): number {
	return options.timeoutMs?.[probe] ?? PROBE_TIMEOUT_MS[probe];
}

/** Run one probe in a child; never throws (a dead or silent child is `{ok:false}`). */
async function runChild(
	options: ChildProbeOptions,
	request: ProbeRequest,
): Promise<Record<string, unknown>> {
	const scratch = mkdtempSync(join(tmpdir(), 'dedalo_install_probe_'));
	try {
		return await runChildIn(options, request, scratch);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/** The child's environment: the live one, its server state and session store in `scratch`. */
export function probeChildEnv(scratch: string): Record<string, string> {
	return {
		...liveProcessEnv(),
		DEDALO_TS_STATE_PATH: join(scratch, 'ts_state.json'),
		DEDALO_SESSION_DB_PATH: join(scratch, 'dedalo_ts_sessions.sqlite'),
	};
}

/** runChild over a throwaway state directory. */
async function runChildIn(
	options: ChildProbeOptions,
	request: ProbeRequest,
	scratch: string,
): Promise<Record<string, unknown>> {
	const secrets = forms(request.secrets);
	const spawn = options.spawn ?? defaultSpawn;
	const child = spawn([options.execPath, 'run', CHILD_PATH], {
		cwd: options.cwd,
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
		env: probeChildEnv(scratch),
	});
	options.onSpawn?.(child);
	const bound = boundOf(options, request.probe);
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, bound);
	try {
		// Sent while the output is collected: a child that writes before it reads cannot
		// deadlock against a flush awaited first.
		const delivered = deliver(child, JSON.stringify(request));
		const ended = await collect(child);
		const sent = await delivered;
		const answer = answerLine(ended.stdout);
		if (sent && answer !== null && typeof answer === 'object' && !timedOut) {
			return redactOutcome(answer as Record<string, unknown>, secrets);
		}
		const why = timedOut
			? `timed out after ${Math.round(bound / 1000)} s`
			: sent
				? silentExit(ended)
				: `did not read its request (${silentExit(ended)})`;
		return { ok: false, detail: redactSecrets(`the ${request.probe} probe ${why}`, secrets) };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Write the request to the child's stdin and close it; false when the pipe refused
 * it. NEVER throws or rejects: a child that closes its stdin unread (dead at import,
 * killed at its timeout) makes the write — synchronously, or the pending flush later
 * — fail EPIPE. Uncaught, that crashed the front end (runChild's never-throws
 * contract broken; a late rejection is an unhandled one); here it fails the probe.
 * `true` is NOT proof of a read: Bun drops a write to a child it already reaped
 * (write() → true, measured Bun 1.4.3) — then the child's own answer (none) judges.
 * Each step is guarded on its own, so `end()` still closes the pipe after a failed
 * `write()`; the two run back to back (no await between).
 */
function deliver(child: ProbeProcess, text: string): Promise<boolean> {
	const step = (send: () => unknown): Promise<boolean> => {
		try {
			return Promise.resolve(send()).then(
				() => true,
				() => false,
			);
		} catch {
			return Promise.resolve(false);
		}
	};
	const wrote = step(() => child.stdin.write(text));
	const closed = step(() => child.stdin.end());
	return Promise.all([wrote, closed]).then(([a, b]) => a && b);
}

/** A child's whole output and exit code. */
async function collect(
	child: ProbeProcess,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

/** Why a child gave no answer: its exit code and the last line it printed to stderr. */
function silentExit(ended: { stderr: string; exitCode: number }): string {
	const last = ended.stderr.trim().split('\n').at(-1) ?? '';
	return `exited ${ended.exitCode} without an answer${last === '' ? '' : `: ${last}`}`;
}

/** A child's answer as a ProbeOutcome (anything missing reads as a failure). */
function outcomeOf(answer: Record<string, unknown>): ProbeOutcome {
	return {
		ok: answer.ok === true,
		detail: String(answer.detail ?? ''),
		...(Array.isArray(answer.rows) ? { rows: answer.rows as ProbeOutcome['rows'] } : {}),
		...(typeof answer.version === 'string' ? { version: answer.version } : {}),
		...(typeof answer.seedPath === 'string' ? { seedPath: answer.seedPath } : {}),
		...identityOf(answer),
	};
}

/** The identity probe's verdict, when the answer carries one. */
function identityOf(answer: Record<string, unknown>): Pick<ProbeOutcome, 'identity'> {
	return answer.identity !== null && typeof answer.identity === 'object'
		? { identity: answer.identity as NonNullable<ProbeOutcome['identity']> }
		: {};
}

/** The InstallProbes of the real machine, each one a probe child. */
export function childProbes(options: ChildProbeOptions): InstallProbes {
	const run = (request: ProbeRequest) => runChild(options, request);
	const plain = (answers: Readonly<Record<string, unknown>>) => ({ ...answers });
	return {
		system: async (route: InstallRoute, instance = '') =>
			outcomeOf(await run({ probe: 'system', answers: { route, instance }, secrets: {} })),
		identity: async (answers) =>
			outcomeOf(await run({ probe: 'identity', answers: plain(answers), secrets: {} })),
		database: async (answers, dbPassword) =>
			outcomeOf(
				await run({ probe: 'db', answers: plain(answers), secrets: { db_password: dbPassword } }),
			),
		media: async (answers) =>
			outcomeOf(await run({ probe: 'media', answers: plain(answers), secrets: {} })),
		diffusion: async (answers, mysqlPassword) =>
			outcomeOf(
				await run({
					probe: 'diffusion',
					answers: plain(answers),
					secrets: { mysql_password: mysqlPassword },
				}),
			),
		mailer: async (answers, smtpPass, sendTo) =>
			outcomeOf(
				await run({
					probe: 'mailer',
					answers: plain(answers),
					secrets: { smtp_pass: smtpPass },
					...(sendTo === undefined ? {} : { send_to: sendTo }),
				}),
			),
		ontologyCatalog: async (answers, priorEnv) => {
			const answer = await run({
				probe: 'catalog',
				answers: plain(answers),
				secrets: {},
				// ONLY what the catalog probe reads (ontologyServersFor): never the prior
				// .env's passwords/salt — none of them is in this request's redaction set.
				prior_env:
					priorEnv.ONTOLOGY_SERVERS === undefined
						? {}
						: { ONTOLOGY_SERVERS: priorEnv.ONTOLOGY_SERVERS },
			});
			return {
				ok: answer.ok === true,
				detail: String(answer.detail ?? ''),
				catalog: (answer.catalog ?? null) as CatalogProbeResult['catalog'],
			};
		},
	};
}
