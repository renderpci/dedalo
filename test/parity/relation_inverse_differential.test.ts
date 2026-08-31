/**
 * RELATIONS_SPEC.md gate 4 — the INVERSE/INDEXATION family vs live PHP,
 * driven through the surfaces BOTH engines actually serve:
 *
 * 1. CHILDREN (§6.3, get_data action): rsc680 (component_relation_children)
 *    on rsc205 §19575 — 66 real children computed from the inverse dd47
 *    question, paged 5, expanded through the component's child ddos. Plus
 *    the DATA-DRIVEN-tipo pin: hierarchy49 on test2822 §503 resolves EMPTY on
 *    BOTH engines through this generic path (the section has no ontology node
 *    for it; the tree UI flows through dd_ts_api — a separate subsystem).
 * 2. INDEXATION + TAG LINKS (§6.4, get_data action): hierarchy40
 *    (component_relation_index, source {mode:'external'}) on test2822 §1024 —
 *    the dd96 inverse locator carries tag_id/section_top anchors (the tag
 *    indexation contract) + related_list children + full count.
 * 3. RELATED transitive closure (§6.6, section read): test6137
 *    (MULTIDIRECTIONAL dd621) on test6100 §61683 — the computed `references`
 *    [{value, label}] on the edit item (a=b ∧ b=c ⇒ c=a walk + label build).
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQOs are written in `test`-TLD terms (the source geo hierarchy → test2822, numisdata4 →
// test6100, its relation_related numisdata55 → test6137; the rsc/hierarchy
// tipos are SEED-shipped and pinned, spelled through `seed()`), and the frozen
// PHP interactions are reached through `unmapRqo` (fixture lookup) +
// `adoptTipoIdMap`.
//
// KNOWN RED — CORPUS GAP, NOT A TLD BINDING (measured 2026-08-19). Every
// record these four cases need was REFUSED by the corpus derive
// (src/core/test_data/test_corpus/refused.json):
//   rsc205/19575   no_storable_component (+ its rsc680 page is a read
//                  projection, `list_projection_not_storable`)
//   test2822/1024  no_storable_component (+ hierarchy40 list projection)
//   test2822/503   never_revealed
//   test6100/61683 never_revealed ("numisdata4/self")
// So the engine has nothing to read here and the cases cannot go green until
// the corpus can speak for those records. Nothing is stubbed, skipped or
// weakened to hide it.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData, readSection } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import {
	adoptEntriesArrayContract,
	adoptTipoIdMap,
	installTokensIn,
	normalizeSectionIdTypes,
} from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/**
 * Seed-shipped ontology, spelled so the install-TLD census does not read it as
 * an install binding (the pilot's `seed()` convention).
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The cloned thesaurus section and the cloned coin-type section. */
const TREE_SECTION = 'test2822';
const TYPE_SECTION = 'test6100';
const RELATED_COMPONENT = 'test6137';
/** The corpus this gate OWNS (see the KNOWN RED note in the header). */
const CORPUS_SCOPE = [TYPE_SECTION, seed('rsc', 205)];

let php: PhpApiClient;

beforeAll(async () => {
	await ensureTestCorpus(CORPUS_SCOPE);
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
}, 60000);

afterAll(async () => {
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
});

/** Comparable projection (identity + payload + computed references). */
function itemProjection(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_id: item.section_id,
		mode: item.mode,
		from_component_tipo: item.from_component_tipo,
		entries: item.entries ?? null,
		pagination: item.pagination ?? null,
		references: item.references ?? null,
	};
}

function getDataRqo(
	model: string,
	tipo: string,
	sectionTipo: string,
	sectionId: string,
	limit: number,
): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			action: 'get_data',
			model,
			tipo,
			section_tipo: sectionTipo,
			section_id: sectionId,
			mode: 'edit',
			lang: 'lg-nolan',
		},
		sqo: { section_tipo: [sectionTipo], limit, offset: 0 },
	};
}

/** Drive one get_data on both engines and project ALL returned items. */
async function compareGetData(rqo: Record<string, unknown>): Promise<{
	php: unknown[];
	ts: unknown[];
}> {
	const { body } = await php.call(structuredClone(rqo));
	// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
	// test-TLD terms. `detail === null` is `matched === true` carrying its own
	// reason; the id resolutions are the anti-vacuity floor.
	const adopted = adoptTipoIdMap(body, 'relation_inverse_differential');
	expect(adopted.detail).toBeNull();
	expect(adopted.matched).toBe(true);
	expect(adopted.rewrites.ids).toBeGreaterThan(0);
	// WC-001 (unified []): rewrite the PHP side only (see engineering/wire_contract/).
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	const phpItems = normalizeSectionIdTypes(
		adoptEntriesArrayContract(
			(adopted.body.result as { data?: Record<string, unknown>[] })?.data ?? [],
		).map(itemProjection),
	);
	const tsItems = normalizeSectionIdTypes(
		(
			(await readComponentData(structuredClone(rqo) as unknown as Rqo)) as Record<string, unknown>[]
		).map(itemProjection),
	);
	return { php: phpItems, ts: tsItems };
}

describe.if(hasPhpCredentials())('inverse/indexation family differential (spec gate 4)', () => {
	test('children get_data: relation_children on the seed bibliography §19575 — computed page + full count + subdatum', async () => {
		const rqo = getDataRqo(
			'component_relation_children',
			seed('rsc', 680),
			seed('rsc', 205),
			'19575',
			5,
		);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		expect(tsItems.length).toBeGreaterThan(1); // own item + expanded children
		expect(tsItems).toEqual(phpItems as never);
	});

	test('children get_data on a DATA-DRIVEN tipo (§503): EMPTY on both engines (pinned)', async () => {
		const rqo = getDataRqo('component_relation_children', 'hierarchy49', TREE_SECTION, '503', 5);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		// The section has no ontology node for it: the generic path resolves no table/children
		// on EITHER engine (the tree resolves via dd_ts_api). Pin the parity so
		// a PHP behavior change surfaces loudly.
		expect(tsItems).toEqual(phpItems as never);
	});

	test('indexation get_data: relation_index on the cloned tree §1024 — tag-carrying dd96 inverse page', async () => {
		const rqo = getDataRqo('component_relation_index', 'hierarchy40', TREE_SECTION, '1024', 5);
		const { php: phpItems, ts: tsItems } = await compareGetData(rqo);
		expect(tsItems.length).toBeGreaterThan(0);
		// The inverse locator MUST surface the tag anchors (tag_id +
		// section_top_id/tipo + from_component_top_tipo) — the stored
		// tag-indexation contract read back through the inverse machinery.
		const ownItem = tsItems.find((item) => (item as { tipo?: unknown }).tipo === 'hierarchy40') as
			| { entries?: { tag_id?: unknown }[] }
			| undefined;
		expect(ownItem?.entries?.[0]?.tag_id).toBeDefined();
		expect(tsItems).toEqual(phpItems as never);
	});

	test('relation_related MULTIDIRECTIONAL: §61683 computed references on the edit item', async () => {
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model: 'section',
				tipo: TYPE_SECTION,
				section_tipo: TYPE_SECTION,
				mode: 'edit',
				lang: 'lg-spa',
				action: 'search',
			},
			sqo: {
				section_tipo: [TYPE_SECTION],
				limit: 1,
				offset: 0,
				filter_by_locators: [{ section_tipo: TYPE_SECTION, section_id: '61683' }],
			},
			show: {
				ddo_map: [{ tipo: RELATED_COMPONENT, section_tipo: 'self', parent: 'self', mode: 'edit' }],
			},
		};
		const { body } = await php.call(structuredClone(rqo));
		// WC-2026-08-19-test-tld-replay (see compareGetData above).
		// THE ONE TOKEN THE CLONE HAS NO TWIN FOR: the install AREA node ABOVE
		// the cloned section (the closure that built the `test` TLD stops at the
		// section root), carried by `context[0].parent_grouper`. This case
		// compares `data[]` only — the context shape is context_differential's
		// subject, and that gate asserts both sides of this seam explicitly. The
		// reduction is PROVED, not trusted, and WITHOUT naming the install token
		// (a test file that spells one binds it): exactly one token survives, it
		// IS the section entry's parent, and the compared subtree carries none.
		const adoptedRelated = adoptTipoIdMap(body, 'relation_inverse_differential');
		expect(adoptedRelated.kind).toBe('install_tipo_left');
		expect(adoptedRelated.leftovers).toHaveLength(1);
		expect(
			(adoptedRelated.body.result as { context?: Record<string, unknown>[] })?.context?.[0]
				?.parent_grouper,
		).toBe(adoptedRelated.leftovers[0]);
		expect(adoptedRelated.rewrites.tipos).toBeGreaterThan(0);
		expect(
			installTokensIn(
				(adoptedRelated.body.result as { data?: Record<string, unknown>[] })?.data ?? [],
			),
		).toEqual([]);
		// WC-001 (unified []): rewrite the PHP side only (see engineering/wire_contract/).
		// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
		const phpItems = normalizeSectionIdTypes(
			adoptEntriesArrayContract(
				(adoptedRelated.body.result as { data?: Record<string, unknown>[] })?.data ?? [],
			)
				.filter((item) => item.tipo === RELATED_COMPONENT)
				.map(itemProjection),
		);
		const tsResult = await readSection(structuredClone(rqo) as unknown as Rqo);
		const tsItems = normalizeSectionIdTypes(
			(tsResult.data as Record<string, unknown>[])
				.filter((item) => item.tipo === RELATED_COMPONENT)
				.map(itemProjection),
		);
		expect(
			((tsItems[0] as { references?: unknown[] } | undefined)?.references ?? []).length,
		).toBeGreaterThan(0);
		expect(tsItems).toEqual(phpItems as never);
	});
});
