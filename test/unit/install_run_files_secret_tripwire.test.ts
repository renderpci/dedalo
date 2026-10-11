/**
 * INSTALL RUN FILES CARRY NO SECRET TRIPWIRE — the terminal installer's plan
 * file, state file and lock (`<private>/install/`), and every line it prints,
 * never hold a supplied secret; the files are 0600 in a 0700 dir; an answers
 * file may not carry one (terminal installer phase 1, 2026-10-11;
 * src/core/install/run_files.ts, executor.ts, scripts/install.ts).
 *
 * WHY. The run files are KEPT after success, as the install's record, and are
 * what an operator pastes into a bug report; the printed lines land in
 * terminals, CI logs and `install.sh` transcripts. A database or SMTP password
 * in either is a credential leak with a long life.
 *
 * WHAT IS MEASURED (outcomes — the bytes written and printed, scanned for
 * sentinel values):
 *  (a) buildPlanFile over a plan that USES all three secret answers (database,
 *      diffusion, SMTP) holds no sentinel, no secret answer key, no secret .env
 *      entry; the answers are an ALLOW-LIST — an answer key nobody classified (a
 *      future secret) never reaches the file; and every answer whose name says
 *      it is a password is classified secret.
 *  (b) the EXECUTOR, over a fake machine, with steps whose messages, warnings,
 *      console output and thrown errors all carry the sentinels: the plan file,
 *      the state file, the lock (read mid-run), the io lines and the console
 *      hold none — and `***` does appear (the redaction ran; anti-vacuity);
 *      the run dir is 0700 (FORCED on one that already existed at 0755), the
 *      files 0600, and a symlink planted at a run file's tmp name is never
 *      followed.
 *  (c) the SPAWNED CLI: secrets through the environment, `--secrets-stdin` and
 *      argv reach no printed line (`--plan`, a run refused after the plan,
 *      MALFORMED `--secrets-stdin` JSON whose unquoted value the parser would
 *      quote); an argv secret earns the `ps` warning; an answers file carrying
 *      a secret is refused before anything is written.
 *
 * DB-FREE (the hermetic tier runs it). The same scan over a REAL install —
 * faulted, resumed, the generated salt printed exactly once — is
 * test/unit/install_resume_drill.test.ts's.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { executeInstall } from '../../src/core/install/executor.ts';
import {
	ANSWERS_FILE_SCHEMA,
	INSTALL_ANSWER_KEYS,
	type InstallAnswers,
	normalizeInstallAnswers,
	PLAIN_ANSWER_KEYS,
	SECRET_ANSWER_KEYS,
} from '../../src/core/install/install_plan.ts';
import {
	ENV_SECRET_KEYS,
	LOCK_FILE,
	modeOf,
	PLAN_FILE,
	plainAnswers,
	redactSecrets,
	STATE_FILE,
} from '../../src/core/install/run_files.ts';
import type { InstallStepDefinition, StepRawOutcome } from '../../src/core/install/steps.ts';
import {
	FAKE_BASE_ANSWERS,
	fakeHost,
	fakePlan,
	fakeTable,
	recordingIo,
	withPrivateDir,
} from '../helpers/install_fake_executor.ts';

/** A fresh temp private dir under this file's scratch root (removed in afterAll). */
const privateRoot = mkdtempSync(join(tmpdir(), 'dedalo_fake_install_'));
afterAll(() => rmSync(privateRoot, { recursive: true, force: true }));
const scratchPrivateDir = (): string => mkdtempSync(join(privateRoot, 'private_'));

/**
 * "Nothing was written" into a scratch dir this test made: rmdir succeeds ONLY
 * on an empty directory — the proof without enumerating it.
 */
function expectNothingWritten(dir: string): void {
	let code: string | null = null;
	try {
		rmdirSync(dir);
	} catch (error) {
		code = (error as NodeJS.ErrnoException).code ?? 'unknown';
	}
	expect(code, `${dir} must be empty (nothing written)`).toBeNull();
}

const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/install.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_secrets_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** Distinctive values that pass every check (the root one passes the password policy). */
const SENTINEL = Object.freeze({
	db_password: 'SENTINEL-db-7Qx2',
	mysql_password: 'SENTINEL-mysql-4Kp9',
	smtp_pass: 'SENTINEL-smtp-8Vn3',
	root_password: 'Sentinel-Root-Kestrel-91',
});
const SENTINELS = Object.values(SENTINEL);

/** The sentinels found in `text` (expected: none). */
const leaked = (text: string): string[] => SENTINELS.filter((value) => text.includes(value));

/** Answers that USE every secret answer (diffusion + mailer on). */
const ALL_SECRETS_ANSWERS: Readonly<Record<string, unknown>> = Object.freeze({
	...FAKE_BASE_ANSWERS,
	diffusion: true,
	mysql_hostname: 'localhost',
	mysql_port: '3306',
	mysql_database: 'web_secret',
	mysql_username: 'web_user',
	mailer: true,
	smtp_host: 'smtp.example.org',
	smtp_port: '587',
	smtp_secure: 'tls',
	smtp_user: 'mailer@example.org',
});

// ── (a) the plan file ────────────────────────────────────────────────────────

describe('install run files — the plan file holds no secret (a)', () => {
	test('a plan that uses every secret answer is written without one', () => {
		const { plan, planFile } = fakePlan(SENTINEL, ALL_SECRETS_ANSWERS);
		// Anti-vacuity: the secrets are really IN the plan's answers and .env rendering.
		expect(plan.answers.db_password).toBe(SENTINEL.db_password);
		expect(plan.answers.mysql_password).toBe(SENTINEL.mysql_password);
		expect(plan.answers.smtp_pass).toBe(SENTINEL.smtp_pass);
		const rendered = plan.env.flatMap((section) => section.entries.map((entry) => entry.value));
		expect(leaked(rendered.join('\n')).length).toBeGreaterThanOrEqual(3);

		const text = JSON.stringify(planFile);
		expect(leaked(text)).toEqual([]);
		for (const key of SECRET_ANSWER_KEYS) expect(Object.keys(planFile.answers)).not.toContain(key);
		for (const entry of planFile.env_entries) {
			expect(Object.hasOwn(ENV_SECRET_KEYS, entry.key), entry.key).toBe(false);
		}
		// What IS recorded: that each secret was supplied — a boolean.
		expect(planFile.secrets_supplied).toEqual({
			db_password: true,
			mysql_password: true,
			smtp_pass: true,
			root_password: true,
		});
	});

	test('the answers are an ALLOW-LIST: a key nobody classified never reaches the plan file', () => {
		const answers = {
			...normalizeInstallAnswers(ALL_SECRETS_ANSWERS).answers,
			api_token: 'SENTINEL-unclassified-5Rt1',
		} as InstallAnswers & { api_token: string };
		const plain = plainAnswers(answers);
		expect(Object.keys(plain).sort()).toEqual([...PLAIN_ANSWER_KEYS].sort());
		expect(JSON.stringify(plain)).not.toContain('SENTINEL-unclassified-5Rt1');
	});

	test('every answer named like a password is classified secret; secret ∪ plain = every answer', () => {
		const passwordShaped = INSTALL_ANSWER_KEYS.filter((key) => /pass|secret|token/i.test(key));
		expect(passwordShaped.length).toBeGreaterThanOrEqual(3);
		expect([...SECRET_ANSWER_KEYS].sort()).toEqual([...passwordShaped].sort());
		expect([...SECRET_ANSWER_KEYS, ...PLAIN_ANSWER_KEYS].sort()).toEqual(
			[...INSTALL_ANSWER_KEYS].sort(),
		);
	});

	test('redactSecrets: every supplied secret, overlapping ones whole, in any text', () => {
		const text = `connect failed: password ${SENTINEL.db_password} (and ${SENTINEL.db_password}x) for ${SENTINEL.smtp_pass}`;
		const redacted = redactSecrets(text, [SENTINEL.db_password.slice(0, 9), ...SENTINELS]);
		expect(leaked(redacted)).toEqual([]);
		expect(redacted).toContain('***');
		expect(redacted).not.toContain('7Qx2');
	});
});

// ── (b) the executor writes and prints no secret ─────────────────────────────

describe('install run files — the executor writes and prints no secret (b)', () => {
	test('messages, warnings, console output and a thrown error carrying secrets are all redacted', async () => {
		await withPrivateDir(scratchPrivateDir(), async (dir) => {
			const { plan, planFile } = fakePlan(SENTINEL, ALL_SECRETS_ANSWERS);
			const runDir = join(dir, 'install');
			const lockSeen: string[] = [];
			const consoleSeen: string[] = [];
			const loud = (id: string) => async () => {
				console.log(`console line from ${id}: ${SENTINELS.join(' ')}`);
				console.warn(`console warning from ${id}: ${SENTINEL.root_password}`);
				lockSeen.push(readFileSync(join(runDir, LOCK_FILE), 'utf8'));
				return {
					ok: true,
					msg: `${id} used ${SENTINEL.db_password} and ${SENTINEL.smtp_pass}`,
					warnings: [`${id} warned about ${SENTINEL.mysql_password}`],
				};
			};
			const overrides: Record<string, Partial<InstallStepDefinition>> = Object.fromEntries(
				plan.steps.map((id) => [
					id,
					{
						run: loud(id),
						warnings: (outcome: StepRawOutcome) => outcome.warnings as string[],
					},
				]),
			);
			overrides.install_hierarchies = {
				run: async () => {
					throw new Error(
						`hierarchy import failed for user with password ${SENTINEL.root_password} / ${SENTINEL.db_password}`,
					);
				},
			};
			const original = { log: console.log, warn: console.warn, error: console.error };
			const capture = (...args: unknown[]) => consoleSeen.push(args.map(String).join(' '));
			console.log = capture;
			console.warn = capture;
			console.error = capture;
			const { io, lines } = recordingIo();
			let outcome: Awaited<ReturnType<typeof executeInstall>>;
			try {
				outcome = await executeInstall(
					{ mode: 'fresh', planFile, plan, secrets: { ...SENTINEL } },
					io,
					{ table: fakeTable([], overrides), host: fakeHost().host },
				);
			} finally {
				console.log = original.log;
				console.warn = original.warn;
				console.error = original.error;
			}
			expect(outcome.result).toBe('failed');
			expect(outcome.failedStep).toBe('install_hierarchies');

			const planText = readFileSync(join(runDir, PLAN_FILE), 'utf8');
			const stateText = readFileSync(join(runDir, STATE_FILE), 'utf8');
			const printed = [...lines, ...consoleSeen, outcome.message ?? '', ...outcome.hint].join('\n');
			// Anti-vacuity: the steps really ran, really printed, really wrote messages.
			expect(lockSeen.length).toBeGreaterThan(5);
			expect(consoleSeen.length).toBeGreaterThan(10);
			expect(stateText).toContain('***');
			expect(printed).toContain('***');
			expect(stateText).toContain('hierarchy import failed');

			expect(leaked(planText), 'plan file').toEqual([]);
			expect(leaked(stateText), 'state file').toEqual([]);
			expect(leaked(lockSeen.join('\n')), 'lock file').toEqual([]);
			expect(leaked(printed), 'printed lines').toEqual([]);
			expect(modeOf(runDir)).toBe(0o700);
			for (const name of [PLAN_FILE, STATE_FILE]) {
				expect(modeOf(join(runDir, name)), name).toBe(0o600);
			}
		});
	});

	test('a run dir that already exists at 0755 is forced to 0700; a symlink at a tmp name is never followed', async () => {
		await withPrivateDir(scratchPrivateDir(), async (dir) => {
			const { plan, planFile } = fakePlan(SENTINEL, ALL_SECRETS_ANSWERS);
			const runDir = join(dir, 'install');
			mkdirSync(runDir, { mode: 0o755 });
			chmodSync(runDir, 0o755);
			expect(modeOf(runDir)).toBe(0o755);
			// A planted symlink where the plan file's tmp will be: following it
			// would write the plan into the target.
			const target = join(dir, 'outside.txt');
			writeFileSync(target, 'untouched');
			symlinkSync(target, join(runDir, `${PLAN_FILE}.tmp.${process.pid}`));
			const { io } = recordingIo();
			const outcome = await executeInstall(
				{ mode: 'fresh', planFile, plan, secrets: { ...SENTINEL } },
				io,
				{ table: fakeTable([]), host: fakeHost().host },
			);
			expect(outcome.result, outcome.message ?? '').toBe('complete');
			expect(modeOf(runDir)).toBe(0o700);
			expect(readFileSync(target, 'utf8')).toBe('untouched');
			expect(modeOf(join(runDir, PLAN_FILE))).toBe(0o600);
		});
	});
});

// ── (c) the spawned CLI ──────────────────────────────────────────────────────

interface Spawned {
	exitCode: number;
	out: string;
	privateDir: string;
}

/** The CLI with its own scratch private dir; `env` adds the secret channel under test. */
function spawnCli(
	argv: readonly string[],
	extraEnv: Record<string, string> = {},
	stdin?: string,
): Spawned {
	const privateDir = mkdtempSync(join(scratchRoot, 'private_'));
	const base = Object.fromEntries(
		Object.entries(Bun.env).filter(
			([key, value]) => value !== undefined && !key.startsWith('DEDALO_INSTALL_'),
		),
	) as Record<string, string>;
	const proc = Bun.spawnSync([process.execPath, 'run', CLI, ...argv], {
		cwd: ROOT,
		env: {
			...base,
			DEDALO_INSTALL_PRIVATE_DIR: privateDir,
			DEDALO_TS_STATE_PATH: join(privateDir, 'ts_state.json'),
			DEDALO_SESSION_DB_PATH: join(privateDir, 'sessions.sqlite'),
			...extraEnv,
		},
		stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode,
		out: proc.stdout.toString() + proc.stderr.toString(),
		privateDir,
	};
}

/** The answers as flags (an absent database: every run is refused, never installs). */
const ANSWER_ARGV = [
	'--db-name',
	`dedalo_secrets_absent_${process.pid}`,
	'--db-user',
	'secret_user',
	'--entity',
	'secrets',
	'--hierarchies',
	'none',
	'--diffusion',
	'--mysql-name',
	'web_secret',
	'--mysql-user',
	'web_user',
	'--mailer',
	'--smtp-host',
	'smtp.example.org',
];

const SECRET_ENV = {
	DEDALO_INSTALL_DB_PASSWORD: SENTINEL.db_password,
	DEDALO_INSTALL_MYSQL_PASSWORD: SENTINEL.mysql_password,
	DEDALO_INSTALL_SMTP_PASSWORD: SENTINEL.smtp_pass,
	DEDALO_INSTALL_ROOT_PASSWORD: SENTINEL.root_password,
};

describe('install run files — the CLI prints no secret, whatever the channel (c)', () => {
	test('--plan with every secret through the environment prints none', () => {
		const run = spawnCli([...ANSWER_ARGV, '--plan'], SECRET_ENV);
		expect(run.exitCode, run.out).toBe(0);
		expect(leaked(run.out)).toEqual([]);
		expectNothingWritten(run.privateDir);
	}, 60000);

	test('a run refused AFTER the plan (absent database), secrets via --secrets-stdin, prints none and writes nothing', () => {
		const run = spawnCli([...ANSWER_ARGV, '--secrets-stdin'], {}, JSON.stringify(SENTINEL));
		expect(run.exitCode).toBe(1);
		// It got past the plan (the secrets were accepted and used to reach the machine).
		expect(run.out).toContain('→ pre-flight checks');
		expect(leaked(run.out)).toEqual([]);
		expectNothingWritten(run.privateDir);
	}, 60000);

	test('MALFORMED --secrets-stdin (an unquoted secret) is refused without echoing the value', () => {
		// An identifier-shaped value: the parser quotes the whole token.
		const unquoted = 'KestrelUnquoted7Secret';
		const malformed = `{"root_password": ${unquoted}}`;
		const run = spawnCli([...ANSWER_ARGV, '--secrets-stdin', '--plan'], {}, malformed);
		expect(run.exitCode).toBe(1);
		expect(run.out).toContain('--secrets-stdin: not one JSON object');
		expect(run.out).not.toContain(unquoted);
		// Anti-vacuity: the parser's own message WOULD have quoted the value.
		let parserMessage = '';
		try {
			JSON.parse(malformed);
		} catch (error) {
			parserMessage = (error as Error).message;
		}
		expect(parserMessage).toContain(unquoted);
		expectNothingWritten(run.privateDir);
	}, 60000);

	test('argv secrets still work but warn (visible in ps) — and their values are never echoed', () => {
		const run = spawnCli([
			...ANSWER_ARGV,
			'--plan',
			'--db-password',
			SENTINEL.db_password,
			'--smtp-password',
			SENTINEL.smtp_pass,
			'--root-password',
			SENTINEL.root_password,
		]);
		expect(run.exitCode, run.out).toBe(0);
		for (const flag of ['--db-password', '--smtp-password', '--root-password']) {
			expect(run.out).toContain(`⚠ ${flag} on the command line is visible to other users (ps)`);
		}
		expect(leaked(run.out)).toEqual([]);
	}, 60000);

	test('an answers file carrying a secret is refused before any write, the value never echoed', () => {
		const dir = mkdtempSync(join(scratchRoot, 'answers_'));
		const file = join(dir, 'answers.json');
		writeFileSync(
			file,
			JSON.stringify({
				schema: ANSWERS_FILE_SCHEMA,
				answers: { db_database: 'x', db_username: 'u', entity: 'e', smtp_pass: SENTINEL.smtp_pass },
			}),
		);
		const run = spawnCli(['--answers', file], {
			DEDALO_INSTALL_ROOT_PASSWORD: SENTINEL.root_password,
		});
		expect(run.exitCode).toBe(1);
		expect(run.out).toContain(
			"answers file: 'smtp_pass' is a secret and is not accepted in a file",
		);
		expect(leaked(run.out)).toEqual([]);
		expectNothingWritten(run.privateDir);
	}, 60000);
});
