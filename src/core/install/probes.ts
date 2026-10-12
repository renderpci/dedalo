/**
 * THE INTERACTIVE INSTALLER'S PROBES (phase 2, 2026-10-12) — what the screens
 * check while the operator answers: the System check, the database, the media
 * directory, the publication MariaDB, the SMTP relay (with a real test mail),
 * the ontology catalog of the chosen source.
 *
 * RUNS IN THE PROBE CHILD ONLY (install_probe.ts): most of these reach modules
 * that import the engine configuration (pg_bin → config; the diffusion facade;
 * the ontology manifest fetch), and config freezes at import — the front end's
 * own process must stay config-free until the run starts (scripts/install.ts
 * seeds the install's environment first). So every config-touching import here
 * is DYNAMIC, made after the child seeded a neutral boot environment.
 *
 * Each probe answers a PROBE OUTCOME (`{ok, msg}`) and never throws for an
 * unreachable server — that is the answer to the question. Every function takes
 * the PLAIN answers so far plus the one secret it needs.
 */

import { accessSync, constants, existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { CatalogProbeResult } from './front_end.ts';
import type { InitTestResult } from './init_test.ts';
import {
	type InstallRoute,
	normalizeInstallAnswers,
	ontologyServersFor,
	ontologySourceFor,
} from './install_plan.ts';
import type { OntologyCatalog } from './ontology_choice.ts';
import type { ProbeOutcome, SystemCheckRow } from './screen_model.ts';
import type { InstallServerInfo } from './server_info.ts';

type Answers = Readonly<Record<string, unknown>>;

// ── the System check ─────────────────────────────────────────────────────────

/** The init_test line's subject (its sentences are the wizard's — read, never rewritten). */
const INIT_ROWS: readonly { label: string; match: RegExp; hostOnly: boolean }[] = [
	{ label: 'Bun', match: /\bBun\b/, hostOnly: false },
	{ label: 'Install seed', match: /seed/i, hostOnly: true },
	{ label: 'Private directory', match: /Private config/i, hostOnly: false },
	{ label: 'PostgreSQL client', match: /psql|PostgreSQL client/i, hostOnly: true },
];

/** A Docker/trial host runs the engine in a container: only Bun and the private dir are its rows. */
function onHost(route: InstallRoute): boolean {
	return route !== 'docker' && route !== 'trial';
}

/**
 * A failed check no INIT_ROWS entry names (one init_test adds later) still
 * FAILS — never dropped, or the must_pass gate would let it through.
 */
function unnamedFailures(init: InitTestResult): SystemCheckRow[] {
	return init.errors
		.filter((line) => !INIT_ROWS.some((spec) => spec.match.test(line)))
		.map((line) => ({ state: 'fail' as const, label: 'Check', detail: line }));
}

/** init_test's lines as rows: a `msg` line passes, an `errors` line fails. */
function initRows(init: InitTestResult, route: InstallRoute): SystemCheckRow[] {
	const rows: SystemCheckRow[] = [];
	for (const spec of INIT_ROWS) {
		if (spec.hostOnly && !onHost(route)) continue;
		const failed = init.errors.find((line) => spec.match.test(line));
		const passed = init.msg.find((line) => spec.match.test(line));
		if (failed !== undefined) rows.push({ state: 'fail', label: spec.label, detail: failed });
		else if (passed !== undefined) rows.push({ state: 'ok', label: spec.label, detail: passed });
	}
	return [...rows, ...unnamedFailures(init)];
}

/** One diagnostics fact: ok when known, a warning (with why it matters) when not. */
function fact(label: string, value: string | null, missing = 'unknown'): SystemCheckRow {
	return value === null
		? { state: 'warn', label, detail: missing }
		: { state: 'ok', label, detail: value };
}

/** A capability the runtime ships: its words when present, else null. */
function builtIn(present: boolean, words: string): string | null {
	return present ? words : null;
}

/** The diagnostics as rows (host routes only): facts, and a warning for a missing media tool. */
function infoRows(info: InstallServerInfo): SystemCheckRow[] {
	return [
		fact('Platform', info.platform),
		fact('Memory', info.ram),
		fact('CPU', info.cpu_mhz),
		fact('Disk', info.disk_free_space),
		fact('PostgreSQL version', info.pg_version),
		fact('ImageMagick', info.imagemagick, 'missing — images are not processed without it'),
		fact('FFmpeg', info.ffmpeg, 'missing — audio and video are not processed without it'),
		fact('cURL', builtIn(info.curl, 'built in (fetch)'), 'missing'),
		fact('OpenSSL', builtIn(info.openssl, 'built in (WebCrypto)'), 'missing'),
	];
}

/**
 * The System-check rows (pure): init_test's checks (a failure is a FAIL row —
 * the gate) and, on a host route, the diagnostics. On docker/trial the engine
 * runs in a container, so psql, the seed, PostgreSQL, ImageMagick and FFmpeg
 * are not this host's (their checks are the container's — phase 4).
 */
export function systemCheckRows(
	init: InitTestResult,
	info: InstallServerInfo | null,
	route: InstallRoute,
): SystemCheckRow[] {
	return [...initRows(init, route), ...(info !== null && onHost(route) ? infoRows(info) : [])];
}

export async function systemCheck(route: InstallRoute): Promise<ProbeOutcome> {
	const { runInitTest } = await import('./init_test.ts');
	const { buildInstallServerInfo } = await import('./server_info.ts');
	const { SEED_DUMP_PATH } = await import('./paths.ts');
	const { DEDALO_VERSION } = await import('../update/version.ts');
	const rows = systemCheckRows(
		runInitTest(),
		onHost(route) ? buildInstallServerInfo() : null,
		route,
	);
	const failed = rows.filter((row) => row.state === 'fail').length;
	return {
		ok: failed === 0,
		msg: failed === 0 ? 'system ready' : `${failed} check(s) failed`,
		rows,
		version: DEDALO_VERSION,
		seedPath: SEED_DUMP_PATH,
	};
}

// ── connections ──────────────────────────────────────────────────────────────

/** The answers as the probe doors read them (normalized: the plan's defaults applied). */
function posted(answers: Answers, secret: Record<string, string>): Record<string, unknown> {
	return { ...normalizeInstallAnswers(answers).answers, ...secret };
}

/** ok = the role reaches the database AND it exists (the executor refuses anything else). */
export async function databaseProbe(answers: Answers, dbPassword: string): Promise<ProbeOutcome> {
	const { testDbConnection } = await import('./db_probe.ts');
	const result = await testDbConnection(posted(answers, { db_password: dbPassword }));
	return { ok: result.can_connect && result.db_exists, msg: result.msg };
}

export async function diffusionProbe(
	answers: Answers,
	mysqlPassword: string,
): Promise<ProbeOutcome> {
	const { testDiffusionConnection } = await import('./db_probe.ts');
	const result = await testDiffusionConnection(posted(answers, { mysql_password: mysqlPassword }));
	return { ok: result.ok, msg: result.msg };
}

/** The SMTP handshake, then — with `sendTo` — one real test mail (mailer_probe.ts). */
export async function mailerProbe(
	answers: Answers,
	smtpPass: string,
	sendTo?: string,
): Promise<ProbeOutcome> {
	const { testMailerConnection } = await import('./mailer_probe.ts');
	const result = await testMailerConnection(posted(answers, { smtp_pass: smtpPass }), sendTo);
	return { ok: result.ok, msg: result.msg };
}

// ── the media directory ──────────────────────────────────────────────────────

/** The nearest existing ancestor of `path` (itself when it exists). */
function nearestExisting(path: string): string | null {
	let probe = resolve(path);
	while (!existsSync(probe)) {
		const parent = dirname(probe);
		if (parent === probe) return null;
		probe = parent;
	}
	return probe;
}

/**
 * Can THIS user create (or write) the media directory? The nearest existing
 * ancestor must be writable — the check the wizard's pre-flight runs on the
 * private dir (init_test.ts). A production instance's `/srv/dedalo/<i>/media`
 * normally needs root to create: that is a manual prerequisite in phase 2
 * (multi_instance.md), and failing HERE beats failing at check_directories
 * after the .env is written.
 */
export async function mediaProbe(answers: Answers): Promise<ProbeOutcome> {
	const path = normalizeInstallAnswers(answers).answers.media_path;
	if (path === '') return { ok: true, msg: 'not written — the engine default media root' };
	if (!isAbsolute(path)) return { ok: false, msg: `${path} is not an absolute path` };
	const existing = nearestExisting(path);
	if (existing === null) return { ok: false, msg: `no existing ancestor of ${path}` };
	try {
		accessSync(existing, constants.W_OK);
	} catch {
		return {
			ok: false,
			msg: `${existing} is not writable by this user — create ${path} owned by the instance user first`,
		};
	}
	return {
		ok: true,
		msg: existing === resolve(path) ? `${path} exists and is writable` : `${path} can be created`,
	};
}

// ── the ontology catalog ─────────────────────────────────────────────────────

/** A catalog safe to hand to the parent: its source without the server access code. */
function displayCatalog(catalog: OntologyCatalog): OntologyCatalog {
	const source = catalog.source;
	return {
		...catalog,
		source:
			source.kind === 'server'
				? { kind: 'server', server: { ...source.server, code: '' } }
				: source,
	};
}

/**
 * The catalog the answers' source offers (ontology_catalog.ts — THE resolver;
 * a local archive is extracted and removed again before returning). For the
 * screens and the Review's PREVIEW only: the run re-resolves in its own process
 * and refuses when it decides otherwise (front_end.ts reviewedDecisionsRefusal).
 */
export async function catalogProbe(
	answers: Answers,
	priorEnv: Readonly<Record<string, string>>,
): Promise<CatalogProbeResult> {
	const { resolveOntologyCatalog } = await import('./ontology_catalog.ts');
	const { ontologySourceLabel } = await import('./ontology_choice.ts');
	const normalized = normalizeInstallAnswers(answers).answers;
	const source = ontologySourceFor(normalized, priorEnv);
	try {
		const resolved = await resolveOntologyCatalog(source, {
			allowedServers: ontologyServersFor(normalized, priorEnv),
		});
		resolved.cleanup();
		return {
			ok: true,
			msg: `ontologies offered by ${ontologySourceLabel(source)}`,
			catalog: displayCatalog(resolved.catalog),
		};
	} catch (error) {
		return {
			ok: false,
			msg: error instanceof Error ? error.message : String(error),
			catalog: null,
		};
	}
}
