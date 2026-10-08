/**
 * INSTALL PLAN PARITY TRIPWIRE — the CLI and the browser wizard are FRONT ENDS
 * of one install plan (src/core/install/install_plan.ts; installer unification
 * A1/A3/A7, 2026-10-08), so the same answers must produce the same install.
 *
 * WHY. Before the plan module each front end carried its own answers → .env
 * mapping and its own defaults, and they had drifted (measured): the CLI
 * defaulted the database host to `/tmp`, wrote an empty entity label,
 * installed no optional thesaurus while the wizard pre-ticked three, silently
 * accepted `--yes` and any other unknown flag, and NO front end wrote
 * ONTOLOGY_SERVERS / CODE_SERVERS — every fresh install's update panels said
 * "No master servers are configured".
 *
 * WHAT IS MEASURED (outcomes, not spellings):
 *  (a) an answer matrix — base, +diffusion, +mailer, +serving keys, air-gapped,
 *      thesauri default / none / explicit / with the core `lg` — posted the
 *      wizard's way (its record shape; the default thesauri read from the
 *      wizard's own context) and typed the CLI's way (argv through
 *      answersFromCliArgs): identical .env sections, keys, steps, thesauri.
 *      (The wizard's thesauri are posted again to install_hierarchies, which
 *      runs the plan's normalizeHierarchyChoice — gated where it is wired, in
 *      install_step_router_native.)
 *  (b) ONE spawned `scripts/install.ts --plan` equals the in-process plan —
 *      the CLI really runs the module, not a copy of it;
 *  (c) persistConfig, run in two scratch private dirs from the CLI-derived and
 *      the wizard answers, writes .env files whose parsed keys AND values are
 *      identical except the generated DEDALO_SALT_STRING;
 *  (d) the default .env carries the official servers, and the plan's official
 *      constants equal the fenced examples the config catalog documents (one
 *      truth); air-gapped writes `[]`; a prior custom server list survives a
 *      non-air-gapped re-run verbatim, but a prior `[]` (an earlier air-gapped
 *      answer) yields to an official re-run;
 *  (e) every plan step is an action the wizard router serves;
 *  (f) unknown flags (`--yes`) and value flags without a value are errors and
 *      the spawned CLI exits 1; `lg` is dropped with a note; an unvendored tld
 *      is an error;
 *  (g) no plan, whatever the answers, owns DEDALO_SUPERVISED — supervision is
 *      declared by the process manager, never by ../private/.env.
 *
 * persistConfig runs in CHILD processes (scratch DEDALO_INSTALL_PRIVATE_DIR +
 * DEDALO_TS_STATE_PATH in the child's env), so this gate never mutates its own
 * process environment and never touches the live ../private/.env or state.
 * No database is touched anywhere in this file.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MAINTENANCE_KEYS } from '../../src/config/catalog/maintenance.ts';
import { parseEnvFile } from '../../src/config/env.ts';
import { buildInstallContext } from '../../src/core/install/context.ts';
import { INSTALL_ROUTER_ACTIONS } from '../../src/core/install/engine.ts';
import {
	answersFromCliArgs,
	buildInstallPlan,
	INSTALL_CLI_FLAGS,
	INSTALL_STEP_IDS,
	type InstallPlan,
	OFFICIAL_CODE_SERVER,
	OFFICIAL_ONTOLOGY_SERVER,
} from '../../src/core/install/install_plan.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/install.ts');
const CONFIG_PERSIST = join(ROOT, 'src/core/install/config_persist.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_plan_parity_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** The thesauri the WIZARD pre-ticks — read from the context it is served, not re-typed. */
const WIZARD_DEFAULT_THESAURI = (
	buildInstallContext().properties as { install_checked_default: string[] }
).install_checked_default;

// ── the answer matrix ─────────────────────────────────────────────────────────

interface AnswerCase {
	name: string;
	argv: string[];
	wizard: Record<string, unknown>;
}

const BASE_ARGV = [
	'--db-name',
	'dedalo_parity',
	'--db-user',
	'parity_user',
	'--db-password',
	'secret pass',
	'--db-host',
	'localhost',
	'--db-port',
	'5432',
	'--entity',
	'parity',
	'--entity-label',
	'Parity Museum',
	'--timezone',
	'Europe/Madrid',
	'--locale',
	'es-ES',
	'--langs',
	'lg-spa,lg-eng',
	'--app-lang',
	'lg-spa',
	'--data-lang',
	'lg-eng',
];

/** The same answers as the wizard posts them (its key names, its value shapes). */
const BASE_WIZARD: Record<string, unknown> = {
	db_database: 'dedalo_parity',
	db_username: 'parity_user',
	db_password: 'secret pass',
	db_hostname: 'localhost',
	db_port: '5432',
	db_socket: '',
	entity: 'parity',
	entity_label: 'Parity Museum',
	timezone: 'Europe/Madrid',
	locale: 'es-ES',
	langs: ['lg-spa', 'lg-eng'],
	app_lang_default: 'lg-spa',
	data_lang_default: 'lg-eng',
	diffusion: false,
	mailer: false,
	update_servers: true,
	hierarchies: WIZARD_DEFAULT_THESAURI,
};

const DIFFUSION_ARGV = [
	'--diffusion',
	'--mysql-host',
	'mariadb.local',
	'--mysql-port',
	'3307',
	'--mysql-name',
	'web_parity',
	'--mysql-user',
	'web_user',
	'--mysql-password',
	'web pw',
];
const DIFFUSION_WIZARD = {
	diffusion: true,
	mysql_hostname: 'mariadb.local',
	mysql_port: '3307',
	mysql_database: 'web_parity',
	mysql_username: 'web_user',
	mysql_password: 'web pw',
};
const MAILER_ARGV = [
	'--mailer',
	'--smtp-host',
	'smtp.example.org',
	'--smtp-port',
	'465',
	'--smtp-secure',
	'ssl',
	'--smtp-user',
	'mailer@example.org',
	'--smtp-password',
	'mail pw',
	'--smtp-from',
	'noreply@example.org',
	'--smtp-from-name',
	'Dédalo',
];
const MAILER_WIZARD = {
	mailer: true,
	smtp_host: 'smtp.example.org',
	smtp_port: '465',
	smtp_secure: 'ssl',
	smtp_user: 'mailer@example.org',
	smtp_pass: 'mail pw',
	smtp_from: 'noreply@example.org',
	smtp_from_name: 'Dédalo',
};

const CASES: AnswerCase[] = [
	{ name: 'base (every default)', argv: BASE_ARGV, wizard: BASE_WIZARD },
	{
		name: '+diffusion',
		argv: [...BASE_ARGV, ...DIFFUSION_ARGV],
		wizard: { ...BASE_WIZARD, ...DIFFUSION_WIZARD },
	},
	{
		name: '+mailer',
		argv: [...BASE_ARGV, ...MAILER_ARGV],
		wizard: { ...BASE_WIZARD, ...MAILER_WIZARD },
	},
	{
		name: '+serving keys',
		argv: [
			...BASE_ARGV,
			'--media-path',
			'/srv/dedalo/media',
			'--socket',
			'/run/dedalo/dedalo_ts.sock',
			'--media-access-mode',
			'publication',
		],
		wizard: {
			...BASE_WIZARD,
			media_path: '/srv/dedalo/media',
			unix_socket: '/run/dedalo/dedalo_ts.sock',
			media_access_mode: 'publication',
		},
	},
	{
		name: 'air-gapped (no update servers)',
		argv: [...BASE_ARGV, '--no-update-servers'],
		wizard: { ...BASE_WIZARD, update_servers: false },
	},
	{
		name: 'thesauri: none',
		argv: [...BASE_ARGV, '--hierarchies', 'none'],
		wizard: { ...BASE_WIZARD, hierarchies: [] },
	},
	{
		name: 'thesauri: explicit',
		argv: [...BASE_ARGV, '--hierarchies', 'ad,fr'],
		wizard: { ...BASE_WIZARD, hierarchies: ['ad', 'fr'] },
	},
	{
		name: 'thesauri: with the core lg',
		argv: [...BASE_ARGV, '--hierarchies', 'lg,fr'],
		wizard: { ...BASE_WIZARD, hierarchies: ['lg', 'fr'] },
	},
];

/** What a plan DECIDES (the fields both front ends must agree on). */
function decided(plan: InstallPlan) {
	return {
		env: plan.env,
		envKeys: plan.envKeys,
		steps: plan.steps,
		hierarchies: plan.hierarchies,
		notes: plan.notes,
		errors: plan.errors,
	};
}

function cliPlan(argv: readonly string[]): InstallPlan {
	const invocation = answersFromCliArgs(argv);
	expect(invocation.errors).toEqual([]);
	return buildInstallPlan(invocation.raw);
}

// ── child processes ──────────────────────────────────────────────────────────

/** Spawn the real CLI in --plan mode (touches nothing). */
function spawnPlan(argv: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
	const proc = Bun.spawnSync([process.execPath, 'run', CLI, '--plan', ...argv], {
		cwd: ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

/**
 * persistConfig in a CHILD with its own scratch private dir + state path; the
 * answers ride stdin. Answers the written .env text.
 */
function persistInChild(answers: Record<string, unknown>, privateDir: string): string {
	const script = `const { persistConfig } = await import(${JSON.stringify(CONFIG_PERSIST)});
const answers = JSON.parse(await Bun.stdin.text());
await persistConfig(answers);`;
	const proc = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: ROOT,
		env: {
			...Bun.env,
			DEDALO_INSTALL_PRIVATE_DIR: privateDir,
			DEDALO_TS_STATE_PATH: join(privateDir, 'ts_state.json'),
			DEDALO_INSTALL_NO_RESTART: 'true',
		},
		stdin: Buffer.from(JSON.stringify(answers)),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	expect(proc.exitCode, `persistConfig child failed: ${proc.stderr.toString()}`).toBe(0);
	return readFileSync(join(privateDir, '.env'), 'utf8');
}

function scratchDir(name: string): string {
	return mkdtempSync(join(scratchRoot, `${name}_`));
}

/** The fenced `KEY=<json>` example a catalog entry documents. */
function catalogExample(key: 'ONTOLOGY_SERVERS' | 'CODE_SERVERS'): unknown {
	const doc = MAINTENANCE_KEYS[key].doc;
	const line = doc.split('\n').find((candidate) => candidate.startsWith(`${key}=`));
	expect(line, `the catalog documents a ${key}= example`).toBeDefined();
	return JSON.parse((line as string).slice(key.length + 1));
}

// ── (a) CLI ≡ wizard ─────────────────────────────────────────────────────────

describe('install plan — CLI ≡ wizard (a)', () => {
	test('the wizard really pre-ticks a non-empty default (the matrix is not vacuous)', () => {
		expect(WIZARD_DEFAULT_THESAURI.length).toBeGreaterThan(0);
		expect(CASES.length).toBeGreaterThanOrEqual(8);
	});

	for (const answerCase of CASES) {
		test(`${answerCase.name}: same .env sections, keys, steps, thesauri`, () => {
			const fromCli = cliPlan(answerCase.argv);
			const fromWizard = buildInstallPlan(answerCase.wizard);
			expect(fromCli.errors).toEqual([]);
			expect(fromCli.envKeys.length).toBeGreaterThan(15);
			expect(decided(fromCli)).toEqual(decided(fromWizard));
		});
	}

	test('the matrix exercises what it claims (the decided fields really differ by case)', () => {
		const base = cliPlan(CASES[0]?.argv ?? []);
		const diffusion = cliPlan(CASES[1]?.argv ?? []);
		const mailer = cliPlan(CASES[2]?.argv ?? []);
		expect(diffusion.steps).toContain('test_diffusion_connection');
		expect(base.steps).not.toContain('test_diffusion_connection');
		expect(mailer.steps).toContain('test_mailer_connection');
		expect(diffusion.envKeys).toContain('DEDALO_DIFFUSION_NATIVE');
		expect(mailer.envKeys).toContain('DEDALO_SMTP_HOST');
		expect(cliPlan(CASES[3]?.argv ?? []).envKeys).toContain('SERVER_UNIX_SOCKET');
		expect(cliPlan(CASES[5]?.argv ?? []).hierarchies).toEqual([]);
		expect(base.hierarchies).toEqual(WIZARD_DEFAULT_THESAURI);
	});
});

// ── (b) the spawned CLI uses the module ─────────────────────────────────────

describe('install plan — the CLI runs the module (b)', () => {
	test('`scripts/install.ts --plan` prints the in-process plan and exits 0', () => {
		const argv = [...BASE_ARGV, ...DIFFUSION_ARGV, '--hierarchies', 'lg,ad'];
		const spawned = spawnPlan(argv);
		expect(spawned.exitCode, spawned.stderr).toBe(0);
		const printed = JSON.parse(spawned.stdout.trim()) as Record<string, unknown>;
		const local = cliPlan(argv);
		expect(printed).toEqual({
			env_keys: [...local.envKeys],
			steps: [...local.steps],
			hierarchies: [...local.hierarchies],
			notes: [...local.notes],
			errors: [],
		});
		expect((printed.notes as string[]).length).toBe(1);
	});
});

// ── (c) + (d) the written .env ───────────────────────────────────────────────

describe('install plan — the written .env (c, d)', () => {
	test('CLI-derived and wizard answers write the same .env (salt aside)', () => {
		const answerCase = {
			argv: [...BASE_ARGV, ...DIFFUSION_ARGV, ...MAILER_ARGV],
			wizard: { ...BASE_WIZARD, ...DIFFUSION_WIZARD, ...MAILER_WIZARD },
		};
		// The CLI hands persistConfig the plan's normalized answers (scripts/install.ts).
		const cliAnswers = { ...cliPlan(answerCase.argv).answers };
		const cliEnv = parseEnvFile(persistInChild(cliAnswers, scratchDir('cli')));
		const wizardEnv = parseEnvFile(persistInChild(answerCase.wizard, scratchDir('wizard')));
		expect(Object.keys(cliEnv).length).toBeGreaterThan(30);
		expect(cliEnv.DEDALO_SALT_STRING).toMatch(/^[0-9a-f]{64}$/);
		const { DEDALO_SALT_STRING: _cliSalt, ...cliRest } = cliEnv;
		const { DEDALO_SALT_STRING: _wizardSalt, ...wizardRest } = wizardEnv;
		expect(cliRest).toEqual(wizardRest);
	});

	test('the default .env carries the official servers — the SAME entries the catalog documents', () => {
		expect([OFFICIAL_ONTOLOGY_SERVER]).toEqual(catalogExample('ONTOLOGY_SERVERS') as never);
		expect([OFFICIAL_CODE_SERVER]).toEqual(catalogExample('CODE_SERVERS') as never);
		const env = parseEnvFile(persistInChild(BASE_WIZARD, scratchDir('default')));
		expect(JSON.parse(env.ONTOLOGY_SERVERS as string)).toEqual([OFFICIAL_ONTOLOGY_SERVER]);
		expect(JSON.parse(env.CODE_SERVERS as string)).toEqual([OFFICIAL_CODE_SERVER]);
	});

	test('air-gapped writes [] for both lists', () => {
		const env = parseEnvFile(
			persistInChild({ ...BASE_WIZARD, update_servers: false }, scratchDir('airgapped')),
		);
		expect(JSON.parse(env.ONTOLOGY_SERVERS as string)).toEqual([]);
		expect(JSON.parse(env.CODE_SERVERS as string)).toEqual([]);
	});

	test('a prior custom server list survives a non-air-gapped re-run verbatim', () => {
		const dir = scratchDir('mirror');
		const mirror =
			'ONTOLOGY_SERVERS=[{"name":"Mirror","url":"https://mirror.example.org/dedalo/core/api/v1/json/","code":"m1"}]';
		writeFileSync(join(dir, '.env'), `DEDALO_SALT_STRING=deadbeef\n${mirror}\n`);
		const body = persistInChild(BASE_WIZARD, dir);
		const lines = body.split('\n');
		expect(lines.filter((line) => line.startsWith('ONTOLOGY_SERVERS='))).toEqual([mirror]);
		// The list the operator did not customise is still written official.
		expect(JSON.parse(parseEnvFile(body).CODE_SERVERS as string)).toEqual([OFFICIAL_CODE_SERVER]);
	});

	// The wizard re-save it invites: an air-gapped save, then a reload (the box
	// arrives ticked) and a save with the official server. The earlier `[]` is an
	// ANSWER, not a mirror — keeping it would leave the install offline while the
	// form showed the official server. Same for an unparseable prior value.
	test('an official re-run after an air-gapped one writes the official lists (a prior [] is not preserved)', () => {
		const dir = scratchDir('airgapped_then_official');
		writeFileSync(
			join(dir, '.env'),
			'DEDALO_SALT_STRING=deadbeef\nONTOLOGY_SERVERS=[]\nCODE_SERVERS=not-json\n',
		);
		const body = persistInChild(BASE_WIZARD, dir);
		const env = parseEnvFile(body);
		expect(JSON.parse(env.ONTOLOGY_SERVERS as string)).toEqual([OFFICIAL_ONTOLOGY_SERVER]);
		expect(JSON.parse(env.CODE_SERVERS as string)).toEqual([OFFICIAL_CODE_SERVER]);
		// Owned, so written once — the stale lines are not carried as "Preserved".
		for (const key of ['ONTOLOGY_SERVERS', 'CODE_SERVERS']) {
			expect(body.split('\n').filter((line) => line.startsWith(`${key}=`)).length, key).toBe(1);
		}
	});

	test('an air-gapped re-run OWNS the lists: a prior mirror is replaced by []', () => {
		const dir = scratchDir('mirror_airgapped');
		writeFileSync(
			join(dir, '.env'),
			'DEDALO_SALT_STRING=deadbeef\nONTOLOGY_SERVERS=[{"name":"Mirror","url":"https://m.example.org/","code":"m1"}]\n',
		);
		const env = parseEnvFile(persistInChild({ ...BASE_WIZARD, update_servers: false }, dir));
		expect(JSON.parse(env.ONTOLOGY_SERVERS as string)).toEqual([]);
	});
});

// ── (e) routable steps ───────────────────────────────────────────────────────

describe('install plan — every step is routable (e)', () => {
	test('every INSTALL_STEP_ID — and every step any plan emits — is a wizard router action', () => {
		expect(INSTALL_ROUTER_ACTIONS.length).toBeGreaterThanOrEqual(INSTALL_STEP_IDS.length);
		expect(INSTALL_STEP_IDS.filter((step) => !INSTALL_ROUTER_ACTIONS.includes(step))).toEqual([]);
		for (const answerCase of CASES) {
			const steps = cliPlan(answerCase.argv).steps;
			expect(steps.filter((step) => !INSTALL_ROUTER_ACTIONS.includes(step))).toEqual([]);
			expect(steps).toContain('install_hierarchies');
		}
	});
});

// ── (f) refusals and notes ───────────────────────────────────────────────────

describe('install plan — refusals and notes (f)', () => {
	test('an unknown flag (`--yes`) and a value flag without its value are ERRORS', () => {
		const invocation = answersFromCliArgs([...BASE_ARGV, '--yes', '--db-port', '--entity']);
		expect(invocation.errors).toContain('unknown flag --yes');
		expect(invocation.errors).toContain('--db-port needs a value');
		expect(invocation.errors).toContain('--entity needs a value');
	});

	test('the spawned CLI exits 1 on `--yes`, before touching anything', () => {
		const spawned = spawnPlan([...BASE_ARGV, '--yes']);
		expect(spawned.exitCode).toBe(1);
		const printed = JSON.parse(spawned.stdout.trim()) as { errors: string[] };
		expect(printed.errors).toContain('unknown flag --yes');
	});

	test('lg is dropped from the thesauri with a note; an unvendored tld is an error', () => {
		const withLg = cliPlan([...BASE_ARGV, '--hierarchies', 'lg,fr']);
		expect(withLg.hierarchies).toEqual(['fr']);
		expect(withLg.notes.some((note) => note.startsWith('lg is a core hierarchy'))).toBe(true);
		expect(withLg.errors).toEqual([]);
		const unknown = buildInstallPlan({ ...BASE_WIZARD, hierarchies: ['zzbk'] });
		expect(unknown.errors).toContain("unknown hierarchy 'zzbk' (not vendored)");
	});

	test('every documented flag maps (the table is complete for the plan answers it names)', () => {
		const keyed = INSTALL_CLI_FLAGS.filter((spec) => spec.key !== null);
		expect(keyed.length).toBeGreaterThan(30);
		for (const spec of keyed) {
			const argv = spec.kind === 'value' ? [spec.flag, 'x'] : [spec.flag];
			const invocation = answersFromCliArgs(argv);
			expect(invocation.errors, spec.flag).toEqual([]);
			expect(Object.keys(invocation.raw), spec.flag).toEqual([spec.key as string]);
		}
	});
});

// ── (g) supervision is never configuration ──────────────────────────────────

describe('install plan — never DEDALO_SUPERVISED (g)', () => {
	test('no answer can make a plan own DEDALO_SUPERVISED', () => {
		const smuggled = {
			...BASE_WIZARD,
			...DIFFUSION_WIZARD,
			...MAILER_WIZARD,
			DEDALO_SUPERVISED: 'true',
			supervised: true,
			dedalo_supervised: 'true',
		};
		for (const raw of [smuggled, ...CASES.map((answerCase) => answerCase.wizard)]) {
			expect(buildInstallPlan(raw).envKeys).not.toContain('DEDALO_SUPERVISED');
		}
		const env = parseEnvFile(persistInChild(smuggled, scratchDir('smuggled')));
		expect(Object.keys(env).length).toBeGreaterThan(30);
		expect(env.DEDALO_SUPERVISED).toBeUndefined();
	});
});
