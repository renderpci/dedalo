/**
 * THE TERMINAL INSTALLER'S SCREEN MODEL (phase 2, 2026-10-12) — what every
 * interactive front end (the plain line mode today, the OpenTUI screens in
 * phase 3) ASKS, in which order, with which options, defaults and errors. A
 * front end renders a `Screen[]` and hands each response back through
 * `applyAnswer`; it never decides a default, a rule or a mapping itself.
 *
 * THE LAWS (each one gated — test/unit/install_screen_model_tripwire.test.ts):
 *  - ONE RUN PATH. The model only builds RAW ANSWERS (the same shape the wizard
 *    posts and an answers file carries); scripts/install.ts feeds them to the
 *    same plan and executor as a headless run (front_end.ts).
 *  - DEFAULTS LIVE IN THE PLAN. A question's `default` is the plan's own
 *    normalization of the answers without that key, read back — never restated
 *    here. Accepting a shown default leaves the key ABSENT, so a default derived
 *    from another answer (entity_label from entity, the production names from
 *    the instance) follows it. The ONE exception: the time zone and locale the
 *    HOST reports are offered as the suggestion and become answers once accepted
 *    (the plan stays deterministic).
 *  - ONE RULE SET. A question's `errors` are the plan's `fieldErrors` for its
 *    key (install_validation.ts — the sentences the CLI and the wizard refuse
 *    with); nothing here validates.
 *  - A HIDDEN QUESTION HOLDS NO ANSWER. `applyAnswer` drops every answer whose
 *    question is not visible after the change (a route change, a service turned
 *    off) — an error can never sit on a question nobody can reach, and a value
 *    nobody sees is never written.
 *  - SECRETS NEVER ENTER THE MODEL: the input says only WHETHER each was given.
 *
 * PURE: no config, no database, no probe, no terminal. Imports the plan, its
 * validation, the language and ontology catalogs (config-free), the client
 * password policy and the label catalog's JSON (the `password_rule_*` texts are
 * component_password's, shared — never copied). Kept OFF the server's import
 * closure (gated: install_screen_model_tripwire).
 */

import { check_password } from '../../../client/dedalo/core/component_password/js/password_policy.js';
import masterLabels from '../labels/master.json';
import { CORE_HIERARCHIES, type hierarchyChoiceView } from './hierarchy_meta.ts';
import {
	buildInstallPlan,
	cliArgsOf,
	INSTALL_ANSWER_KEYS,
	INSTALL_ROUTES,
	type InstallAnswers,
	type InstallPlan,
	type InstallRoute,
	normalizeInstallAnswers,
	ontologyServersFor,
	toponymyMissing,
} from './install_plan.ts';
import {
	MEDIA_ACCESS_MODE_OPTIONS,
	rootPasswordErrors,
	SMTP_SECURE_MODES,
	validLocale,
	validTimeZone,
} from './install_validation.ts';
import { deriveLangConfig, INSTALL_LANG_CATALOG } from './lang_catalog.ts';
import {
	describeOntologyCatalog,
	type OntologyCatalog,
	type OntologyCatalogViewEntry,
	type OntologyOrigin,
	ontologySourceLabel,
	vendoredOntologyCatalog,
} from './ontology_choice.ts';
import type { SecretKey } from './run_files.ts';
import {
	HELP_LINKS,
	MARK_TEXT,
	NOTICE_TEXT,
	ONTOLOGY_NOTE_TEXT,
	OPTION_TEXT,
	PLACEHOLDER_TEXT,
	QUESTION_TEXT,
	REVIEW_TEXT,
	ROUTE_TEXT,
	SCREEN_TEXT,
} from './screen_text.ts';

export type { InstallRoute } from './install_plan.ts';

// ── the screens and their order ──────────────────────────────────────────────

export type ScreenId =
	| 'route'
	| 'system'
	| 'database'
	| 'image'
	| 'tls_address'
	| 'containers'
	| 'identity'
	| 'web_tls'
	| 'services'
	| 'ontologies'
	| 'thesauri'
	| 'languages'
	| 'publication'
	| 'mail'
	| 'administrator'
	| 'review';

/**
 * The owner's step list per route (the approved mockup's order). "Install",
 * "Done" and "Resume" are run states of a front end, not model screens.
 */
export const SCREEN_ORDER: Readonly<Record<InstallRoute, readonly ScreenId[]>> = Object.freeze({
	production: Object.freeze([
		'route',
		'system',
		'database',
		'identity',
		'web_tls',
		'services',
		'ontologies',
		'thesauri',
		'languages',
		'publication',
		'mail',
		'administrator',
		'review',
	] as const),
	docker: Object.freeze([
		'route',
		'system',
		'image',
		'tls_address',
		'containers',
		'identity',
		'ontologies',
		'thesauri',
		'languages',
		'publication',
		'mail',
		'administrator',
		'review',
	] as const),
	// Docker minus the TLS choices: the trial stack is what install.sh builds.
	trial: Object.freeze([
		'route',
		'system',
		'image',
		'containers',
		'identity',
		'ontologies',
		'thesauri',
		'languages',
		'publication',
		'mail',
		'administrator',
		'review',
	] as const),
	developer: Object.freeze([
		'route',
		'system',
		'database',
		'identity',
		'ontologies',
		'thesauri',
		'languages',
		'publication',
		'mail',
		'administrator',
		'review',
	] as const),
});

/**
 * The answers no screen asks, with WHY — the completeness gate holds every
 * other answer key to a question.
 */
export const FLAGS_ONLY_ANSWER_KEYS: Readonly<Record<string, string>> = Object.freeze({
	register_tools:
		'skipping tool registration is a CI/test affordance; an operator install always registers',
});

const STACK_FIXED =
	'the compose stack fixes it (install.sh passes --route and the container run takes it from there)';
const STACK_SECRET =
	'given to install.sh (DEDALO_INSTALL_* in the container run) — the host front end cannot use it in phase 2';
const NO_INSTANCE = 'only a production install is a named instance';

/**
 * The answers a ROUTE does not ask, with WHY (A8): they keep the route's
 * default (routeDefaults) and stay settable by flag. Secrets included.
 */
export const ROUTE_FIXED: Readonly<Record<InstallRoute, Readonly<Record<string, string>>>> =
	Object.freeze({
		production: Object.freeze({}),
		developer: Object.freeze({
			instance: NO_INSTANCE,
			media_path: 'a checkout keeps the engine default media root (flag-settable: --media-path)',
			unix_socket: 'a checkout serves on its own port or socket (flag-settable: --socket)',
			media_access_mode: 'the engine default (flag-settable: --media-access-mode)',
		}),
		docker: Object.freeze({
			instance: NO_INSTANCE,
			db_hostname: STACK_FIXED,
			db_port: STACK_FIXED,
			db_socket: STACK_FIXED,
			db_database: STACK_FIXED,
			db_username: STACK_FIXED,
			media_path: STACK_FIXED,
			unix_socket: STACK_FIXED,
			media_access_mode: STACK_FIXED,
			db_password: STACK_SECRET,
			mysql_password: STACK_SECRET,
			smtp_pass: STACK_SECRET,
			root_password: STACK_SECRET,
		}),
		trial: Object.freeze({
			instance: NO_INSTANCE,
			db_hostname: STACK_FIXED,
			db_port: STACK_FIXED,
			db_socket: STACK_FIXED,
			db_database: STACK_FIXED,
			db_username: STACK_FIXED,
			media_path: STACK_FIXED,
			unix_socket: STACK_FIXED,
			media_access_mode: 'the trial stack has no media access control (its own route)',
			db_password: STACK_SECRET,
			mysql_password: STACK_SECRET,
			smtp_pass: STACK_SECRET,
			root_password: STACK_SECRET,
		}),
	});

// ── the input ────────────────────────────────────────────────────────────────

/** The probes a front end runs (each in the probe child — install_probe_client.ts). */
export type ProbeId = 'system' | 'db' | 'media' | 'diffusion' | 'mailer';

/** One System-check row (words, never glyphs). */
export interface SystemCheckRow {
	state: 'ok' | 'warn' | 'fail';
	label: string;
	detail: string;
}

/** A probe's answer as the model reads it. */
export interface ProbeOutcome {
	ok: boolean;
	/** the probe's sentence (an internal shape, never a wire envelope: no `msg`). */
	detail: string;
	/** system only: the rows, the engine version, the seed path. */
	rows?: SystemCheckRow[];
	version?: string;
	seedPath?: string;
}

export interface InstallCatalogs {
	/** null = not fetched (or unreachable) → the built-in catalog is offered. */
	ontology: { catalog: OntologyCatalog | null; ok: boolean; detail: string };
	thesauri: { view: ReturnType<typeof hierarchyChoiceView> } | { error: string };
}

export interface ScreenModelInput {
	/** The plain answers so far — never a secret value. */
	raw: Readonly<Record<string, unknown>>;
	secretsGiven: Readonly<Partial<Record<SecretKey, boolean>>>;
	priorEnv: Readonly<Record<string, string>>;
	catalogs: InstallCatalogs;
	/** Detected on the host; offered as suggestions only (see the header). */
	host: { timezone?: string; locale?: string };
	probes: Readonly<Partial<Record<ProbeId, ProbeOutcome>>>;
	/** The acknowledge-question ids the operator typed `yes` to. */
	acknowledged: ReadonlySet<string>;
}

// ── the output ───────────────────────────────────────────────────────────────

export type OptionMark =
	| { kind: 'core' }
	| { kind: 'default' }
	| { kind: 'ships_terms' }
	| { kind: 'empty' }
	| { kind: 'needed_by'; by: string[]; mandatory: boolean }
	| { kind: 'also_installs'; tlds: string[] }
	| { kind: 'undeclared'; origin: OntologyOrigin }
	| { kind: 'note'; text: string };

export interface Option {
	value: string;
	label: string;
	description: string;
	group: string | null;
	selected: boolean;
	/** Cannot be unticked (a mandatory ontology dependency, a core row) — `marks` say why. */
	locked: boolean;
	marks: OptionMark[];
	/** The options of the SAME question this one declares (what ticking it pre-ticks). */
	declares: readonly { tld: string; mandatory: boolean }[];
	/** Pre-ticked because something OUTSIDE this question declares it (an ontology, for a thesaurus). */
	external: boolean;
}

export interface Question {
	/** `<screen>.<key|name>` — stable; scripts and gates address questions by it. */
	id: string;
	key: keyof InstallAnswers | SecretKey | null;
	/** Further answer keys this question's answer writes (ontologies/thesauri → declined_dependencies). */
	sets: readonly (keyof InstallAnswers)[];
	kind: 'text' | 'choice' | 'multi' | 'secret' | 'confirm' | 'acknowledge';
	label: string;
	description: string;
	/** The current value (multi: the SELECTION shown, the closure included; secret: null). */
	value: unknown;
	/** What an unanswered question takes (the plan's default — see the header). */
	default: unknown;
	/** The key is present in the answers (a secret: given; an acknowledgement: typed). */
	answered: boolean;
	required: boolean;
	/** text/secret: an empty entry is a valid answer (an optional field; a passwordless connection). */
	emptyAllowed?: boolean;
	options?: Option[];
	groups?: { id: string; label: string; open: boolean }[];
	/** The plan's refusals for `key` ∪ `sets` — the validator's own sentences. */
	errors: string[];
	/** A suggestion shown next to the errors (never applied for the operator — e.g. the entity code). */
	hint?: string;
}

export interface Notice {
	level: 'info' | 'warn' | 'error';
	text: string;
}

export interface Screen {
	id: ScreenId;
	/** 1-based position on the route. */
	index: number;
	count: number;
	title: string;
	description: string;
	/** The VISIBLE questions only, in ask order. */
	questions: Question[];
	notices: Notice[];
	probe?: { id: ProbeId; gate: 'must_pass' | 'pass_or_acknowledge' | 'report' };
	/** A host part phase 4 automates; today the manual steps. */
	placeholder?: { phase: 4; manual: string };
	help: { label: string; url: string }[];
}

// ── the context every builder reads ──────────────────────────────────────────

interface Ctx {
	readonly input: ScreenModelInput;
	/** The chosen route; null before the operator picks one. */
	readonly route: InstallRoute | null;
	readonly plan: InstallPlan;
	readonly answers: InstallAnswers;
	readonly visible: ReadonlySet<string>;
}

const HOST_SUGGESTED: ReadonlySet<string> = new Set(['timezone', 'locale']);
const SECRET_KEY_SET: ReadonlySet<string> = new Set([
	'db_password',
	'mysql_password',
	'smtp_pass',
	'root_password',
]);

/** The chosen route, or null (absent or not one of INSTALL_ROUTES). */
function chosenRoute(raw: Readonly<Record<string, unknown>>): InstallRoute | null {
	const route = raw.route;
	return typeof route === 'string' && (INSTALL_ROUTES as readonly string[]).includes(route)
		? (route as InstallRoute)
		: null;
}

/** A host route: the engine steps run on THIS machine (production, developer). */
function hostRoute(route: InstallRoute | null): boolean {
	return route !== 'docker' && route !== 'trial';
}

/** One visibility rule: these keys are asked when `when` holds. */
interface VisibilityRule {
	readonly keys: readonly string[];
	readonly when: (raw: Readonly<Record<string, unknown>>, route: InstallRoute | null) => boolean;
}

/** Production — or no route chosen yet (the production list is shown until one is). */
const productionOrUnset = (_raw: unknown, route: InstallRoute | null): boolean =>
	route === 'production' || route === null;
const onHostRoute = (_raw: unknown, route: InstallRoute | null): boolean => hostRoute(route);
const diffusionOn = (raw: Readonly<Record<string, unknown>>): boolean => raw.diffusion === true;
const mailerOn = (raw: Readonly<Record<string, unknown>>): boolean => raw.mailer === true;

/**
 * THE visibility table (see visibleKeys). Secrets ride the host routes only:
 * on docker/trial they are install.sh's (ROUTE_FIXED).
 */
const VISIBILITY: readonly VisibilityRule[] = Object.freeze<VisibilityRule[]>([
	{
		keys: [
			'route',
			'entity',
			'entity_label',
			'information',
			'info_key',
			'timezone',
			'locale',
			'update_servers',
			'ontologies',
			'declined_dependencies',
			'hierarchies',
			'langs',
			'app_lang_default',
			'data_lang_default',
			'diffusion',
			'mailer',
		],
		when: () => true,
	},
	{ keys: ['instance', 'media_path', 'unix_socket', 'media_access_mode'], when: productionOrUnset },
	{
		keys: [
			'db_hostname',
			'db_port',
			'db_socket',
			'db_database',
			'db_username',
			'db_password',
			'root_password',
		],
		when: onHostRoute,
	},
	{ keys: ['ontology_source'], when: (raw) => raw.update_servers === 'none' },
	{
		keys: ['mysql_hostname', 'mysql_port', 'mysql_socket', 'mysql_database', 'mysql_username'],
		when: diffusionOn,
	},
	{ keys: ['mysql_password'], when: (raw, route) => diffusionOn(raw) && hostRoute(route) },
	{
		keys: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from', 'smtp_from_name'],
		when: mailerOn,
	},
	{ keys: ['smtp_pass'], when: (raw, route) => mailerOn(raw) && hostRoute(route) },
]);

/**
 * THE visibility rule — which answer keys (and secret keys) a question asks,
 * given the answers so far. ONE function: the builders include exactly these
 * questions, and applyAnswer drops every answer outside them.
 */
export function visibleKeys(raw: Readonly<Record<string, unknown>>): ReadonlySet<string> {
	const route = chosenRoute(raw);
	return new Set(VISIBILITY.filter((rule) => rule.when(raw, route)).flatMap((rule) => rule.keys));
}

/** The plan the answers so far decide — what every question's errors and selections come from. */
export function previewPlan(input: ScreenModelInput): InstallPlan {
	return buildInstallPlan(input.raw, {
		priorEnv: input.priorEnv,
		ontologyCatalog: input.catalogs.ontology.catalog ?? undefined,
	});
}

function context(input: ScreenModelInput): Ctx {
	const plan = previewPlan(input);
	return {
		input,
		route: chosenRoute(input.raw),
		plan,
		answers: plan.answers,
		visible: visibleKeys(input.raw),
	};
}

function without(raw: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> {
	const copy = { ...raw };
	delete copy[key];
	return copy;
}

/** Two answer values compared as data. */
function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The host's suggestion for timezone/locale, when the validator accepts it. */
function hostSuggestion(ctx: Ctx, key: 'timezone' | 'locale'): string | undefined {
	const value = ctx.input.host[key];
	if (value === undefined || value === '') return undefined;
	return (key === 'timezone' ? validTimeZone(value) : validLocale(value)) ? value : undefined;
}

/** The plan's own default: the normalization of the answers WITHOUT `key`, read back. */
function planDefault(ctx: Ctx, key: keyof InstallAnswers): unknown {
	return normalizeInstallAnswers(without(ctx.input.raw, key)).answers[key];
}

/** The keys whose default is not the plain read-back (see the header). */
const SPECIAL_DEFAULTS: Readonly<Partial<Record<keyof InstallAnswers, (ctx: Ctx) => unknown>>> =
	Object.freeze({
		// Chosen, never defaulted.
		route: () => null,
		// The host's suggestion (D3), else the plan's.
		timezone: (ctx: Ctx) => hostSuggestion(ctx, 'timezone') ?? planDefault(ctx, 'timezone'),
		locale: (ctx: Ctx) => hostSuggestion(ctx, 'locale') ?? planDefault(ctx, 'locale'),
		// The language derivation's own defaults (lang_catalog.ts).
		langs: () => deriveLangConfig({}).projectsDefaultLangs,
		app_lang_default: (ctx: Ctx) =>
			deriveLangConfig({ langs: ctx.answers.langs }).applicationLangsDefault,
		data_lang_default: (ctx: Ctx) => deriveLangConfig({ langs: ctx.answers.langs }).dataLangDefault,
	});

/** THE default of `key`: the plan's normalization of the answers without it (see the header). */
function defaultOf(ctx: Ctx, key: keyof InstallAnswers): unknown {
	const special = SPECIAL_DEFAULTS[key];
	return special === undefined ? planDefault(ctx, key) : special(ctx);
}

/** The plan's tagged refusals for these keys (the validator's sentences, de-duplicated). */
function errorsFor(ctx: Ctx, keys: readonly string[]): string[] {
	return [
		...new Set(
			ctx.plan.fieldErrors.filter((item) => keys.includes(item.key)).map((item) => item.message),
		),
	];
}

function textOf(id: string): { label: string; description: string } {
	return QUESTION_TEXT[id] ?? { label: id, description: '' };
}

/** A question over one plain answer key. */
function ask(
	ctx: Ctx,
	screen: ScreenId,
	key: keyof InstallAnswers,
	kind: Question['kind'],
	extra: Partial<Question> = {},
): Question {
	const sets = extra.sets ?? [];
	return {
		id: `${screen}.${key}`,
		key,
		sets,
		kind,
		...textOf(key),
		value: ctx.answers[key],
		default: defaultOf(ctx, key),
		answered: Object.hasOwn(ctx.input.raw, key),
		required: false,
		errors: errorsFor(ctx, [key, ...sets]),
		...extra,
	};
}

/** A secret question: the model only knows whether it was given. */
function askSecret(ctx: Ctx, screen: ScreenId, key: SecretKey, emptyAllowed: boolean): Question {
	const given = ctx.input.secretsGiven[key] === true;
	return {
		id: `${screen}.${key}`,
		key,
		sets: [],
		kind: 'secret',
		...textOf(key),
		value: null,
		default: '',
		answered: given,
		required: !emptyAllowed,
		emptyAllowed,
		// A secret's refusals are the prompt's own (empty, twice, the policy —
		// passwordFeedback); the Review shows a missing root password.
		errors: [],
	};
}

/** A typed-`yes` acknowledgement (no answer key: it lives in `acknowledged`). */
function acknowledge(ctx: Ctx, id: string): Question {
	const typed = ctx.input.acknowledged.has(id);
	return {
		id,
		key: null,
		sets: [],
		kind: 'acknowledge',
		...textOf(id),
		value: typed,
		default: false,
		answered: typed,
		required: true,
		errors: [],
	};
}

/** The visible ones of `questions` (a builder lists every possible question; this filters). */
function shown(ctx: Ctx, questions: readonly (Question | null)[]): Question[] {
	return questions.filter(
		(question): question is Question =>
			question !== null && (question.key === null || ctx.visible.has(question.key)),
	);
}

/** A choice option with no marks or dependencies. */
function plainOption(value: string, label: string, description: string): Option {
	return {
		value,
		label,
		description,
		group: null,
		selected: false,
		locked: false,
		marks: [],
		declares: [],
		external: false,
	};
}

// ── the screens ──────────────────────────────────────────────────────────────

interface Frame {
	index: number;
	count: number;
}

function screen(id: ScreenId, frame: Frame, parts: Partial<Screen>): Screen {
	const text = SCREEN_TEXT[id] ?? { title: id, description: '' };
	return {
		id,
		index: frame.index,
		count: frame.count,
		title: text.title,
		description: text.description,
		questions: [],
		notices: [],
		help: [],
		...parts,
	};
}

/** A probe's outcome as notices (`ok` informs; a failure is an error or a warning). */
function probeNotices(
	outcome: ProbeOutcome | undefined,
	failLevel: 'error' | 'warn',
	render: (msg: string) => string = (msg) => msg,
): Notice[] {
	if (outcome === undefined) return [];
	return [
		outcome.ok
			? { level: 'info', text: render(NOTICE_TEXT.probeOk(outcome.detail)) }
			: { level: failLevel, text: render(NOTICE_TEXT.probeFailed(outcome.detail)) },
	];
}

function routeScreen(ctx: Ctx, frame: Frame): Screen {
	const options = INSTALL_ROUTES.map((route) => {
		const text = ROUTE_TEXT[route];
		return plainOption(route, `${text.label} (${text.badge})`, text.description);
	});
	return screen('route', frame, {
		questions: shown(ctx, [
			ask(ctx, 'route', 'route', 'choice', { options, required: true, value: ctx.route }),
			// The instance names everything the next screens default (database,
			// role, media, socket), so it is asked WITH the route.
			ctx.route === 'production' ? ask(ctx, 'route', 'instance', 'text', { required: true }) : null,
			ctx.route === 'trial' ? acknowledge(ctx, 'route.trial_no_media_protection') : null,
		]),
		help: [HELP_LINKS.guide, HELP_LINKS.reference],
	});
}

/** A row's notice level. */
const ROW_LEVEL: Readonly<Record<SystemCheckRow['state'], Notice['level']>> = Object.freeze({
	ok: 'info',
	warn: 'warn',
	fail: 'error',
});

/** `items` when `condition` holds, else none — keeps the builders flat. */
function when<T>(condition: boolean, ...items: T[]): T[] {
	return condition ? items : [];
}

/** The version line of a System check. */
function versionNotices(outcome: ProbeOutcome): Notice[] {
	return when(outcome.version !== undefined, {
		level: 'info' as const,
		text: NOTICE_TEXT.systemVersion(outcome.version ?? '', outcome.seedPath ?? ''),
	});
}

/** The System check's rows and summary as notices. */
function systemNotices(outcome: ProbeOutcome | undefined): Notice[] {
	if (outcome === undefined) return [];
	const rows = outcome.rows ?? [];
	const failed = rows.filter((row) => row.state === 'fail').length;
	const warned = rows.filter((row) => row.state === 'warn').length;
	return [
		...versionNotices(outcome),
		...rows.map((row) => ({
			level: ROW_LEVEL[row.state],
			text: `${row.state === 'fail' ? 'failed' : row.state}  ${row.label}  ${row.detail}`,
		})),
		{
			level: failed > 0 ? ('error' as const) : ('info' as const),
			text: NOTICE_TEXT.systemSummary(failed, warned),
		},
		...when(!outcome.ok && rows.length === 0, { level: 'error' as const, text: outcome.detail }),
	];
}

function systemScreen(ctx: Ctx, frame: Frame): Screen {
	return screen('system', frame, {
		notices: systemNotices(ctx.input.probes.system),
		probe: { id: 'system', gate: 'must_pass' },
	});
}

function databaseScreen(ctx: Ctx, frame: Frame): Screen {
	const probe = ctx.input.probes.db;
	return screen('database', frame, {
		questions: shown(ctx, [
			ask(ctx, 'database', 'db_hostname', 'text'),
			ask(ctx, 'database', 'db_port', 'text'),
			ask(ctx, 'database', 'db_socket', 'text', { emptyAllowed: true }),
			ask(ctx, 'database', 'db_database', 'text', { required: true }),
			ask(ctx, 'database', 'db_username', 'text', { required: true }),
			askSecret(ctx, 'database', 'db_password', true),
		]),
		notices: [
			{ level: 'info', text: NOTICE_TEXT.databasePrerequisite },
			...(probe === undefined
				? []
				: [
						{
							level: probe.ok ? 'info' : 'error',
							text: NOTICE_TEXT.databaseProbe(probe.detail),
						} as Notice,
					]),
		],
		probe: { id: 'db', gate: 'must_pass' },
	});
}

/**
 * The entity code SUGGESTED for a free text (an institution's name): diacritics
 * dropped, every run of other characters one `_`, lowercase, a leading letter
 * guaranteed. Shown next to the validator's refusal — never applied for the
 * operator.
 */
export function entitySlug(text: string): string {
	const slug = text
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (slug === '') return 'entity';
	return /^[a-z]/.test(slug) ? slug : `e_${slug}`;
}

function identityScreen(ctx: Ctx, frame: Frame): Screen {
	const entity = ask(ctx, 'identity', 'entity', 'text', { required: true });
	const slug = entitySlug(ctx.answers.entity);
	if (entity.errors.length > 0 && ctx.answers.entity !== '' && slug !== ctx.answers.entity) {
		entity.hint = `suggested entity code: ${slug}`;
	}
	return screen('identity', frame, {
		questions: shown(ctx, [
			entity,
			ask(ctx, 'identity', 'entity_label', 'text'),
			ask(ctx, 'identity', 'information', 'text'),
			ask(ctx, 'identity', 'info_key', 'text'),
			ask(ctx, 'identity', 'timezone', 'text'),
			ask(ctx, 'identity', 'locale', 'text'),
		]),
	});
}

function placeholderScreen(id: ScreenId, frame: Frame, manual: string): Screen {
	return screen(id, frame, { placeholder: { phase: 4, manual } });
}

function servicesScreen(ctx: Ctx, frame: Frame): Screen {
	const options = MEDIA_ACCESS_MODE_OPTIONS.map((mode) => {
		const text = OPTION_TEXT.media_access_mode[mode] ?? { label: mode, description: '' };
		return plainOption(mode, text.label, text.description);
	});
	return screen('services', frame, {
		questions: shown(ctx, [
			ask(ctx, 'services', 'media_path', 'text', { emptyAllowed: true }),
			ask(ctx, 'services', 'unix_socket', 'text', { emptyAllowed: true }),
			ask(ctx, 'services', 'media_access_mode', 'choice', { options }),
		]),
		notices: [
			{ level: 'info', text: NOTICE_TEXT.mediaPrerequisite },
			...probeNotices(ctx.input.probes.media, 'error', (msg) => NOTICE_TEXT.mediaProbe(msg)),
		],
		probe: { id: 'media', gate: 'must_pass' },
		placeholder: { phase: 4, manual: PLACEHOLDER_TEXT.services },
		help: [HELP_LINKS.production, HELP_LINKS.multiInstance],
	});
}

// ── ontologies ───────────────────────────────────────────────────────────────

/** The ONTOLOGY dependencies an entry declares (core excluded by the caller's option set). */
function ontologyDeclares(entry: OntologyCatalogViewEntry): { tld: string; mandatory: boolean }[] {
	return (entry.dependencies ?? [])
		.filter((dependency) => dependency.main === 'ontology35')
		.map((dependency) => ({ tld: dependency.tld, mandatory: dependency.mandatory }));
}

/** The selected entries that declare `entry` as an ONTOLOGY dependency. */
function declarersOf(
	entry: OntologyCatalogViewEntry,
	entries: readonly OntologyCatalogViewEntry[],
	selected: ReadonlySet<string>,
): OntologyCatalogViewEntry[] {
	return entries.filter(
		(other) =>
			other.tld !== entry.tld &&
			selected.has(other.tld) &&
			ontologyDeclares(other).some((item) => item.tld === entry.tld),
	);
}

/** The marks of one ontology option (words for a screen reader, flags for a UI). */
function ontologyMarks(
	entry: OntologyCatalogViewEntry,
	declarers: readonly OntologyCatalogViewEntry[],
	mandatory: boolean,
): OptionMark[] {
	const note = ONTOLOGY_NOTE_TEXT[entry.tld];
	return [
		...when<OptionMark>(entry.is_default, { kind: 'default' }),
		...when<OptionMark>(declarers.length > 0, {
			kind: 'needed_by',
			by: declarers.map((other) => other.tld),
			mandatory,
		}),
		...when<OptionMark>(entry.also_installs.length > 0, {
			kind: 'also_installs',
			tlds: entry.also_installs,
		}),
		...when<OptionMark>(entry.dependencies === null, { kind: 'undeclared', origin: entry.origin }),
		...when<OptionMark>(note !== undefined, { kind: 'note', text: note ?? '' }),
	];
}

/** One catalog entry as an option of the ontologies question. */
function ontologyOption(
	entry: OntologyCatalogViewEntry,
	entries: readonly OntologyCatalogViewEntry[],
	selected: ReadonlySet<string>,
): Option {
	const declarers = declarersOf(entry, entries, selected);
	const mandatory = declarers.some((other) =>
		ontologyDeclares(other).some((item) => item.tld === entry.tld && item.mandatory),
	);
	return {
		value: entry.tld,
		label: entry.name,
		description: ONTOLOGY_NOTE_TEXT[entry.tld] ?? '',
		group: entry.typology_name,
		selected: selected.has(entry.tld),
		locked: selected.has(entry.tld) && mandatory,
		marks: ontologyMarks(entry, declarers, mandatory),
		declares: ontologyDeclares(entry),
		external: false,
	};
}

/** The core group: locked, always installed (never part of the answer). */
const CORE_GROUP = 'core';

function ontologiesQuestion(ctx: Ctx): Question {
	const catalog = ctx.input.catalogs.ontology.catalog ?? vendoredOntologyCatalog();
	const view = describeOntologyCatalog(catalog);
	const selected = new Set(ctx.plan.activeOntologyTlds.filter((tld) => !view.core.includes(tld)));
	const options: Option[] = [
		...view.core.map((tld) => ({
			...plainOption(tld, tld, MARK_TEXT.core),
			group: CORE_GROUP,
			selected: true,
			locked: true,
			marks: [{ kind: 'core' } as OptionMark],
		})),
		...view.entries.map((entry) => ontologyOption(entry, view.entries, selected)),
	];
	const groups = [...new Set(options.map((option) => option.group ?? ''))].map((id) => ({
		id,
		label: id === CORE_GROUP ? MARK_TEXT.core : id === '' ? 'Other' : id,
		open: options.some(
			(option) =>
				(option.group ?? '') === id &&
				id !== CORE_GROUP &&
				(option.selected ||
					option.marks.some((mark) => mark.kind === 'default' || mark.kind === 'note')),
		),
	}));
	return ask(ctx, 'ontologies', 'ontologies', 'multi', {
		sets: ['declined_dependencies'],
		options: options.map((option) => ({ ...option, group: option.group ?? '' })),
		groups,
		value: [...selected],
	});
}

/** The update-server options (the URL shown is the one the install will configure — A9). */
function updateServerOptions(ctx: Ctx): Option[] {
	const official = ontologyServersFor({ update_servers: 'official' }, ctx.input.priorEnv)[0];
	return [
		{
			...plainOption('official', '', ''),
			...OPTION_TEXT.update_servers.official(official?.url ?? ''),
		},
		{ ...plainOption('none', '', ''), ...OPTION_TEXT.update_servers.none },
	];
}

/** Where the offered ontologies come from: the catalog read, or why it could not be. */
function catalogNotices(catalog: InstallCatalogs['ontology']): Notice[] {
	if (!catalog.ok && catalog.detail !== '') {
		return [{ level: 'warn', text: NOTICE_TEXT.catalogUnreachable(catalog.detail) }];
	}
	return catalog.catalog === null
		? []
		: [
				{
					level: 'info',
					text: NOTICE_TEXT.catalogSource(ontologySourceLabel(catalog.catalog.source)),
				},
			];
}

function ontologiesScreen(ctx: Ctx, frame: Frame): Screen {
	const airGapped = ctx.answers.update_servers === 'none';
	return screen('ontologies', frame, {
		questions: shown(ctx, [
			ask(ctx, 'ontologies', 'update_servers', 'choice', { options: updateServerOptions(ctx) }),
			ask(ctx, 'ontologies', 'ontology_source', 'text', { emptyAllowed: true }),
			ontologiesQuestion(ctx),
		]),
		notices: [
			...when<Notice>(airGapped, { level: 'warn', text: NOTICE_TEXT.airGapped }),
			...when<Notice>(airGapped && ctx.answers.ontology_source === '', {
				level: 'info',
				text: NOTICE_TEXT.onlyOh,
			}),
			...catalogNotices(ctx.input.catalogs.ontology),
		],
	});
}

// ── thesauri ─────────────────────────────────────────────────────────────────

/**
 * The thesauri the ONTOLOGY side pre-ticks, with the thesaurus declines set
 * aside (a declined one is still "theirs": re-ticking it must remove the
 * decline, not make it a choice).
 */
function externalThesauri(ctx: Ctx): ReadonlySet<string> {
	const ontologyDeclines = declineTokens(ctx.input.raw.declined_dependencies).filter(
		(token) => !token.endsWith(':hierarchy1'),
	);
	const plan = buildInstallPlan(
		{ ...ctx.input.raw, hierarchies: 'none', declined_dependencies: ontologyDeclines },
		{
			priorEnv: ctx.input.priorEnv,
			ontologyCatalog: ctx.input.catalogs.ontology.catalog ?? undefined,
		},
	);
	return new Set(plan.ontologyHierarchyDependencies.map((item) => item.tld));
}

function thesauriQuestion(ctx: Ctx): Question {
	const thesauri = ctx.input.catalogs.thesauri;
	const view = 'view' in thesauri ? thesauri.view : { hierarchies: [], hierarchy_typologies: [] };
	const typologyLabel = new Map(
		view.hierarchy_typologies.map((item) => [item.typology, item.label] as const),
	);
	const selected = new Set(ctx.plan.hierarchies);
	const dependencies = new Map(ctx.plan.hierarchyDependencies.map((item) => [item.tld, item]));
	const external = externalThesauri(ctx);
	const options: Option[] = view.hierarchies.map((entry) => {
		const marks: OptionMark[] = [{ kind: entry.has_data ? 'ships_terms' : 'empty' }];
		const dependency = dependencies.get(entry.tld);
		if (dependency !== undefined) {
			marks.push({ kind: 'needed_by', by: dependency.dependants, mandatory: dependency.mandatory });
		}
		return {
			value: entry.tld,
			label: entry.label,
			description: '',
			group: typologyLabel.get(entry.typology) ?? String(entry.typology),
			selected: selected.has(entry.tld),
			// A thesaurus is never locked (owner decision 2026-10-10): a mandatory
			// one is "strongly recommended", declinable.
			locked: false,
			marks,
			declares: entry.dependencies,
			external: external.has(entry.tld),
		};
	});
	// Groups A→Z by typology; open when they hold a ticked entry.
	const groupIds = [...new Set(options.map((option) => option.group as string))].sort((a, b) =>
		a.localeCompare(b),
	);
	const order = new Map(groupIds.map((id, index) => [id, index]));
	options.sort((a, b) => (order.get(a.group as string) ?? 0) - (order.get(b.group as string) ?? 0));
	return ask(ctx, 'thesauri', 'hierarchies', 'multi', {
		sets: ['declined_dependencies'],
		options,
		groups: groupIds.map((id) => ({
			id,
			label: id,
			open: options.some((option) => option.group === id && option.selected),
		})),
		value: [...ctx.plan.hierarchies],
	});
}

/** The plan's warnings about thesauri (a declined strongly-recommended one, one without an entry). */
function thesaurusWarnings(plan: InstallPlan): Notice[] {
	return plan.warnings
		.filter((warning) => /thesaur/i.test(warning))
		.map((warning) => ({ level: 'warn' as const, text: warning }));
}

function thesauriScreen(ctx: Ctx, frame: Frame): Screen {
	const thesauri = ctx.input.catalogs.thesauri;
	const notices: Notice[] = [
		{ level: 'info', text: NOTICE_TEXT.thesauriIntro },
		{
			level: 'info',
			text: NOTICE_TEXT.coreThesauri(CORE_HIERARCHIES.map((item) => `${item.label} [${item.tld}]`)),
		},
	];
	if ('error' in thesauri) notices.push({ level: 'error', text: thesauri.error });
	if (toponymyMissing(ctx.plan.hierarchies, [])) {
		notices.push({ level: 'warn', text: NOTICE_TEXT.toponymy(NOTICE_TEXT.toponymyExample) });
	}
	notices.push(...thesaurusWarnings(ctx.plan));
	return screen('thesauri', frame, {
		questions: shown(ctx, [
			thesauriQuestion(ctx),
			ctx.plan.hierarchies.length === 0 ? acknowledge(ctx, 'thesauri.none_selected') : null,
		]),
		notices,
	});
}

// ── languages, publication, mail, administrator ──────────────────────────────

function languagesScreen(ctx: Ctx, frame: Frame): Screen {
	const picked = ctx.plan.langConfig.projectsDefaultLangs;
	const langOptions = Object.entries(INSTALL_LANG_CATALOG).map(([code, label]) => ({
		...plainOption(code, label, code),
		selected: picked.includes(code),
	}));
	const defaultOptions = picked.map((code) =>
		plainOption(code, INSTALL_LANG_CATALOG[code] ?? code, code),
	);
	return screen('languages', frame, {
		questions: shown(ctx, [
			ask(ctx, 'languages', 'langs', 'multi', {
				options: langOptions,
				value: [...picked],
				required: true,
			}),
			ask(ctx, 'languages', 'app_lang_default', 'choice', {
				options: defaultOptions,
				value: ctx.plan.langConfig.applicationLangsDefault,
			}),
			ask(ctx, 'languages', 'data_lang_default', 'choice', {
				options: defaultOptions,
				value: ctx.plan.langConfig.dataLangDefault,
			}),
		]),
	});
}

/** A failed pass_or_acknowledge probe asks for the typed override. */
function overrideQuestion(ctx: Ctx, id: ScreenId, probe: ProbeId): Question | null {
	const outcome = ctx.input.probes[probe];
	return outcome !== undefined && !outcome.ok ? acknowledge(ctx, `${id}.probe_override`) : null;
}

/** The probe part of an optional service's screen, when it is tested here. */
function serviceProbe(tested: boolean, probe: ProbeId): Pick<Screen, 'probe'> {
	return tested ? { probe: { id: probe, gate: 'pass_or_acknowledge' } } : {};
}

/**
 * The tested half of an optional service's screen (publication, mail): the
 * probe, its outcome and the typed override — on a host route with the service
 * on. On docker/trial the stack is not running yet: the container's install
 * tests the connection.
 */
function serviceParts(
	ctx: Ctx,
	id: ScreenId,
	on: boolean,
	probe: ProbeId,
): { override: Question | null; notices: Notice[]; probe: Pick<Screen, 'probe'> } {
	const onHost = hostRoute(ctx.route);
	const tested = on && onHost;
	return {
		override: tested ? overrideQuestion(ctx, id, probe) : null,
		notices: [
			...when<Notice>(on && !onHost, { level: 'info', text: NOTICE_TEXT.trialProbesSkipped }),
			...probeNotices(tested ? ctx.input.probes[probe] : undefined, 'warn'),
		],
		probe: serviceProbe(tested, probe),
	};
}

function publicationScreen(ctx: Ctx, frame: Frame): Screen {
	const parts = serviceParts(ctx, 'publication', ctx.answers.diffusion, 'diffusion');
	return screen('publication', frame, {
		questions: shown(ctx, [
			ask(ctx, 'publication', 'diffusion', 'confirm'),
			ask(ctx, 'publication', 'mysql_hostname', 'text'),
			ask(ctx, 'publication', 'mysql_port', 'text'),
			ask(ctx, 'publication', 'mysql_socket', 'text', { emptyAllowed: true }),
			ask(ctx, 'publication', 'mysql_database', 'text'),
			ask(ctx, 'publication', 'mysql_username', 'text', { required: true }),
			askSecret(ctx, 'publication', 'mysql_password', true),
			parts.override,
		]),
		notices: parts.notices,
		...parts.probe,
	});
}

/** The SMTP security options (the exported vocabulary, explained). */
function secureOptions(): Option[] {
	return SMTP_SECURE_MODES.map((mode) => {
		const text = OPTION_TEXT.smtp_secure[mode] ?? { label: mode, description: '' };
		return plainOption(mode, text.label, text.description);
	});
}

function mailScreen(ctx: Ctx, frame: Frame): Screen {
	const on = ctx.answers.mailer;
	const parts = serviceParts(ctx, 'mail', on, 'mailer');
	return screen('mail', frame, {
		questions: shown(ctx, [
			ask(ctx, 'mail', 'mailer', 'confirm'),
			ask(ctx, 'mail', 'smtp_host', 'text', { required: true }),
			ask(ctx, 'mail', 'smtp_port', 'text'),
			ask(ctx, 'mail', 'smtp_secure', 'choice', { options: secureOptions() }),
			ask(ctx, 'mail', 'smtp_user', 'text', { emptyAllowed: true }),
			askSecret(ctx, 'mail', 'smtp_pass', true),
			ask(ctx, 'mail', 'smtp_from', 'text', { emptyAllowed: true }),
			ask(ctx, 'mail', 'smtp_from_name', 'text', { emptyAllowed: true }),
			parts.override,
		]),
		notices: [...when<Notice>(!on, { level: 'warn', text: NOTICE_TEXT.noMail }), ...parts.notices],
		...parts.probe,
	});
}

function administratorScreen(ctx: Ctx, frame: Frame): Screen {
	const onHost = hostRoute(ctx.route);
	return screen('administrator', frame, {
		questions: shown(ctx, [askSecret(ctx, 'administrator', 'root_password', false)]),
		notices: onHost
			? [
					...passwordFeedback('').rules.map((rule) => ({
						level: 'info' as const,
						text: `rule: ${rule.text}`,
					})),
				]
			: [{ level: 'info', text: NOTICE_TEXT.secretsElsewhere }],
		...(onHost
			? {}
			: { placeholder: { phase: 4 as const, manual: PLACEHOLDER_TEXT.administrator_stack } }),
	});
}

// ── review ───────────────────────────────────────────────────────────────────

/** Can the route EXECUTE from this front end in phase 2 (D5)? */
export function routeExecutesHere(route: InstallRoute | null): boolean {
	return hostRoute(route) && route !== null;
}

function reviewScreen(ctx: Ctx, frame: Frame): Screen {
	const plan = ctx.plan;
	const notices: Notice[] = [
		...plan.errors.map((text) => ({ level: 'error' as const, text })),
		...plan.warnings.map((text) => ({ level: 'warn' as const, text })),
		...plan.notes.map((text) => ({ level: 'info' as const, text })),
		...plan.suggestions.map((text) => ({ level: 'info' as const, text })),
		{ level: 'info', text: NOTICE_TEXT.reviewEnvHelp },
	];
	if (!routeExecutesHere(ctx.route))
		notices.push({ level: 'info', text: NOTICE_TEXT.reviewDockerOnly });
	if (ctx.route === 'production') {
		notices.push({ level: 'info', text: NOTICE_TEXT.mediaPrerequisite });
		notices.push({ level: 'info', text: PLACEHOLDER_TEXT.web_tls });
		notices.push({ level: 'info', text: PLACEHOLDER_TEXT.services });
	}
	return screen('review', frame, {
		notices,
		help: [HELP_LINKS.reference, ...(ctx.route === 'production' ? [HELP_LINKS.production] : [])],
	});
}

const BUILDERS: Readonly<Record<ScreenId, (ctx: Ctx, frame: Frame) => Screen>> = Object.freeze({
	route: routeScreen,
	system: systemScreen,
	database: databaseScreen,
	image: (_ctx: Ctx, frame: Frame) => placeholderScreen('image', frame, PLACEHOLDER_TEXT.image),
	tls_address: (_ctx: Ctx, frame: Frame) =>
		placeholderScreen('tls_address', frame, PLACEHOLDER_TEXT.tls_address),
	containers: (_ctx: Ctx, frame: Frame) =>
		placeholderScreen('containers', frame, PLACEHOLDER_TEXT.containers),
	identity: identityScreen,
	web_tls: (_ctx: Ctx, frame: Frame) =>
		placeholderScreen('web_tls', frame, PLACEHOLDER_TEXT.web_tls),
	services: servicesScreen,
	ontologies: ontologiesScreen,
	thesauri: thesauriScreen,
	languages: languagesScreen,
	publication: publicationScreen,
	mail: mailScreen,
	administrator: administratorScreen,
	review: reviewScreen,
});

/**
 * EVERY screen of the chosen route, in order (before a route is chosen: the
 * production list — only its first screen can be answered then).
 */
export function buildScreens(input: ScreenModelInput): Screen[] {
	const ctx = context(input);
	const ids = SCREEN_ORDER[ctx.route ?? 'production'];
	return ids.map((id, index) => BUILDERS[id](ctx, { index: index + 1, count: ids.length }));
}

// ── applying an answer ───────────────────────────────────────────────────────

/** A response as a list of strings (multi). */
function listOf(response: unknown): string[] {
	if (Array.isArray(response)) return response.map(String);
	if (typeof response === 'string')
		return response
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	return [];
}

/** The `declined_dependencies` answer as normalized tokens (lowercase; bare TLDs kept bare). */
function declineTokens(value: unknown): string[] {
	if (value === undefined || value === null || value === 'none') return [];
	const items = Array.isArray(value) ? value : String(value).split(',');
	return items.map((item) => String(item).trim().toLowerCase()).filter((item) => item !== '');
}

/**
 * The decline list after one question re-decided ITS main: the other main's
 * tokens kept, a bare token (both mains) narrowed to the other main (this
 * question re-decides its own half), this main's replaced by `fresh`.
 */
function mergeDeclines(
	previous: unknown,
	main: 'ontology35' | 'hierarchy1',
	fresh: readonly string[],
): string[] {
	const other = main === 'ontology35' ? 'hierarchy1' : 'ontology35';
	const kept = declineTokens(previous).flatMap((token) => {
		if (!token.includes(':')) return [`${token}:${other}`];
		return token.endsWith(`:${other}`) ? [token] : [];
	});
	return [...new Set([...kept, ...fresh.map((tld) => `${tld}:${main}`)])];
}

/** Everything reachable from `seeds` over `declares`, a declined node not expanded. */
function reachable(
	seeds: Iterable<string>,
	declares: ReadonlyMap<string, readonly string[]>,
	declined: ReadonlySet<string>,
): Set<string> {
	const seen = new Set<string>();
	const queue = [...seeds];
	while (queue.length > 0) {
		const tld = queue.shift() as string;
		if (seen.has(tld)) continue;
		seen.add(tld);
		if (declined.has(tld)) continue;
		for (const next of declares.get(tld) ?? []) queue.push(next);
	}
	return seen;
}

/**
 * A multi-select's ticks → the ANSWER (B8): the roots (ticked and declared by
 * nothing ticked, nor pre-ticked from outside — in tick order) and the declines (what the
 * selection would install but is unticked) — classified against the NEW
 * selection's closure, to a fixed point, so an untick of a declarer keeps a
 * still-ticked dependency (it becomes a root) and a decline whose declarer is
 * gone is dropped.
 */
export function mapSelection(
	ticked: ReadonlySet<string>,
	options: readonly Option[],
	explicitRoots: readonly string[] = [],
): { roots: string[]; declined: string[] } {
	const order = options.map((option) => option.value);
	const declares = new Map(
		options.map((option) => [option.value, option.declares.map((item) => item.tld)]),
	);
	const external = new Set(
		options.filter((option) => option.external).map((option) => option.value),
	);
	const declaredByTicked = (tld: string): boolean =>
		[...ticked].some((other) => other !== tld && (declares.get(other) ?? []).includes(tld));
	// The roots in TICK order (the answer's order is the plan's install order).
	const tickedOffered = [...ticked].filter((tld) => order.includes(tld));
	// A tld the CURRENT answer already names (`--hierarchies kh,on`) stays a root while
	// ticked, even when something also declares it: the flags keep it in their order.
	const explicit = new Set(explicitRoots);
	const roots = tickedOffered.filter(
		(tld) => explicit.has(tld) || (!external.has(tld) && !declaredByTicked(tld)),
	);
	// A cycle of ticked declarers has no root: rescue every ticked tld the roots miss.
	for (const tld of tickedOffered) {
		if (!reachable([...roots, ...external], declares, new Set()).has(tld)) roots.push(tld);
	}
	const locked = new Set(options.filter((option) => option.locked).map((option) => option.value));
	let declined = new Set<string>();
	for (let round = 0; round <= order.length + 1; round++) {
		const installed = reachable([...roots, ...external], declares, declined);
		const next = new Set(
			[...installed].filter((tld) => !ticked.has(tld) && !locked.has(tld) && order.includes(tld)),
		);
		if (same([...next].sort(), [...declined].sort())) break;
		declined = next;
	}
	return { roots, declined: order.filter((tld) => declined.has(tld)) };
}

/** Set `key` to `value`, or leave it ABSENT when it is the question's default (see the header). */
function setOrDefault(
	raw: Record<string, unknown>,
	question: Question,
	key: keyof InstallAnswers,
	value: unknown,
): void {
	if (!HOST_SUGGESTED.has(key) && same(value, question.default)) delete raw[key];
	else raw[key] = value;
}

/** The response as the answer value of its kind. */
function answerValueOf(question: Question, response: unknown): unknown {
	if (question.kind === 'confirm') return response === true;
	if (question.kind === 'multi') return listOf(response);
	return typeof response === 'string' ? response.trim() : String(response ?? '');
}

/** ontologies: the roots become the answer, the unticked dependencies `<tld>:ontology35` declines. */
function applyOntologies(raw: Record<string, unknown>, question: Question, ticks: string[]): void {
	const options = (question.options ?? []).filter((option) => option.group !== CORE_GROUP);
	const explicit = explicitRootsOf(raw, 'ontologies');
	const { roots, declined } = mapSelection(new Set(ticks), options, explicit);
	setOrDefault(raw, question, 'ontologies', roots);
	writeDeclines(
		raw,
		mergeDeclines(
			raw.declined_dependencies,
			'ontology35',
			keepExplicitDeclines(raw.declined_dependencies, 'ontology35', declined, explicit, ticks),
		),
	);
}

/** The roots the current answer names for `key` (an answers file / the flags; [] when absent). */
function explicitRootsOf(raw: Readonly<Record<string, unknown>>, key: string): string[] {
	const value = raw[key];
	return value === undefined || value === null ? [] : listOf(value);
}

/**
 * The fresh declines PLUS a previous decline of a still-ticked explicit root
 * (`--hierarchies ds --decline-dependencies ds:hierarchy1`): the selection
 * cannot express it (ds is ticked), yet re-answering the screen unchanged must
 * not change the plan the flags decide.
 */
function keepExplicitDeclines(
	previous: unknown,
	main: 'ontology35' | 'hierarchy1',
	declined: readonly string[],
	explicit: readonly string[],
	ticks: readonly string[],
): string[] {
	const kept = declineTokens(previous)
		.filter((token) => token.endsWith(`:${main}`) || !token.includes(':'))
		.map((token) => token.split(':')[0] as string)
		.filter((tld) => explicit.includes(tld) && ticks.includes(tld));
	return [...new Set([...declined, ...kept])];
}

/** hierarchies: the roots become the answer, the unticked declared ones `<tld>:hierarchy1` declines. */
function applyThesauri(raw: Record<string, unknown>, question: Question, ticks: string[]): void {
	const explicit = explicitRootsOf(raw, 'hierarchies');
	const { roots, declined } = mapSelection(new Set(ticks), question.options ?? [], explicit);
	if (roots.length === 0) Reflect.deleteProperty(raw, 'hierarchies');
	else raw.hierarchies = roots;
	writeDeclines(
		raw,
		mergeDeclines(
			raw.declined_dependencies,
			'hierarchy1',
			keepExplicitDeclines(raw.declined_dependencies, 'hierarchy1', declined, explicit, ticks),
		),
	);
}

function writeDeclines(raw: Record<string, unknown>, tokens: string[]): void {
	if (tokens.length === 0) Reflect.deleteProperty(raw, 'declined_dependencies');
	else raw.declined_dependencies = tokens;
}

/**
 * langs: the ticked set IN TICK ORDER — the plan writes the working languages
 * in that order (DEDALO_PROJECTS_DEFAULT_LANGS), so `--langs lg-spa,lg-eng` is
 * expressible here too; a default language outside it is dropped (B2).
 */
function applyLangs(raw: Record<string, unknown>, question: Question, ticks: string[]): void {
	const offered = new Set((question.options ?? []).map((option) => option.value));
	const picked = [...new Set(ticks)].filter((code) => offered.has(code));
	setOrDefault(raw, question, 'langs', picked);
	for (const key of ['app_lang_default', 'data_lang_default']) {
		if (typeof raw[key] === 'string' && !picked.includes(raw[key] as string)) delete raw[key];
	}
}

/** The multi-selects whose ticks map to more than their own key. */
const SELECTION_APPLIERS: Readonly<
	Partial<
		Record<
			keyof InstallAnswers,
			(raw: Record<string, unknown>, question: Question, ticks: string[]) => void
		>
	>
> = Object.freeze({
	ontologies: applyOntologies,
	hierarchies: applyThesauri,
	langs: applyLangs,
});

/** Drop every answer whose question is not visible any more (see the header). */
function prune(raw: Record<string, unknown>): Record<string, unknown> {
	const visible = visibleKeys(raw);
	for (const key of Object.keys(raw)) {
		const known = (INSTALL_ANSWER_KEYS as readonly string[]).includes(key);
		if (known && !visible.has(key) && FLAGS_ONLY_ANSWER_KEYS[key] === undefined) delete raw[key];
	}
	return raw;
}

/**
 * THE ONLY WRITER OF THE RAW ANSWERS: one response to one question → the next
 * answers. A secret or an acknowledgement never enters them (the front end
 * holds the secret; the acknowledgement lives in `acknowledged`).
 */
export function applyAnswer(
	raw: Readonly<Record<string, unknown>>,
	question: Question,
	response: unknown,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...raw };
	if (!writesAnswer(question)) return next;
	const key = question.key as keyof InstallAnswers;
	const value = answerValueOf(question, response);
	const special = SELECTION_APPLIERS[key];
	if (special === undefined) setOrDefault(next, question, key, value);
	else special(next, question, value as string[]);
	return prune(next);
}

/** Does this question's answer go into the raw answers (never a secret, never an acknowledgement)? */
function writesAnswer(question: Question): boolean {
	return (
		question.key !== null &&
		question.kind !== 'secret' &&
		question.kind !== 'acknowledge' &&
		!SECRET_KEY_SET.has(question.key)
	);
}

// ── the root password, the review, the command ───────────────────────────────

const LABELS = masterLabels as Readonly<Record<string, string>>;

/** A `${name}` label template filled from `params`. */
function fill(template: string, params: Readonly<Record<string, unknown>>): string {
	return template.replace(/\$\{(\w+)\}/g, (whole, name: string) =>
		params[name] === undefined ? whole : String(params[name]),
	);
}

/**
 * THE policy's verdict on a candidate root password, as the rule list the
 * prompt prints (each rule's own text, `ok` or not) and the plan's refusal —
 * never the value itself.
 */
export function passwordFeedback(password: string): {
	rules: { id: string; text: string; ok: boolean }[];
	errors: string[];
} {
	const verdict = check_password(password) as unknown as {
		rules: { id: string; label: string; params: Record<string, unknown>; ok: boolean }[];
	};
	return {
		rules: verdict.rules.map((rule) => ({
			id: rule.id,
			text: fill(LABELS[rule.label] ?? rule.id, rule.params),
			ok: password !== '' && rule.ok,
		})),
		errors: rootPasswordErrors(password, true),
	};
}

/** The argv a headless run would take to decide the same plan (secrets never). */
export function equivalentCommand(answers: InstallAnswers): string[] {
	return cliArgsOf(answers);
}

/** One argv token quoted for a POSIX shell (display only). */
export function shellQuote(token: string): string {
	return /^[A-Za-z0-9_./:=,@%+-]+$/.test(token) ? token : `'${token.replace(/'/g, `'\\''`)}'`;
}

/** The probe verdict line of an optional service (tested / not / acknowledged). */
function serviceVerdict(input: ScreenModelInput, probe: ProbeId, screenId: ScreenId): string {
	if (input.acknowledged.has(`${screenId}.probe_override`)) return REVIEW_TEXT.acknowledged;
	return input.probes[probe]?.ok === true ? REVIEW_TEXT.tested : REVIEW_TEXT.untested;
}

/** The database line: db@host (or socket), the role — never the password. */
function databaseLine(answers: InstallAnswers): string {
	const where =
		answers.db_socket !== '' ? answers.db_socket : `${answers.db_hostname}:${answers.db_port}`;
	return `${answers.db_database} @ ${where} · role ${answers.db_username}`;
}

/** The thesaurus line: the count and the ones that ship terms. */
function thesauriLine(plan: InstallPlan, input: ScreenModelInput): string {
	const view = 'view' in input.catalogs.thesauri ? input.catalogs.thesauri.view.hierarchies : [];
	const withData = plan.hierarchies.filter((tld) =>
		view.some((item) => item.tld === tld && item.has_data),
	);
	const count = `${plan.hierarchies.length} + lg`;
	return withData.length === 0 ? count : `${count} (ship terms: ${withData.join(', ')})`;
}

/** The optional services' review lines (off, or where + tested/acknowledged). */
function serviceLines(a: InstallAnswers, input: ScreenModelInput): ReviewLine[] {
	const publication = `${a.mysql_database} @ ${a.mysql_hostname} · ${serviceVerdict(input, 'diffusion', 'publication')}`;
	const mail = `${a.smtp_host} · ${serviceVerdict(input, 'mailer', 'mail')}`;
	return [
		{ label: REVIEW_TEXT.publication, value: a.diffusion ? publication : REVIEW_TEXT.off },
		{ label: REVIEW_TEXT.mail, value: a.mailer ? mail : REVIEW_TEXT.off },
	];
}

/** A path answer, or "not written". */
function pathValue(value: string): string {
	return value === '' ? REVIEW_TEXT.notWritten : value;
}

/** The administrator line — on a host route (elsewhere install.sh asks the password). */
function adminLines(input: ScreenModelInput): ReviewLine[] {
	const set = input.secretsGiven.root_password === true;
	return when(hostRoute(chosenRoute(input.raw)), {
		label: REVIEW_TEXT.admin,
		value: set ? REVIEW_TEXT.passwordSet : REVIEW_TEXT.passwordMissing,
	});
}

/** One Review line. */
export interface ReviewLine {
	label: string;
	value: string;
}

/**
 * The Review's lines: what the install will do, in plain words (no secret
 * value, no .env value — only key names).
 */
export function reviewLines(plan: InstallPlan, input: ScreenModelInput): ReviewLine[] {
	const a = plan.answers;
	const lang = plan.langConfig;
	const ontologies = (plan.ontologyRequest?.items ?? []).map((item) => item.tld).join(', ');
	return [
		{ label: REVIEW_TEXT.route, value: a.route },
		...when(a.instance !== '', { label: REVIEW_TEXT.instance, value: a.instance }),
		{ label: REVIEW_TEXT.database, value: databaseLine(a) },
		{ label: REVIEW_TEXT.ontologies, value: ontologies || '—' },
		{ label: REVIEW_TEXT.thesauri, value: thesauriLine(plan, input) },
		{
			label: REVIEW_TEXT.languages,
			value: `${lang.projectsDefaultLangs.join(', ')} · data ${lang.dataLangDefault} · interface ${lang.applicationLangsDefault}`,
		},
		...serviceLines(a, input),
		{ label: REVIEW_TEXT.media, value: pathValue(a.media_path) },
		{ label: REVIEW_TEXT.socket, value: pathValue(a.unix_socket) },
		...adminLines(input),
		{ label: REVIEW_TEXT.steps, value: plan.steps.join(', ') },
		{ label: REVIEW_TEXT.envKeys, value: plan.envKeys.join(', ') },
		{
			label: REVIEW_TEXT.sameAs,
			value: ['bun', 'run', 'scripts/install.ts', ...equivalentCommand(a)]
				.map(shellQuote)
				.join(' '),
		},
	];
}
