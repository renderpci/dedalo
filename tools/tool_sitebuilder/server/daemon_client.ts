/**
 * The ONLY place the engine talks to the Site Builder daemon.
 *
 * It dials the paired daemon — a unix socket by default, a URL when the daemon is genuinely
 * remote — attaches the shared bearer token, attaches the acting user's identity (so the
 * daemon can record who did what; the engine is the trusted identity injector and the
 * browser never reaches the daemon), and bounds the control calls with a timeout. It maps
 * every transport failure and daemon problem+json onto a registered `site_builder.*` code
 * (wire.ts), and it never lets the token, the address or the daemon's own prose leak into a
 * message the engine relays to a browser.
 *
 * ── NOTHING IS SENT BEFORE THE PAIRING IS PROVED ────────────────────────────────────────
 *
 * `assertPaired()` runs ahead of the FIRST byte of every call, including the stream leg.
 * The engine recomputes the pairing fingerprint from its own configuration and compares it
 * against the one the daemon publishes on its unauthenticated /health; a mismatch is a
 * registered `site_builder.instance_mismatch` refusal and NOTHING — not the token, not the
 * actor, not the request — reaches the wire. The reason this exists at all is in
 * src/core/site_builder/pairing.ts: a copy-pasted `../private/.env` silently points one
 * museum's engine at another museum's daemon, and until that is proved false it is
 * indistinguishable from a correct pairing.
 *
 * THE REFUSAL IS ONE REFUSAL. A wrong instance name, an instance that does not exist on
 * that host and a wrong token all fail with the same code, the same message and the same
 * absence of detail, so the check cannot be turned around into an oracle that enumerates a
 * host's instances or confirms a guessed token. What distinguishes them is the SERVER LOG,
 * which an operator with access to the machine can read and a caller cannot.
 *
 * Two shapes: `daemonJson` for the ordinary control calls (parsed JSON, timeout), and
 * `daemonStream` for the SSE event pass-through (no overall timeout — a turn streams for
 * minutes; cancellation is wired to the caller's AbortSignal).
 */

import { config } from '../../../src/config/config.ts';
import type { DedaloError } from '../../../src/core/errors/index.ts';
import {
	describeUnconfigured,
	fingerprintMatches,
	instanceFingerprint,
	resolveSiteBuilderTransport,
	type SiteBuilderTransport,
} from '../../../src/core/site_builder/pairing.ts';
import {
	capDetail,
	codeForProblem,
	type DaemonProblem,
	refusalSentence,
	siteBuilderFailure,
} from './wire.ts';

export interface Actor {
	user_id: number;
	username: string;
}

/**
 * THE HEALTH FIELD THE PAIRING TRAVELS IN. Spelled once, here, because it is read in two
 * places: the proof below, and the status action that must STRIP it before the daemon's
 * health body is relayed to a browser (index.ts). A fingerprint on the wire to a browser
 * would hand an offline brute force a target it has no business having.
 */
export const PAIRING_FIELD = 'instance_fingerprint';

/** The resolved address + credential, or null on an install with no site builder. */
function transportOrNull(): SiteBuilderTransport | null {
	return resolveSiteBuilderTransport(config.siteBuilder);
}

export function isConfigured(): boolean {
	return transportOrNull() !== null;
}

function requireTransport(): SiteBuilderTransport {
	const transport = transportOrNull();
	if (transport === null) {
		// The LOG says which key is missing; the caller is told only that the feature is off.
		console.error(`[tool_sitebuilder] ${describeUnconfigured(config.siteBuilder)}`);
		throw siteBuilderFailure(
			'site_builder.unconfigured',
			'The site builder is not configured on this server.',
		);
	}
	return transport;
}

/**
 * THE PAIRING, PROVED ONCE PER PROCESS.
 *
 * Module-level state, and deliberately so: the pairing is a fact about this PROCESS's
 * configuration and the daemon at the other end of a fixed address — it carries no user, no
 * language and no request. Re-probing /health before every control call would add a round
 * trip to every list, every message and every build for an answer that cannot change while
 * both processes live.
 *
 * ONLY SUCCESS IS REMEMBERED. A failure is not cached: a daemon that was down during the
 * first probe, or was restarted with its credential rotated, must be able to become paired
 * again without an engine restart. The cost of not caching a failure is one extra probe per
 * failed call, which is the cheap direction.
 *
 * The key is the fingerprint the CONFIGURATION implies, so a config module swapped under
 * the process (which is exactly what the gates do) re-proves rather than inheriting the
 * previous pairing's verdict.
 */
let provenPairing: string | null = null;

async function assertPaired(transport: SiteBuilderTransport): Promise<void> {
	const expected = instanceFingerprint(transport.instance, transport.token);
	if (provenPairing === expected) return;

	let response: Response;
	try {
		// The pairing probe carries NO bearer and NO actor: /health is the daemon's one
		// unauthenticated route precisely so this question can be asked before anything is
		// entrusted to the answerer.
		response = await fetch(`${transport.base}/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(transport.timeoutMs),
			...(transport.unixSocket === undefined ? {} : { unix: transport.unixSocket }),
		});
	} catch (error) {
		// Unreachable is NOT a mismatch: an operator chasing a down daemon must not be sent
		// looking for a pairing bug, and a caller must not be told a network fact as a
		// configuration one.
		console.error('[tool_sitebuilder] daemon unreachable during the pairing probe:', error);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}
	if (!response.ok) {
		// A daemon that is up and refuses its own PUBLIC route is not answering the pairing
		// question, which is a service fault rather than a wrong pairing.
		console.error(`[tool_sitebuilder] the pairing probe got HTTP ${response.status} from /health`);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}
	// A body that is not JSON, or JSON without the field, leaves `published` undefined — and
	// undefined is a MISMATCH below, not a pass. Whatever is at that address is either not
	// this daemon or too old to prove anything, and both are things to refuse.
	const published = await response
		.json()
		.then((body) => (body as Record<string, unknown>)?.[PAIRING_FIELD])
		.catch(() => undefined);

	if (!fingerprintMatches(published, expected)) {
		// The LOG carries everything an operator needs and the wire carries none of it. The
		// instance NAME is safe here (it is in the socket path and in the .env already); the
		// token and both fingerprints are not, because a fingerprint written to a log that
		// leaves the machine is a pre-image target.
		console.error(
			`[tool_sitebuilder] PAIRING REFUSED: the daemon at the configured address is not ` +
				`instance '${transport.instance}' holding this engine's DEDALO_SITE_BUILDER_TOKEN. ` +
				`Nothing was sent. Either DEDALO_SITE_BUILDER_INSTANCE names another museum ` +
				`(a private .env copied between installs), or the token does not match the daemon's ` +
				`SERVICE_TOKEN, or ${PAIRING_FIELD} is absent because the daemon predates the pairing ` +
				`proof and must be updated. Re-append this instance's engine.env.fragment ` +
				`(scripts/site_builder_pair.ts) and restart.`,
		);
		throw siteBuilderFailure(
			'site_builder.instance_mismatch',
			// ONE sentence for all three causes: wrong instance, unknown instance, wrong token.
			// A refusal that distinguished them would enumerate a host's instances for anyone
			// who can reach this action.
			'The site builder did not prove it is the paired instance.',
		);
	}
	provenPairing = expected;
}

function headers(
	token: string,
	actor: Actor,
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'X-Dedalo-User-Id': String(actor.user_id),
		'X-Dedalo-Username': actor.username,
		...extra,
	};
}

/**
 * A control call returning parsed JSON. `body` (for POST/DELETE) has the actor merged in,
 * because the daemon requires it on every mutation. Read calls pass no body.
 */
export async function daemonJson(
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	actor: Actor,
	body?: Record<string, unknown>,
): Promise<unknown> {
	const transport = requireTransport();
	await assertPaired(transport);
	const hasBody = method !== 'GET';
	const payload = hasBody ? JSON.stringify({ ...(body ?? {}), actor }) : undefined;

	let res: Response;
	try {
		res = await fetch(transport.base + path, {
			method,
			headers: headers(
				transport.token,
				actor,
				hasBody ? { 'Content-Type': 'application/json' } : {},
			),
			body: payload,
			signal: AbortSignal.timeout(transport.timeoutMs),
			// A unix socket is not a fallback for a port: where one is configured it IS the
			// transport, and its 0660 <daemon user>:<engine group> ownership is the whole
			// access decision.
			...(transport.unixSocket === undefined ? {} : { unix: transport.unixSocket }),
		});
	} catch (error) {
		// Network failure or timeout — log the real cause server-side, surface nothing.
		console.error('[tool_sitebuilder] daemon unreachable:', error);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}

	if (res.ok) {
		return res.status === 204 ? {} : await res.json().catch(() => ({}));
	}
	throw await mapError(res);
}

/** The SSE pass-through leg: returns the raw daemon Response for byte forwarding. */
export async function daemonStream(
	path: string,
	actor: Actor,
	signal: AbortSignal,
): Promise<Response> {
	const transport = requireTransport();
	await assertPaired(transport);
	let res: Response;
	try {
		res = await fetch(transport.base + path, {
			method: 'GET',
			headers: headers(transport.token, actor, { Accept: 'text/event-stream' }),
			signal,
			...(transport.unixSocket === undefined ? {} : { unix: transport.unixSocket }),
		});
	} catch (error) {
		console.error('[tool_sitebuilder] daemon stream unreachable:', error);
		throw siteBuilderFailure(
			'site_builder.unreachable',
			'The site builder service is not reachable.',
		);
	}
	if (!res.ok) throw await mapError(res);
	return res;
}

/**
 * A non-2xx daemon response → the registered refusal. The daemon's problem `type`/`reason`
 * chooses the code; its `detail` is LOG-ONLY prose (wire.ts), so nothing the daemon writes
 * can become the browser's error text.
 */
async function mapError(res: Response): Promise<DedaloError> {
	// Auth failures are an operator problem (our token is wrong), not the user's — generic
	// message, loud server log.
	if (res.status === 401 || res.status === 403) {
		console.error(`[tool_sitebuilder] daemon rejected our token (${res.status})`);
		return siteBuilderFailure(
			'site_builder.auth',
			'The site builder rejected this server. Check its configuration.',
			{ status: res.status },
		);
	}
	let problem: DaemonProblem = {};
	try {
		problem = (await res.json()) as DaemonProblem;
	} catch {
		// non-JSON error body
	}
	const fallback =
		res.status >= 400 && res.status < 500 ? 'site_builder.rejected' : 'site_builder.failed';
	const code = codeForProblem(problem, fallback);
	const detail = capDetail(problem.detail, 'The site builder reported an error.');
	// The daemon's own prose stays here, in the LOG, in full — it names the instance, the
	// site table, the directory and the command to run, and it is written for whoever
	// administers the host.
	console.error(`[tool_sitebuilder] daemon error ${res.status} (${code}):`, problem.detail ?? '');
	// What the browser gets is the sentence the ENGINE authors for this refusal's machine
	// code, or nothing at all. A refusal the daemon can spell out and the user cannot see is
	// half a failure; a refusal the daemon gets to WORD is a service writing our UI.
	return siteBuilderFailure(code, detail, { status: res.status }, refusalSentence(problem));
}
