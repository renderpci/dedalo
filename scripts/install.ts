/**
 * TS-NATIVE INSTALL CLI (DEC-19) — headless, unattended install of a fresh
 * Dédalo instance with no PHP anywhere. A FRONT END of the install plan
 * (src/core/install/install_plan.ts): the flags (and an answers file) become the
 * same answers the browser wizard posts, the plan turns them into the .env and
 * the step list, and the EXECUTOR (src/core/install/executor.ts) runs those
 * steps through the ONE step table the wizard routes too (steps.ts) — resumably:
 * a plan file and a state file under `<private>/install/` record every step, so
 * an install that dies anywhere is finished with `--resume` or undone with
 * `--abort --confirm-database <db>`. install.sh drives this script; it carries no
 * install logic of its own either.
 *
 * The one subtlety: `config` freezes at import from the environment. So the
 * plan is built first (config-free), its boot environment is seeded into the
 * process (cliBootEnv), and only THEN is the engine imported — config then
 * resolves the REAL values (not install-mode sentinels), the pool points at the
 * target DB, and no restart is needed. A resume does the same from the SAVED
 * plan (its secrets from the install's own .env once persist_config is done).
 *
 * INTERACTIVE (terminal installer phase 2, 2026-10-12): run with NO answer
 * (no answer flag, no --answers, --plan, --list-*, --resume, --abort,
 * --secrets-stdin, --execute or --root-password) on a terminal and the
 * installer ASKS — screen by screen, in the route's order
 * (src/core/install/screen_model.ts), each screen's probe run in a child
 * process, then a Review (install / edit <n> / write <path> / quit). Phase 2
 * draws it in PLAIN line mode (src/core/install/ui_plain/) — selected anyway
 * by --plain, TERM=dumb or unset, a redirected stdout (the prompts then go to
 * stderr or /dev/tty) or a terminal under 80×24. The interactive answers run
 * through the SAME plan and executor as the flags below; the catalog is
 * re-resolved here and a decision that changed since the Review is refused.
 * Piped stdin with no answer source is REFUSED (use --answers). The Docker
 * and trial routes stop at the Review (write the answers; install.sh runs the
 * host steps) — headless `--route docker|trial` is the in-container delegate.
 *
 * --write-answers <file> writes the reviewed (or, headless, the planned)
 * answers as a dedalo.install.answers/1 file (0600, atomic, no secret; never
 * inside the private dir, never over a file that is not an answers file).
 *
 * Usage (npm script `dedalo:install` — NOT `install`, which is a reserved
 * package-manager lifecycle hook):
 *   bun run scripts/install.ts                      # interactive (a terminal)
 *   bun run scripts/install.ts --plain [--write-answers answers.json]
 *   DEDALO_INSTALL_ROOT_PASSWORD='...' [DEDALO_INSTALL_DB_PASSWORD='...'] \
 *   bun run scripts/install.ts --db-name dedalo_x --db-user u --entity myentity \
 *       [--route production|docker|trial|developer] [--instance <name>] \
 *       [--answers answers.json] [--write-answers out.json] \
 *       [--db-host localhost] [--db-port 5432] [--db-socket ...] \
 *       [--entity-label ...] [--information ...] [--info-key ...] \
 *       [--timezone Europe/Madrid] [--locale es-ES] \
 *       [--langs lg-eng,lg-spa] [--app-lang lg-eng] [--data-lang lg-eng] \
 *       [--hierarchies es,fr | default | none] \
 *       [--ontologies oh,tch | default] [--ontology-source <dir|archive>] \
 *       [--decline-dependencies tchi,ts:hierarchy1] \
 *       [--diffusion --mysql-host ... --mysql-port ... --mysql-socket ... \
 *          --mysql-name ... --mysql-user ...] \
 *       [--mailer --smtp-host smtp.example.org --smtp-port 587 --smtp-secure tls \
 *          --smtp-user ... --smtp-from ... --smtp-from-name ...] \
 *       [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] \
 *       [--media-access-mode publication] \
 *       [--no-update-servers] [--skip-tools] [--plan] [--list-ontologies] [--list-hierarchies] \
 *       [--list-langs] [--secrets-stdin] [--execute]
 * Any value flag also takes the `--flag=value` form (a value may then start
 * with `--`).
 *   bun run scripts/install.ts --resume [same answers, or none]
 *   bun run scripts/install.ts --abort --confirm-database dedalo_x
 *
 * SECRETS (never in an answers file, never in the plan/state files, never
 * printed — the generated salt is shown ONCE in the final summary), highest
 * precedence first: `--secrets-stdin` (one JSON object {db_password,
 * mysql_password, smtp_pass, root_password}); the environment variables
 * DEDALO_INSTALL_DB_PASSWORD / _MYSQL_PASSWORD / _SMTP_PASSWORD / _ROOT_PASSWORD
 * (removed from this process's environment once read); the legacy argv flags
 * --db-password / --mysql-password / --smtp-password / --root-password, which
 * still work but warn (visible to other users in `ps`). On a TERMINAL, without
 * --execute, a fresh run with no root password and a --resume missing a secret
 * it still needs ASK for it (hidden, twice; the root password against the
 * policy); --execute never prompts.
 *
 * VALIDATION BEFORE ANY WRITE: every answer-only refusal — the root password
 * policy included — is the PLAN's (install_validation.ts), and the target
 * database must exist and be EMPTY (zero user objects); nothing is written
 * until both pass.
 *
 * Defaults live in the plan, not here: --hierarchies omitted (or `default`) =
 * NO optional thesaurus beyond the ones the chosen ontologies DECLARE
 * (hierarchy60 — the same boxes the wizard pre-ticks; 2026-10-10). The offer is
 * every entry of the vendored thesaurus manifest (install/import/hierarchy/
 * hierarchy.json), with or without data files (one without installs as an empty
 * thesaurus). No toponymy is ever a default: a plan without one prints a
 * SUGGESTION to import the operator's own country. Languages (lg) is ALWAYS
 * activated by the seed restore and is not a choice. The official update server
 * is written unless --no-update-servers (air-gapped: ONTOLOGY_SERVERS /
 * CODE_SERVERS = []). An unknown flag is an error, never ignored.
 *
 * DOMAIN ONTOLOGIES (A4/A5/A6): --ontologies omitted = `oh`, installed from the
 * one vendored file; any other TLD comes from the first configured ontology
 * server (the official master by default) or from --ontology-source (a
 * directory in the server export layout — ontology.json + <tld>.copy.gz
 * [+ matrix_dd.copy.gz] — or a .tar/.tar.gz/.tgz of one: a fully offline
 * install). The DECLARED dependencies of the chosen TLDs (hierarchy60) are
 * installed with them: ontologies (`main: ontology35`) deps first, thesauri
 * (`main: hierarchy1`) added to --hierarchies. A MANDATORY ONTOLOGY cannot be
 * declined; an OPTIONAL ontology and EVERY thesaurus are installed unless
 * --decline-dependencies names them (a TLD, or `<tld>:ontology35|hierarchy1`).
 * A thesaurus never blocks the install (owner decision 2026-10-10): declining a
 * MANDATORY one, or one with no hierarchy.json entry, is a warning — strongly
 * recommended, installable later from Maintenance › Install hierarchies. The
 * catalog is resolved ONCE, before anything is written; the files are staged and
 * verified before the database is touched (stage_ontologies) and imported right
 * after the seed restore (install_ontologies).
 *
 * --plan prints ONE JSON line (env_keys, steps, hierarchies,
 * hierarchy_dependencies, suggestions, ontologies, declined_dependencies,
 * ontology_source, ontology_install, active_ontology_tlds, notes, warnings,
 * errors) and exits — 0 when the answers are valid, 1 otherwise — touching no
 * database and no file (a non-vendored choice reads the source's manifest). No
 * root password is needed; one that IS supplied is checked against the policy.
 *
 * --list-ontologies prints ONE JSON line — the catalog view the wizard's
 * Ontologies screen shows (source, default, core, entries with their declared
 * dependencies and what each also installs, warnings) + errors — for the source
 * the other answers select (--ontology-source, --no-update-servers, or the
 * configured server), and exits. It needs no other answer.
 *
 * --list-hierarchies prints ONE JSON line — the thesaurus offer of the vendored
 * manifest (core, typologies, entries {tld, name, typology_id, typology_name,
 * has_data, dependencies}, the toponymy suggestion) + errors — and exits. It
 * needs no other answer.
 *
 * --list-langs prints ONE JSON line — {langs: [{code, label}], default} — and
 * exits.
 *
 * Exit codes: 0 done (an interactive `quit` typed too: nothing installed), 1
 * refused or failed (a failure after the first write prints how to resume or
 * undo; an interactive answer refused too often), 130 SIGINT (Ctrl-C / Ctrl-D
 * at an interactive question included), 143 SIGTERM.
 */

import {
	closeSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// All config-free — safe to import BEFORE the environment is seeded.
import { processEnvValue, seedProcessEnv, unsetProcessEnv } from '../src/config/env.ts';
import {
	type FrontEndChoice,
	type ReviewedDecisions,
	reviewedDecisionsRefusal,
	selectFrontEndFor,
	type TerminalCaps,
	writeAnswersFile,
} from '../src/core/install/front_end.ts';
import { CORE_HIERARCHIES, hierarchyChoiceView } from '../src/core/install/hierarchy_meta.ts';
import {
	answersFromAnswersFile,
	answersFromCliArgs,
	buildInstallPlan,
	cliBootEnv,
	type InstallPlan,
	mergeAnswerSources,
	normalizeInstallAnswers,
	offeredThesauri,
	ontologyServersFor,
	ontologySourceFor,
	planCatalogNeeded,
	SECRET_ANSWER_KEYS,
	TOPONYMY_SUGGESTION,
} from '../src/core/install/install_plan.ts';
import {
	INSTALL_DEFAULT_LANG_CODES,
	INSTALL_LANG_CATALOG,
} from '../src/core/install/lang_catalog.ts';
import {
	describeOntologyCatalog,
	type OntologyCatalog,
	vendoredOntologyCatalog,
} from '../src/core/install/ontology_choice.ts';
import { readPriorEnv } from '../src/core/install/prior_env.ts';
import {
	buildPlanFile,
	type PlanFile,
	readInstallEnv,
	readPlanFile,
	readStateFile,
	SECRET_KEYS,
	type SecretKey,
	type Secrets,
	secretsFromEnv,
} from '../src/core/install/run_files.ts';

/** Removes the resolved catalog's scratch files (an extracted --ontology-source archive). */
let cleanupCatalog: () => void = () => undefined;

function fail(msg: string): never {
	cleanupCatalog();
	console.error(`\n✖ install failed: ${msg}\n`);
	process.exit(1);
}

const invocation = answersFromCliArgs(Bun.argv.slice(2));

// ── which front end (before ANY read or write) ───────────────────────────────

/**
 * The terminal as this process sees it — THE one place outside src/ that reads
 * it (front_end.ts selectFrontEnd decides from it).
 */
function terminalCaps(): TerminalCaps {
	const stdoutTty = process.stdout.isTTY === true;
	const stderrTty = process.stderr.isTTY === true;
	return {
		stdinTty: process.stdin.isTTY === true,
		stdoutTty,
		stderrTty,
		ttyDevice: !stdoutTty && !stderrTty && ttyDeviceWritable(),
		rawMode: typeof process.stdin.setRawMode === 'function',
		term: processEnvValue('TERM'),
		noColor: (processEnvValue('NO_COLOR') ?? '') !== '',
		columns: process.stdout.columns ?? process.stderr.columns,
		rows: process.stdout.rows ?? process.stderr.rows,
	};
}

/** Can /dev/tty be opened for writing (the last-resort prompt sink)? */
function ttyDeviceWritable(): boolean {
	try {
		closeSync(openSync('/dev/tty', 'w'));
		return true;
	} catch {
		return false;
	}
}

const frontEnd: FrontEndChoice = selectFrontEndFor(terminalCaps(), invocation);
if (frontEnd.kind === 'refuse') {
	console.error(`\n✖ install failed: ${frontEnd.error}\n`);
	process.exit(1);
}
if (frontEnd.kind === 'interactive' && invocation.errors.length > 0) {
	console.error(`\n✖ install failed: ${invocation.errors.join('; ')}\n`);
	process.exit(1);
}

const priorEnv = await readPriorEnv();

for (const flag of invocation.argvSecretFlags) {
	console.warn(
		`⚠ ${flag} on the command line is visible to other users (ps); use DEDALO_INSTALL_* or --secrets-stdin`,
	);
}

// ── the secrets (stdin > environment > argv), then out of the environment ────

/** The environment variable each secret may come from. */
const SECRET_ENV: Readonly<Record<SecretKey, string>> = {
	db_password: 'DEDALO_INSTALL_DB_PASSWORD',
	mysql_password: 'DEDALO_INSTALL_MYSQL_PASSWORD',
	smtp_pass: 'DEDALO_INSTALL_SMTP_PASSWORD',
	root_password: 'DEDALO_INSTALL_ROOT_PASSWORD',
};

/** `--secrets-stdin`: one JSON object, known keys only. */
async function stdinSecrets(): Promise<Secrets> {
	if (!invocation.secretsStdin) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(await Bun.stdin.text());
	} catch {
		// NEVER the parser's message: it quotes the offending token, which is
		// typically an unquoted secret value.
		return fail('--secrets-stdin: not one JSON object');
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return fail('--secrets-stdin: not one JSON object');
	}
	const secrets: Secrets = {};
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (!(SECRET_KEYS as readonly string[]).includes(key)) {
			fail(`--secrets-stdin: unknown key '${key}' (expected ${SECRET_KEYS.join(', ')})`);
		}
		if (typeof value !== 'string') fail(`--secrets-stdin: '${key}' must be a string`);
		secrets[key as SecretKey] = value;
	}
	return secrets;
}

/** One secret by precedence; '' counts as not given. */
function pick(...candidates: (string | undefined)[]): string | undefined {
	return candidates.find((value) => value !== undefined && value !== '');
}

const fromStdin = await stdinSecrets();
const argvSecret = (key: string): string | undefined => {
	const value = invocation.raw[key];
	return typeof value === 'string' ? value : undefined;
};
const secrets: Secrets = {};
for (const key of SECRET_KEYS) {
	const fromArgv = key === 'root_password' ? invocation.rootPassword : argvSecret(key);
	const value = pick(fromStdin[key], processEnvValue(SECRET_ENV[key]), fromArgv);
	if (value !== undefined) secrets[key] = value;
}
// Read once and removed from process.env. Bun's default spawn env is the
// ORIGINAL environ (deletes ignored), so every installer child is spawned with
// an explicit env built from the live one (liveProcessEnv / envSnapshot /
// pgClientEnv) — gate: install_probe_child.test.ts. (The database password does
// reach the psql children the installer starts — as DB_PASSWORD/PGPASSWORD,
// they need it; the root, SMTP and diffusion passwords reach no child.)
unsetProcessEnv(Object.values(SECRET_ENV));

// ── the answers (flags + an answers file; secrets apart) ─────────────────────

/** The flags' answers without their secret values (those live in `secrets`). */
function plainFlagAnswers(): Record<string, unknown> {
	const raw = { ...invocation.raw };
	for (const key of SECRET_ANSWER_KEYS) delete raw[key];
	return raw;
}

function readAnswersFile(path: string): { raw: Record<string, unknown>; errors: string[] } {
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		return { raw: {}, errors: [`answers file ${path}: ${(error as Error).message}`] };
	}
	return answersFromAnswersFile(json);
}

const parseErrors = [...invocation.errors];
let plainRaw = plainFlagAnswers();
if (invocation.answersFile !== undefined) {
	const file = readAnswersFile(invocation.answersFile);
	const merged = mergeAnswerSources(plainRaw, file.raw);
	plainRaw = merged.raw;
	parseErrors.push(...file.errors, ...merged.errors);
}
/** The raw answers the plan is built from: the plain ones + the secret answers (memory only). */
function withSecrets(raw: Record<string, unknown>, given: Secrets): Record<string, unknown> {
	return {
		...raw,
		...(given.db_password === undefined ? {} : { db_password: given.db_password }),
		...(given.mysql_password === undefined ? {} : { mysql_password: given.mysql_password }),
		...(given.smtp_pass === undefined ? {} : { smtp_pass: given.smtp_pass }),
	};
}
let raw = withSecrets(plainRaw, secrets);

// ── listings ─────────────────────────────────────────────────────────────────

/**
 * B5 hygiene: an --ontology-source archive is extracted into
 * `<tmp>/dedalo_ontology_source_*` and removed by the catalog's cleanup — which
 * a SIGKILL never runs. Sweep the ones older than a day (a concurrent run's own
 * fresh one is never touched).
 */
function sweepOrphanSourceDirs(): void {
	const dayAgo = Date.now() - 24 * 3600 * 1000;
	try {
		for (const name of readdirSync(tmpdir())) {
			if (!name.startsWith('dedalo_ontology_source_')) continue;
			const path = join(tmpdir(), name);
			if (statSync(path).mtimeMs < dayAgo) rmSync(path, { recursive: true, force: true });
		}
	} catch {
		// hygiene only — never blocks an install
	}
}

/**
 * Resolve the source catalog of `answers` (it imports the engine, so call it only
 * after the environment is seeded — or when the process exits right after).
 */
async function resolveCatalogOf(
	answersRaw: Record<string, unknown>,
	prior: Readonly<Record<string, string>>,
): Promise<{ catalog: OntologyCatalog | undefined; errors: string[] }> {
	const { answers } = normalizeInstallAnswers(answersRaw);
	const source = ontologySourceFor(answers, prior);
	if (!planCatalogNeeded(answers, source)) return { catalog: undefined, errors: [] };
	sweepOrphanSourceDirs();
	const { resolveOntologyCatalog } = await import('../src/core/install/ontology_catalog.ts');
	try {
		const resolved = await resolveOntologyCatalog(source, {
			allowedServers: ontologyServersFor(answers, prior),
		});
		cleanupCatalog = resolved.cleanup;
		return { catalog: resolved.catalog, errors: [] };
	} catch (error) {
		return { catalog: undefined, errors: [error instanceof Error ? error.message : String(error)] };
	}
}

/** --list-ontologies: the catalog view of the selected source, then exit. */
async function listOntologies(): Promise<never> {
	const { answers } = normalizeInstallAnswers(raw);
	const source = ontologySourceFor(answers, priorEnv);
	const { resolveOntologyCatalog } = await import('../src/core/install/ontology_catalog.ts');
	const errors = [...parseErrors];
	let catalog = vendoredOntologyCatalog();
	try {
		const resolved = await resolveOntologyCatalog(source, {
			allowedServers: ontologyServersFor(answers, priorEnv),
		});
		catalog = resolved.catalog;
		resolved.cleanup();
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}
	console.log(JSON.stringify({ ...describeOntologyCatalog(catalog), errors }));
	process.exit(errors.length === 0 ? 0 : 1);
}

if (invocation.listOntologies) await listOntologies();

/** --list-hierarchies: the vendored thesaurus offer, then exit (config-free: the manifest only). */
function listHierarchies(): never {
	const errors = [...parseErrors];
	const offer = offeredThesauri(errors);
	// The declared thesaurus dependencies (hierarchy60), from THE client view.
	const dependenciesOf = new Map<string, { tld: string; mandatory: boolean }[]>();
	if (errors.length === 0) {
		for (const item of hierarchyChoiceView('lg-eng').hierarchies) {
			dependenciesOf.set(item.tld, item.dependencies);
		}
	}
	console.log(
		JSON.stringify({
			core: CORE_HIERARCHIES.map((item) => item.tld),
			entries: offer.map((entry) => ({
				tld: entry.tld,
				name: entry.name,
				typology_id: entry.typology_id,
				typology_name: entry.typology_name,
				has_data: entry.data_files.length > 0,
				dependencies: dependenciesOf.get(entry.tld) ?? [],
			})),
			suggestion: TOPONYMY_SUGGESTION,
			errors,
		}),
	);
	process.exit(errors.length === 0 ? 0 : 1);
}

if (invocation.listHierarchies) listHierarchies();

/** --list-langs: the language offer, then exit (constants only). */
function listLangs(): never {
	console.log(
		JSON.stringify({
			langs: Object.entries(INSTALL_LANG_CATALOG).map(([code, label]) => ({ code, label })),
			default: [...INSTALL_DEFAULT_LANG_CODES],
			errors: [...parseErrors],
		}),
	);
	process.exit(parseErrors.length === 0 ? 0 : 1);
}

if (invocation.listLangs) listLangs();

// ── running the executor ─────────────────────────────────────────────────────

/**
 * Every psql this process starts names itself `dedalo_install:<pid>` on the
 * server, so a later --resume can see an orphan of a killed run still working
 * (db_restore.ts inspectTargetDatabase) — and tell this run's own apart.
 */
function bootEnvironment(plan: InstallPlan): void {
	seedProcessEnv({ ...cliBootEnv(plan), PGAPPNAME: `dedalo_install:${process.pid}` });
}

/** Print the plan's notes, warnings and suggestions. */
function announce(plan: InstallPlan): void {
	const { answers } = plan;
	console.log(`\nDédalo TS install — entity '${answers.entity}', db '${answers.db_database}'\n`);
	for (const note of plan.notes) console.log(`  note: ${note}`);
	for (const warning of plan.warnings) console.warn(`  ⚠ ${warning}`);
	for (const suggestion of plan.suggestions) console.log(`  suggestion: ${suggestion}`);
}

/** The interactive front end's one-time display (the generated salt), when there is one. */
let showOnce: ((lines: readonly string[]) => boolean) | undefined;

/** Run the executor and leave with its exit code (the hint after a failure that wrote state). */
async function execute(
	request: import('../src/core/install/executor.ts').ExecutorRequest,
): Promise<never> {
	const { executeInstall } = await import('../src/core/install/executor.ts');
	const outcome = await executeInstall(request, {
		log: (line) => console.log(line),
		warn: (line) => console.warn(line),
		...(showOnce === undefined ? {} : { showOnce }),
	});
	cleanupCatalog();
	if (outcome.exitCode !== 0) {
		if (outcome.hint.length > 0) {
			const at = outcome.failedStep === null ? '' : ` at step [${outcome.failedStep}]`;
			console.error(`\n✖ install failed${at}: ${outcome.message ?? ''}`);
			for (const line of outcome.hint) console.error(line);
			console.error('');
		} else {
			console.error(`\n✖ install failed: ${outcome.message ?? ''}\n`);
		}
		process.exit(outcome.exitCode);
	}
	if (outcome.result === 'aborted') {
		console.log(
			'\n✔ install aborted — what the install created is removed; the database itself is kept.\n',
		);
	} else {
		const verified = (request.secrets.root_password ?? '') !== '';
		console.log(
			`\n✔ install complete${verified ? ' — root login verified' : ''}. Start the server under its supervisor ` +
				'(systemd: `systemctl enable --now dedalo-ts` — docs/install/production.md) or with ' +
				'`bun run start:supervised`; plain `bun run start` is unsupervised and cannot take code updates.\n',
		);
	}
	process.exit(0);
}

// ── prompting for a missing secret (a terminal, no --execute) ────────────────

/** May this run ASK for a missing secret? A terminal, not --execute, not a print-and-exit run. */
function canPromptSecrets(): boolean {
	return (
		!invocation.execute &&
		!invocation.planOnly &&
		process.stdin.isTTY === true &&
		typeof process.stdin.setRawMode === 'function'
	);
}

/** The prompt sink of a headless run (the same rule as the interactive one: never a redirected stdout). */
function promptOutput(): { isTTY?: boolean; write(text: string): unknown } | null {
	if (process.stdout.isTTY === true) return process.stdout;
	if (process.stderr.isTTY === true) return process.stderr;
	try {
		const fd = openSync('/dev/tty', 'w');
		return { isTTY: true, write: (text: string) => writeSync(fd, text) };
	} catch {
		return null;
	}
}

/** The words a prompt for each secret uses. */
const SECRET_PROMPT: Readonly<Record<SecretKey, string>> = {
	db_password: 'Database password',
	mysql_password: 'MariaDB (publication) password',
	smtp_pass: 'SMTP password',
	root_password: 'Root password',
};

/**
 * Ask the missing `keys` on the terminal (hidden, twice; the root password held
 * to the policy, rule by rule). Nothing is asked when the run may not prompt.
 */
async function promptSecrets(keys: readonly SecretKey[], into: Secrets): Promise<void> {
	const missing = keys.filter((key) => (into[key] ?? '') === '');
	if (missing.length === 0 || !canPromptSecrets()) return;
	const output = promptOutput();
	if (output === null) return;
	const { ttyInstallPrompter, isNav } = await import('../src/core/install/ui_plain/prompter.ts');
	const { passwordFeedback } = await import('../src/core/install/screen_model.ts');
	const prompter = ttyInstallPrompter(
		{ input: process.stdin, output, signals: process },
		{ columns: process.stdout.columns },
	);
	for (const key of missing) {
		const answer = await prompter.secret(
			{
				id: `secret.${key}`,
				key,
				sets: [],
				kind: 'secret',
				label: SECRET_PROMPT[key],
				description: 'never echoed, never written to the plan file or the log',
				value: null,
				default: '',
				answered: false,
				required: true,
				errors: [],
			},
			key === 'root_password' ? passwordFeedback : undefined,
		);
		if (isNav(answer)) fail('stopped at the password prompt — nothing was written');
		into[key] = answer;
	}
}

/** Write the answers file (--write-answers, or the interactive Review's choice), or fail. */
function writeAnswersOrFail(path: string | undefined, plan: InstallPlan): void {
	if (path === undefined) return;
	const refusal = writeAnswersFile(path, plan.answers);
	if (refusal !== null) fail(refusal);
	// stderr: --plan's stdout is exactly ONE JSON line.
	console.error(`  answers written to ${path} (no secret is in it)`);
}

/** What an interactive run adds to a fresh install. */
interface InteractiveRun {
	/** The decisions the operator reviewed — the run refuses to decide otherwise. */
	reviewed: ReviewedDecisions;
	writeAnswers?: string;
}

/** A FRESH install (or --plan). */
async function freshInstall(interactive?: InteractiveRun): Promise<never> {
	if (interactive === undefined && !invocation.planOnly) {
		await promptSecrets(['root_password'], secrets);
	}
	const route = normalizeInstallAnswers(raw).answers.route;
	if (interactive !== undefined && (route === 'docker' || route === 'trial')) {
		fail(
			`the ${route} route's host steps arrive in a later release — today run install.sh (it runs this installer inside the container)`,
		);
	}
	// The answers alone (no catalog yet): enough for the boot environment.
	const preliminary = buildInstallPlan(raw, { priorEnv });
	const answerErrors = [...parseErrors, ...normalizeInstallAnswers(raw).errors];
	// Seed the environment BEFORE anything imports config (see the header) — the
	// catalog resolver below is the first thing that does.
	if (answerErrors.length === 0) bootEnvironment(preliminary);
	// The ontology catalog, resolved ONCE (a server manifest is fetched here, before
	// any write): the plan's closure, the .env and the staging all use it.
	const resolvedCatalog = await resolveCatalogOf(raw, priorEnv);
	const plan = buildInstallPlan(raw, {
		priorEnv,
		ontologyCatalog: resolvedCatalog.catalog,
		// --plan checks a supplied password; a run requires one.
		rootPassword: secrets.root_password,
		requireRootPassword: !invocation.planOnly,
	});
	const errors = [...parseErrors, ...resolvedCatalog.errors, ...plan.errors];
	// The interactive Review was built on the probe child's catalog; this run
	// re-resolved it — the decisions must be the reviewed ones.
	const changed =
		interactive === undefined || errors.length > 0
			? null
			: reviewedDecisionsRefusal(interactive.reviewed, plan);
	if (changed !== null) errors.push(changed);
	// --write-answers: after a VALID plan, before anything runs (--plan included).
	if (errors.length === 0) {
		writeAnswersOrFail(interactive?.writeAnswers ?? invocation.writeAnswersPath, plan);
	}

	if (invocation.planOnly) {
		cleanupCatalog();
		console.log(
			JSON.stringify({
				env_keys: [...plan.envKeys],
				steps: [...plan.steps],
				hierarchies: [...plan.hierarchies],
				hierarchy_dependencies: [...plan.hierarchyDependencies],
				suggestions: [...plan.suggestions],
				ontologies: [...plan.ontologies],
				declined_dependencies: [...plan.answers.declined_dependencies],
				ontology_source: plan.ontologySource,
				ontology_install: (plan.ontologyRequest?.items ?? []).map((item) => item.tld),
				active_ontology_tlds: [...plan.activeOntologyTlds],
				notes: [...plan.notes],
				warnings: [...plan.warnings],
				errors,
			}),
		);
		process.exit(errors.length === 0 ? 0 : 1);
	}

	if (errors.length > 0) fail(errors.join('; '));
	announce(plan);
	return execute({
		mode: 'fresh',
		execute: invocation.execute,
		planFile: buildPlanFile(plan, secrets),
		plan,
		secrets,
		ontologyCatalog: resolvedCatalog.catalog,
	});
}

/** Has the saved state recorded `step` done? */
function stepDone(state: ReturnType<typeof readStateFile>, step: string): boolean {
	return state?.steps[step]?.status === 'done';
}

/**
 * The secrets a resume/abort runs with: the given ones, and — once
 * persist_config is done — the db/mysql/smtp ones the install's own .env holds
 * (a supplied database password that differs from it is refused).
 */
function resumeSecrets(planFile: PlanFile, state: ReturnType<typeof readStateFile>): Secrets {
	if (!stepDone(state, 'persist_config')) return secrets;
	const env = readInstallEnv();
	if (env === null)
		fail(
			'persist_config is recorded done but the install .env is missing — --abort and start again',
		);
	const written = secretsFromEnv(env);
	const given = secrets.db_password;
	if (
		given !== undefined &&
		planFile.secrets_supplied.db_password &&
		given !== (written.db_password ?? '')
	) {
		fail('the database password given differs from the one this install wrote to its .env');
	}
	return {
		...written,
		...(secrets.root_password === undefined ? {} : { root_password: secrets.root_password }),
	};
}

/** `--resume` / `--abort`: the SAVED plan is the authority. */
async function continueInstall(): Promise<never> {
	if (parseErrors.length > 0) fail(parseErrors.join('; '));
	let planFile: PlanFile | null;
	let state: ReturnType<typeof readStateFile>;
	try {
		planFile = readPlanFile();
		state = readStateFile();
	} catch (error) {
		return fail((error as Error).message);
	}
	if (planFile === null || state === null) {
		return fail(
			'no install record to continue (no install.plan.json / install.state.json in the private dir)',
		);
	}
	const runSecrets = resumeSecrets(planFile, state);
	// On a terminal (no --execute) a resume ASKS the secrets it still needs.
	if (!invocation.abort) {
		// The config-free step table (importing the executor here would freeze
		// config BEFORE bootEnvironment seeds the install's database).
		const { secretsNeeded } = await import('../src/core/install/steps.ts');
		await promptSecrets(secretsNeeded(planFile, state), runSecrets);
	}
	if (
		invocation.abort &&
		(state.created.seed_started || state.created.seed_restored) &&
		planFile.secrets_supplied.db_password &&
		(runSecrets.db_password ?? '') === ''
	) {
		fail(
			'--abort resets the database and needs its password: DEDALO_INSTALL_DB_PASSWORD or --secrets-stdin',
		);
	}
	// The boot environment from the SAVED answers (+ the secrets).
	const savedRaw = withSecrets({ ...planFile.answers }, runSecrets);
	const prior = await readPriorEnv();
	bootEnvironment(buildInstallPlan(savedRaw, { priorEnv: prior }));
	// Answers on the command line must be the saved ones (compared in the executor).
	// Only the keys the operator SUPPLIED are compared (an omitted one is not "different").
	const givenKeys = Object.keys(plainRaw);
	const givenAnswers = givenKeys.length > 0 ? normalizeInstallAnswers(raw).answers : undefined;
	if (invocation.abort) {
		return execute({
			mode: 'abort',
			execute: invocation.execute,
			secrets: runSecrets,
			confirmDatabase: invocation.confirmDatabase,
		});
	}
	// The catalog is re-resolved only while a step that needs it is not done;
	// the executor then holds the rebuilt plan's decisions to the saved ones.
	const needsCatalog = !stepDone(state, 'persist_config') || !stepDone(state, 'stage_ontologies');
	let plan: InstallPlan | undefined;
	let catalog: OntologyCatalog | undefined;
	if (needsCatalog) {
		const resolved = await resolveCatalogOf(savedRaw, prior);
		if (resolved.errors.length > 0) fail(resolved.errors.join('; '));
		catalog = resolved.catalog;
		plan = buildInstallPlan(savedRaw, { priorEnv: prior, ontologyCatalog: catalog });
		if (plan.errors.length > 0) fail(plan.errors.join('; '));
	}
	console.log(`\nDédalo TS install — resuming '${String(planFile.answers.db_database ?? '')}'\n`);
	return execute({
		mode: 'resume',
		execute: invocation.execute,
		givenAnswers,
		givenKeys,
		plan,
		secrets: runSecrets,
		ontologyCatalog: catalog,
	});
}

// ── the interactive front end ────────────────────────────────────────────────

/** The prompt sink the selection chose (stdout, stderr, or /dev/tty). */
function interactiveOutput(sink: 'stdout' | 'stderr' | 'tty'): {
	isTTY?: boolean;
	write(text: string): unknown;
} {
	if (sink === 'stdout') return process.stdout;
	if (sink === 'stderr') return process.stderr;
	const output = promptOutput();
	if (output === null) fail('no terminal to show the questions on');
	return output;
}

/** The thesaurus offer the screens show (config-free: the vendored manifest). */
function thesaurusOffer(): { view: ReturnType<typeof hierarchyChoiceView> } | { error: string } {
	try {
		return { view: hierarchyChoiceView('lg-eng') };
	} catch (error) {
		return { error: (error as Error).message };
	}
}

/** Walk the screens (plain line mode — phase 3 draws the full-screen UI), then act on the outcome. */
async function interactiveInstall(sink: 'stdout' | 'stderr' | 'tty'): Promise<never> {
	const { runPlainInstall } = await import('../src/core/install/ui_plain/run_plain.ts');
	const { ttyInstallPrompter } = await import('../src/core/install/ui_plain/prompter.ts');
	const { childProbes } = await import('../src/core/install/install_probe_client.ts');
	const prompter = ttyInstallPrompter(
		{ input: process.stdin, output: interactiveOutput(sink), signals: process },
		{ columns: process.stdout.columns ?? process.stderr.columns },
	);
	const host = Intl.DateTimeFormat().resolvedOptions();
	const result = await runPlainInstall({
		prompter,
		probes: childProbes({ execPath: process.execPath, cwd: process.cwd() }),
		priorEnv,
		thesauri: thesaurusOffer(),
		host: { timezone: host.timeZone, locale: host.locale },
		givenSecrets: { ...secrets },
		...(invocation.writeAnswersPath === undefined
			? {}
			: { writeAnswersPath: invocation.writeAnswersPath }),
	});
	if (result.kind === 'resume') return continueInstall();
	if (result.kind === 'quit') {
		process.exit(result.reason === 'interrupted' ? 130 : result.reason === 'refused' ? 1 : 0);
	}
	if (result.kind !== 'install') process.exit(0);
	// REPLACE, never merge: a secret the environment supplied for a service the
	// operator then turned off (or cleared) is not in result.secrets (givenOnly)
	// and must not be recorded as supplied nor used.
	for (const key of SECRET_KEYS) delete secrets[key];
	Object.assign(secrets, result.secrets);
	raw = withSecrets(result.raw, secrets);
	showOnce = (lines) => prompter.showOnce(lines);
	return freshInstall({
		reviewed: result.reviewed,
		...(result.writeAnswers === undefined ? {} : { writeAnswers: result.writeAnswers }),
	});
}

if (frontEnd.kind === 'interactive') await interactiveInstall(frontEnd.sink);
else if (invocation.resume || invocation.abort) await continueInstall();
else await freshInstall();
