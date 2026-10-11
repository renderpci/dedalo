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
 * Gate: test/unit/install_validation_upfront_tripwire.test.ts.
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

/** The media access modes DEDALO_MEDIA_ACCESS_MODE reads ('' = not written). */
const MEDIA_ACCESS_MODES: ReadonlySet<string> = new Set([
	'',
	'private',
	'publication',
	'false',
	'off',
	'0',
]);

const SMTP_SECURE_MODES: ReadonlySet<string> = new Set(['tls', 'ssl', 'none']);

/** The required answers: empty → "<key> is required". */
function requiredErrors(a: InstallAnswers, errors: string[]): void {
	for (const key of ['db_database', 'db_username', 'entity'] as const) {
		if (a[key] === '') errors.push(`${key} is required`);
	}
	// An empty host would persist a DISABLED mailer — refuse the contradiction.
	if (a.mailer && a.smtp_host === '') errors.push('mailer requires smtp_host');
	diffusionRequiredErrors(a, errors);
}

/** Diffusion writes to a named MariaDB database as a named user. */
function diffusionRequiredErrors(a: InstallAnswers, errors: string[]): void {
	if (!a.diffusion) return;
	for (const key of ['mysql_database', 'mysql_username'] as const) {
		if (a[key] === '') errors.push(`diffusion requires ${key}`);
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
function portErrors(a: InstallAnswers, errors: string[]): void {
	const ports: [string, string][] = [['db_port', a.db_port]];
	if (a.diffusion) ports.push(['mysql_port', a.mysql_port]);
	if (a.mailer) ports.push(['smtp_port', a.smtp_port]);
	for (const [name, value] of ports) {
		const problem = portError(name, value);
		if (problem !== null) errors.push(problem);
	}
}

/**
 * The connection fields a pg/mysql client spawn will carry: no option shape, no
 * control character (pg_transport.ts connFieldProblem — the rule pg_exec.ts
 * enforces again at the spawn).
 */
function connectionErrors(a: InstallAnswers, errors: string[]): void {
	const fields: [string, string][] = [
		['db_hostname', a.db_hostname],
		['db_database', a.db_database],
		['db_username', a.db_username],
		['mysql_hostname', a.mysql_hostname],
		['mysql_database', a.mysql_database],
		['mysql_username', a.mysql_username],
	];
	for (const [name, value] of fields) {
		const problem = connFieldProblem(name, value);
		if (problem !== null) errors.push(problem);
	}
	// A relative socket would refuse the boot (config.ts) — refuse it here first.
	const socketProblem = pgSocketProblem(a.db_socket);
	if (socketProblem !== null) errors.push(`db_socket: ${socketProblem}`);
}

/** Paths the server resolves from any cwd must be absolute ('' = not given). */
function pathErrors(a: InstallAnswers, errors: string[]): void {
	const paths: [string, string][] = [
		['media_path', a.media_path],
		['unix_socket', a.unix_socket],
	];
	if (a.diffusion) paths.push(['mysql_socket', a.mysql_socket]);
	for (const [name, value] of paths) {
		if (value !== '' && !isAbsolute(value)) errors.push(`${name} must be an absolute path`);
	}
}

/** Does `timeZone` name an IANA zone this runtime knows? */
function validTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** Is `locale` a well-formed BCP 47 tag? */
function validLocale(locale: string): boolean {
	try {
		Intl.getCanonicalLocales(locale);
		return true;
	} catch {
		return false;
	}
}

/** The entity name's shape. */
function entityErrors(a: InstallAnswers, errors: string[]): void {
	if (a.entity !== '' && !ENTITY_PATTERN.test(a.entity)) {
		errors.push(
			`entity '${a.entity}' must start with a letter and contain only letters, digits and _`,
		);
	}
}

/** The closed-vocabulary answers (SMTP encryption, media access mode). */
function vocabularyErrors(a: InstallAnswers, errors: string[]): void {
	if (a.mailer && !SMTP_SECURE_MODES.has(a.smtp_secure.toLowerCase())) {
		errors.push('smtp_secure must be tls|ssl|none');
	}
	if (!MEDIA_ACCESS_MODES.has(a.media_access_mode)) {
		errors.push('media_access_mode must be private|publication|false (or empty)');
	}
}

/** The time zone and locale the runtime must understand. */
function localeErrors(a: InstallAnswers, errors: string[]): void {
	if (!validTimeZone(a.timezone)) {
		errors.push(`timezone '${a.timezone}' is not a valid IANA time zone`);
	}
	if (!validLocale(a.locale)) {
		errors.push(`locale '${a.locale}' is not a valid BCP 47 tag`);
	}
}

/**
 * The install fingerprint values. Never .env values (they go to ts_state.json),
 * so the plan's env-line check (install_plan.ts controlCharacterErrors) does not
 * see them.
 */
function fingerprintErrors(a: InstallAnswers, errors: string[]): void {
	for (const key of ['information', 'info_key'] as const) {
		if (/[\r\n\0]/.test(a[key])) errors.push(`${key} contains an illegal control character`);
	}
}

/**
 * Every answer-only refusal, appended to `errors` (the plan's — each one
 * blocks). `notes` is the plan's notes list, for a rule that only informs.
 */
export function validateAnswers(a: InstallAnswers, _notes: string[], errors: string[]): void {
	requiredErrors(a, errors);
	connectionErrors(a, errors);
	portErrors(a, errors);
	pathErrors(a, errors);
	entityErrors(a, errors);
	vocabularyErrors(a, errors);
	localeErrors(a, errors);
	fingerprintErrors(a, errors);
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
