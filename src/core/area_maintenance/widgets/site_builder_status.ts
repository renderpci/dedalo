/**
 * site_builder_status widget — a display-only ops panel for the Site Builder daemon.
 *
 * It probes the configured daemon (config.siteBuilder) with a short timeout and reports
 * whether it is configured and reachable, its driver availability, and the most recent
 * publishes (from the daemon's audit tail). Best-effort and fail-soft: an unconfigured or
 * unreachable daemon yields a `reachable: false` panel, never an error. Admin-gated by the
 * area itself; no execute action.
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

import type { WidgetModule } from './support.ts';

const PROBE_TIMEOUT_MS = 3000;

type FetchJson = (
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
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

export async function buildSiteBuilderStatus(
	deps: { fetchJson?: FetchJson; siteBuilder?: { url?: unknown; token?: unknown } } = {},
): Promise<Record<string, unknown>> {
	const siteBuilder =
		deps.siteBuilder ?? (await import('../../../config/config.ts')).config.siteBuilder;
	const doFetch = deps.fetchJson ?? fetchJson;
	const url = siteBuilder.url;
	const token = siteBuilder.token;

	if (typeof url !== 'string' || typeof token !== 'string') {
		return { configured: false, reachable: false, url_host: null, drivers: [], last_publishes: [] };
	}

	const base = url.replace(/\/$/, '');
	const authHeaders = { Authorization: `Bearer ${token}` };
	// Never surface the full URL (may embed structure); the host is enough for an operator.
	const urlHost = siteBuilderHost(base);

	try {
		const health = await doFetch(`${base}/health`, {}, PROBE_TIMEOUT_MS);

		let audit: unknown;
		// Quirk: pinned, not fixed — a null/undefined health body threw on `.drivers` in the
		// pre-split code, so the audit probe was never issued in that case. Kept exactly.
		if (health !== null && health !== undefined) {
			try {
				audit = await doFetch(`${base}/v1/audit?limit=10`, authHeaders, PROBE_TIMEOUT_MS);
			} catch {
				// audit is best-effort; a reachable daemon with no audit yet is fine
				audit = undefined;
			}
		}

		return buildSiteBuilderPanel({ urlHost, health, audit });
	} catch {
		return buildSiteBuilderPanel({ urlHost, health: null });
	}
}

async function fetchJson(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
): Promise<unknown> {
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
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
