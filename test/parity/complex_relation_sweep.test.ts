/**
 * Phase 6 gate: COMPLEX RELATION COMPONENT sweep vs live PHP — the
 * user-nominated set of components with heterogeneous request_configs:
 *
 *   test6100.test6230        autocomplete        (rc: types)
 *   test6100.test6137        relation_related    (no rc)
 *   testmint1.testmint1006   autocomplete_hi     (rc: hierarchy_types)
 *   testmint1.testmint1014   portal              (rc: bibliography)
 *   test6099.test6157        portal              (rc: coins)
 *   rsc167.rsc860            autocomplete_hi     (rc: indexation, seed-shipped)
 *   rsc197.rsc1435           portal              (rc; NO stored data — both
 *                            engines must agree on the empty case; seed-shipped)
 *   testcult1.testcult1036   autocomplete        (rc; thesaurus section)
 *   testcult1.testcult1020   relation_index      (source.mode external —
 *                            computed inverse indexations)
 *
 * For each pair, a LIST-mode section read (2 pinned records with data) —
 * every emitted item compared on the normalized read fields.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// Every case is written in `test`-TLD terms (the two seed-shipped sections are
// PINNED and spelled through `seed()`), and the frozen PHP interactions are
// reached through `unmapRqo` (fixture lookup) + `adoptTipoIdMap`. The thesaurus
// components are SECTION-SCOPED clones (`cult1@hierarchy93` → testcult1036),
// because the twenty-two synthetic thesauri were twinned from one subtree.
// The records come from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import {
	adoptEntriesArrayContract,
	adoptTipoIdMap,
	installTokensIn,
	normalizeSectionIdTypes,
} from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

interface SweepCase {
	section: string;
	component: string;
	ids: string[];
	/**
	 * A LEDGERED designed-empty fixture: the component has NO stored data on
	 * either engine, so the parity contract is "both agree the component is
	 * empty" — the item-level non-empty floor (which guards against a VANISHED
	 * fixture) is skipped, but the envelope-entries equality below still runs,
	 * so the case cannot pass on a truly empty read (the pinned records must
	 * still be present in the envelope).
	 */
	emptyByDesign?: boolean;
}

/**
 * Seed-shipped ontology, spelled so the install-TLD census does not read it as
 * an install binding (the pilot's `seed()` convention).
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

const CASES: SweepCase[] = [
	{ section: 'test6100', component: 'test6230', ids: ['1', '2'] },
	{ section: 'test6100', component: 'test6137', ids: ['6', '7'] },
	{ section: 'testmint1', component: 'testmint1006', ids: ['2', '3'] },
	{ section: 'testmint1', component: 'testmint1014', ids: ['2', '3'] },
	{ section: 'test6099', component: 'test6157', ids: ['1', '2'] },
	{ section: seed('rsc', 167), component: seed('rsc', 860), ids: ['1', '2'] },
	{
		section: seed('rsc', 197),
		component: seed('rsc', 1435),
		ids: ['1', '2'],
		emptyByDesign: true,
	},
	{ section: 'testcult1', component: 'testcult1036', ids: ['1', '2'] },
	{ section: 'testcult1', component: 'testcult1020', ids: ['1', '2'] },
	// autocomplete WITH DATAFRAME data on both main and frame (user fixture):
	// test6744 dd490 entries paired by id_key + main_component_tipo, and the
	// frame's config child (rsc1246, mode edit) at the paired target.
	{ section: 'test6099', component: 'test6117', ids: ['15657', '15446'] },
];

/**
 * THE ONE INSTALL TOKEN THE CLONE HAS NO TWIN FOR. The closure that built the
 * `test` TLD stops at the SECTION root, so a frozen body can still name the
 * install AREA node ABOVE it — here `numisdata1`, carried by
 * `context[0].parent_grouper` of the numisdata-descended reads. This gate
 * compares `data[]` only (the context shape is context_differential's subject,
 * and that gate asserts both sides of this seam explicitly), and the reduction
 * is proved rather than trusted: the COMPARED subtree is asserted to carry NO
 * install token at all, the leftover set of every case is asserted to be this
 * token and nothing else, and at least one case must actually carry it (a
 * declaration that matches nothing is a stale exemption).
 */
let unclonedAreaSeen = false;

/** The corpus this gate OWNS: every section it reads, plus the sections the
 * compared relation values point INTO (the values are locators; a target the
 * corpus does not hold resolves to nothing on the TS side). */
const CORPUS_SCOPE = [...new Set(CASES.map((sweep) => sweep.section)), seed('rsc', 205)];

function readRqo(sweep: SweepCase): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: sweep.section,
			section_tipo: sweep.section,
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: [sweep.section],
			limit: 2,
			offset: 0,
			filter_by_locators: sweep.ids.map((id) => ({
				section_tipo: sweep.section,
				section_id: id,
			})),
			order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
		},
		show: {
			ddo_map: [
				{
					tipo: sweep.component,
					section_tipo: sweep.section,
					parent: sweep.section,
					mode: 'list',
				},
			],
		},
	};
}

function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		pagination: item.pagination ?? null,
	};
}

const phpBySweep = new Map<string, Record<string, unknown>[]>();
const tsBySweep = new Map<string, Record<string, unknown>[]>();

beforeAll(async () => {
	await ensureTestCorpus(CORPUS_SCOPE);
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	const loggedIn = await php.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	if (!loggedIn) throw new Error('PHP login failed');
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);

	for (const sweep of CASES) {
		const key = `${sweep.section}.${sweep.component}`;
		const rawBody = (await php.call(readRqo(sweep))).body;
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
		// test-TLD terms. `detail === null` is `matched === true` carrying its
		// own reason; the id resolutions are the anti-vacuity floor.
		const adopted = adoptTipoIdMap(rawBody, 'complex_relation_sweep');
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		expect(['adopted', 'install_tipo_left']).toContain(adopted.kind);
		// At most ONE token may survive, and it must BE the section entry's
		// parent — never spelled here (a test file that names an install tipo
		// binds it), always proved against the body it came from.
		expect(adopted.leftovers.length).toBeLessThan(2);
		if (adopted.leftovers.length === 1) {
			const frozenContext =
				(adopted.body as { result?: { context?: Record<string, unknown>[] } }).result?.context ??
				[];
			expect(frozenContext[0]?.parent_grouper).toBe(adopted.leftovers[0]);
			unclonedAreaSeen = true;
		}
		const phpBody = adopted.body as {
			result?: { data?: unknown[] } | false;
		};
		// Fail LOUD on a failed PHP call — result:false must never degrade to an
		// empty array (empty-vs-empty would pass degenerately).
		if (phpBody.result === false || phpBody.result === undefined || phpBody.result === null) {
			throw new Error(`PHP read failed for ${key}: ${JSON.stringify(phpBody).slice(0, 300)}`);
		}
		// WC-001 (unified []): PHP emits entries:null for empty values; the TS
		// engine emits [] for EVERY model. Rewrite the PHP side only.
		// WC-2026-08-10-section-id-int-canonical: address-shaped keys compared by
		// VALUE, both sides (fixtures carry the PHP-era numeric strings).
		// The COMPARED surface must be install-free after the walk: whatever the
		// context carries, `data[]` is fully expressed in test-TLD terms.
		expect(installTokensIn(phpBody.result.data ?? [])).toEqual([]);
		phpBySweep.set(
			key,
			normalizeSectionIdTypes(
				adoptEntriesArrayContract((phpBody.result.data ?? []) as Record<string, unknown>[]),
			),
		);

		try {
			const tsResult = await dispatchRqo(
				readRqo(sweep) as never,
				{
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				} as never,
			);
			// WC-2026-08-10-section-id-int-canonical: same transform on the live side.
			tsBySweep.set(
				key,
				normalizeSectionIdTypes(
					((tsResult.body as { data?: { data?: unknown[] } }).data?.data ?? []) as Record<
						string,
						unknown
					>[],
				),
			);
		} catch (error) {
			tsBySweep.set(key, [{ __ts_error: error instanceof Error ? error.message : String(error) }]);
		}
	}
}, 120000);

afterAll(async () => {
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
});

describe.if(hasPhpCredentials())('complex relation component sweep (list mode)', () => {
	test('the declared uncloned area token is actually exercised', () => {
		expect(unclonedAreaSeen).toBe(true);
	});

	for (const sweep of CASES) {
		const key = `${sweep.section}.${sweep.component}`;
		test(`${key} items match PHP`, () => {
			const phpData = phpBySweep.get(key) ?? [];
			const tsData = tsBySweep.get(key) ?? [];
			const tsError = (tsData[0] as { __ts_error?: string } | undefined)?.__ts_error;
			if (tsError !== undefined) {
				throw new Error(`TS read failed: ${tsError}`);
			}
			// Envelope entries must match exactly — on the fields PHP emits.
			// WC-2026-08-17-list-row-selectability-declared: the TS row entries
			// carry one ADDITIVE key PHP never emitted (`selectability_declared`,
			// stamped on every row of a section that declares no per-term
			// contract), so the TS entries are projected onto the frozen keys and
			// the added key is asserted PRESENT rather than quietly dropped
			// (the read_differential pattern).
			const phpEntries = ((phpData[0] as { entries?: Record<string, unknown>[] })?.entries ??
				[]) as Record<string, unknown>[];
			const tsEntries = ((tsData[0] as { entries?: Record<string, unknown>[] })?.entries ??
				[]) as Record<string, unknown>[];
			expect(phpEntries.length).toBeGreaterThan(0);
			const frozenKeys = Object.keys(phpEntries[0] as Record<string, unknown>);
			expect(
				tsEntries.map((entry) => Object.fromEntries(frozenKeys.map((key) => [key, entry[key]]))),
			).toEqual(phpEntries);
			for (const entry of tsEntries) {
				expect(typeof entry.selectability_declared).toBe('boolean');
			}
			// Items: same key set, each equal on normalized fields.
			const keyOf = (item: Record<string, unknown>): string =>
				`${item.row_section_id}|${item.tipo}|${item.section_id}`;
			const phpByKey = new Map(phpData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			const tsByKey = new Map(tsData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			// Non-empty floor: a vanished fixture must redden, not compare 0
			// items — EXCEPT the ledgered designed-empty case, whose contract is
			// exactly the empty component (the envelope-entries equality above
			// already proved the pinned records are present, so this case still
			// cannot pass on a truly empty read).
			if (!sweep.emptyByDesign) {
				expect(phpByKey.size).toBeGreaterThan(0);
			}
			expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
			for (const [itemKey, phpItem] of phpByKey) {
				expect(tsByKey.get(itemKey)).toEqual(phpItem);
			}
		});
	}
});
