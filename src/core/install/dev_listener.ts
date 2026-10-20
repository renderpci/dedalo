/**
 * THE DEVELOPER ROUTE'S LISTENER — what a checkout install writes so that
 * `bun run dev` SERVES something a browser reaches (TODO-054/055; design
 * DEV_ROUTE_SERVE §1.1–1.2, owner answers D1/D3).
 *
 * WHY. The developer route used to write no listener at all: with
 * `SERVER_TCP_PORT` unset the engine serves only its unix socket, the browser
 * reaches nothing, and the installer still said "complete". It also wrote
 * neither DEDALO_DEV_MODE nor DEDALO_DEBUG_API_ERRORS, and nothing decided
 * SESSION_COOKIE_SECURE — which must be `false` on plain HTTP (a browser
 * DROPS a Secure cookie on `http://`, so every login silently fails) and `true`
 * on HTTPS.
 *
 * WHAT IT DECIDES (the plan renders it — install_plan.ts devSection, the ONE
 * .env writer config_persist.ts):
 *  - SERVER_TCP_PORT (default 3500 — D3) and SERVER_TCP_HOST (default
 *    127.0.0.1: this machine; 0.0.0.0 or one address opens it to the network);
 *  - the TLS pair from `tls_mode`: `local_ca` (DEFAULT — D1: the pair the ONE
 *    local-CA generator issues into `<private>/tls`), `files` (the developer's
 *    own, e.g. mkcert) or `none` (plain HTTP);
 *  - SESSION_COOKIE_SECURE derived from that answer by {@link servesTls} — the
 *    SAME function the docker stack writes its own from (host/stack/files.ts);
 *  - DEDALO_DEV_MODE=true and DEDALO_DEBUG_API_ERRORS=true (the route IS a
 *    development install);
 *  - SERVER_UNIX_SOCKET — the engine also binds its unix socket in development,
 *    and every checkout on one machine used to share the catalog default
 *    `/tmp/dedalo_ts.sock`: the second `bun run dev` refused to boot. The
 *    default is now the entity's own, `/tmp/dedalo_ts_<entity>.sock`
 *    ({@link devSocketDefault}), ALWAYS written (never left to the engine
 *    default). It is not a listener key ({@link DEV_LISTENER_ENV_KEYS}): every
 *    route writes it, so the plan's Serving section renders it ({@link
 *    DevListenerPlan.serving}). Whether a server already answers on it is the
 *    machine half (dev_listener_check.ts).
 *
 * THE PRESERVE RULE. A re-run keeps what the operator already has: an answer
 * left at its default (`''` — "the plan decides") writes nothing for a key the
 * prior .env already sets, so config_persist carries that line verbatim (an
 * existing `SERVER_TCP_PORT=3600` stays 3600; the Review lists it as kept). An
 * explicit answer always writes. Two keys are never kept: the TLS pair under an
 * explicit answer (switching to `none` CLEARS a prior pair, written empty —
 * config_persist never deletes by omission) and SESSION_COOKIE_SECURE, which
 * follows the listener the file ends up with, kept pair included — a cookie
 * flag that disagrees with the transport is a login that never sticks.
 *
 * PURE AND CONFIG-FREE (the plan's own rule): the private TLS directory is the
 * caller's argument, the URL is src/config/dev_listener_address.ts's.
 * Gate: test/unit/install_dev_route_listener_native.test.ts.
 */

import { join } from 'node:path';
import { devListenerUrl, isLoopbackBind } from '../../config/dev_listener_address.ts';
import { ENTITY_PATTERN } from './entity_name.ts';
import type { InstallAnswers } from './install_plan.ts';

/** D3: the development port the route offers first. */
export const DEV_PORT_DEFAULT = '3500';
/** This machine only (the catalog's own SERVER_TCP_HOST default). */
export const DEV_HOST_DEFAULT = '127.0.0.1';
/** Every IPv4 address: the local network reaches it. */
export const DEV_HOST_NETWORK = '0.0.0.0';
/** The developer route's TLS modes (no Let's Encrypt: a checkout has no public name). */
export const DEV_TLS_MODES = ['local_ca', 'none', 'files'] as const;
/** D1: an unanswered developer `tls_mode` is the local authority. */
export const DEV_TLS_DEFAULT = 'local_ca';
/** The engine's own socket default (src/config/catalog/server.ts SERVER_UNIX_SOCKET). */
export const DEV_SOCKET_FALLBACK = '/tmp/dedalo_ts.sock';
/** The generator's leaf files (deploy/dedalo-tls-rotate.sh SITE_CRT / SITE_KEY). */
export const DEV_TLS_CERT_NAME = 'fullchain.pem';
export const DEV_TLS_KEY_NAME = 'privkey.pem';

const PORT_KEY = 'SERVER_TCP_PORT';
const HOST_KEY = 'SERVER_TCP_HOST';
const CERT_KEY = 'SERVER_TCP_TLS_CERT_FILE';
const KEY_KEY = 'SERVER_TCP_TLS_KEY_FILE';
const SECURE_KEY = 'SESSION_COOKIE_SECURE';
const DEV_MODE_KEY = 'DEDALO_DEV_MODE';
const DEBUG_KEY = 'DEDALO_DEBUG_API_ERRORS';
/** Written by every route that has one (install_plan.ts servingSection) — never a listener key. */
export const DEV_SOCKET_KEY = 'SERVER_UNIX_SOCKET';

/**
 * Every key the developer route's listener section may write — and that no
 * other route's plan writes (the catalog says "unset in production"; gated).
 */
export const DEV_LISTENER_ENV_KEYS: readonly string[] = Object.freeze([
	PORT_KEY,
	HOST_KEY,
	CERT_KEY,
	KEY_KEY,
	SECURE_KEY,
	DEV_MODE_KEY,
	DEBUG_KEY,
]);

/**
 * The developer route's socket for `entity`: `/tmp/dedalo_ts_<entity>.sock`
 * (lowercased — a case-insensitive file system makes `Test` and `test` one
 * file anyway), so two checkouts of two entities never share one; the engine's
 * own default while the entity is unset or malformed (its own error says so).
 */
export function devSocketDefault(entity: string): string {
	return ENTITY_PATTERN.test(entity)
		? `/tmp/dedalo_ts_${entity.toLowerCase()}.sock`
		: DEV_SOCKET_FALLBACK;
}

/** Where the plan's socket comes from: the answer, the prior .env (PRESERVE) or the entity. */
export type DevSocketSource = 'answered' | 'kept' | 'derived';

/**
 * Where the listener's certificate comes from: an answered mode, or `kept` —
 * the prior .env's own complete pair under an unanswered mode (PRESERVE).
 */
export type DevTlsSource = (typeof DEV_TLS_MODES)[number] | 'kept';

export interface DevListenerTlsPair {
	readonly certFile: string;
	readonly keyFile: string;
}

/** The developer listener a plan writes (or keeps). */
export interface DevListenerPlan {
	/** The port the listener binds (written or kept). */
	readonly port: string;
	/** The address it binds (written or kept). */
	readonly host: string;
	readonly tlsSource: DevTlsSource;
	/** The pair the server will present; null = plain HTTP. */
	readonly tls: DevListenerTlsPair | null;
	/** SESSION_COOKIE_SECURE: true exactly when the listener speaks HTTPS. */
	readonly sessionCookieSecure: boolean;
	/** The client page as a browser on this machine opens it. */
	readonly url: string;
	/** True when other machines reach it (the Review warns). */
	readonly networkReachable: boolean;
	/** The .env entries the plan writes, in file order. */
	readonly entries: readonly { readonly key: string; readonly value: string }[];
	/** The keys the prior .env keeps (not written: config_persist carries the line). */
	readonly kept: readonly string[];
	/** SERVER_UNIX_SOCKET in effect (written or kept). */
	readonly socket: string;
	readonly socketSource: DevSocketSource;
	/** The Serving-section entries the plan writes (the socket, unless kept). */
	readonly serving: readonly { readonly key: string; readonly value: string }[];
}

type Prior = Readonly<Record<string, string>>;

/** A prior value that says something (unset and blank are the same: unset). */
function priorValue(prior: Prior, key: string): string | undefined {
	const value = prior[key]?.trim() ?? '';
	return value === '' ? undefined : value;
}

/** The prior .env's COMPLETE TLS pair, or null (a half pair is not kept: it refuses the boot). */
export function priorTlsPair(prior: Prior): DevListenerTlsPair | null {
	const certFile = priorValue(prior, CERT_KEY);
	const keyFile = priorValue(prior, KEY_KEY);
	return certFile === undefined || keyFile === undefined ? null : { certFile, keyFile };
}

/** The developer `tls_mode` in effect: the answer, else the kept pair, else D1's local CA. */
export function devTlsSource(
	answers: Pick<InstallAnswers, 'tls_mode'>,
	prior: Prior,
): DevTlsSource {
	if (answers.tls_mode !== '') return answers.tls_mode as DevTlsSource;
	return priorTlsPair(prior) === null ? DEV_TLS_DEFAULT : 'kept';
}

/**
 * Does the install's browser-facing listener speak HTTPS? THE one answer
 * SESSION_COOKIE_SECURE is written from, on every route that writes it:
 * docker unless `none`; trial never (plain HTTP by definition); production
 * always (its reverse proxy terminates TLS, no `none` mode exists); developer
 * unless its effective mode is `none`.
 */
export function servesTls(
	answers: Pick<InstallAnswers, 'route' | 'tls_mode'>,
	prior: Prior = {},
): boolean {
	if (answers.route === 'docker') return answers.tls_mode !== 'none';
	if (answers.route === 'trial') return false;
	if (answers.route === 'production') return true;
	return devTlsSource(answers, prior) !== 'none';
}

/** The pair an answered (or kept) mode makes the server present; null = plain HTTP. */
function tlsPairOf(
	source: DevTlsSource,
	answers: Pick<InstallAnswers, 'tls_cert_path' | 'tls_key_path'>,
	prior: Prior,
	tlsDir: string,
): DevListenerTlsPair | null {
	if (source === 'none') return null;
	if (source === 'kept') return priorTlsPair(prior);
	if (source === 'files') return { certFile: answers.tls_cert_path, keyFile: answers.tls_key_path };
	return { certFile: join(tlsDir, DEV_TLS_CERT_NAME), keyFile: join(tlsDir, DEV_TLS_KEY_NAME) };
}

/** Accumulates the section: a written entry, or a key the prior .env keeps. */
class SectionBuilder {
	readonly entries: { key: string; value: string }[] = [];
	readonly kept: string[] = [];
	constructor(private readonly prior: Prior) {}

	/** An answer ('' = the plan decides): written when given, else kept when the prior has it, else the default. */
	answered(key: string, answer: string, fallback: string): string {
		if (answer !== '') return this.write(key, answer);
		const prior = priorValue(this.prior, key);
		if (prior === undefined) return this.write(key, fallback);
		this.kept.push(key);
		return prior;
	}

	write(key: string, value: string): string {
		this.entries.push({ key, value });
		return value;
	}
}

/** The TLS half of the section (see the PRESERVE rule in the header). */
function tlsEntries(
	section: SectionBuilder,
	source: DevTlsSource,
	pair: DevListenerTlsPair | null,
	prior: Prior,
): void {
	if (source === 'kept') {
		section.kept.push(CERT_KEY, KEY_KEY);
		return;
	}
	if (pair !== null) {
		section.write(CERT_KEY, pair.certFile);
		section.write(KEY_KEY, pair.keyFile);
		return;
	}
	// `none` clears what an earlier run wrote (written empty = unset to the server).
	for (const key of [CERT_KEY, KEY_KEY]) {
		if (priorValue(prior, key) !== undefined) section.write(key, '');
	}
}

/** How SectionBuilder.answered decided the socket. */
function devSocketSource(answer: string, kept: readonly string[]): DevSocketSource {
	if (answer !== '') return 'answered';
	return kept.includes(DEV_SOCKET_KEY) ? 'kept' : 'derived';
}

/**
 * The developer listener of `answers` over the prior .env, or null for every
 * other route (and for a host route's delegated engine child): they write none
 * of these keys. `tlsDir` = where the local-CA material lives (paths.ts devTlsDir).
 */
export function devListenerPlan(
	answers: Pick<
		InstallAnswers,
		| 'route'
		| 'engine_only'
		| 'entity'
		| 'unix_socket'
		| 'dev_port'
		| 'dev_host'
		| 'tls_mode'
		| 'tls_cert_path'
		| 'tls_key_path'
	>,
	prior: Prior,
	tlsDir: string,
): DevListenerPlan | null {
	if (answers.route !== 'developer' || answers.engine_only) return null;
	const section = new SectionBuilder(prior);
	const port = section.answered(PORT_KEY, answers.dev_port, DEV_PORT_DEFAULT);
	const host = section.answered(HOST_KEY, answers.dev_host, DEV_HOST_DEFAULT);
	const tlsSource = devTlsSource(answers, prior);
	const tls = tlsPairOf(tlsSource, answers, prior, tlsDir);
	tlsEntries(section, tlsSource, tls, prior);
	const sessionCookieSecure = servesTls(answers, prior);
	section.write(SECURE_KEY, sessionCookieSecure ? 'true' : 'false');
	section.answered(DEV_MODE_KEY, '', 'true');
	section.answered(DEBUG_KEY, '', 'true');
	const serving = new SectionBuilder(prior);
	const socket = serving.answered(
		DEV_SOCKET_KEY,
		answers.unix_socket,
		devSocketDefault(answers.entity),
	);
	return {
		port,
		host,
		tlsSource,
		tls,
		sessionCookieSecure,
		url: devListenerUrl(host, port, tls !== null),
		networkReachable: !isLoopbackBind(host),
		entries: section.entries,
		kept: [...section.kept, ...serving.kept],
		socket,
		socketSource: devSocketSource(answers.unix_socket, serving.kept),
		serving: serving.entries,
	};
}

/**
 * The warning for a listener other machines reach — a PLAN warning (not only
 * the Development server screen's notice), so the Review, a headless run's
 * announcement and the plan file all carry it. The sentence lives HERE, on the
 * plan side: the screen text module is UI-only (screen model tripwire (g)).
 */
export function devListenerNetworkWarning(host: string, tls: boolean): string {
	return `Bound to ${host}: other machines reach it, with full error details${tls ? '' : ' and no TLS (anyone on the path reads the traffic, passwords included)'}. Only on a network you trust.`;
}

/** The plan's listener warnings: the network one when other machines reach it. */
export function devListenerWarnings(listener: DevListenerPlan | null): string[] {
	if (listener === null || !listener.networkReachable) return [];
	return [devListenerNetworkWarning(listener.host, listener.tls !== null)];
}
