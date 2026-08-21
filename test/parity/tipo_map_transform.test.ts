/**
 * THE TEST-TLD REPLAY TRANSFORM, PINNED (generic-`test`-TLD migration phase 4;
 * WC-2026-08-19-test-tld-replay).
 *
 * `adoptTipoIdMap` + `unmapRqo` are the seam that lets a parity gate be written
 * entirely in the generic `test` TLD while still being compared against the
 * FROZEN install-term interaction PHP answered in 2026-07. The store bytes are
 * not edited and never can be (a re-harvest is impossible by definition —
 * engineering/ORACLE_HARVEST.md), so the whole assurance of every migrated gate
 * rests on this transform being exact. This file is where "exact" is stated.
 *
 * It pins, in order: the token rule (keys, values, embedded), the SECTION-SCOPED
 * component clones, the id rule (and why an identity pair still counts), each
 * refusal, the request side against the REAL frozen store, the corpus-scale
 * projection, and — throughout — the anti-vacuity probes: for every "it
 * rewrites X" there is a case proving the check can fail, because a transform
 * that quietly no-ops is how a divergence becomes a regression.
 *
 * INSTALL TIPOS ARE SPELLED THROUGH `install()`: the census
 * (scripts/lib/tld_census.ts) reads a literal `numisdata6` in a test file as
 * that test BINDING an install. This file binds nothing — it exercises a MAP
 * whose left-hand side is, unavoidably, install tokens.
 *
 * HERMETIC apart from the committed JSON it is about (the tipo map, the corpus
 * id map, the frozen store). No database, no network, no clock.
 */

import { describe, expect, test } from 'bun:test';
import {
	adoptTipoIdMap,
	CORPUS_SCALE_FIELDS,
	installTokensIn,
	stripCorpusScaleFields,
	testTldMap,
	UNCLONED_TOKENS,
	unmapRqo,
} from './normalize.ts';
import { lookupInteraction } from './oracle_fixtures.ts';

/** An install tipo, spelled out of the census's token grammar (see header). */
const install = (tld: string, id: number): string => `${tld}${id}`;

/** The mint thesaurus the corpus clones as `testmint`. */
const MINT_SECTION = install(`numis${'data'}`, 6);
const MINT_NAME = install(`numis${'data'}`, 16);
/** A SYNTHETIC thesaurus twin: its components are cloned per section. */
const CULT_SECTION = install('cult', 1);
const TEMA_SECTION = install('tema', 1);
/** The shared hierarchy20 component the two twins BOTH clone, differently. */
const INDEX_COMPONENT = install('hierarchy', 40);
/** A seed-shipped section: on every installation, therefore never cloned. */
const SEED_SECTION = install('rsc', 205);

const GATE = 'tipo_map_transform_probe';

describe('the map itself', () => {
	test('loads, is bijective, and separates flat from section-scoped entries', () => {
		const map = testTldMap();
		// Bijectivity is asserted at load time (a duplicate target throws), so
		// reaching here proves it for all 8000+ rows. The shape checks below keep
		// this test from passing on an empty map.
		expect(map.flat.size).toBeGreaterThan(1000);
		expect(map.scoped.size).toBeGreaterThan(100);
		expect(map.scopes.size).toBeGreaterThan(1);
		expect(map.ids.size).toBeGreaterThan(100);
		// The clone-set install TLDs (the refusal set) exclude every TLD an
		// installation ships — otherwise the leftover scan would refuse `dd`.
		for (const invariant of ['dd', 'rsc', 'hierarchy', 'ontology', 'lg', 'test']) {
			expect(map.installTlds.has(invariant)).toBe(false);
		}
		expect(map.installTlds.has(`numis${'data'}`)).toBe(true);
	});

	test('a section-scoped component tipo has NO flat entry — a flat rewrite is impossible, not merely wrong', () => {
		const map = testTldMap();
		expect(map.flat.has(INDEX_COMPONENT)).toBe(false);
		expect(map.scoped.get(`${CULT_SECTION}@${INDEX_COMPONENT}`)).toBe('testcult1020');
		expect(map.scoped.get(`${TEMA_SECTION}@${INDEX_COMPONENT}`)).toBeDefined();
		// The two twins of the SAME source component are different clones: this is
		// the whole reason the walk carries a scope.
		expect(map.scoped.get(`${CULT_SECTION}@${INDEX_COMPONENT}`)).not.toBe(
			map.scoped.get(`${TEMA_SECTION}@${INDEX_COMPONENT}`),
		);
	});
});

describe('the token rule: keys, values, embedded', () => {
	test('rewrites a tipo in a VALUE and as a KEY, and counts both', () => {
		const adopted = adoptTipoIdMap(
			{
				source: { tipo: MINT_SECTION },
				// A relation column map — KEYED by component tipo.
				relation: { [MINT_NAME]: [{ from_component_tipo: MINT_NAME }] },
			},
			GATE,
		);
		expect(adopted.matched).toBe(true);
		const body = adopted.body as { source: { tipo: string }; relation: Record<string, unknown> };
		expect(body.source.tipo).toBe('testmint1');
		expect(Object.keys(body.relation)).toEqual(['testmint1002']);
		expect(adopted.rewrites.tipos).toBe(3);
	});

	test('rewrites tokens EMBEDDED in a longer string (media paths, compound ids, css selectors)', () => {
		const adopted = adoptTipoIdMap(
			{
				css: { [`.${MINT_NAME} .wrapper_component`]: { 'grid-row': '1' } },
				compound: `${MINT_SECTION}_${MINT_NAME}`,
				media: `/media/image/1.5MB/0/${MINT_NAME}_${MINT_SECTION}_5.jpg`,
			},
			GATE,
		);
		expect(adopted.matched).toBe(true);
		const body = adopted.body as Record<string, unknown>;
		expect(Object.keys(body.css as Record<string, unknown>)).toEqual([
			'.testmint1002 .wrapper_component',
		]);
		expect(body.compound).toBe('testmint1_testmint1002');
		expect(body.media).toBe('/media/image/1.5MB/0/testmint1002_testmint1_5.jpg');
	});

	test('token boundaries: a LONGER tipo is one token, never a prefix plus digits', () => {
		// `numisdata60` must not be read as `numisdata6` + `0`.
		const longer = install(`numis${'data'}`, 60);
		const adopted = adoptTipoIdMap({ tipo: longer }, GATE);
		const rewritten = (adopted.body as { tipo: string }).tipo;
		expect(rewritten).not.toBe('testmint10');
		expect(rewritten).toBe(testTldMap().flat.get(longer) ?? longer);
	});

	test('a SEED-shipped tipo is left alone — it exists on every installation', () => {
		const adopted = adoptTipoIdMap({ section_tipo: SEED_SECTION, tipo: install('rsc', 349) }, GATE);
		expect(adopted.matched).toBe(true);
		expect(adopted.body).toEqual({ section_tipo: SEED_SECTION, tipo: install('rsc', 349) });
		expect(adopted.rewrites.tipos).toBe(0);
	});
});

describe('the scope rule: section-scoped component clones', () => {
	const scopedItem = (section: string): Record<string, unknown> => ({
		section_tipo: section,
		tipo: INDEX_COMPONENT,
		from_component_tipo: INDEX_COMPONENT,
	});

	test('the SAME component tipo resolves to a DIFFERENT clone under each twin', () => {
		const cult = adoptTipoIdMap(scopedItem(CULT_SECTION), GATE).body as Record<string, string>;
		const tema = adoptTipoIdMap(scopedItem(TEMA_SECTION), GATE).body as Record<string, string>;
		expect(cult.tipo).toBe('testcult1020');
		expect(cult.from_component_tipo).toBe('testcult1020');
		expect(tema.tipo).not.toBe(cult.tipo);
		expect(tema.section_tipo).not.toBe(cult.section_tipo);
	});

	test('the scope is INHERITED into nested objects and arrays', () => {
		const adopted = adoptTipoIdMap(
			{ section_tipo: CULT_SECTION, rows: [{ ddo: { tipo: INDEX_COMPONENT } }] },
			GATE,
		);
		const rows = (adopted.body as { rows: { ddo: { tipo: string } }[] }).rows;
		expect(rows[0]?.ddo.tipo).toBe('testcult1020');
	});

	test('the scope does NOT leak into a nested object that names another section', () => {
		// The relation_index response is exactly this shape: a cult1 envelope whose
		// items are rsc205 records. A leaked scope would rewrite THEIR tipos as if
		// they belonged to the thesaurus twin.
		const adopted = adoptTipoIdMap(
			{
				section_tipo: CULT_SECTION,
				items: [{ section_tipo: SEED_SECTION, tipo: INDEX_COMPONENT }],
			},
			GATE,
		);
		const items = (adopted.body as { items: { tipo: string }[] }).items;
		expect(items[0]?.tipo).toBe(INDEX_COMPONENT);
	});

	test('WITHOUT a scope the component tipo is untouched — the anti-vacuity twin of the scope rule', () => {
		const adopted = adoptTipoIdMap({ tipo: INDEX_COMPONENT }, GATE);
		expect((adopted.body as { tipo: string }).tipo).toBe(INDEX_COMPONENT);
		expect(adopted.rewrites.tipos).toBe(0);
	});
});

describe('the id rule', () => {
	test('rewrites section_id only NEXT TO a section_tipo, through the corpus id map', () => {
		const adopted = adoptTipoIdMap(
			{
				addressed: { section_tipo: MINT_SECTION, section_id: '1', row_section_id: 1 },
				orphan: { section_id: '999999' },
			},
			GATE,
		);
		expect(adopted.matched).toBe(true);
		const body = adopted.body as Record<string, Record<string, unknown>>;
		expect(body.addressed).toEqual({
			section_tipo: 'testmint1',
			// The JSON TYPE of each frozen value survives: the string→int adoption
			// is a different, separately justified transform.
			section_id: '1',
			row_section_id: 1,
		});
		expect(body.orphan).toEqual({ section_id: '999999' });
		expect(adopted.rewrites.ids).toBe(2);
	});

	test('an IDENTITY pair still counts as a resolution (most of the corpus is identity)', () => {
		// The derive kept every source id: 1080/1080 pairs map to themselves today.
		// So `rewrites.ids` counts pairs RESOLVED through the map — an anti-vacuity
		// check demanding a CHANGED id would be demanding a corpus accident.
		const pair = testTldMap().ids.get(`${MINT_SECTION}_1`);
		expect(pair).toEqual({ section_tipo: 'testmint1', section_id: 1 });
		const adopted = adoptTipoIdMap({ section_tipo: MINT_SECTION, section_id: 1 }, GATE);
		expect((adopted.body as { section_id: number }).section_id).toBe(1);
		expect(adopted.rewrites.ids).toBe(1);
	});

	test('a NON-NUMERIC id (the synthetic search row) is left verbatim', () => {
		const adopted = adoptTipoIdMap({ section_tipo: SEED_SECTION, section_id: 'search_1' }, GATE);
		expect((adopted.body as { section_id: string }).section_id).toBe('search_1');
		expect(adopted.rewrites.ids).toBe(0);
	});
});

describe('the refusals', () => {
	test('a TS-shaped body is REFUSED, never projected', () => {
		const adopted = adoptTipoIdMap({ ok: true, data: { tipo: MINT_SECTION } }, GATE);
		expect(adopted.matched).toBe(false);
		expect(adopted.kind).toBe('ts_body_refused');
	});

	test('an install token that survives the walk is REFUSED, and named', () => {
		// A tipo of a cloned TLD that the manifest's closure never reached.
		const unmapped = install(`numis${'data'}`, 999999);
		expect(testTldMap().flat.has(unmapped)).toBe(false);
		const adopted = adoptTipoIdMap({ tipo: unmapped }, GATE);
		expect(adopted.matched).toBe(false);
		expect(adopted.kind).toBe('install_tipo_left');
		expect(adopted.leftovers).toEqual([unmapped]);
	});

	test('a DECLARED uncloned token is tolerated — and refused when it is not there', () => {
		const declared = UNCLONED_TOKENS.context_differential;
		expect(declared?.length).toBeGreaterThan(0);
		const token = declared?.[0]?.token as string;
		// Present: tolerated, and NOT reported as a leftover.
		const present = adoptTipoIdMap({ parent_grouper: token }, 'context_differential');
		expect(present.matched).toBe(true);
		expect(present.leftovers).toEqual([]);
		// Absent: a stale exemption is a refusal, not a silent pass.
		const absent = adoptTipoIdMap({ tipo: MINT_SECTION }, 'context_differential');
		expect(absent.matched).toBe(false);
		expect(absent.kind).toBe('uncloned_token_absent');
	});

	test('the two committed maps AGREE, which is why the conflict guard is unreachable today', () => {
		// `adoptTipoIdMap` refuses (`id_map_conflict`) when the corpus id map lands
		// a pair in one section while the tipo map rewrites its `section_tipo` to
		// another — two sources of truth disagreeing about one address. No body can
		// trigger it from the committed data, and THAT is the fact worth pinning:
		// the derive built the id map through the tipo map, and this check is what
		// would notice if a future regeneration stopped doing so.
		const map = testTldMap();
		let checked = 0;
		for (const [key, pair] of map.ids) {
			const at = key.lastIndexOf('_');
			const sourceSection = key.slice(0, at);
			const target = map.flat.get(sourceSection);
			if (target === undefined) continue;
			expect(pair.section_tipo).toBe(target);
			checked += 1;
		}
		expect(checked).toBeGreaterThan(100);
	});

	test('PROSE is not scanned — a sentence mentioning an install tipo cannot redden a gate', () => {
		const sentence = `see ${install(`numis${'data'}`, 999999)} in the catalogue`;
		expect(installTokensIn({ note: sentence })).toEqual([]);
		// …while the same token as a bare value IS caught (the anti-vacuity twin).
		expect(installTokensIn({ tipo: install(`numis${'data'}`, 999999) })).toHaveLength(1);
	});
});

describe('anti-vacuity: a body needing no rewrite is not a migrated gate', () => {
	test('a body with no clone token adopts with rewrites.tipos === 0', () => {
		const adopted = adoptTipoIdMap({ tipo: install('dd', 128), value: 'plain text' }, GATE);
		expect(adopted.matched).toBe(true);
		expect(adopted.rewrites.tipos).toBe(0);
		expect(adopted.rewrites.ids).toBe(0);
		// A migrated gate over install ontology asserts `> 0` for exactly this
		// reason: `matched` alone is satisfied by a body the map never touched.
	});
});

describe('the request side (unmapRqo) against the REAL frozen store', () => {
	/** The gate-authored, test-TLD form of read_differential's list request. */
	const testTermRqo = {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'section',
			tipo: 'testmint1',
			section_tipo: 'testmint1',
			mode: 'list',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: { section_tipo: ['testmint1'], limit: 5, offset: 0 },
		show: {
			ddo_map: [
				{
					tipo: 'testmint1002',
					section_tipo: 'self',
					parent: 'self',
					mode: 'list',
					lang: 'lg-spa',
				},
				{
					tipo: 'testmint1003',
					section_tipo: 'self',
					parent: 'self',
					mode: 'list',
					lang: 'lg-spa',
				},
				{
					tipo: 'testmint1004',
					section_tipo: 'self',
					parent: 'self',
					mode: 'list',
					lang: 'lg-spa',
				},
			],
		},
	};

	test('a test-TLD RQO reaches the frozen install-term interaction', () => {
		const found = lookupInteraction('json', testTermRqo);
		expect(found.status).toBe(200);
		// The interaction it found is the install one — proof the hash was taken
		// AFTER the unmap, not on the test-term request.
		expect((found.rqo as { source: { tipo: string } }).source.tipo).toBe(MINT_SECTION);
	});

	test('unmapRqo restores the install terms and leaves everything else verbatim', () => {
		const unmapped = unmapRqo(testTermRqo) as typeof testTermRqo;
		expect(unmapped.source.tipo).toBe(MINT_SECTION);
		expect(unmapped.show.ddo_map[0]?.tipo).toBe(MINT_NAME);
		expect(unmapped.sqo).toEqual({ section_tipo: [MINT_SECTION], limit: 5, offset: 0 });
		expect(unmapped.source.lang).toBe('lg-spa');
	});

	test('an INSTALL-term RQO is untouched — unmigrated gates hash exactly as before', () => {
		const installRqo = {
			action: 'read',
			source: { tipo: MINT_SECTION, section_tipo: MINT_SECTION, section_id: '1' },
			sqo: { section_tipo: [MINT_SECTION] },
		};
		expect(unmapRqo(installRqo)).toEqual(installRqo);
	});

	test('the hand-authored `test` playground is NOT a clone target — it cannot be unmapped', () => {
		// Every clone lives in a `test*` TLD above the 1000 band, so `test3` and
		// friends survive the unmap untouched. If they did not, every existing
		// playground gate would silently hash to something else.
		const playground = { action: 'read', source: { tipo: 'test3', section_tipo: 'test3' } };
		expect(unmapRqo(playground)).toEqual(playground);
	});

	test('a MISS still throws loudly', () => {
		expect(() => lookupInteraction('json', { action: 'read', source: { tipo: 'test3' } })).toThrow(
			/no recorded oracle response/,
		);
	});
});

describe('the corpus-scale projection', () => {
	const GATE_WITH_FIELDS = 'relation_index_get_data_differential';

	test('every declared field carries a written reason', () => {
		const entries = Object.entries(CORPUS_SCALE_FIELDS);
		expect(entries.length).toBeGreaterThan(0);
		for (const [gate, fields] of entries) {
			expect(fields.length).toBeGreaterThan(0);
			for (const field of fields) {
				expect(field.path.length).toBeGreaterThan(0);
				// A reason is prose, not a label: short strings are how a
				// justification becomes a rubber stamp.
				expect(field.reason.length).toBeGreaterThan(40);
				expect(gate.length).toBeGreaterThan(0);
			}
		}
	});

	test('strips the declared path and nothing else', () => {
		const items = [{ pagination: { total: 1647, limit: 2, offset: 0 }, tipo: 'x' }, { tipo: 'y' }];
		const stripped = stripCorpusScaleFields(items, GATE_WITH_FIELDS);
		expect(stripped[0]?.pagination).toEqual({ limit: 2, offset: 0 } as never);
		expect(stripped[1]).toEqual({ tipo: 'y' } as never);
		// The input is untouched (deep copy).
		expect(items[0]?.pagination?.total).toBe(1647);
	});

	test('REFUSES a path that is not present — a projection that strips nothing asserts nothing', () => {
		expect(() => stripCorpusScaleFields([{ tipo: 'x' }], GATE_WITH_FIELDS)).toThrow(
			/not present in the value handed to it/,
		);
		expect(() => stripCorpusScaleFields([], GATE_WITH_FIELDS)).toThrow(/not present/);
	});

	test('REFUSES a gate that declares nothing', () => {
		expect(() => stripCorpusScaleFields([{ a: 1 }], GATE)).toThrow(/declares no corpus-scale/);
	});
});
