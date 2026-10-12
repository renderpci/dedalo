/**
 * INSTALL VALIDATION UP FRONT TRIPWIRE — every refusal an install's ANSWERS can
 * earn is raised by the PLAN, before anything is written, and the three front
 * ends refuse identically (terminal installer phase 1, 2026-10-11;
 * src/core/install/install_validation.ts).
 *
 * WHY. Until the validation moved into the plan, an invalid answer was found by
 * the step that first used it: a weak root password at set_root_pw — AFTER the
 * .env, the seed restore and the ontology import (a half-built install for an
 * input the plan could have refused); an entity `1x` only by the wizard's own
 * client-side check, the CLI accepting it; a port `x` only when the server
 * booted.
 *
 * WHAT IS MEASURED (outcomes, never source spellings):
 *  (a) ONE table of bad answers. Each row's refusal appears in the plan's
 *      `errors` IDENTICALLY through the three ways answers arrive — the CLI argv
 *      (the flag of each key DERIVED from INSTALL_CLI_FLAGS, never re-typed), an
 *      answers file (`answersFromAnswersFile`, the `--answers` envelope) and the
 *      wizard post (its record shape) — and the base answers the table perturbs
 *      are themselves clean on all three (anti-vacuity).
 *  (b) The root password is a PLAN INPUT (a wizard post and an answers file never
 *      carry it): every rule of THE policy (client password_policy.js
 *      PASSWORD_RULES, iterated — a new rule without a row is red) refuses
 *      through the plan; a fresh run REQUIRES one, `--plan` only checks a
 *      supplied one; and the plan's refusal agrees with the server's own
 *      (`passwordPolicyFailure`, the function set_root_pw refuses with) over a
 *      corpus — two callers of one rule, held to one verdict.
 *  (c) The REAL CLI, spawned for an install (not `--plan`) with a scratch
 *      private dir and a scratch server-state path: each refusal row exits 1
 *      with its sentence on stderr and leaves the scratch dir EMPTY — no .env, no
 *      `install/` (plan, state, lock, staging), no ts_state.json. The target
 *      database name is one that does not exist, so a regression that let a bad
 *      answer through would be refused LATER with a different sentence (the
 *      database preflight) — the sentence assertion is what reddens.
 *
 * DB-FREE by construction (the hermetic tier runs it): nothing here connects to
 * Postgres. The database half — a refused install leaves the TARGET database
 * at zero objects; a non-empty or missing database is refused before any write
 * — needs a server and is test/unit/install_resume_drill.test.ts's
 * (`preflight refusals` describe).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PASSWORD_RULES } from '../../client/dedalo/core/component_password/js/password_policy.js';
import {
	ANSWERS_FILE_SCHEMA,
	answersFromAnswersFile,
	answersFromCliArgs,
	buildInstallPlan,
	INSTALL_CLI_FLAGS,
	SECRET_ANSWER_KEYS,
} from '../../src/core/install/install_plan.ts';
import { rootPasswordErrors } from '../../src/core/install/install_validation.ts';
import { passwordPolicyFailure } from '../../src/core/security/password_policy.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/install.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_upfront_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** A database that never exists: a regression past the plan is refused LATER, differently. */
const ABSENT_DB = `dedalo_upfront_absent_${process.pid}`;
/** A password every policy rule accepts. */
const GOOD_ROOT_PASSWORD = 'Mosaic-Kestrel-Harbor-47';

/** Clean base answers, as the wizard posts them (no secret: a trust connection). */
const BASE: Readonly<Record<string, unknown>> = Object.freeze({
	db_database: ABSENT_DB,
	db_username: 'upfront_user',
	db_hostname: 'localhost',
	db_port: '5432',
	entity: 'upfront',
	entity_label: 'Upfront Museum',
	timezone: 'Europe/Madrid',
	locale: 'es-ES',
	langs: ['lg-spa', 'lg-eng'],
	app_lang_default: 'lg-spa',
	data_lang_default: 'lg-eng',
	hierarchies: [],
});

const FLAG_OF: ReadonlyMap<string, { flag: string; kind: 'value' | 'bool' }> = new Map(
	INSTALL_CLI_FLAGS.filter((spec) => spec.key !== null).map((spec) => [
		spec.key as string,
		{ flag: spec.flag, kind: spec.kind },
	]),
);

/** The wizard-shape answers typed the CLI's way — each key's flag read from the flag table. */
function argvOf(answers: Readonly<Record<string, unknown>>): string[] {
	const argv: string[] = [];
	for (const [key, value] of Object.entries(answers)) {
		const spec = FLAG_OF.get(key);
		if (spec === undefined) throw new Error(`no CLI flag sets '${key}'`);
		if (spec.kind === 'bool') {
			// Only the positive bool flags are used by this table (--diffusion, --mailer).
			if (value === true) argv.push(spec.flag);
			continue;
		}
		argv.push(
			spec.flag,
			Array.isArray(value) ? (value.length === 0 ? 'none' : value.join(',')) : String(value),
		);
	}
	return argv;
}

/** The plan errors of `answers` through each front end. */
function errorsThreeWays(answers: Readonly<Record<string, unknown>>): {
	argv: readonly string[];
	file: readonly string[];
	wizard: readonly string[];
} {
	const invocation = answersFromCliArgs(argvOf(answers));
	expect(invocation.errors, 'the argv itself parses').toEqual([]);
	const file = answersFromAnswersFile({ schema: ANSWERS_FILE_SCHEMA, answers });
	expect(file.errors, 'the answers file itself parses').toEqual([]);
	return {
		argv: buildInstallPlan(invocation.raw).errors,
		file: buildInstallPlan(file.raw).errors,
		wizard: buildInstallPlan(answers).errors,
	};
}

interface BadRow {
	name: string;
	/** Overrides applied to BASE. */
	answers: Record<string, unknown>;
	/** The plan error the row must earn (exact). */
	error: string;
}

const MAILER = {
	mailer: true,
	smtp_host: 'smtp.example.org',
	smtp_port: '587',
	smtp_secure: 'tls',
};
const DIFFUSION = {
	diffusion: true,
	mysql_hostname: 'localhost',
	mysql_port: '3306',
	mysql_database: 'web_upfront',
	mysql_username: 'web_user',
};

const BAD_ROWS: readonly BadRow[] = [
	{
		name: 'entity starting with a digit',
		answers: { entity: '1x' },
		error: "entity '1x' must start with a letter and contain only letters, digits and _",
	},
	{
		name: 'entity with a hyphen',
		answers: { entity: 'a-b' },
		error: "entity 'a-b' must start with a letter and contain only letters, digits and _",
	},
	{ name: 'entity empty', answers: { entity: '' }, error: 'entity is required' },
	{ name: 'db_port 0', answers: { db_port: '0' }, error: "db_port '0' must be an integer 1-65535" },
	{
		name: 'db_port 70000',
		answers: { db_port: '70000' },
		error: "db_port '70000' must be an integer 1-65535",
	},
	{ name: 'db_port x', answers: { db_port: 'x' }, error: "db_port 'x' must be an integer 1-65535" },
	{
		name: 'smtp_port out of range (mailer on)',
		answers: { ...MAILER, smtp_port: '99999' },
		error: "smtp_port '99999' must be an integer 1-65535",
	},
	{
		name: 'mysql_port not a number (diffusion on)',
		answers: { ...DIFFUSION, mysql_port: 'abc' },
		error: "mysql_port 'abc' must be an integer 1-65535",
	},
	{
		name: 'smtp_secure starttls',
		answers: { ...MAILER, smtp_secure: 'starttls' },
		error: 'smtp_secure must be tls|ssl|none',
	},
	{ name: 'mailer without host', answers: { mailer: true }, error: 'mailer requires smtp_host' },
	{
		name: 'media_access_mode typo',
		answers: { media_access_mode: 'privat' },
		error: 'media_access_mode must be private|publication|false (or empty)',
	},
	{
		name: 'timezone unknown',
		answers: { timezone: 'Mars/Base' },
		error: "timezone 'Mars/Base' is not a valid IANA time zone",
	},
	{
		name: 'locale with an underscore',
		answers: { locale: 'es_ES' },
		error: "locale 'es_ES' is not a valid BCP 47 tag",
	},
	{
		name: 'relative media_path',
		answers: { media_path: 'media/here' },
		error: 'media_path must be an absolute path',
	},
	{
		name: 'relative unix_socket',
		answers: { unix_socket: 'run/dedalo.sock' },
		error: 'unix_socket must be an absolute path',
	},
	{
		name: 'diffusion without mysql_username',
		answers: { ...DIFFUSION, mysql_username: '' },
		error: 'diffusion requires mysql_username',
	},
	{
		name: 'db_database shaped like an option',
		answers: { db_database: '-cfoo' },
		error: 'db_database: looks like a command-line option',
	},
	{
		name: 'db_username with a newline',
		answers: { db_username: 'user\nx' },
		error: 'db_username: contains an illegal control character',
	},
	{
		name: 'information with a newline',
		answers: { information: 'line one\nline two' },
		error: 'information contains an illegal control character',
	},
	{
		name: 'info_key with a NUL',
		answers: { info_key: 'k\0' },
		error: 'info_key contains an illegal control character',
	},
	// The ROUTE and the INSTANCE (terminal installer phase 2, 2026-10-12).
	{
		name: 'an unknown route',
		answers: { route: 'cloud' },
		error: 'route must be production|docker|trial|developer',
	},
	{
		name: 'production without an instance',
		answers: { route: 'production' },
		error: 'the production route requires instance (e.g. --instance prado)',
	},
	{
		name: 'an instance on the developer route (the default)',
		answers: { instance: 'prado' },
		error: 'instance is only meaningful on the production route (route is developer)',
	},
	{
		name: 'an instance on the docker route',
		answers: { route: 'docker', instance: 'prado' },
		error: 'instance is only meaningful on the production route (route is docker)',
	},
	{
		name: 'a malformed instance',
		answers: { route: 'production', instance: 'Prado-1' },
		error:
			"instance 'Prado-1' must start with a lowercase letter and contain only a-z, 0-9 and _ (28 characters at most)",
	},
	{
		name: 'an instance too long for the unix user ded_<instance>',
		answers: { route: 'production', instance: `p${'x'.repeat(28)}` },
		error: `instance 'p${'x'.repeat(28)}' must start with a lowercase letter and contain only a-z, 0-9 and _ (28 characters at most)`,
	},
];

/** A row whose refusal comes from the language derivation (its sentence is that module's). */
const LANG_ROW = {
	name: 'application language outside the chosen languages',
	answers: { langs: ['lg-spa', 'lg-eng'], app_lang_default: 'lg-fra' },
	prefix: 'languages: ',
};

// ── (a) one table, three front ends ──────────────────────────────────────────

describe('install validation — every bad answer refused by the plan, identically on three front ends (a)', () => {
	test('the base answers are CLEAN through all three (the table perturbs a valid install)', () => {
		const clean = errorsThreeWays(BASE);
		expect(clean).toEqual({ argv: [], file: [], wizard: [] });
	});

	for (const row of BAD_ROWS) {
		test(`${row.name}: '${row.error}' on argv ≡ answers file ≡ wizard post`, () => {
			const seen = errorsThreeWays({ ...BASE, ...row.answers });
			expect(seen.argv).toContain(row.error);
			expect(seen.file).toEqual(seen.argv);
			expect(seen.wizard).toEqual(seen.argv);
		});
	}

	// D7 (2026-10-12): the publication database has a plan default, so diffusion
	// without one is NOT refused (the old "diffusion requires mysql_database" rule
	// is gone) — the default is written instead, the instance's on production.
	test('diffusion without mysql_database is CLEAN on all three: the plan default is used', () => {
		const answers = { ...BASE, ...DIFFUSION, mysql_database: '' };
		expect(errorsThreeWays(answers)).toEqual({ argv: [], file: [], wizard: [] });
		expect(buildInstallPlan(answers).answers.mysql_database).toBe('web_dedalo');
		const production = buildInstallPlan({ ...answers, route: 'production', instance: 'prado' });
		expect(production.errors).toEqual([]);
		expect(production.answers.mysql_database).toBe('web_prado');
	});

	test('a valid production instance is CLEAN on all three (the route rows are not vacuous)', () => {
		expect(errorsThreeWays({ ...BASE, route: 'production', instance: 'prado' })).toEqual({
			argv: [],
			file: [],
			wizard: [],
		});
	});

	test(`${LANG_ROW.name}: a 'languages:' refusal on argv ≡ answers file ≡ wizard post`, () => {
		const seen = errorsThreeWays({ ...BASE, ...LANG_ROW.answers });
		expect(seen.argv.some((error) => error.startsWith(LANG_ROW.prefix))).toBe(true);
		expect(seen.file).toEqual(seen.argv);
		expect(seen.wizard).toEqual(seen.argv);
	});
});

// ── (b) the root password, a plan input ──────────────────────────────────────

/** One password breaking each rule FIRST (the rule ids are the policy's own). */
const WEAK_BY_RULE: Readonly<Record<string, string>> = {
	length: 'Ab1-x',
	lower: 'KESTREL-HARBOR-47',
	upper: 'kestrel-harbor-47',
	digit: 'Kestrel-Harbor-Mosaic',
	banned_chars: 'Kestrel&Harbor-47',
	banned_words: 'Kestrel-Password-47',
	sequence: 'Kestrel-Harbor-6789',
};

describe('install validation — the root password is held to THE policy by the plan (b)', () => {
	test('every rule of the policy has a refusing row (a new rule without one is red)', () => {
		const ids = PASSWORD_RULES.map((rule) => rule.id);
		expect(ids.length).toBeGreaterThanOrEqual(5);
		expect(Object.keys(WEAK_BY_RULE).sort()).toEqual([...ids].sort());
	});

	for (const [rule, password] of Object.entries(WEAK_BY_RULE)) {
		test(`a password breaking '${rule}' is a plan error, run or --plan alike`, () => {
			const expected = `root password does not meet the password policy (${rule})`;
			for (const requireRootPassword of [true, false]) {
				const plan = buildInstallPlan(BASE, { rootPassword: password, requireRootPassword });
				expect(plan.errors).toContain(expected);
				expect(plan.rootPasswordErrors).toEqual([expected]);
			}
		});
	}

	test('a run REQUIRES one; --plan (not required) does not; a good one passes both', () => {
		const required =
			'root password is required (DEDALO_INSTALL_ROOT_PASSWORD, --secrets-stdin or --root-password)';
		expect(buildInstallPlan(BASE, { requireRootPassword: true }).errors).toContain(required);
		expect(buildInstallPlan(BASE, { requireRootPassword: false }).errors).toEqual([]);
		expect(
			buildInstallPlan(BASE, { rootPassword: GOOD_ROOT_PASSWORD, requireRootPassword: true })
				.errors,
		).toEqual([]);
	});

	test("the plan's verdict equals the server's own refusal (passwordPolicyFailure) over a corpus", () => {
		const corpus = [
			...Object.values(WEAK_BY_RULE),
			GOOD_ROOT_PASSWORD,
			'Ñandú-Çedilla-Ωmega-9',
			'Zz9-zz9-ZZ9-zz9',
			'x'.repeat(65),
			`Aa1-${'x'.repeat(60)}`,
			'Clave-Segura-27',
			'Abcd-Harbor-27',
		];
		let refused = 0;
		for (const password of corpus) {
			const failure = passwordPolicyFailure(password);
			const errors = rootPasswordErrors(password, true);
			if (failure === null) expect(errors, password).toEqual([]);
			else {
				refused += 1;
				expect(errors, password).toEqual([
					`root password does not meet the password policy (${failure})`,
				]);
			}
		}
		// Both verdicts are exercised (anti-vacuity).
		expect(refused).toBeGreaterThan(5);
		expect(refused).toBeLessThan(corpus.length);
	});
});

// ── (c) the real CLI writes nothing for a refused answer ─────────────────────

interface SpawnedRun {
	exitCode: number;
	stdout: string;
	stderr: string;
	privateDir: string;
}

/**
 * The real CLI, spawned for an INSTALL (not --plan): a fresh scratch private dir,
 * the server state and the session store inside it; the root password through
 * the environment (the supported channel) unless the row overrides it.
 */
function spawnInstall(
	argv: readonly string[],
	options: { rootPassword?: string | null; stdin?: string } = {},
): SpawnedRun {
	const privateDir = mkdtempSync(join(scratchRoot, 'private_'));
	const password = options.rootPassword === undefined ? GOOD_ROOT_PASSWORD : options.rootPassword;
	// An undefined value REMOVES the key (no inherited fault seam, no inherited password).
	const env = Object.fromEntries(
		Object.entries({
			...Bun.env,
			DEDALO_INSTALL_PRIVATE_DIR: privateDir,
			DEDALO_TS_STATE_PATH: join(privateDir, 'ts_state.json'),
			DEDALO_SESSION_DB_PATH: join(privateDir, 'sessions.sqlite'),
			DEDALO_INSTALL_ROOT_PASSWORD: password ?? undefined,
			DEDALO_INSTALL_FAULT: undefined,
		}).filter((entry): entry is [string, string] => entry[1] !== undefined),
	);
	const proc = Bun.spawnSync([process.execPath, 'run', CLI, ...argv], {
		cwd: ROOT,
		env,
		stdin: options.stdin === undefined ? 'ignore' : Buffer.from(options.stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
		privateDir,
	};
}

/** The run refused with `sentence` and left its private dir EMPTY. */
function expectRefusedClean(run: SpawnedRun, sentence: string): void {
	expect(run.exitCode, run.stdout + run.stderr).toBe(1);
	expect(run.stderr).toContain(sentence);
	// Nothing written: no .env, no install/ (plan, state, lock, staging), no ts_state.json.
	expectNothingWritten(run.privateDir);
}

/**
 * "Nothing was written" into the scratch private dir this test made: rmdir
 * succeeds ONLY on an empty directory — the proof without enumerating it.
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

/** An answers file (the `--answers` envelope) in the scratch root. */
function answersFile(answers: Record<string, unknown>): string {
	const path = join(mkdtempSync(join(scratchRoot, 'answers_')), 'answers.json');
	writeFileSync(path, JSON.stringify({ schema: ANSWERS_FILE_SCHEMA, answers }));
	return path;
}

describe('install validation — the spawned CLI refuses before writing anything (c)', () => {
	test('control: valid answers get PAST the plan (refused by the database preflight instead)', () => {
		// Anti-vacuity: what makes the rows below meaningful is that a clean plan
		// reaches the machine checks, which refuse with a DIFFERENT sentence.
		const run = spawnInstall(argvOf(BASE));
		expect(run.exitCode).toBe(1);
		// It reached the executor's machine checks (printed only after the plan passed).
		expect(run.stdout).toContain('→ pre-flight checks');
		expect(run.stderr).not.toContain('must start with a letter');
		expect(run.stderr).not.toContain('password policy');
		expectNothingWritten(run.privateDir);
	}, 60000);

	test('a weak root password', () => {
		expectRefusedClean(
			spawnInstall(argvOf(BASE), { rootPassword: WEAK_BY_RULE.sequence }),
			'root password does not meet the password policy (sequence)',
		);
	}, 60000);

	test('no root password at all', () => {
		expectRefusedClean(
			spawnInstall(argvOf(BASE), { rootPassword: null }),
			'root password is required',
		);
	}, 60000);

	for (const row of BAD_ROWS.filter((candidate) =>
		[
			'entity starting with a digit',
			'db_port 70000',
			'information with a newline',
			'db_database shaped like an option',
			'timezone unknown',
		].includes(candidate.name),
	)) {
		test(row.name, () => {
			const run = spawnInstall(argvOf({ ...BASE, ...row.answers }));
			expectRefusedClean(run, row.error);
			expect(run.stdout).not.toContain('→ pre-flight checks');
		}, 60000);
	}

	test('a language default outside the chosen languages', () => {
		expectRefusedClean(spawnInstall(argvOf({ ...BASE, ...LANG_ROW.answers })), LANG_ROW.prefix);
	}, 60000);

	test('the same refusal through --answers <file>', () => {
		const file = answersFile({ ...BASE, entity: '1x' });
		expectRefusedClean(
			spawnInstall(['--answers', file]),
			"entity '1x' must start with a letter and contain only letters, digits and _",
		);
	}, 60000);

	test('an answers file carrying a SECRET is refused (each secret key), nothing written', () => {
		expect(SECRET_ANSWER_KEYS.length).toBeGreaterThanOrEqual(3);
		for (const key of SECRET_ANSWER_KEYS) {
			const run = spawnInstall([
				'--answers',
				answersFile({ ...BASE, [key]: 'SENTINEL-in-file-91' }),
			]);
			expectRefusedClean(run, `answers file: '${key}' is a secret and is not accepted in a file`);
			expect(run.stdout + run.stderr).not.toContain('SENTINEL-in-file-91');
		}
	}, 120000);

	test('a key set by both the answers file and a flag is refused (no silent precedence)', () => {
		const file = answersFile({ ...BASE });
		expectRefusedClean(
			spawnInstall(['--answers', file, '--entity', 'other']),
			'entity is set by both --answers and --entity',
		);
	}, 60000);

	test('--secrets-stdin with an unknown key is refused, nothing written', () => {
		expectRefusedClean(
			spawnInstall([...argvOf(BASE), '--secrets-stdin'], {
				stdin: JSON.stringify({ root_password: GOOD_ROOT_PASSWORD, api_token: 'x' }),
			}),
			"--secrets-stdin: unknown key 'api_token'",
		);
	}, 60000);
});
