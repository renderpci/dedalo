/**
 * Standing concurrency-interleave test — the persistent-runtime discipline
 * invariant (spec §4 request isolation): concurrent requests with DIFFERENT
 * users/principals AND DIFFERENT languages must never observe each other's
 * request-scoped state. Any module-level state leak (a cached principal, a
 * shared mutable "current user"/lang) makes this fail nondeterministically —
 * run it on every merge.
 *
 * Three layers:
 *  1. MECHANISM (deterministic, no DB): the request-context + language ALS
 *     scopes that dispatchRqo opens keep the principal and langs isolated across
 *     concurrent, interleaved async trees. This is the direct proof of the §4
 *     invariant for the seeded principal.
 *  2. DISPATCH INTEGRATION (deterministic, Postgres-free): two concurrent
 *     authenticated requests through the REAL dispatchRqo path (gates → seed →
 *     scope open → handler) mutate only their own session — no cross-request
 *     bleed at the actual chokepoint.
 *  3. RESOLVER lang read (DB-backed): interleaved lg-spa/lg-eng section reads
 *     each carry their own request's language and values.
 *  4. GRID-COLUMNS cache (DB-backed, S1-12): the descriptor-grid column cache
 *     is keyed by the application lang and hub-cleared — a Spanish-first
 *     process must serve English labels to a later lg-eng request.
 *  5. TOOLS REGISTRY cache (DB-backed, S1-13): getElementTools resolves labels
 *     per call from lang-independent cached rows — an lg-eng request after an
 *     lg-spa build must receive English labels, never cache-owned objects.
 */

import { describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolveGridColumns } from '../../src/core/components/component_info/widgets/grid.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	currentApplicationLang,
	currentDataLang,
	runWithRequestLangs,
} from '../../src/core/resolve/request_lang.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	currentPrincipal,
	runWithRequestContext,
} from '../../src/core/security/request_context.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { getElementTools, resetRegistryCache } from '../../src/core/tools/registry.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

// --- Layer 1: mechanism (the seeded principal + langs never bleed) ----------

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const USER: Principal = { userId: 42, isGlobalAdmin: false, isDeveloper: false };

/**
 * Run inside the same nested scopes dispatchRqo opens, then repeatedly yield to
 * the event loop and assert the accessors STILL return this branch's values —
 * so a concurrent branch with a different principal/lang cannot corrupt them.
 */
async function isolatedProbe(
	principal: Principal,
	langs: { applicationLang: string; dataLang: string },
	rounds: number,
): Promise<number | undefined> {
	return runWithRequestContext(
		{ principal, session: null, requestId: `r-${principal.userId}`, clientIp: 'x' },
		() =>
			runWithRequestLangs(langs, async () => {
				for (let round = 0; round < rounds; round++) {
					await Promise.resolve();
					await new Promise((resolve) => setTimeout(resolve, 0)); // yield: force interleave
					expect(currentPrincipal()?.userId).toBe(principal.userId);
					expect(currentPrincipal()?.isGlobalAdmin).toBe(principal.isGlobalAdmin);
					expect(currentApplicationLang()).toBe(langs.applicationLang);
					expect(currentDataLang()).toBe(langs.dataLang);
				}
				return currentPrincipal()?.userId;
			}),
	);
}

describe('request isolation — mechanism (principal + langs)', () => {
	test('concurrent interleaved requests with different principals + langs never bleed', async () => {
		const [adminResult, userResult] = await Promise.all([
			isolatedProbe(ADMIN, { applicationLang: 'lg-spa', dataLang: 'lg-spa' }, 40),
			isolatedProbe(USER, { applicationLang: 'lg-eng', dataLang: 'lg-cat' }, 40),
		]);
		expect(adminResult).toBe(-1);
		expect(userResult).toBe(42);
	}, 30000);

	test('accessors fall back to install defaults outside any request scope', () => {
		expect(currentPrincipal()).toBeUndefined();
		expect(typeof currentApplicationLang()).toBe('string');
	});
});

// --- Layer 2: dispatch integration (the real chokepoint isolates per session) --

function changeLangRqo(applicationLang: string): Rqo {
	return {
		action: 'change_lang',
		dd_api: 'dd_utils_api',
		options: { dedalo_application_lang: applicationLang },
	} as unknown as Rqo;
}

function contextForToken(token: string): ApiRequestContext {
	const session = getSession(token);
	return {
		requestId: token.slice(0, 6),
		clientIp: 'local',
		session,
		sessionToken: token,
		csrfCandidate: session?.csrfToken ?? null,
	};
}

describe('request isolation — dispatch integration', () => {
	test('two concurrent change_lang requests through dispatchRqo mutate only their own session', async () => {
		// Two distinct authenticated sessions (root resolves the principal in
		// memory — Postgres-free). Each drives change_lang to a DIFFERENT interface
		// language through the full gate → seed → scope path, concurrently.
		const tokenA = createSession(-1, 'rootA', true);
		const tokenB = createSession(-1, 'rootB', true);
		await Promise.all([
			dispatchRqo(changeLangRqo('lg-eng'), contextForToken(tokenA)),
			dispatchRqo(changeLangRqo('lg-cat'), contextForToken(tokenB)),
		]);
		// No cross-request bleed: each session persisted only its own choice.
		expect(getSession(tokenA)?.applicationLang).toBe('lg-eng');
		expect(getSession(tokenB)?.applicationLang).toBe('lg-cat');
	});
});

// --- Layer 3: resolver-level lang read (DB-backed) --------------------------

function buildReadRqo(lang: string): Rqo {
	return {
		action: 'read',
		source: {
			model: 'section',
			tipo: 'numisdata6',
			section_tipo: 'numisdata6',
			mode: 'list',
			lang,
			action: 'search',
		},
		sqo: { section_tipo: ['numisdata6'], limit: 3, offset: 0 },
		show: {
			ddo_map: [{ tipo: 'numisdata16', section_tipo: 'self', parent: 'self', mode: 'list', lang }],
		},
	} as unknown as Rqo;
}

describe('request isolation — resolver lang read', () => {
	test('10 interleaved rounds of lg-spa vs lg-eng reads never cross-contaminate', async () => {
		const rounds = Array.from({ length: 10 }, async () => {
			const [spanishData, englishData] = await Promise.all([
				readSectionRows(buildReadRqo('lg-spa')),
				readSectionRows(buildReadRqo('lg-eng')),
			]);
			for (const item of spanishData.slice(1) as Record<string, unknown>[]) {
				expect(item.lang).toBe('lg-spa');
				for (const entry of (item.entries as { lang: string }[] | null) ?? []) {
					expect(entry.lang).toBe('lg-spa');
				}
			}
			for (const item of englishData.slice(1) as Record<string, unknown>[]) {
				expect(item.lang).toBe('lg-eng');
				for (const entry of (item.entries as { lang: string }[] | null) ?? []) {
					expect(entry.lang).toBe('lg-eng');
				}
			}
		});
		await Promise.all(rounds);
	}, 30000);
});

// --- Layer 4: grid-columns cache — application-lang keyed + hub-cleared (S1-12) --

/**
 * rsc860 is the descriptors-grid component the oh87 widget targets: its
 * request_config carries show.get_ddo_map {model:'section_map'}, so its
 * dynamic columns resolve section_map term labels in the APPLICATION lang.
 * Ontology-only — no oral-history record data is needed to resolve columns.
 */
const GRID_COMPONENT = 'rsc860';
const GRID_OWNER_SECTION = 'oh1';

function gridLabels(lang: string): Promise<string[]> {
	return runWithRequestLangs({ applicationLang: lang, dataLang: lang }, async () =>
		(await resolveGridColumns(GRID_COMPONENT, GRID_OWNER_SECTION)).map((column) => column.label),
	);
}

describe('request isolation — grid-columns cache (S1-12)', () => {
	test('lg-eng after an lg-spa build receives English labels (no first-lang poisoning)', async () => {
		// Spanish FIRST so its build populates the cache before English asks.
		const spanish = await gridLabels('lg-spa');
		const english = await gridLabels('lg-eng');
		expect(spanish).toContain('Término');
		expect(english).toContain('Term');
		expect(english).not.toContain('Término');

		// Interleaved rounds: concurrent requests stay isolated too.
		await Promise.all([
			(async () => expect(await gridLabels('lg-spa')).toEqual(spanish))(),
			(async () => expect(await gridLabels('lg-eng')).toEqual(english))(),
		]);
	}, 30000);

	test('the cache is registered with the ontology invalidation hub', async () => {
		const before = await runWithRequestLangs(
			{ applicationLang: 'lg-spa', dataLang: 'lg-spa' },
			() => resolveGridColumns(GRID_COMPONENT, GRID_OWNER_SECTION),
		);
		const cachedAgain = await runWithRequestLangs(
			{ applicationLang: 'lg-spa', dataLang: 'lg-spa' },
			() => resolveGridColumns(GRID_COMPONENT, GRID_OWNER_SECTION),
		);
		expect(cachedAgain).toBe(before); // cache hit: same array identity

		await clearOntologyDerivedCaches();
		const after = await runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
			resolveGridColumns(GRID_COMPONENT, GRID_OWNER_SECTION),
		);
		expect(after).not.toBe(before); // hub fire dropped the entry → rebuilt
		expect(after).toEqual(before);
	}, 30000);
});

// --- Layer 5: tools registry — labels resolve per call, per request (S1-13) --

describe('request isolation — tools registry cache (S1-13)', () => {
	// A translatable text component: matches tool_time_machine via all_components
	// through the PRODUCTION entry (structure_context stamps entry.tools with this).
	const target = {
		model: 'component_input_text',
		tipo: 'oh24',
		isComponent: true,
		translatable: true,
		toolConfigKeys: [],
	};

	function toolLabel(tools: { name: string; label: string }[], name: string): string | undefined {
		return tools.find((tool) => tool.name === name)?.label;
	}

	test('lg-eng after an lg-spa cache build receives English labels', async () => {
		resetRegistryCache(); // the lg-spa request below performs the build
		const spanish = await runWithRequestLangs(
			{ applicationLang: 'lg-spa', dataLang: 'lg-spa' },
			() => getElementTools(target),
		);
		expect(toolLabel(spanish.tools, 'tool_time_machine')).toBe('Máquina del tiempo');

		const english = await runWithRequestLangs(
			{ applicationLang: 'lg-eng', dataLang: 'lg-eng' },
			() => getElementTools(target),
		);
		expect(toolLabel(english.tools, 'tool_time_machine')).toBe('Time machine');
	}, 30000);

	test('callers receive fresh objects, never the cache-owned entries', async () => {
		const [first, second] = await Promise.all([
			runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
				getElementTools(target),
			),
			runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
				getElementTools(target),
			),
		]);
		expect(first.tools.length).toBeGreaterThan(0);
		expect(first.tools.map((tool) => tool.name)).toEqual(second.tools.map((tool) => tool.name));
		for (const [index, tool] of first.tools.entries()) {
			expect(tool).not.toBe(second.tools[index] as object); // per-call copies
			expect(tool).toEqual(second.tools[index] as typeof tool); // same content
		}
	}, 30000);
});
