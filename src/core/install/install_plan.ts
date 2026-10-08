/**
 * THE INSTALL PLAN — the ONE place an install's answers become a configuration
 * and a step list (installer unification A1, 2026-10-08). Every front end is a
 * front end of THIS: the browser wizard (persist_config → config_persist.ts),
 * the headless CLI (scripts/install.ts) and install.sh (which drives the CLI).
 *
 * WHY. Before this module each front end carried its own copy of the answers →
 * .env mapping and its own defaults, and they had drifted: the CLI defaulted
 * the database host to `/tmp` (Debian/RHEL sockets do not live there), wrote an
 * empty entity label, installed NO optional thesaurus while the wizard
 * pre-ticked three, silently ignored unknown flags (`--yes`), and no front end
 * wrote ONTOLOGY_SERVERS / CODE_SERVERS — so every fresh install's update panels
 * answered "No master servers are configured".
 *
 * WHAT IT OWNS:
 *  - the DEFAULTS (here and nowhere else — the CLI parser maps provided flags
 *    only, the wizard posts what the operator typed);
 *  - the .env sections, their order and their comments (config_persist renders
 *    them verbatim);
 *  - the step list, whose ids ARE the wizard router's action names
 *    (engine.ts INSTALL_ROUTER_ACTIONS — gated: every plan step is routable);
 *  - the update-server choice (A3): the official master by default, `[]` only
 *    on an explicit air-gapped answer;
 *  - the optional-thesaurus choice (A7): the shared default is
 *    defaultOptionalHierarchies(); a CORE tld (`lg`) is dropped with a note —
 *    the seed restore always activates it.
 *
 * WHAT IT NEVER CONTAINS: DEDALO_SUPERVISED. Supervision is declared by the
 * process manager that restarts the server (systemd unit, compose service,
 * the supervised package scripts), never by ../private/.env, which every launch
 * method reads alike (src/core/update/supervision.ts). The plan's key set is a
 * closed list; no answer can add a key to it.
 *
 * PURE AND CONFIG-FREE: imports only lang_catalog.ts + hierarchy_meta.ts. The
 * CLI builds the plan BEFORE it seeds the process environment that
 * src/config/config.ts freezes at import, so importing config (or the error
 * registry, or the db) from here would freeze the wrong configuration.
 * Gate: test/unit/install_plan_parity_tripwire.test.ts (CLI ≡ wizard).
 */

import {
	defaultOptionalHierarchies,
	isCoreHierarchyTld,
	offeredHierarchies,
} from './hierarchy_meta.ts';
import { deriveLangConfig } from './lang_catalog.ts';

/** One master server entry, as ONTOLOGY_SERVERS / CODE_SERVERS carry it. */
export interface MasterServerEntry {
	readonly name: string;
	readonly url: string;
	readonly code: string;
}

/** The official master's JSON API endpoint (both ontology and code). */
export const OFFICIAL_MASTER_URL = 'https://v7.master.dedalo.dev/dedalo/core/api/v1/json/';

/**
 * The official entries — byte-equal to the catalog examples
 * (src/config/catalog/maintenance.ts, rendered into install/sample.env); the
 * parity gate parses those examples and holds them equal, so there is one truth.
 */
export const OFFICIAL_ONTOLOGY_SERVER: MasterServerEntry = Object.freeze({
	name: 'Official Dédalo Ontology server',
	url: OFFICIAL_MASTER_URL,
	code: 'x3a0B4Y020Eg9w',
});
export const OFFICIAL_CODE_SERVER: MasterServerEntry = Object.freeze({
	name: 'Official Dédalo code server',
	url: OFFICIAL_MASTER_URL,
	code: 'x3a0B4Y020Eg9w',
});

/** `official` = the official master (default); `none` = air-gapped, `[]` written. */
export type UpdateServersChoice = 'official' | 'none';

/** Every install step, in run order. Each id IS a wizard router action name. */
export const INSTALL_STEP_IDS = [
	'test_db_connection',
	'test_diffusion_connection',
	'test_mailer_connection',
	'persist_config',
	'check_directories',
	'install_db_from_default_file',
	'set_root_pw',
	'install_hierarchies',
	'register_tools',
	'install_finish',
] as const;
export type InstallStepId = (typeof INSTALL_STEP_IDS)[number];

/** The normalized answers — the SAME key names the wizard posts. */
export interface InstallAnswers {
	db_hostname: string;
	db_port: string;
	db_socket: string;
	db_database: string;
	db_username: string;
	db_password: string;
	entity: string;
	entity_label: string;
	information: string;
	info_key: string;
	timezone: string;
	locale: string;
	langs: string[] | undefined;
	app_lang_default: string | undefined;
	data_lang_default: string | undefined;
	diffusion: boolean;
	mysql_hostname: string;
	mysql_port: string;
	mysql_socket: string;
	mysql_database: string;
	mysql_username: string;
	mysql_password: string;
	mailer: boolean;
	smtp_host: string;
	smtp_port: string;
	smtp_secure: string;
	smtp_user: string;
	smtp_pass: string;
	smtp_from: string;
	smtp_from_name: string;
	/** '' = not provided (the key is then not written, and a prior value survives). */
	media_path: string;
	unix_socket: string;
	media_access_mode: string;
	update_servers: UpdateServersChoice;
	/** OPTIONAL thesauri only — core tlds are removed (with a note). */
	hierarchies: string[];
	register_tools: boolean;
}

/** One .env assignment. `raw` = written verbatim (JSON), never envQuote'd. */
export interface EnvEntry {
	readonly key: string;
	readonly value: string;
	readonly raw: boolean;
}
export interface EnvSection {
	readonly comment: string;
	readonly entries: readonly EnvEntry[];
}

export interface InstallPlan {
	readonly answers: InstallAnswers;
	readonly langConfig: ReturnType<typeof deriveLangConfig>;
	/** The .env body sections, in file order. */
	readonly env: readonly EnvSection[];
	/** Every key the plan OWNS, in file order (DEDALO_SALT_STRING included). */
	readonly envKeys: readonly string[];
	readonly steps: readonly InstallStepId[];
	readonly hierarchies: readonly string[];
	readonly notes: readonly string[];
	/** Empty = valid. */
	readonly errors: readonly string[];
}

type RawAnswers = Readonly<Record<string, unknown>>;

// ── normalization ────────────────────────────────────────────────────────────

/** A posted value as text; absent (undefined/null) is ''. */
function text(raw: RawAnswers, key: string): string {
	const value = raw[key];
	return value === undefined || value === null ? '' : String(value);
}

/** A posted value as text, with the plan's default when absent or empty. */
function textOr(raw: RawAnswers, key: string, fallback: string): string {
	const value = text(raw, key);
	return value === '' ? fallback : value;
}

/** An optional value: absent stays undefined (deriveLangConfig picks its own default). */
function optionalText(raw: RawAnswers, key: string): string | undefined {
	const value = raw[key];
	return value === undefined || value === null ? undefined : String(value);
}

/** A comma string or an array → trimmed, non-empty entries. */
function listOf(value: unknown): string[] {
	const items = Array.isArray(value) ? value : String(value).split(',');
	return items.map((item) => String(item).trim()).filter((item) => item !== '');
}

/** langs: absent → undefined (the default working languages); otherwise the listed codes. */
function parseLangs(value: unknown): string[] | undefined {
	return value === undefined || value === null ? undefined : listOf(value);
}

/** update_servers: absent/true/'official' → official; false/'none' → none. */
function parseUpdateServers(value: unknown, errors: string[]): UpdateServersChoice {
	if (value === undefined || value === true || value === 'official') return 'official';
	if (value === false || value === 'none') return 'none';
	errors.push('update_servers must be official|none');
	return 'official';
}

/** The requested thesauri before the core/vendored filter. */
function requestedHierarchies(value: unknown): string[] {
	if (value === undefined || value === null || value === 'default') {
		return defaultOptionalHierarchies();
	}
	if (value === 'none') return [];
	return listOf(value).map((tld) => tld.toLowerCase());
}

/** Drop core tlds (noted) and refuse unvendored ones; de-duplicated, order kept. */
function parseHierarchies(value: unknown, notes: string[], errors: string[]): string[] {
	const offered = new Set(offeredHierarchies().map((meta) => meta.tld));
	const picked: string[] = [];
	for (const tld of requestedHierarchies(value)) {
		if (isCoreHierarchyTld(tld)) {
			notes.push(`${tld} is a core hierarchy (always activated) — dropped from the list`);
		} else if (!offered.has(tld)) {
			errors.push(`unknown hierarchy '${tld}' (not vendored)`);
		} else if (!picked.includes(tld)) {
			picked.push(tld);
		}
	}
	return picked;
}

/**
 * The thesaurus answer ALONE, normalized exactly as buildInstallPlan does —
 * lowercased, de-duplicated, a core tld dropped with a note, an unvendored one
 * an error. The wizard's install_hierarchies step posts its own ticked list
 * AFTER persist_config (engine.ts), so it runs this on that post: the same answer
 * reaches the same thesauri through the CLI and the wizard.
 */
export function normalizeHierarchyChoice(value: unknown): {
	hierarchies: string[];
	notes: string[];
	errors: string[];
} {
	const notes: string[] = [];
	const errors: string[] = [];
	const hierarchies = parseHierarchies(value, notes, errors);
	return { hierarchies, notes, errors };
}

/** The required answers: empty → "<key> is required". */
function requireAnswers(answers: InstallAnswers, errors: string[]): void {
	for (const key of ['db_database', 'db_username', 'entity'] as const) {
		if (answers[key] === '') errors.push(`${key} is required`);
	}
	// An empty host would persist a DISABLED mailer — refuse the contradiction.
	if (answers.mailer && answers.smtp_host === '') errors.push('mailer requires smtp_host');
}

/** Database + entity + locale answers (the plan's defaults live here). */
function coreAnswers(raw: RawAnswers) {
	const entity = text(raw, 'entity');
	return {
		db_hostname: textOr(raw, 'db_hostname', 'localhost'),
		db_port: textOr(raw, 'db_port', '5432'),
		db_socket: text(raw, 'db_socket'),
		db_database: text(raw, 'db_database'),
		db_username: text(raw, 'db_username'),
		db_password: text(raw, 'db_password'),
		entity,
		entity_label: textOr(raw, 'entity_label', entity),
		information: textOr(raw, 'information', 'ts-install'),
		info_key: textOr(raw, 'info_key', 'ts'),
		timezone: textOr(raw, 'timezone', 'Europe/Madrid'),
		locale: textOr(raw, 'locale', 'es-ES'),
		langs: parseLangs(raw.langs),
		app_lang_default: optionalText(raw, 'app_lang_default'),
		data_lang_default: optionalText(raw, 'data_lang_default'),
	};
}

/** The optional services: diffusion (MariaDB), mailer (SMTP), serving/media. */
function serviceAnswers(raw: RawAnswers) {
	return {
		diffusion: raw.diffusion === true,
		mysql_hostname: textOr(raw, 'mysql_hostname', 'localhost'),
		mysql_port: textOr(raw, 'mysql_port', '3306'),
		mysql_socket: text(raw, 'mysql_socket'),
		mysql_database: text(raw, 'mysql_database'),
		mysql_username: text(raw, 'mysql_username'),
		mysql_password: text(raw, 'mysql_password'),
		mailer: raw.mailer === true,
		smtp_host: text(raw, 'smtp_host'),
		smtp_port: textOr(raw, 'smtp_port', '587'),
		smtp_secure: textOr(raw, 'smtp_secure', 'tls'),
		smtp_user: text(raw, 'smtp_user'),
		smtp_pass: text(raw, 'smtp_pass'),
		smtp_from: text(raw, 'smtp_from'),
		smtp_from_name: text(raw, 'smtp_from_name'),
		media_path: text(raw, 'media_path'),
		unix_socket: text(raw, 'unix_socket'),
		media_access_mode: text(raw, 'media_access_mode'),
	};
}

/** Raw answers (wizard post or CLI flags) → normalized answers + notes + errors. */
export function normalizeInstallAnswers(raw: RawAnswers): {
	answers: InstallAnswers;
	notes: string[];
	errors: string[];
} {
	const notes: string[] = [];
	const errors: string[] = [];
	const answers: InstallAnswers = {
		...coreAnswers(raw),
		...serviceAnswers(raw),
		update_servers: parseUpdateServers(raw.update_servers, errors),
		hierarchies: parseHierarchies(raw.hierarchies, notes, errors),
		register_tools: raw.register_tools !== false,
	};
	requireAnswers(answers, errors);
	return { answers, notes, errors };
}

// ── the .env sections ───────────────────────────────────────────────────────

const entry = (key: string, value: string, raw = false): EnvEntry => ({ key, value, raw });
type LangConfig = ReturnType<typeof deriveLangConfig>;

function databaseSection(a: InstallAnswers): EnvSection {
	return {
		comment: '# --- Database (PostgreSQL) ---',
		entries: [
			entry('DEDALO_DATABASE_CONN', a.db_database),
			entry('DEDALO_USERNAME_CONN', a.db_username),
			entry('DEDALO_PASSWORD_CONN', a.db_password),
			entry('DEDALO_HOSTNAME_CONN', a.db_hostname),
			entry('DEDALO_DB_PORT_CONN', a.db_port),
			entry('DEDALO_SOCKET_CONN', a.db_socket),
		],
	};
}

function entitySection(a: InstallAnswers): EnvSection {
	return {
		comment: '# --- Entity / locale ---',
		entries: [
			entry('DEDALO_ENTITY', a.entity),
			entry('DEDALO_ENTITY_LABEL', a.entity_label),
			entry('DEDALO_TIMEZONE', a.timezone),
			entry('DEDALO_LOCALE', a.locale),
		],
	};
}

/**
 * LANGUAGES (mandatory once configured — config.ts requires them whenever
 * INSTALL_MODE is false, so a config without them crash-loops at boot). The
 * map/array keys are RAW compact JSON: parseEnvFile strips surrounding quotes
 * but does not unescape inner \", so an envQuote'd JSON value would not
 * round-trip through JSON.parse.
 */
function langSection(l: LangConfig): EnvSection {
	return {
		comment: '# --- Languages (mandatory: config.ts refuses boot without them) ---',
		entries: [
			entry('DEDALO_APPLICATION_LANGS', JSON.stringify(l.applicationLangs), true),
			entry('DEDALO_PROJECTS_DEFAULT_LANGS', JSON.stringify(l.projectsDefaultLangs), true),
			entry('DEDALO_APPLICATION_LANGS_DEFAULT', l.applicationLangsDefault),
			entry('DEDALO_DATA_LANG_DEFAULT', l.dataLangDefault),
			entry('DEDALO_APPLICATION_LANG', l.applicationLangsDefault),
			entry('DEDALO_DATA_LANG', l.dataLangDefault),
			entry('DEDALO_STRUCTURE_LANG', l.structureLang),
		],
	};
}

function secretSection(salt: string): EnvSection {
	return {
		comment: '# --- Secret (coexistence: written for PHP; TS auth uses Argon2id) ---',
		entries: [entry('DEDALO_SALT_STRING', salt)],
	};
}

/**
 * A prior server list the operator CUSTOMISED: a JSON array with at least one
 * entry (a mirror, an extra master). `[]` is the air-gapped answer an earlier
 * run wrote, and an unparseable value configures nothing — neither is a choice
 * an explicit `official` answer may silently keep.
 */
function isCustomServerList(value: string | undefined): boolean {
	if (value === undefined) return false;
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) && parsed.length > 0;
	} catch {
		return false;
	}
}

/**
 * UPDATE SERVERS (A3). Official by default; `none` (air-gapped) always writes
 * `[]` — an explicit answer the plan owns. PRESERVE RULE: with `official`, a key
 * whose prior .env value is a NON-EMPTY list is not re-emitted, so persist_config
 * carries the operator's line verbatim (mirrors they added survive a re-run). A
 * prior `[]` is NOT preserved: it is an earlier air-gapped answer, and keeping it
 * under an `official` answer would leave the install cut off from updates while
 * the front end showed the official server (the wizard re-save it invites).
 */
function updateServersSection(
	a: InstallAnswers,
	prior: Readonly<Record<string, string>>,
): EnvSection {
	const official = a.update_servers === 'official';
	const servers: [string, MasterServerEntry][] = [
		['ONTOLOGY_SERVERS', OFFICIAL_ONTOLOGY_SERVER],
		['CODE_SERVERS', OFFICIAL_CODE_SERVER],
	];
	return {
		comment:
			'# --- Update servers (ontology + code masters; [] = air-gapped, no updates offered) ---',
		entries: servers
			.filter(([key]) => !(official && isCustomServerList(prior[key])))
			.map(([key, server]) => entry(key, JSON.stringify(official ? [server] : []), true)),
	};
}

/**
 * Serving / media: written ONLY when provided, so a re-save that does not carry
 * them preserves a prior value instead of clobbering it. SERVER_UNIX_SOCKET is
 * the load-bearing one: its default mismatches a systemd + reverse-proxy deploy.
 */
function servingSection(a: InstallAnswers): EnvSection {
	const candidates = [
		entry('MEDIA_PATH', a.media_path),
		entry('SERVER_UNIX_SOCKET', a.unix_socket),
		entry('DEDALO_MEDIA_ACCESS_MODE', a.media_access_mode),
	];
	return {
		comment: '# --- Serving / media ---',
		entries: candidates.filter((candidate) => candidate.value !== ''),
	};
}

function diffusionSection(a: InstallAnswers): EnvSection {
	if (!a.diffusion) return { comment: '', entries: [] };
	return {
		comment: '# --- Diffusion (native TS engine, MariaDB target) ---',
		entries: [
			entry('DEDALO_DIFFUSION_NATIVE', 'true'),
			entry('DEDALO_DIFFUSION_DB_HOST', a.mysql_hostname),
			entry('DEDALO_DIFFUSION_DB_PORT', a.mysql_port),
			entry('DEDALO_DIFFUSION_DB_SOCKET', a.mysql_socket),
			entry('DEDALO_DIFFUSION_DB_USER', a.mysql_username),
			entry('DEDALO_DIFFUSION_DB_PASSWORD', a.mysql_password),
			entry('DEDALO_DIFFUSION_DB_NAME', a.mysql_database),
		],
	};
}

function mailerSection(a: InstallAnswers): EnvSection {
	if (!a.mailer) return { comment: '', entries: [] };
	return {
		comment: '# --- Outbound email (SMTP relay — password recovery) ---',
		entries: [
			entry('DEDALO_SMTP_HOST', a.smtp_host),
			entry('DEDALO_SMTP_PORT', a.smtp_port),
			entry('DEDALO_SMTP_SECURE', a.smtp_secure),
			entry('DEDALO_SMTP_USER', a.smtp_user),
			entry('DEDALO_SMTP_PASS', a.smtp_pass),
			entry('DEDALO_SMTP_FROM', a.smtp_from),
			entry('DEDALO_SMTP_FROM_NAME', a.smtp_from_name),
		],
	};
}

/** The .env body sections in file order; an empty section is omitted. */
function envSections(
	a: InstallAnswers,
	l: LangConfig,
	salt: string,
	prior: Readonly<Record<string, string>>,
): EnvSection[] {
	return [
		databaseSection(a),
		entitySection(a),
		langSection(l),
		secretSection(salt),
		updateServersSection(a, prior),
		servingSection(a),
		diffusionSection(a),
		mailerSection(a),
	].filter((section) => section.entries.length > 0);
}

/**
 * A .env is LINE-BASED: a CR/LF/NUL inside a value would split it into a second
 * `KEY=value` line (OPS-02 key injection). envQuote refuses it at write time;
 * the plan reports it up front so `--plan` and the wizard refuse BEFORE a write.
 */
function controlCharacterErrors(sections: readonly EnvSection[]): string[] {
	return sections
		.flatMap((section) => section.entries)
		.filter((item) => /[\r\n\0]/.test(item.value))
		.map((item) => `${item.key} contains an illegal control character`);
}

// ── the steps ────────────────────────────────────────────────────────────────

/** The step list: the optional probes and tool registration follow the answers. */
function installSteps(a: InstallAnswers): InstallStepId[] {
	const optional: Partial<Record<InstallStepId, boolean>> = {
		test_diffusion_connection: a.diffusion,
		test_mailer_connection: a.mailer,
		register_tools: a.register_tools,
	};
	return INSTALL_STEP_IDS.filter((step) => optional[step] !== false);
}

/** Answers → the whole plan. `salt` defaults to '' (the CLI's `--plan` has none). */
export function buildInstallPlan(
	raw: RawAnswers,
	context: { salt?: string; priorEnv?: Readonly<Record<string, string>> } = {},
): InstallPlan {
	const { answers, notes, errors } = normalizeInstallAnswers(raw);
	const langConfig = deriveLangConfig({
		langs: answers.langs,
		appLangDefault: answers.app_lang_default,
		dataLangDefault: answers.data_lang_default,
	});
	const env = envSections(answers, langConfig, context.salt ?? '', context.priorEnv ?? {});
	return {
		answers,
		langConfig,
		env,
		envKeys: env.flatMap((section) => section.entries.map((item) => item.key)),
		steps: installSteps(answers),
		hierarchies: answers.hierarchies,
		notes,
		errors: [
			...errors,
			...langConfig.errors.map((error) => `languages: ${error}`),
			...controlCharacterErrors(env),
		],
	};
}

/**
 * The process environment the CLI must hold BEFORE it imports config.ts: the
 * engine then resolves the REAL configuration (not install mode), the pool
 * targets the install database, and the four mandatory lang keys are present
 * (config.ts throws at import without them once ENTITY/DB are set).
 */
export function cliBootEnv(plan: InstallPlan): Record<string, string> {
	const a = plan.answers;
	const l = plan.langConfig;
	return {
		ENTITY: a.entity,
		DB_NAME: a.db_database,
		DB_HOST: a.db_hostname,
		DB_PORT: a.db_port,
		DB_USER: a.db_username,
		DB_PASSWORD: a.db_password,
		// The directory step's write-probe reads config.media.rootPath.
		...(a.media_path === '' ? {} : { MEDIA_PATH: a.media_path }),
		DEDALO_INSTALL_NO_RESTART: 'true', // the CLI never self-restarts
		DEDALO_APPLICATION_LANGS: JSON.stringify(l.applicationLangs),
		DEDALO_PROJECTS_DEFAULT_LANGS: JSON.stringify(l.projectsDefaultLangs),
		DEDALO_APPLICATION_LANGS_DEFAULT: l.applicationLangsDefault,
		DEDALO_DATA_LANG_DEFAULT: l.dataLangDefault,
		DEDALO_APPLICATION_LANG: l.applicationLangsDefault,
		DEDALO_DATA_LANG: l.dataLangDefault,
		DEDALO_STRUCTURE_LANG: l.structureLang,
	};
}

// ── the CLI front end's argv mapping ────────────────────────────────────────

/**
 * Every flag the CLI accepts. `key` is the answer it sets (null = a front-end
 * flag: --root-password, --plan). A bool flag sets `true`, except the negating
 * `--no-*` / `--skip-*` ones, which set `false`. NO DEFAULTS here — a flag that
 * is not given leaves its answer absent, and the plan's default applies.
 */
export const INSTALL_CLI_FLAGS: readonly {
	flag: string;
	key: string | null;
	kind: 'value' | 'bool';
}[] = Object.freeze([
	{ flag: '--db-host', key: 'db_hostname', kind: 'value' },
	{ flag: '--db-port', key: 'db_port', kind: 'value' },
	{ flag: '--db-socket', key: 'db_socket', kind: 'value' },
	{ flag: '--db-name', key: 'db_database', kind: 'value' },
	{ flag: '--db-user', key: 'db_username', kind: 'value' },
	{ flag: '--db-password', key: 'db_password', kind: 'value' },
	{ flag: '--entity', key: 'entity', kind: 'value' },
	{ flag: '--entity-label', key: 'entity_label', kind: 'value' },
	{ flag: '--information', key: 'information', kind: 'value' },
	{ flag: '--info-key', key: 'info_key', kind: 'value' },
	{ flag: '--timezone', key: 'timezone', kind: 'value' },
	{ flag: '--locale', key: 'locale', kind: 'value' },
	{ flag: '--langs', key: 'langs', kind: 'value' },
	{ flag: '--app-lang', key: 'app_lang_default', kind: 'value' },
	{ flag: '--data-lang', key: 'data_lang_default', kind: 'value' },
	{ flag: '--mysql-host', key: 'mysql_hostname', kind: 'value' },
	{ flag: '--mysql-port', key: 'mysql_port', kind: 'value' },
	{ flag: '--mysql-socket', key: 'mysql_socket', kind: 'value' },
	{ flag: '--mysql-name', key: 'mysql_database', kind: 'value' },
	{ flag: '--mysql-user', key: 'mysql_username', kind: 'value' },
	{ flag: '--mysql-password', key: 'mysql_password', kind: 'value' },
	{ flag: '--smtp-host', key: 'smtp_host', kind: 'value' },
	{ flag: '--smtp-port', key: 'smtp_port', kind: 'value' },
	{ flag: '--smtp-secure', key: 'smtp_secure', kind: 'value' },
	{ flag: '--smtp-user', key: 'smtp_user', kind: 'value' },
	{ flag: '--smtp-password', key: 'smtp_pass', kind: 'value' },
	{ flag: '--smtp-from', key: 'smtp_from', kind: 'value' },
	{ flag: '--smtp-from-name', key: 'smtp_from_name', kind: 'value' },
	{ flag: '--media-path', key: 'media_path', kind: 'value' },
	{ flag: '--socket', key: 'unix_socket', kind: 'value' },
	{ flag: '--media-access-mode', key: 'media_access_mode', kind: 'value' },
	{ flag: '--hierarchies', key: 'hierarchies', kind: 'value' },
	{ flag: '--root-password', key: null, kind: 'value' },
	{ flag: '--diffusion', key: 'diffusion', kind: 'bool' },
	{ flag: '--mailer', key: 'mailer', kind: 'bool' },
	{ flag: '--no-update-servers', key: 'update_servers', kind: 'bool' },
	{ flag: '--skip-tools', key: 'register_tools', kind: 'bool' },
	{ flag: '--plan', key: null, kind: 'bool' },
]);

const FLAGS_BY_NAME: ReadonlyMap<string, (typeof INSTALL_CLI_FLAGS)[number]> = new Map(
	INSTALL_CLI_FLAGS.map((spec) => [spec.flag, spec]),
);

export interface CliInstallInvocation {
	raw: Record<string, unknown>;
	rootPassword: string | undefined;
	planOnly: boolean;
	errors: string[];
}

/** A value flag's value, or the error that it has none. */
function flagValue(argv: readonly string[], index: number, flag: string, errors: string[]) {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith('--')) {
		errors.push(`${flag} needs a value`);
		return undefined;
	}
	return value;
}

/** Apply one parsed flag to the invocation. */
function applyFlag(
	invocation: CliInstallInvocation,
	spec: { flag: string; key: string | null; kind: 'value' | 'bool' },
	value: string | undefined,
): void {
	if (spec.flag === '--root-password') invocation.rootPassword = value;
	else if (spec.flag === '--plan') invocation.planOnly = true;
	else if (spec.kind === 'value') invocation.raw[spec.key as string] = value;
	else invocation.raw[spec.key as string] = !/^--(no|skip)-/.test(spec.flag);
}

/**
 * Consume the flag at `index` (and its value, for a value flag); answers how
 * many tokens it took. An unparseable token is recorded as an error and skipped.
 */
function consumeToken(
	argv: readonly string[],
	index: number,
	invocation: CliInstallInvocation,
): number {
	const token = argv[index] as string;
	const spec = FLAGS_BY_NAME.get(token);
	if (spec === undefined) {
		invocation.errors.push(
			token.startsWith('--') ? `unknown flag ${token}` : `unexpected argument '${token}'`,
		);
		return 1;
	}
	if (spec.kind === 'bool') {
		applyFlag(invocation, spec, undefined);
		return 1;
	}
	const value = flagValue(argv, index, token, invocation.errors);
	if (value === undefined) return 1;
	applyFlag(invocation, spec, value);
	return 2;
}

/**
 * argv → the raw answers the plan normalizes. Maps PROVIDED flags only (no
 * defaults); an unknown flag or a value flag without its value is an ERROR —
 * the old parser silently ignored both (`--yes` was accepted and meant nothing).
 */
export function answersFromCliArgs(argv: readonly string[]): CliInstallInvocation {
	const invocation: CliInstallInvocation = {
		raw: {},
		rootPassword: undefined,
		planOnly: false,
		errors: [],
	};
	for (let index = 0; index < argv.length; ) {
		index += consumeToken(argv, index, invocation);
	}
	return invocation;
}
