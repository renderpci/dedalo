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
import { instanceFingerprint } from '../../src/core/site_builder/pairing.ts';

/**
 * A CONFIGURED install, as of the pairing pass (2026-08-29): a transport, a token AND the
 * instance the engine is paired with. The instance is not decoration here — an engine that
 * cannot say which museum's daemon it is dialling resolves to no transport at all
 * (core/site_builder/pairing.ts), so the panel reports it as unconfigured, which is the
 * fail-closed reading and the one the socket cases below rely on.
 */
const CONFIGURED = { url: 'https://sb.local:8443/', token: 'tok', instance: 'example' };

/**
 * A `/health` body from the daemon this engine is ACTUALLY paired with.
 *
 * The panel now proves the pairing before it spends the bearer token, so a stub without a
 * fingerprint is an UNPAIRED daemon and reads as unreachable — which is the point. Every
 * reachable-path fixture therefore has to publish the real fingerprint, and the one that
 * does not is the mispairing case asserted at the bottom of this file.
 */
function healthOf(body: Record<string, unknown>, instance = 'example', token = 'tok') {
	return { ...body, instance_fingerprint: instanceFingerprint(instance, token) };
}

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

	/**
	 * A TRANSPORT WITHOUT AN INSTANCE NAME IS NOT A CONFIGURATION (2026-08-29).
	 *
	 * The engine proves the pairing before it sends anything, and it cannot prove what it
	 * was never told — so a URL and a token with no DEDALO_SITE_BUILDER_INSTANCE is refused
	 * rather than probed. Pinned here because the panel is where an operator would first
	 * notice a half-finished pairing, and "not configured" is the honest report of one.
	 */
	test('a transport without an instance name is unconfigured and probes nothing', async () => {
		const calls: string[] = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: { url: 'https://sb.local:8443/', token: 'tok' },
			fetchJson: async (url) => {
				calls.push(url);
				return {};
			},
		});
		expect(value).toMatchObject({ configured: false, url_host: null });
		expect(calls).toEqual([]);
	});

	/**
	 * THE SOCKET IS A TRANSPORT THE PANEL CAN SEE.
	 *
	 * A provisioned daemon publishes no port at all, so before this the ops panel reported
	 * every correctly-installed site builder as "not configured" — the one place an
	 * operator looks, saying the opposite of the truth. The socket path reaches the probe;
	 * the prefix is the daemon's own default base path; `url_host` shows the synthetic
	 * authority, because there is no network address to show.
	 */
	test('a socket-paired daemon is probed over the socket, under the default base path', async () => {
		const calls: Array<{ url: string; unixSocket?: string }> = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: {
				socket: '/run/dedalo-sites/example/daemon.sock',
				token: 'tok',
				instance: 'example',
			},
			fetchJson: async (url, _headers, _timeout, unixSocket) => {
				calls.push({ url, unixSocket });
				return url.endsWith('/health') ? healthOf({ drivers: ['claude_code'] }) : { data: [] };
			},
		});
		expect(calls.map((c) => c.url)).toEqual([
			'http://site-builder.invalid/publication/site_builder/health',
			'http://site-builder.invalid/publication/site_builder/v1/audit?limit=10',
		]);
		expect(calls.every((c) => c.unixSocket === '/run/dedalo-sites/example/daemon.sock')).toBe(true);
		expect(value).toMatchObject({
			configured: true,
			reachable: true,
			drivers: ['claude_code'],
			url_host: 'site-builder.invalid',
		});
	});

	test('reachable: health + audit, trailing slash stripped, bearer token on audit only', async () => {
		const calls: Array<{ url: string; headers: Record<string, string> }> = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url, headers) => {
				calls.push({ url, headers });
				if (url.endsWith('/health')) return healthOf({ drivers: ['ftp'] });
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
				if (url.endsWith('/health')) return healthOf({ drivers: ['local'] });
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
			siteBuilder: { url: 'not a url', token: 't', instance: 'example' },
			fetchJson: async () => healthOf({ drivers: [] }, 'example', 't'),
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
		expect(source).toContain('buildSiteBuilderPanel({ urlHost, health: paired ? health : null, audit });');
		expect(source).toContain('return buildSiteBuilderPanel({ urlHost, health: null });');
	});
});

/**
 * THE PANEL DOES NOT SPEND THE TOKEN ON AN UNPROVED DAEMON.
 *
 * `/health` is public: anything listening on that socket or URL answers it. The panel then
 * sent `Authorization: Bearer <this engine's token>` to whatever replied, and rendered the
 * answer as this museum's status — so an engine pointed at a neighbouring museum's daemon
 * (a copy-pasted ../private/.env; a shared fleet token) leaked its credential and displayed
 * the other museum's publish history as its own. Verified against two real daemons before
 * the fix.
 */
describe('the ops panel proves the pairing before it authenticates', () => {
	const foreignHealth = { drivers: ['claude_code'], instance_fingerprint: instanceFingerprint('museum-b', 'tok') };

	test('a foreign daemon gets no bearer token, and contributes nothing to the panel', async () => {
		const calls: Array<{ url: string; headers: Record<string, string> }> = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED, // instance 'example'
			fetchJson: async (url, headers) => {
				calls.push({ url, headers });
				if (url.endsWith('/health')) return foreignHealth;
				return { data: [{ action: 'publish', id: 99 }] };
			},
		});

		// Only the unauthenticated liveness question was asked.
		expect(calls.map((c) => c.url)).toEqual(['https://sb.local:8443/health']);
		expect(calls.every((c) => c.headers.Authorization === undefined)).toBe(true);

		// And nothing of the foreign daemon reached the panel.
		expect(value).toMatchObject({ configured: true, reachable: false, drivers: [], last_publishes: [] });
	});

	test('a health body with NO fingerprint at all is equally unproved', async () => {
		const calls: string[] = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url) => {
				calls.push(url);
				return url.endsWith('/health') ? { drivers: ['claude_code'] } : { data: [] };
			},
		});
		expect(calls).toEqual(['https://sb.local:8443/health']);
		expect(value).toMatchObject({ reachable: false, drivers: [] });
	});

	test('the correctly paired daemon still gets the token, and IS rendered', async () => {
		// Anti-vacuity: a gate that only ever refuses would pass with the probe deleted.
		const calls: Array<{ url: string; headers: Record<string, string> }> = [];
		const value = await buildSiteBuilderStatus({
			siteBuilder: CONFIGURED,
			fetchJson: async (url, headers) => {
				calls.push({ url, headers });
				if (url.endsWith('/health')) return healthOf({ drivers: ['claude_code'] });
				return { data: [{ action: 'publish', id: 7 }] };
			},
		});
		expect(calls).toHaveLength(2);
		expect(calls[1]?.headers).toEqual({ Authorization: 'Bearer tok' });
		expect(value).toMatchObject({ reachable: true, drivers: ['claude_code'], last_publishes: [{ action: 'publish', id: 7 }] });
	});
});
