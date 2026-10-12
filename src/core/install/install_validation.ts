/**
 * PLAN-TIME VALIDATION — every refusal an install's ANSWERS can earn, raised by
 * the plan BEFORE anything is written (terminal installer, phase 1, 2026-10-11).
 *
 * WHY. Until this module an invalid answer was found by the step that first
 * used it: a weak root password at set_root_pw — AFTER the .env, the seed
 * restore and the ontology import; an entity `1x` only by the wizard's own
 * client-side check (the CLI accepted it); a port `x` by the server boot. A
 * failure that late leaves a half-built install for an input the plan could
 * have refused. So every rule that needs nothing but the answers lives HERE and
 * runs inside buildInstallPlan (install_plan.ts) — the CLI argv, an answers file
 * (`--answers`) and the wizard post all reach the SAME checks through
 * normalizeInstallAnswers, and refuse with the SAME sentence.
 *
 * What stays OUTSIDE: anything that needs the machine (is the database empty,
 * does it exist — db_restore.ts inspectTargetDatabase, run by the executor
 * before any write) and the step doors' own refusals, which stay as defence in
 * depth (root_pw.ts still refuses a weak password; pg_exec.ts still refuses an
 * option-shaped connection field).
 *
 * PURE AND CONFIG-FREE: imports only src/config/pg_transport.ts and the client
 * password policy module (the bytes the browser checklist and the server
 * refusal both run — core/security/password_policy.ts wraps the same function
 * but pulls in the error registry, so it is not imported here).
 *
 * TAGGED (phase 2, 2026-10-12): every refusal is a {@link FieldError} — the
 * sentence AND the answer key it is about. The plan's `errors` carry the
 * sentences unchanged; its `fieldErrors` carry the tags, which the terminal
 * screen model (screen_model.ts) uses to show each sentence on its question.
 * Gates: test/unit/install_validation_upfront_tripwire.test.ts,
 * test/unit/install_screen_model_tripwire.test.ts.
 */

import { isAbsolute } from 'node:path';
import { check_password } from '../../../client/dedalo/core/component_password/js/password_policy.js';
import { connFieldProblem, pgSocketProblem } from '../../config/pg_transport.ts';
import type { InstallAnswers } from './install_plan.ts';

/**
 * The entity name: a letter, then letters/digits/underscore. It becomes a
 * directory and a key prefix; the wizard enforced it client-side only
 * (render_installer.js) and the CLI not at all.
 */
export const ENTITY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * The INSTANCE name of a production install (multi-instance hosts —
 * docs/install/multi_instance.md): it must be valid as a unix user `ded_<i>`
 * (32 characters at most, so 28 here), a systemd instance (`dedalo-ts@<i>`), a
 * path segment and a PostgreSQL identifier (`dedalo_<i>`) — hence lowercase.
 */
export const INSTANCE_PATTERN = /^[a-z][a-z0-9_]{0,27}$/;

/**
 * The media access modes DEDALO_MEDIA_ACCESS_MODE reads ('' = not written).
 * `off` and `0` are accepted aliases of `false`; a front end OFFERS only
 * {@link MEDIA_ACCESS_MODE_OPTIONS}.
 */
export const MEDIA_ACCESS_MODES: readonly string[] = Object.freeze([
	'',
	'private',
	'publication',
	'false',
	'off',
	'0',
]);

/** The canonical media access modes a front end offers ('' = the engine default). */
export const MEDIA_ACCESS_MODE_OPTIONS: readonly string[] = Object.freeze([
	'',
	'private',
	'publication',
	'false',
]);

/** SMTP encryption: STARTTLS, implicit TLS, plain (core/mailer/mailer.ts maps the same three). */
export const SMTP_SECURE_MODES: readonly string[] = Object.freeze(['tls', 'ssl', 'none']);

/** One answer refusal, TAGGED with the answer key it is about (a front end shows it there). */
export interface FieldError {
	readonly key: string;
	readonly message: string;
}

type Problems = FieldError[];

const problem = (key: string, message: string): FieldError => ({ key, message });

/** The required answers: empty → "<key> is required". */
function requiredErrors(a: InstallAnswers, problems: Problems): void {
	for (const key of ['db_database', 'db_username', 'entity'] as const) {
		if (a[key] === '') problems.push(problem(key, `${key} is required`));
	}
	// An empty host would persist a DISABLED mailer — refuse the contradiction.
	if (a.mailer && a.smtp_host === '')
		problems.push(problem('smtp_host', 'mailer requires smtp_host'));
	diffusionRequiredErrors(a, problems);
}

/**
 * Diffusion writes as a named MariaDB user. (Its database has a plan default —
 * `web_dedalo`, `web_<instance>` on production — so it is never missing.)
 */
function diffusionRequiredErrors(a: InstallAnswers, problems: Problems): void {
	if (!a.diffusion) return;
	if (a.mysql_username === '') {
		problems.push(problem('mysql_username', 'diffusion requires mysql_username'));
	}
}

/** A TCP port: digits only, 1-65535. */
function portError(name: string, value: string): string | null {
	const port = Number(value);
	return /^\d+$/.test(value) && port >= 1 && port <= 65535
		? null
		: `${name} '${value}' must be an integer 1-65535`;
}

/** The ports that will be written: the database's, and the services' that are on. */
function portErrors(a: InstallAnswers, problems: Problems): void {
	const ports: [string, string][] = [['db_port', a.db_port]];
	if (a.diffusion) ports.push(['mysql_port', a.mysql_port]);
	if (a.mailer) ports.push(['smtp_port', a.smtp_port]);
	for (const [name, value] of ports) {
		const message = portError(name, value);
		if (message !== null) problems.push(problem(name, message));
	}
}

/**
 * The connection fields a pg/mysql client spawn will carry: no option shape, no
 * control character (pg_transport.ts connFieldProblem — the rule pg_exec.ts
 * enforces again at the spawn).
 */
function connectionErrors(a: InstallAnswers, problems: Problems): void {
	const fields: [string, string][] = [
		['db_hostname', a.db_hostname],
		['db_database', a.db_database],
		['db_username', a.db_username],
		['mysql_hostname', a.mysql_hostname],
		['mysql_database', a.mysql_database],
		['mysql_username', a.mysql_username],
	];
	for (const [name, value] of fields) {
		const message = connFieldProblem(name, value);
		if (message !== null) problems.push(problem(name, message));
	}
	// A relative socket would refuse the boot (config.ts) — refuse it here first.
	const socketProblem = pgSocketProblem(a.db_socket);
	if (socketProblem !== null) problems.push(problem('db_socket', `db_socket: ${socketProblem}`));
}

/** Paths the server resolves from any cwd must be absolute ('' = not given). */
function pathErrors(a: InstallAnswers, problems: Problems): void {
	const paths: [string, string][] = [
		['media_path', a.media_path],
		['unix_socket', a.unix_socket],
	];
	if (a.diffusion) paths.push(['mysql_socket', a.mysql_socket]);
	for (const [name, value] of paths) {
		if (value !== '' && !isAbsolute(value)) {
			problems.push(problem(name, `${name} must be an absolute path`));
		}
	}
}

/** Does `timeZone` name an IANA zone this runtime knows? */
export function validTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** Is `locale` a well-formed BCP 47 tag? */
export function validLocale(locale: string): boolean {
	try {
		Intl.getCanonicalLocales(locale);
		return true;
	} catch {
		return false;
	}
}

/** The entity name's shape. */
function entityErrors(a: InstallAnswers, problems: Problems): void {
	if (a.entity !== '' && !ENTITY_PATTERN.test(a.entity)) {
		problems.push(
			problem(
				'entity',
				`entity '${a.entity}' must start with a letter and contain only letters, digits and _`,
			),
		);
	}
}

/** The closed-vocabulary answers (SMTP encryption, media access mode). */
function vocabularyErrors(a: InstallAnswers, problems: Problems): void {
	if (a.mailer && !SMTP_SECURE_MODES.includes(a.smtp_secure.toLowerCase())) {
		problems.push(problem('smtp_secure', 'smtp_secure must be tls|ssl|none'));
	}
	if (!MEDIA_ACCESS_MODES.includes(a.media_access_mode)) {
		problems.push(
			problem(
				'media_access_mode',
				'media_access_mode must be private|publication|false (or empty)',
			),
		);
	}
}

/** The time zone and locale the runtime must understand. */
function localeErrors(a: InstallAnswers, problems: Problems): void {
	if (!validTimeZone(a.timezone)) {
		problems.push(problem('timezone', `timezone '${a.timezone}' is not a valid IANA time zone`));
	}
	if (!validLocale(a.locale)) {
		problems.push(problem('locale', `locale '${a.locale}' is not a valid BCP 47 tag`));
	}
}

/**
 * The install fingerprint values. Never .env values (they go to ts_state.json),
 * so the plan's env-line check (install_plan.ts controlCharacterErrors) does not
 * see them.
 */
function fingerprintErrors(a: InstallAnswers, problems: Problems): void {
	for (const key of ['information', 'info_key'] as const) {
		if (/[\r\n\0]/.test(a[key])) {
			problems.push(problem(key, `${key} contains an illegal control character`));
		}
	}
}

/**
 * The route and the instance (terminal installer phase 2, 2026-10-12): a
 * PRODUCTION install is a named instance (multi_instance.md — its own user,
 * database, media and socket derive from the name), so it requires one; any
 * other route has no instance, and one given there is refused rather than
 * silently ignored. (An unknown route is refused by the plan's parser.)
 */
function routeErrors(a: InstallAnswers, problems: Problems): void {
	const production = a.route === 'production';
	if (production && a.instance === '') {
		problems.push(
			problem('instance', 'the production route requires instance (e.g. --instance prado)'),
		);
	} else if (!production && a.instance !== '') {
		problems.push(
			problem(
				'instance',
				`instance is only meaningful on the production route (route is ${a.route})`,
			),
		);
	}
	instanceShapeErrors(a, problems);
}

/** The instance name's shape (INSTANCE_PATTERN). */
function instanceShapeErrors(a: InstallAnswers, problems: Problems): void {
	if (a.instance === '' || INSTANCE_PATTERN.test(a.instance)) return;
	problems.push(
		problem(
			'instance',
			`instance '${a.instance}' must start with a lowercase letter and contain only a-z, 0-9 and _ (28 characters at most)`,
		),
	);
}

/**
 * Every answer-only refusal, each TAGGED with the answer it is about — the ONE
 * rule set: the plan's `errors` carry the sentences, its `fieldErrors` the tags
 * the screen model attaches them by (no front end validates anything itself).
 */
export function answerProblems(a: InstallAnswers): FieldError[] {
	const problems: Problems = [];
	routeErrors(a, problems);
	requiredErrors(a, problems);
	connectionErrors(a, problems);
	portErrors(a, problems);
	pathErrors(a, problems);
	entityErrors(a, problems);
	vocabularyErrors(a, problems);
	localeErrors(a, problems);
	fingerprintErrors(a, problems);
	return problems;
}

/**
 * Every answer-only refusal, appended to `errors` (the plan's — each one
 * blocks). `notes` is the plan's notes list, for a rule that only informs.
 */
export function validateAnswers(a: InstallAnswers, _notes: string[], errors: string[]): void {
	errors.push(...answerProblems(a).map((item) => item.message));
}

/**
 * The root password's refusals. It is a PLAN INPUT of its own, never an answer
 * (a wizard post and an answers file never carry it): `required` when the run
 * will set it (a fresh terminal install); a supplied one is always held to THE
 * password policy — the same function set_root_pw refuses with (root_pw.ts).
 */
export function rootPasswordErrors(password: string | undefined, required: boolean): string[] {
	if (password === undefined || password === '') {
		return required
			? [
					'root password is required (DEDALO_INSTALL_ROOT_PASSWORD, --secrets-stdin or --root-password)',
				]
			: [];
	}
	const failed = check_password(password).failed;
	return failed === null ? [] : [`root password does not meet the password policy (${failed})`];
}
