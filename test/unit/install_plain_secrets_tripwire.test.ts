/**
 * INSTALL PLAIN-MODE SECRETS TRIPWIRE — the interactive installer never shows
 * a secret, never writes one into an answers file, never hands one to a probe
 * child through argv or the environment, and refuses to start without a
 * terminal (terminal installer phase 2, 2026-10-12; owner decision: "secrets
 * are never echoed or logged, entered twice"; "piped stdin without --answers is
 * refused").
 *
 * WHAT IS MEASURED (outcomes, never spellings):
 *  (a) A WHOLE plain run over FAKE TERMINAL STREAMS (raw-mode reading for real:
 *      test/helpers/install_plain_script.ts autoTerminal types each answer when
 *      a prompt is open) with four distinct typed secrets — database, MariaDB,
 *      SMTP, root (a weak root first, refused by the policy) — reaches the
 *      Review and installs: the transcript holds NONE of the secrets (any case,
 *      their distinctive core as a substring), no ESC byte (a probe message
 *      planted with escape sequences included), the policy's rule list WAS
 *      printed (anti-vacuity), and the secrets reached the result and the probes.
 *  (b) The answers file the Review's `write` produces holds no secret.
 *  (c) The probe child's request travels on STDIN only: a recording spawn seam
 *      sees no secret in argv and no environment passed; a message that echoes
 *      a secret back is redacted.
 *  (d) passwordFeedback never carries the value it judged.
 *  (e) THE REAL CLI, spawned with a PIPED stdin and (i) no flag, (ii) --plain:
 *      exit 1, stderr names --answers, and its scratch private dir is EMPTY.
 *  (f) The front-end selection table (selectFrontEnd): TERM dumb/unset, a
 *      narrow or short terminal, stdout redirected (prompts to stderr / the
 *      tty device; refused when neither), no raw mode, piped stdin, NO_COLOR
 *      (colour only), every headless source, and --plain + --resume.
 *  (g) A prompt sink that is not a terminal never receives a one-time display.
 *
 * DB-FREE; the only writes are mkdtemp scratch dirs, removed in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	NO_RAW_MODE_REFUSAL,
	NO_TERMINAL_SINK_REFUSAL,
	PIPED_STDIN_REFUSAL,
	selectFrontEnd,
	selectFrontEndFor,
	type TerminalCaps,
} from '../../src/core/install/front_end.ts';
import { answersFromCliArgs } from '../../src/core/install/install_plan.ts';
import { childProbes, type ProbeProcess } from '../../src/core/install/install_probe_client.ts';
import { runInteractiveInstall } from '../../src/core/install/install_session.ts';
import { passwordFeedback } from '../../src/core/install/screen_model.ts';
import { DONE_TEXT } from '../../src/core/install/screen_text.ts';
import { ttyInstallPrompter } from '../../src/core/install/ui_plain/prompter.ts';
import { plainReporter } from '../../src/core/install/ui_plain/reporter.ts';
import {
	autoTerminal,
	FakeTtyOutput,
	fakeProbes,
	thesaurusOffer,
} from '../helpers/install_plain_script.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/install.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_plain_secrets_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** Four distinct secrets; each `core` is what must never appear, in any case. */
const SECRETS = {
	db: { value: 'Db-QuetzalOrchid-71', core: 'quetzalorchid' },
	mysql: { value: 'My-PangolinVelvet-38', core: 'pangolinvelvet' },
	smtp: { value: 'Sm-MarmotTopaz-52', core: 'marmottopaz' },
	root: { value: 'Ro-KestrelHarbor-47x', core: 'kestrelharbor' },
} as const;
/** A root password the policy refuses (asked again, never printed). */
const WEAK_ROOT = 'weakling';

/** The answer the operator types at each prompt (by its label); '' = enter (the shown default). */
const ANSWERS: readonly [RegExp, string][] = [
	[/^Install type/, 'developer'],
	[/^Database name/, 'dedalo_plain_secrets'],
	[/^Database role/, 'plain_role'],
	[/^Database password again \(hidden\)/, SECRETS.db.value],
	[/^Database password \(hidden\)/, SECRETS.db.value],
	[/^Entity code/, 'plainsecrets'],
	[/^Publish to a website/, 'y'],
	[/^MariaDB user/, 'web_user'],
	[/^MariaDB password again \(hidden\)/, SECRETS.mysql.value],
	[/^MariaDB password \(hidden\)/, SECRETS.mysql.value],
	[/^Send mail through an SMTP relay/, 'y'],
	[/^SMTP server/, 'smtp.example.org'],
	[/^SMTP user/, 'mailer@example.org'],
	[/^SMTP password again \(hidden\)/, SECRETS.smtp.value],
	[/^SMTP password \(hidden\)/, SECRETS.smtp.value],
	[/^Root password again \(hidden\)/, SECRETS.root.value],
	[/^Type yes to accept/, 'yes'],
];

/** One whole plain run on fake streams; `review` = the Review commands typed, in order. */
async function drivenRun(review: string[]) {
	let rootTries = 0;
	const reviewQueue = [...review];
	const terminal = autoTerminal((prompt) => {
		if (/^Root password \(hidden\)/.test(prompt)) {
			rootTries += 1;
			return rootTries === 1 ? WEAK_ROOT : SECRETS.root.value;
		}
		if (/^review/.test(prompt)) return reviewQueue.shift() ?? 'quit';
		return ANSWERS.find(([pattern]) => pattern.test(prompt))?.[1] ?? '';
	});
	const probes = fakeProbes();
	// An untrusted message carrying escape sequences (a server's text): must arrive inert.
	probes.database = async (answers, secret) => {
		probes.calls.push({ probe: 'db', answers, secret });
		return { ok: true, detail: 'reached \x1b]0;owned\x07\x1b[31mdb\x1b[0m' };
	};
	try {
		const result = await runInteractiveInstall({
			prompter: ttyInstallPrompter({
				input: terminal.input,
				output: terminal.output,
				signals: terminal.signals,
			}),
			probes,
			priorEnv: {},
			thesauri: thesaurusOffer(),
			host: {},
			givenSecrets: {},
			unfinished: null,
		});
		return {
			result,
			transcript: terminal.output.text,
			probes,
			prompts: terminal.prompts,
			rootTries,
		};
	} finally {
		terminal.stop();
	}
}

/** The transcript holds none of the secrets (any case; their core as a substring). */
function expectNoSecret(text: string): void {
	const lower = text.toLowerCase();
	for (const [name, secret] of Object.entries(SECRETS)) {
		expect(lower.includes(secret.value.toLowerCase()), name).toBe(false);
		expect(lower.includes(secret.core), name).toBe(false);
	}
	expect(lower.includes(WEAK_ROOT)).toBe(false);
}

// ── (a) a whole run on fake terminal streams ─────────────────────────────────

describe('plain mode — a whole typed run shows no secret, no escape (a)', () => {
	test('install: four typed secrets reach the result and the probes, never the screen', async () => {
		const run = await drivenRun(['install']);
		expect(run.result.kind).toBe('install');
		if (run.result.kind !== 'install') return;
		expect(run.result.secrets).toEqual({
			db_password: SECRETS.db.value,
			mysql_password: SECRETS.mysql.value,
			smtp_pass: SECRETS.smtp.value,
			root_password: SECRETS.root.value,
		});
		// No secret ever enters the raw answers.
		expectNoSecret(JSON.stringify(run.result.raw));
		// The secrets went where they belong: each probe got its one secret.
		expect(run.probes.calls.find((call) => call.probe === 'db')?.secret).toBe(SECRETS.db.value);
		expect(run.probes.calls.find((call) => call.probe === 'diffusion')?.secret).toBe(
			SECRETS.mysql.value,
		);
		expect(run.probes.calls.find((call) => call.probe === 'mailer')?.secret).toBe(
			SECRETS.smtp.value,
		);
		// The transcript: no secret, no ESC byte.
		expectNoSecret(run.transcript);
		expect(run.transcript.includes('\x1b')).toBe(false);
		// Anti-vacuity: the screens really ran, the policy list was printed, the
		// weak root password was refused and asked again, every secret asked twice.
		expect(run.transcript).toContain('Step 1 of');
		expect(run.transcript).toContain('reached');
		expect(run.transcript).toMatch(/missing\s+\S/);
		expect(run.transcript).toContain('the password does not meet the policy');
		expect(run.rootTries).toBe(2);
		for (const label of [
			'Database password',
			'MariaDB password',
			'SMTP password',
			'Root password',
		]) {
			expect(
				run.prompts.filter((prompt) => prompt.startsWith(`${label} again (hidden)`)).length,
				label,
			).toBe(1);
		}
		expect(run.prompts.length).toBeGreaterThan(30);
	}, 60000);

	test('(b) write <path> at the Review: the answers file holds no secret', async () => {
		const path = join(mkdtempSync(join(scratchRoot, 'answers_')), 'answers.json');
		const run = await drivenRun([`write ${path}`]);
		expect(run.result).toEqual({ kind: 'written', path });
		const body = readFileSync(path, 'utf8');
		expect(body).toContain('dedalo.install.answers/1');
		expect(body).toContain('plain_role');
		expectNoSecret(body);
		expectNoSecret(run.transcript);
	}, 60000);
});

// ── (c) the probe child request rides stdin only ─────────────────────────────

describe('plain mode — a probe child gets its secret on stdin only (c)', () => {
	test('argv and spawn options carry no secret and no environment; an echoed secret is redacted', async () => {
		const seen: { argv: string[]; options: Record<string, unknown>; stdin: string }[] = [];
		const spawn = (argv: string[], options: Record<string, unknown>): ProbeProcess => {
			const record = { argv, options, stdin: '' };
			seen.push(record);
			const echo = (): string => {
				const request = JSON.parse(record.stdin) as { secrets: Record<string, string> };
				return `${JSON.stringify({ ok: false, detail: `refused for ${Object.values(request.secrets).join(',')}` })}\n`;
			};
			let stdout = '';
			return {
				stdin: {
					write: (text: string) => {
						record.stdin += text;
					},
					end: () => {
						stdout = echo();
					},
				},
				get stdout() {
					return new Response(stdout).body as ReadableStream<Uint8Array>;
				},
				stderr: new Response(`stderr echo ${SECRETS.db.value}\n`)
					.body as ReadableStream<Uint8Array>,
				exited: Promise.resolve(0),
				kill: () => undefined,
			};
		};
		const probes = childProbes({ execPath: '/bin/false', cwd: ROOT, spawn: spawn as never });
		const db = await probes.database({ db_database: 'd' }, SECRETS.db.value);
		const mysql = await probes.diffusion({ diffusion: true }, SECRETS.mysql.value);
		const mail = await probes.mailer({ mailer: true }, SECRETS.smtp.value, 'ops@example.org');
		expect(seen).toHaveLength(3);
		for (const record of seen) {
			expectNoSecret(record.argv.join(' '));
			// An EXPLICIT env (Bun's default is the original environ, deletes ignored —
			// install_probe_child.test.ts measures it): no secret, no DEDALO_INSTALL_* key.
			const env = record.options.env as Record<string, string>;
			expect(typeof env).toBe('object');
			expectNoSecret(JSON.stringify(env));
			expect(Object.keys(env).filter((key) => key.startsWith('DEDALO_INSTALL_'))).toEqual([]);
			expect(record.options.stdin).toBe('pipe');
		}
		// The secret WAS sent — on stdin (anti-vacuity).
		expect(seen[0]?.stdin).toContain(SECRETS.db.value);
		expect(seen[1]?.stdin).toContain(SECRETS.mysql.value);
		expect(seen[2]?.stdin).toContain(SECRETS.smtp.value);
		// What came back echoed the secret: redacted.
		for (const outcome of [db, mysql, mail]) {
			expect(outcome.detail).toContain('***');
			expectNoSecret(outcome.detail);
		}
	});
});

// ── (d) the policy feedback ──────────────────────────────────────────────────

describe('plain mode — the policy feedback never carries the value (d)', () => {
	test('passwordFeedback over weak and strong passwords: rules + errors, never the value', () => {
		for (const password of [WEAK_ROOT, SECRETS.root.value, 'Kestrel-Password-47', 'Ab1-x']) {
			const feedback = passwordFeedback(password);
			expect(feedback.rules.length).toBeGreaterThanOrEqual(5);
			const text = JSON.stringify(feedback).toLowerCase();
			expect(text.includes(password.toLowerCase()), password).toBe(false);
		}
		expect(passwordFeedback(SECRETS.root.value).errors).toEqual([]);
		expect(passwordFeedback(WEAK_ROOT).errors.length).toBeGreaterThan(0);
		// An empty candidate marks no rule satisfied.
		expect(passwordFeedback('').rules.every((rule) => !rule.ok)).toBe(true);
	});
});

// ── (e) the spawned CLI refuses a piped stdin ────────────────────────────────

describe('the CLI refuses an interactive run without a terminal (e)', () => {
	for (const argv of [[], ['--plain']]) {
		test(`stdin piped, argv [${argv.join(' ')}]: exit 1, --answers named, nothing written`, () => {
			const privateDir = mkdtempSync(join(scratchRoot, 'private_'));
			const proc = Bun.spawnSync([process.execPath, 'run', CLI, ...argv], {
				cwd: ROOT,
				env: {
					...Bun.env,
					DEDALO_INSTALL_PRIVATE_DIR: privateDir,
					DEDALO_TS_STATE_PATH: join(privateDir, 'ts_state.json'),
				},
				stdin: Buffer.from(''),
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const stderr = proc.stderr.toString();
			expect(proc.exitCode, stderr).toBe(1);
			expect(stderr).toContain('--answers');
			expect(stderr).toContain(PIPED_STDIN_REFUSAL);
			// rmdir succeeds ONLY on an empty directory: nothing was written.
			let code: string | null = null;
			try {
				rmdirSync(privateDir);
			} catch (error) {
				code = (error as NodeJS.ErrnoException).code ?? 'unknown';
			}
			expect(code).toBeNull();
		}, 60000);
	}
});

// ── (f) which front end ──────────────────────────────────────────────────────

const FULL: TerminalCaps = {
	stdinTty: true,
	stdoutTty: true,
	stderrTty: true,
	ttyDevice: true,
	rawMode: true,
	term: 'xterm-256color',
	noColor: false,
	columns: 120,
	rows: 40,
};

describe('the front-end selection (f)', () => {
	const interactive = { headless: false, plain: false };
	const pick = (caps: Partial<TerminalCaps>, options = interactive) =>
		selectFrontEnd({ ...FULL, ...caps }, options);

	test('a full terminal: the full-screen UI, prompts on stdout; NO_COLOR changes colour only', () => {
		expect(pick({})).toMatchObject({ kind: 'interactive', ui: 'tui', sink: 'stdout' });
		expect(pick({ noColor: true })).toMatchObject({
			kind: 'interactive',
			ui: 'tui',
			sink: 'stdout',
		});
	});

	test('plain when asked, on TERM dumb/unset, narrow or short, unknown size', () => {
		const plain = (caps: Partial<TerminalCaps>, options = interactive) =>
			expect(pick(caps, options), JSON.stringify(caps)).toMatchObject({
				kind: 'interactive',
				ui: 'plain',
			});
		plain({}, { headless: false, plain: true });
		plain({ term: 'dumb' });
		plain({ term: undefined });
		plain({ term: '' });
		plain({ columns: 79 });
		plain({ rows: 23 });
		plain({ columns: undefined, rows: undefined });
		expect(pick({ columns: 80, rows: 24 })).toMatchObject({ ui: 'tui' });
	});

	test('stdout redirected: plain, prompts on stderr — or the tty device — or refused', () => {
		expect(pick({ stdoutTty: false })).toMatchObject({
			kind: 'interactive',
			ui: 'plain',
			sink: 'stderr',
		});
		expect(pick({ stdoutTty: false, stderrTty: false })).toMatchObject({
			kind: 'interactive',
			ui: 'plain',
			sink: 'tty',
		});
		expect(pick({ stdoutTty: false, stderrTty: false, ttyDevice: false })).toEqual({
			kind: 'refuse',
			error: NO_TERMINAL_SINK_REFUSAL,
		});
	});

	test('piped stdin and no raw mode are refused (before any read or write)', () => {
		expect(pick({ stdinTty: false })).toEqual({ kind: 'refuse', error: PIPED_STDIN_REFUSAL });
		expect(pick({ stdinTty: false }, { headless: false, plain: true })).toEqual({
			kind: 'refuse',
			error: PIPED_STDIN_REFUSAL,
		});
		expect(pick({ rawMode: false })).toEqual({ kind: 'refuse', error: NO_RAW_MODE_REFUSAL });
		expect(PIPED_STDIN_REFUSAL).toContain('--answers');
	});

	test('every headless source stays headless — even with a piped stdin', () => {
		const piped = {
			...FULL,
			stdinTty: false,
			stdoutTty: false,
			stderrTty: false,
			ttyDevice: false,
		};
		for (const argv of [
			['--entity', 'x'],
			['--answers', 'a.json'],
			['--plan'],
			['--list-hierarchies'],
			['--list-ontologies'],
			['--list-langs'],
			['--resume'],
			['--abort'],
			['--secrets-stdin'],
			['--execute'],
			['--root-password', 'x'],
			['--plain', '--resume'],
		]) {
			const invocation = answersFromCliArgs(argv);
			expect(invocation.errors, argv.join(' ')).toEqual([]);
			expect(selectFrontEndFor(piped, invocation), argv.join(' ')).toEqual({ kind: 'headless' });
		}
		// Nothing, --plain, --write-answers: interactive — on a terminal; refused piped.
		for (const argv of [[], ['--plain'], ['--write-answers', 'a.json']]) {
			const invocation = answersFromCliArgs(argv);
			expect(selectFrontEndFor(FULL, invocation).kind, argv.join(' ')).toBe('interactive');
			expect(selectFrontEndFor(piped, invocation), argv.join(' ')).toEqual({
				kind: 'refuse',
				error: PIPED_STDIN_REFUSAL,
			});
		}
	});
});

// ── (g) a one-time display needs a terminal ──────────────────────────────────

describe('a one-time display never goes to a redirected sink (g)', () => {
	test('showOnce on a non-terminal output writes nothing and answers false; on a terminal, true', () => {
		const pipe = new FakeTtyOutput();
		pipe.isTTY = false;
		const input = {
			isTTY: true,
			setRawMode: () => undefined,
			on: () => undefined,
			removeListener: () => undefined,
			resume: () => undefined,
			pause: () => undefined,
		};
		expect(ttyInstallPrompter({ input, output: pipe }).showOnce(['salt = abc'])).toBe(false);
		expect(pipe.text).toBe('');
		const tty = new FakeTtyOutput();
		expect(ttyInstallPrompter({ input, output: tty }).showOnce(['salt = \x1b[31mabc'])).toBe(true);
		expect(tty.text).toBe('salt = abc\n');
	});
});

// ── (h) a HEADLESS run's salt reaches its own terminal (campaign 3b C3-18, N28, N24) ──

describe('a headless run (--resume typed at a terminal) shows the salt on its own stdout (h)', () => {
	const ending = { route: 'trial' as const, instance: '', keptLive: false };
	const complete = {
		exitCode: 0,
		result: 'complete' as const,
		message: null,
		failedStep: null,
		hint: [],
	};

	test("the default reporter writes the one-time line to this process's stdout when it is a terminal; redirected, it offers no one-time display", async () => {
		const stdout = process.stdout as { isTTY?: boolean };
		const wasTty = stdout.isTTY;
		const written: string[] = [];
		const write = process.stdout.write;
		process.stdout.write = ((chunk: string) => {
			written.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;
		const logged: string[] = [];
		const sinks = { log: (line: string) => logged.push(line), warn: () => {}, error: () => {} };
		try {
			stdout.isTTY = true;
			const onTty = plainReporter({ sinks });
			expect(onTty.io.showOnce?.(['  generated DEDALO_SALT_STRING = abc'])).toBe(true);
			expect(written.join('')).toContain('generated DEDALO_SALT_STRING = abc');
			// The closing block repeats where it is kept and that it belongs with the backups (N28).
			await onTty.finish(complete, { mode: 'resume', rootVerified: false, ending });
			expect(logged.join('\n')).toContain(DONE_TEXT.saltKeep);
			// Redirected: no one-time display at all (the executors' own rule then applies).
			written.length = 0;
			logged.length = 0;
			stdout.isTTY = false;
			const redirected = plainReporter({ sinks });
			expect(redirected.io.showOnce).toBeUndefined();
			expect(written.join('')).toBe('');
			await redirected.finish(complete, { mode: 'resume', rootVerified: false, ending });
			expect(logged.join('\n')).not.toContain(DONE_TEXT.saltKeep);
		} finally {
			process.stdout.write = write;
			stdout.isTTY = wasTty;
		}
	});

	test('a refused run is worded refused, never "install failed" (N24)', async () => {
		const errors: string[] = [];
		const sinks = { log: () => {}, warn: () => {}, error: (line: string) => errors.push(line) };
		await plainReporter({ sinks }).finish(
			{
				exitCode: 1,
				result: 'refused',
				message: 'this install is SEALED (live) — --abort never undoes a sealed installation',
				failedStep: null,
				hint: [],
			},
			{ mode: 'abort', rootVerified: false, ending },
		);
		expect(errors.join('\n')).toContain('✖ refused: this install is SEALED');
		expect(errors.join('\n')).not.toContain('install failed');
	});
});
