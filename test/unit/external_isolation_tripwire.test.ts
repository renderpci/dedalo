/**
 * TRIPWIRE — request isolation inside src/external.
 *
 * One Bun process serves every user, so a value remembered at module scope is
 * remembered for EVERYONE. v6's external subsystem got exactly this wrong: it
 * kept `$_SESSION['zenon_is_available']` — request-identity state that, under a
 * persistent worker, bleeds between users, and that one empty response poisoned
 * for a whole session across every entity at once.
 *
 * So the subsystem's module-level state is a CLOSED, NAMED set, each entry with
 * a written lifecycle, and everything else must come from the cache factory
 * (which is invalidation-wired by construction) or from an ALS read at call
 * time. The static half below pins that; the behavioural half proves the two
 * identities that actually vary per request — the data lang and the field set —
 * cannot serve each other's row.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import { drainInFlightExternalFetches, fetchExternalRows } from '../../src/external/cache.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl } from '../../src/external/transport.ts';

const SRC_DIR = join(import.meta.dir, '..', '..', 'src');
const EXTERNAL_DIR = join(SRC_DIR, 'external');
const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;

/**
 * THE CLOSED SET of module-level mutable Maps/Sets in src/external, each with
 * the lifecycle that justifies it. These names must also appear in
 * module_state_tripwire's ALLOWLISTED_MODULE_MAPSET — this list is the
 * subsystem-local statement of the same contract, so a reviewer reading the
 * subsystem sees it without opening the global gate.
 */
const ALLOWED_MODULE_MAPS: Readonly<Record<string, string>> = {
	// TIME-CLEARED ONLY. Keyed (service, origin); a success deletes its entry and
	// every access prunes stale ones. NEVER by session/user/lang — see breaker.ts.
	'breaker.ts:breakerStates': 'circuit state per (service, origin); cleared by success or TTL',
	// SELF-DRAINING. Slot accounting deleted the moment the last holder releases
	// with nobody waiting. Keys are a service name and a host.
	'transport.ts:concurrencySlots': 'per-(service,origin) parallelism bound; self-draining',
	// SELF-DRAINING. Each entry is deleted in the `finally` of the very fetch it
	// coalesces. Keys are cache keys, never request identity.
	'cache.ts:inFlight': 'in-flight coalescing; deleted in the finally of its own fetch',
	// SELF-DRAINING, same shape as cache.ts:inFlight and for the same reason — a
	// keystroke-driven autocomplete fires overlapping requests for one query. NOT
	// a result cache: search results are deliberately not cached at all (see the
	// header of search.ts), so this map holds only queries currently in the air.
	// Keys are a service, a section, a method and a URL — never request identity.
	'search.ts:inFlightSearches':
		'in-flight search coalescing; deleted in the finally of its own fetch',
};

/** THE CLOSED SET of module-level `let` bindings in src/external. */
const ALLOWED_MODULE_LETS: Readonly<Record<string, string>> = {
	// The guarded test seam (the media_protection pathOverridesForTests precedent).
	// Holds OPERATOR settings only; production never writes it.
	'settings.ts:overridesForTests': 'test-only settings override; null in production',
};

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function externalSources(): { relative: string; raw: string; code: string }[] {
	return [...new Glob('**/*.ts').scanSync({ cwd: EXTERNAL_DIR })].sort().map((relative) => {
		const raw = readFileSync(join(EXTERNAL_DIR, relative), 'utf8');
		return { relative, raw, code: stripComments(raw) };
	});
}

describe('module-level state is a closed, named set', () => {
	const sources = externalSources();

	test('the subsystem is actually being scanned', () => {
		expect(sources.length).toBeGreaterThanOrEqual(9);
	});

	test('every module-level Map/Set is one of the three documented ones', () => {
		// Column-0 declarations only = module scope. Readonly-typed = a frozen
		// dispatch table (the registry), not a cache.
		const pattern =
			/^(?:export )?(?:const|let|var) (\w+)(?::\s*([^=]+?))?\s*= new (?:Weak)?(?:Map|Set)\b/;
		const found: string[] = [];
		for (const file of sources) {
			for (const line of file.raw.split('\n')) {
				const match = line.match(pattern);
				if (match === null) continue;
				if ((match[2] ?? '').includes('Readonly')) continue;
				found.push(`${file.relative}:${match[1]}`);
			}
		}
		const unexpected = found.filter((entry) => !(entry in ALLOWED_MODULE_MAPS));
		expect(
			unexpected,
			'New module-level mutable Map/Set in src/external. Use createOntologyCache (invalidation-wired by construction), or add it here AND to module_state_tripwire WITH a lifecycle justification',
		).toEqual([]);
		// The list stays honest — a stale entry makes the gate look stricter than it is.
		expect([...Object.keys(ALLOWED_MODULE_MAPS)].filter((entry) => !found.includes(entry))).toEqual(
			[],
		);
	});

	test('every module-level let is one of the documented ones', () => {
		const found: string[] = [];
		for (const file of sources) {
			for (const line of file.raw.split('\n')) {
				const match = line.match(/^(?:export )?(?:let|var) (\w+)/);
				if (match !== null) found.push(`${file.relative}:${match[1]}`);
			}
		}
		expect(found.filter((entry) => !(entry in ALLOWED_MODULE_LETS))).toEqual([]);
		expect([...Object.keys(ALLOWED_MODULE_LETS)].filter((entry) => !found.includes(entry))).toEqual(
			[],
		);
	});

	test('the content caches come from the cache FACTORY, not a bare Map', () => {
		const cache = sources.find((file) => file.relative === 'cache.ts')?.code ?? '';
		const config = sources.find((file) => file.relative === 'config.ts')?.code ?? '';
		expect(/createOntologyCache</.test(cache), 'the row cache must be factory-built').toBe(true);
		expect(/createOntologyCache</.test(config), 'the api_config cache must be factory-built').toBe(
			true,
		);
	});

	test('the breaker is NOT factory-built (an ontology write must not reopen the flood)', () => {
		const breaker = sources.find((file) => file.relative === 'breaker.ts')?.code ?? '';
		expect(breaker).not.toContain('createOntologyCache');
		expect(breaker).not.toContain('createDataCache');
	});

	test('no module-level binding captures a request-scoped accessor or the install lang', () => {
		const capture =
			/^(?:export )?(?:const|let|var) \w+ *= *(?:current(?:Principal|Session|ApplicationLang|DataLang)\(|config\.menu\.)/;
		const violations: string[] = [];
		for (const file of sources) {
			for (const line of file.raw.split('\n')) {
				if (capture.test(line)) violations.push(file.relative);
			}
		}
		expect(violations).toEqual([]);
	});

	test('the data lang is read INSIDE a function, at call time', () => {
		const cache = sources.find((file) => file.relative === 'cache.ts')?.code ?? '';
		const callSite = cache.indexOf('currentDataLang()');
		expect(callSite).toBeGreaterThan(-1);
		// The call sits inside fetchExternalRows, not at module scope.
		const line = cache.slice(cache.lastIndexOf('\n', callSite) + 1, callSite);
		expect(line.startsWith('\t')).toBe(true);
	});

	test('operator settings are read through the ONE door (settings.ts)', () => {
		const violations = sources
			.filter((file) => file.relative !== 'settings.ts' && /config\.external\b/.test(file.code))
			.map((file) => file.relative);
		expect(
			violations,
			'read operator settings through externalSettings() so a scenario cannot be applied inconsistently',
		).toEqual([]);
	});

	test('production never calls the settings test seam', () => {
		const glob = new Glob('**/*.ts');
		const callers: string[] = [];
		for (const relative of glob.scanSync({ cwd: SRC_DIR })) {
			if (relative === 'external/settings.ts') continue; // its home
			if (
				readFileSync(join(SRC_DIR, relative), 'utf8').includes('overrideExternalSettingsForTests')
			) {
				callers.push(relative);
			}
		}
		expect(callers, 'the test seam must never be called from src/').toEqual([]);
	});
});

describe('behavioural — two requests never serve each other’s row', () => {
	const SECTION = 'test3';

	function trackingFetch(): { impl: ExternalFetchImpl; urls: string[] } {
		const urls: string[] = [];
		const impl: ExternalFetchImpl = async (url) => {
			urls.push(url);
			const parsed = new URL(url);
			const id = parsed.searchParams.get('id') ?? '';
			const lang = parsed.searchParams.get('lgn') ?? '';
			// The answer is DIFFERENT per lang, so a bleed is visible in the value.
			await new Promise((resolve) => setTimeout(resolve, 5));
			return new Response(
				JSON.stringify({ records: [{ id, title: `${id}/${lang}`, fields: parsed.search }] }),
				{ status: 200 },
			);
		};
		return { impl, urls };
	}

	function deps(impl: ExternalFetchImpl) {
		return {
			fetchImpl: impl,
			assertPublicUrlImpl: async (uri: string) => ({
				url: new URL(uri),
				addresses: ['141.100.1.1'],
			}),
		};
	}

	beforeEach(async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			maxConcurrency: 8,
			softTtlMs: 300_000,
		});
		resetBreakerForOrigin('zenon', ORIGIN);
		await clearOntologyDerivedCaches();
	});

	afterEach(async () => {
		await drainInFlightExternalFetches();
		overrideExternalSettingsForTests(null);
	});

	test('CONCURRENT fetches for one id in two langs keep their own rows', async () => {
		const { impl } = trackingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000200001', remoteFields: ['id', 'title'] };
		const [english, german] = await Promise.all([
			runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
				fetchExternalRows([target], { deps: deps(impl) }),
			),
			runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-deu' }, () =>
				fetchExternalRows([target], { deps: deps(impl) }),
			),
		]);
		expect(english.get(`${SECTION}|000200001`)?.row?.title).toBe('000200001/en');
		expect(german.get(`${SECTION}|000200001`)?.row?.title).toBe('000200001/de');
	});

	test('CONCURRENT fetches for one id with two field sets keep their own rows', async () => {
		const { impl } = trackingFetch();
		const [narrow, wide] = await Promise.all([
			fetchExternalRows([{ sectionTipo: SECTION, remoteId: '000200002', remoteFields: ['id'] }], {
				deps: deps(impl),
				dataLang: 'lg-eng',
			}),
			fetchExternalRows(
				[{ sectionTipo: SECTION, remoteId: '000200002', remoteFields: ['id', 'title'] }],
				{ deps: deps(impl), dataLang: 'lg-eng' },
			),
		]);
		expect(narrow.get(`${SECTION}|000200002`)?.row?.fields).not.toContain('field[]=title');
		expect(wide.get(`${SECTION}|000200002`)?.row?.fields).toContain('field[]=title');
	});
});
