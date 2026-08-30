/**
 * site_builder_status widget — a display-only ops panel for the Site Builder daemon.
 *
 * It probes the configured daemon (config.siteBuilder) with a short timeout and reports
 * whether it is configured and reachable, its driver availability, and the most recent
 * publishes (from the daemon's audit tail). Best-effort and fail-soft: an unconfigured or
 * unreachable daemon yields a `reachable: false` panel, never an error. Admin-gated by the
 * area itself; no execute action.
 *
 * WHERE IT PROBES is not decided here: `resolveSiteBuilderTransport` (core/site_builder/
 * pairing.ts) is the one answer, shared with the tool's daemon client. It covers both the
 * unix socket a provisioned daemon actually listens on and the URL of a remote one, and it
 * treats a HALF-configured pairing (a transport with no instance name, or no token) as no
 * configuration at all. The panel DOES verify the pairing fingerprint, because it does not
 * only ask an unauthenticated liveness question: it goes on to send this engine's bearer
 * token to /v1/audit. Handing that to whatever answered a public /health, and then printing
 * the replies under this museum's heading, is the mispairing disaster in ops-panel form.
 *
 * Coverage note (honest): the decision logic is split out into two pure exports —
 * `siteBuilderHost` (host extraction, credentials stripped, port kept) and
 * `buildSiteBuilderPanel` (the panel shape: drivers guard, publish filter, reachability).
 * `buildSiteBuilderStatus` itself is the I/O shell and STILL owns both try/catch arms
 * (the health fetch/timeout arm and the best-effort audit swallow). Those arms are NOT
 * exercised by a real network call in any gate — instead the shell takes an injectable
 * `fetchJson` and an injectable `siteBuilder` config slice, so reachable / unreachable /
 * timeout / audit-failure are all driven from a local stub in
 * test/unit/site_builder_status_native.test.ts. No test here ever touches the network.
 */

import type { SiteBuilderConfig } from '../../../config/config.ts';
import {
	fingerprintMatches,
	instanceFingerprint,
	resolveSiteBuilderTransport,
} from '../../site_builder/pairing.ts';
import type { WidgetModule } from './support.ts';

const PROBE_TIMEOUT_MS = 3000;

/**
 * The probe's one I/O seam. `unixSocket` is threaded through rather than folded into the
 * url because a provisioned daemon publishes NO network port at all: it answers on a
 * per-instance unix socket, so a panel that could only speak http would report every
 * correctly-installed daemon as "not configured" — a false statement in the one place an
 * operator goes to find out whether it is running.
 */
type FetchJson = (
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
	unixSocket?: string,
) => Promise<unknown>;

/**
 * The daemon host as an operator should see it: `host` (hostname **plus** port),
 * never the full URL, which may embed structure or credentials. Unparseable → null.
 */
export function siteBuilderHost(url: string): string | null {
	try {
		return new URL(url).host;
	} catch {
		return null;
	}
}

/**
 * The panel shape, from already-fetched probe results.
 *
 * `health` null/undefined means the health probe did not yield a body → the daemon is
 * configured but not reachable. Any other value counts as reachable (a non-object or a
 * non-array `drivers` simply yields `drivers: []` — quirk: pinned, not fixed).
 *
 * `audit` is the raw audit response (`{ data: [...] }`); a bare array of rows is also
 * accepted for direct callers. Anything else yields no publishes. Only rows whose
 * `action` is exactly `'publish'` survive.
 */
export function buildSiteBuilderPanel(input: {
	urlHost: string | null;
	health: unknown;
	audit?: unknown;
}): Record<string, unknown> {
	const { urlHost, health, audit } = input;

	if (health === null || health === undefined) {
		return {
			configured: true,
			reachable: false,
			url_host: urlHost,
			drivers: [],
			last_publishes: [],
		};
	}

	const drivers = Array.isArray((health as { drivers?: unknown[] }).drivers)
		? (health as { drivers: unknown[] }).drivers
		: [];

	const rows = Array.isArray(audit)
		? (audit as unknown[])
		: Array.isArray((audit as { data?: unknown[] } | null | undefined)?.data)
			? (audit as { data: unknown[] }).data
			: [];
	const lastPublishes = rows.filter((row) => (row as { action?: string }).action === 'publish');

	return {
		configured: true,
		reachable: true,
		url_host: urlHost,
		drivers,
		last_publishes: lastPublishes,
	};
}

/**
 * THE PANEL PROVES THE PAIRING BEFORE IT SPENDS THE TOKEN.
 *
 * `/health` is public and unauthenticated: anything listening on that socket or URL can
 * answer it. Sending `Authorization: Bearer <this engine's token>` to whatever replied
 * hands this museum's credential to another museum's daemon — and then renders THAT
 * museum's publish history under this museum's heading, which is the mispairing disaster
 * wearing an ops-panel costume. The daemon publishes an opaque fingerprint for exactly
 * this: it proves the instance AND the shared token while disclosing neither.
 *
 * Extracted rather than inlined so the decision is directly testable and the I/O shell
 * stays under the complexity ratchet — the same split `siteBuilderHost` and
 * `buildSiteBuilderPanel` already got, for the same reason.
 */
export function healthProvesPairing(health: unknown, instance: string, token: string): boolean {
	if (health === null || health === undefined) return false;
	const published = (health as { instance_fingerprint?: unknown }).instance_fingerprint;
	return fingerprintMatches(published, instanceFingerprint(instance, token));
}

export async function buildSiteBuilderStatus(
	deps: { fetchJson?: FetchJson; siteBuilder?: Partial<SiteBuilderConfig> } = {},
): Promise<Record<string, unknown>> {
	const siteBuilder =
		deps.siteBuilder ?? (await import('../../../config/config.ts')).config.siteBuilder;
	const doFetch = deps.fetchJson ?? fetchJson;

	// ONE spelling of "where the daemon is", shared with the tool's daemon client
	// (core/site_builder/pairing.ts). A panel that resolved the address its own way would be
	// a second answer to the question the tool acts on, and the day the two disagreed the
	// panel would report a daemon nobody is talking to. A partial configuration — a
	// transport with no instance name, or no token — resolves to null and reads as
	// unconfigured, which is what it is.
	const transport = resolveSiteBuilderTransport({
		url: undefined,
		socket: undefined,
		instance: undefined,
		token: undefined,
		timeoutMs: PROBE_TIMEOUT_MS,
		...siteBuilder,
	});

	if (transport === null) {
		return { configured: false, reachable: false, url_host: null, drivers: [], last_publishes: [] };
	}

	const base = transport.base;
	const authHeaders = { Authorization: `Bearer ${transport.token}` };
	// Never surface the full URL (may embed structure); the host is enough for an operator.
	// Over a socket that host is the synthetic `.invalid` authority, which says the honest
	// thing: there is no network address to show.
	const urlHost = siteBuilderHost(base);

	try {
		const health = await doFetch(`${base}/health`, {}, PROBE_TIMEOUT_MS, transport.unixSocket);

		const paired = healthProvesPairing(health, transport.instance, transport.token);

		let audit: unknown;
		// Quirk: pinned, not fixed — a null/undefined health body threw on `.drivers` in the
		// pre-split code, so the audit probe was never issued in that case. Kept exactly.
		if (paired) {
			try {
				audit = await doFetch(
					`${base}/v1/audit?limit=10`,
					authHeaders,
					PROBE_TIMEOUT_MS,
					transport.unixSocket,
				);
			} catch {
				// audit is best-effort; a reachable daemon with no audit yet is fine
				audit = undefined;
			}
		}

		// An unpaired daemon contributes NOTHING to the panel — not its drivers, not its
		// version, not its audit. Passing its health body through would render another
		// museum's facts under this museum's heading.
		return buildSiteBuilderPanel({ urlHost, health: paired ? health : null, audit });
	} catch {
		return buildSiteBuilderPanel({ urlHost, health: null });
	}
}

async function fetchJson(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
	unixSocket?: string,
): Promise<unknown> {
	const res = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(timeoutMs),
		...(unixSocket === undefined ? {} : { unix: unixSocket }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export const widget: WidgetModule = {
	spec: {
		id: 'site_builder_status',
		category: 'publication',
		label: { kind: 'literal', text: 'Site builder' },
	},
	eagerValue: () => buildSiteBuilderStatus(),
};
