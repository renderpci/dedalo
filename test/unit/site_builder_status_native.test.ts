/**
 * site_builder_status — native gate for the extracted decision logic (CRAP item 3.14).
 *
 * The pre-existing gate (site_builder_status_widget.test.ts) can only reach the
 * unconfigured early return: `config.siteBuilder` is a frozen module const and that test
 * asserts it is unset in this env. This file gates what was previously unreachable:
 *
 *   - `siteBuilderHost` — host extraction (port kept, credentials stripped, junk → null);
 *   - `buildSiteBuilderPanel` — the panel shape (drivers guard, publish filter, reachable);
 *   - `buildSiteBuilderStatus` — BOTH try/catch arms of the I/O shell, driven through the
 *     injectable `fetchJson` + `siteBuilder` deps. NEVER a real network call: every probe
 *     here is a local stub, and the stub log is asserted so a silent real fetch would show.
 *
 * Rewire proof: the last test reads the widget source and asserts the inline copies of the
 * extracted logic are GONE (no second source of truth).
 */

import { describe, expect, test } from 'bun:test';
import {
	buildSiteBuilderPanel,
	buildSiteBuilderStatus,
	siteBuilderHost,
	widget,
} from '../../src/core/area_maintenance/widgets/site_builder_status.ts';

const CONFIGURED = { url: 'https://sb.local:8443/', token: 'tok' };

describe('siteBuilderHost', () => {
	test('returns host (WITH port), credentials stripped', () => {
		expect(siteBuilderHost('https://user:tok@sb.local:8443/internal/path')).toBe('sb.local:8443');
	});

	test('returns null for an unparseable URL', () => {
		expect(siteBuilderHost('not a url')).toBe(null);
	});

	test('plain host, no port', () => {
		expect(siteBuilderHost('http://sb.local/health')).toBe('sb.local');
	});
});

describe('buildSiteBuilderPanel', () => {
	test('a non-array drivers value yields []', () => {
		expect(buildSiteBuilderPanel({ urlHost: 'sb.local', health: { drivers: 'ftp' } })).toEqual({
			configured: true,
			reachable: true,
			url_host: 'sb.local',
			drivers: [],
			last_publishes: [],
		});
	});

	test('an array drivers value passes through verbatim', () => {
		const panel = buildSiteBuilderPanel({
			urlHost: 'sb.local',
			health: { drivers: ['ftp', 'local'] },
		});
		expect(panel.drivers).toEqual(['ftp', 'local']);
		expect(panel.reachable).toBe(true);
	});

	test('only rows with action === "publish" survive (bare row array)', () => {
		const audit = [{ action: 'publish', id: 1 }, { action: 'delete', id: 2 }, { id: 3 }];
		const panel = buildSiteBuilderPanel({ urlHost: 'sb.local', health: {}, audit });
		expect(panel.last_publishes).toEqual([{ action: 'publish', id: 1 }]);
	});

	test('the daemon-shaped audit response ({data:[…]}) filters identically', () => {
		const panel = buildSiteBuilderPanel({
			urlHost: 'sb.local',
			health: {},
			audit: {
				data: [{ action: 'publish', id: 1 }, { action: 'delete', id: 2 }, { id: 3 }],
			},
		});
		expect(panel.last_publishes).toEqual([{ action: 'publish', id: 1 }]);
	});

	test('a non-array audit.data yields no publishes', () => {
		const panel = buildSiteBuilderPanel({ urlHost: 'sb.local', health: {}, audit: { data: 'x' } });
		expect(panel.last_publishes).toEqual([]);
	});

	test('health null → configured but not reachable', () => {
		expect(buildSiteBuilderPanel({ urlHost: 'sb.local', health: null })).toEqual({
			configured: true,
			reachable: false,
			url_host: 'sb.local',
			drivers: [],
			last_publishes: [],
		});
	});

	test('quirk: pinned, not fixed — a primitive health body counts as reachable', () => {
		const panel = buildSiteBuilderPanel({ urlHost: null, health: 0 });
		expect(panel.reachable).toBe(true);
		expect(panel.drivers).toEqual([]);
		expect(panel.url_host).toBe(null);
	});
});

describe('buildSiteBuilderStatus (I/O shell, stubbed — never the network)', () => {
	test('unconfigured (no url/token) returns the fail-soft shape and probes nothing', async () => {
		const calls: string[] = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: {},
			fetchJson: async (url) => {
				calls.push(url);
				return {};
			},
		});
		expect(value).toEqual({
			configured: false,
			reachable: false,
			url_host: null,
			drivers: [],
			last_publishes: [],
		});
		expect(calls).toEqual([]);
	});

	test('quirk: pinned, not fixed — a url without a token is treated as unconfigured', async () => {
		const value = await buildSiteBuilderStatus({
			siteBuilder: { url: 'https://sb.local' },
			fetchJson: async () => {
				throw new Error('must not be called');
			},
		});
		expect(value).toMatchObject({ configured: false, url_host: null });
	});

	test('reachable: health + audit, trailing slash stripped, bearer token on audit only', async () => {
		const calls: Array<{ url: string; headers: Record<string, string> }> = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url, headers) => {
				calls.push({ url, headers });
				if (url.endsWith('/health')) return { drivers: ['ftp'] };
				return {
					data: [
						{ action: 'publish', id: 1 },
						{ action: 'delete', id: 2 },
					],
				};
			},
		});
		expect(value).toEqual({
			configured: true,
			reachable: true,
			url_host: 'sb.local:8443',
			drivers: ['ftp'],
			last_publishes: [{ action: 'publish', id: 1 }],
		});
		expect(calls.map((c) => c.url)).toEqual([
			'https://sb.local:8443/health',
			'https://sb.local:8443/v1/audit?limit=10',
		]);
		expect(calls[0]?.headers).toEqual({});
		expect(calls[1]?.headers).toEqual({ Authorization: 'Bearer tok' });
	});

	test('health arm: a throwing/timing-out probe yields reachable:false, host still shown', async () => {
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async () => {
				throw new DOMException('The operation timed out.', 'TimeoutError');
			},
		});
		expect(value).toEqual({
			configured: true,
			reachable: false,
			url_host: 'sb.local:8443',
			drivers: [],
			last_publishes: [],
		});
	});

	test('audit arm: a failing audit is swallowed, the daemon stays reachable', async () => {
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url) => {
				if (url.endsWith('/health')) return { drivers: ['local'] };
				throw new Error('HTTP 401');
			},
		});
		expect(value).toEqual({
			configured: true,
			reachable: true,
			url_host: 'sb.local:8443',
			drivers: ['local'],
			last_publishes: [],
		});
	});

	test('quirk: pinned, not fixed — a null health body skips the audit probe entirely', async () => {
		const calls: string[] = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url) => {
				calls.push(url);
				return null;
			},
		});
		expect(calls).toEqual(['https://sb.local:8443/health']);
		expect(value).toMatchObject({ configured: true, reachable: false });
	});

	test('a non-URL daemon address still probes, with url_host null', async () => {
		const value = await buildSiteBuilderStatus({
			siteBuilder: { url: 'not a url', token: 't' },
			fetchJson: async () => ({ drivers: [] }),
		});
		expect(value).toMatchObject({ configured: true, reachable: true, url_host: null });
	});

	test('the widget eagerValue is the shell with no injected deps', async () => {
		// Reads the real (unset) config: same fail-soft shape as the legacy gate pins.
		expect(await widget.eagerValue?.()).toEqual({
			configured: false,
			reachable: false,
			url_host: null,
			drivers: [],
			last_publishes: [],
		});
	});
});

describe('rewire proof', () => {
	test('the inline host/panel logic is gone from the widget source', async () => {
		const source = await Bun.file(
			new URL('../../src/core/area_maintenance/widgets/site_builder_status.ts', import.meta.url)
				.pathname,
		).text();

		// The inline host extraction is deleted (only siteBuilderHost builds a URL now).
		expect(source).not.toContain('urlHost = new URL(base).host');
		// Exactly ONE publish filter and ONE drivers guard exist in the whole file: the
		// ones inside buildSiteBuilderPanel.
		expect(source.split("=== 'publish'").length - 1).toBe(1);
		expect(source.split('drivers?: unknown[]').length - 1).toBe(1);

		// The shell itself no longer contains any of the extracted decision logic.
		const shell = buildSiteBuilderStatus.toString();
		expect(shell).not.toContain('new URL(');
		expect(shell).not.toContain('.filter(');
		expect(shell).not.toContain('Array.isArray');
		expect(shell).not.toContain('.data');
		expect(shell).not.toContain('.drivers');

		// …and the call sites point at the extractions.
		expect(source).toContain('const urlHost = siteBuilderHost(base);');
		expect(source).toContain('return buildSiteBuilderPanel({ urlHost, health, audit });');
		expect(source).toContain('return buildSiteBuilderPanel({ urlHost, health: null });');
	});
});
