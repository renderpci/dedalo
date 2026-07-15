/**
 * site_builder_status widget — a display-only ops panel for the Site Builder daemon.
 *
 * It probes the configured daemon (config.siteBuilder) with a short timeout and reports
 * whether it is configured and reachable, its driver availability, and the most recent
 * publishes (from the daemon's audit tail). Best-effort and fail-soft: an unconfigured or
 * unreachable daemon yields a `reachable: false` panel, never an error. Admin-gated by the
 * area itself; no execute action.
 */

import type { WidgetModule } from './support.ts';

const PROBE_TIMEOUT_MS = 3000;

async function buildSiteBuilderStatus(): Promise<Record<string, unknown>> {
	const { config } = await import('../../../config/config.ts');
	const url = config.siteBuilder.url;
	const token = config.siteBuilder.token;

	if (typeof url !== 'string' || typeof token !== 'string') {
		return { configured: false, reachable: false, url_host: null, drivers: [], last_publishes: [] };
	}

	const base = url.replace(/\/$/, '');
	const authHeaders = { Authorization: `Bearer ${token}` };
	// Never surface the full URL (may embed structure); the host is enough for an operator.
	let urlHost: string | null = null;
	try {
		urlHost = new URL(base).host;
	} catch {
		urlHost = null;
	}

	try {
		const health = await fetchJson(`${base}/health`, {}, PROBE_TIMEOUT_MS);
		const drivers = Array.isArray((health as { drivers?: unknown[] }).drivers)
			? (health as { drivers: unknown[] }).drivers
			: [];

		let lastPublishes: unknown[] = [];
		try {
			const audit = await fetchJson(`${base}/v1/audit?limit=10`, authHeaders, PROBE_TIMEOUT_MS);
			const rows = Array.isArray((audit as { data?: unknown[] }).data)
				? (audit as { data: unknown[] }).data
				: [];
			lastPublishes = rows.filter((row) => (row as { action?: string }).action === 'publish');
		} catch {
			// audit is best-effort; a reachable daemon with no audit yet is fine
		}

		return {
			configured: true,
			reachable: true,
			url_host: urlHost,
			drivers,
			last_publishes: lastPublishes,
		};
	} catch {
		return {
			configured: true,
			reachable: false,
			url_host: urlHost,
			drivers: [],
			last_publishes: [],
		};
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
		category: 'diffusion',
		label: { kind: 'literal', text: 'Site builder' },
	},
	eagerValue: buildSiteBuilderStatus,
};
