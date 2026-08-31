/**
 * Phase 4 gate v0 (plan A3/A6): READ pipeline differential — the TS
 * readSectionRows data[] versus the live PHP dd_core_api::read data[] for the
 * same RQO (explicit show.ddo_map so both sides resolve identical components).
 *
 * Compared per item: the record identity, component tipo, mode, lang and the
 * VALUE payload (entries) + fallback_value + subdatum stamps. Fields the TS
 * pipeline does not emit yet are checked structurally on the PHP side and
 * logged as uncovered rather than silently ignored.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (phase 4 pilot, WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms and the frozen PHP interaction is
// reached through `unmapRqo` + `adoptTipoIdMap`; the five records come from the
// committed test corpus. Two REDUCTIONS are declared and enforced below (the
// additive `selectability_declared` key, and the component values the corpus
// could not reconstruct) — each one derived from data, never hand-listed.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import {
	dropTestCorpus,
	ensureTestCorpus,
	loadTestCorpus,
} from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptEntriesArrayContract, adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned mint thesaurus and its three string components. */
const SECTION = 'testmint1';
const COMPONENTS = ['testmint1002', 'testmint1003', 'testmint1004'] as const;

/**
 * WHAT THE CORPUS CAN AND CANNOT SPEAK FOR — read from the corpus file itself,
 * never hand-listed.
 *
 * The corpus was derived from the frozen store, and a record came out of it in
 * one of two states:
 *
 *  - RAW (`reconstructed: false`) — the whole jsonb row was harvested. Its
 *    values ARE the install's values, so they are compared byte for byte.
 *  - RECONSTRUCTED — the row was rebuilt from READ PROJECTIONS. A list-mode
 *    projection is already truncated ("…</p>"), so re-reading it through the
 *    list pipeline truncates a second time: the shorter string is a fact about
 *    the corpus, not about the read pipeline. And a component no projection
 *    ever revealed in a storable shape is simply ABSENT (`refused.json`,
 *    `list_projection_not_storable`), so the engine correctly serves nothing
 *    where the frozen body carries the install's text.
 *
 * So VALUES are compared on raw records only, while IDENTITY AND ORDER are
 * compared over the whole item sequence. The reduction is held honest four
 * ways: the sets are computed from the corpus; the compared set must be
 * non-empty and the reduced set must be non-empty too (a silently-complete
 * corpus would make this reduction a lie); a skipped pair the corpus HOLDS
 * must still be served non-empty; and a skipped pair it does NOT hold must
 * come back exactly empty rather than wrong.
 */
interface CorpusPairs {
	/** `<id>:<tipo>` of a component stored on a RAW record — comparable verbatim. */
	raw: Set<string>;
	/** `<id>:<tipo>` of a component stored on ANY record — served, if not comparable. */
	any: Set<string>;
}
function corpusPairs(): CorpusPairs {
	const section = loadTestCorpus().find((entry) => entry.section_tipo === SECTION);
	if (section === undefined) throw new Error(`test corpus holds no ${SECTION}`);
	const raw = new Set<string>();
	const any = new Set<string>();
	for (const record of section.records) {
		for (const column of Object.values(record.columns)) {
			if (column === null || typeof column !== 'object') continue;
			for (const tipo of Object.keys(column as Record<string, unknown>)) {
				const pair = `${record.section_id}:${tipo}`;
				any.add(pair);
				if (!record.reconstructed) raw.add(pair);
			}
		}
	}
	return { raw, any };
}

/** The replayed RQO: 3 string components of the mint thesaurus, 5 records. */
const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: SECTION,
		section_tipo: SECTION,
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: [SECTION], limit: 5, offset: 0 },
	show: {
		ddo_map: [
			{ tipo: COMPONENTS[0], section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: COMPONENTS[1], section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: COMPONENTS[2], section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
		],
	},
};

/** Reduce a data item to the comparable core both sides must agree on. */
function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
	};
}

describe.if(hasPhpCredentials())(
	'read pipeline differential: TS vs live PHP (Phase 4 gate v0)',
	() => {
		let phpData: Record<string, unknown>[];
		let tsData: Record<string, unknown>[];

		beforeAll(async () => {
			await ensureTestCorpus([SECTION]);
			const client = new PhpApiClient();
			const loggedIn = await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			if (!loggedIn) throw new Error('PHP login failed');
			const { body } = await client.call(structuredClone(READ_RQO));
			// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
			// test-TLD terms. `matched` + a non-zero rewrite count are the
			// anti-vacuity floor: a body that needed no rewrite would mean this
			// gate is not the migrated one it claims to be.
			const adopted = adoptTipoIdMap(body, 'read_differential');
			expect(adopted.matched).toBe(true);
			expect(adopted.rewrites.tipos).toBeGreaterThan(0);
			expect(adopted.rewrites.ids).toBeGreaterThan(0);
			const result = adopted.body.result as { data: Record<string, unknown>[] };
			// DEC-02 / engineering/wire_contract/ WC-001: assert the adopted `entries: []`
			// empty contract (PHP's `entries: null` is the fossil shape at this seam).
			// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
			phpData = normalizeSectionIdTypes(adoptEntriesArrayContract(result.data));
			tsData = normalizeSectionIdTypes(
				(await readSectionRows(READ_RQO as unknown as Rqo)) as unknown as Record<string, unknown>[],
			);
		});

		afterAll(async () => {
			expect(await dropTestCorpus([SECTION])).toBe(0);
		});

		test('sections envelope matches (typo/tipo/entries incl. paginated_key)', () => {
			const phpEnvelope = phpData[0] as Record<string, unknown>;
			const tsEnvelope = tsData[0] as Record<string, unknown>;
			expect(tsEnvelope.typo).toBe(phpEnvelope.typo);
			expect(tsEnvelope.tipo).toBe(phpEnvelope.tipo);
			// WC-2026-08-17-list-row-selectability-declared: the TS row entries
			// carry one ADDITIVE key PHP never emitted (`selectability_declared`,
			// stamped on every row of a section that declares no per-term
			// contract). "The parity gates compare the fields PHP emits" — so the
			// TS entries are projected onto the frozen keys, and the added key is
			// asserted PRESENT rather than quietly dropped.
			const phpEntries = phpEnvelope.entries as Record<string, unknown>[];
			const tsEntries = tsEnvelope.entries as Record<string, unknown>[];
			expect(tsEntries.length).toBe(phpEntries.length);
			expect(phpEntries.length).toBeGreaterThan(0);
			const frozenKeys = Object.keys(phpEntries[0] as Record<string, unknown>);
			const projected = tsEntries.map((entry) =>
				Object.fromEntries(frozenKeys.map((key) => [key, entry[key]])),
			);
			expect(projected).toEqual(phpEntries);
			for (const entry of tsEntries) {
				expect(entry.selectability_declared).toBe(false);
			}
		});

		test('component data items match: identity, order, entries, fallback, stamps', () => {
			// PHP data[] may include items for components NOT in our ddo_map (e.g.
			// injected defaults). Compare the subset for our three components, in
			// order — a missing or extra item for OUR tipos is a failure.
			const targetTipos = new Set<string>(COMPONENTS);
			const phpItems = phpData.slice(1).filter((item) => targetTipos.has(item.tipo as string));
			const tsItems = tsData.slice(1).filter((item) => targetTipos.has(item.tipo as string));
			// Non-empty floor: an empty PHP side must redden, not compare 0 items.
			expect(phpItems.length).toBeGreaterThan(0);
			// The item SEQUENCE (identity + order) is compared in full: a missing,
			// extra or misordered item is still a failure, corpus or no corpus.
			const address = (item: Record<string, unknown>): string =>
				`${String(item.section_id)}:${String(item.tipo)}`;
			expect(tsItems.map(address)).toEqual(phpItems.map(address));

			// The VALUES are compared for the pairs the corpus holds RAW (see
			// corpusPairs). The reduction is bounded on both sides.
			const pairs = corpusPairs();
			const compared = phpItems.filter((item) => pairs.raw.has(address(item)));
			const reduced = phpItems.filter((item) => !pairs.raw.has(address(item)));
			expect(compared.length).toBeGreaterThan(0);
			expect(reduced.length).toBeGreaterThan(0);
			const comparedTs = tsItems.filter((item) => pairs.raw.has(address(item)));
			expect(comparedTs.map(comparableItem)).toEqual(compared.map(comparableItem));
			// The reduced pairs are still on the engine's hook: a value the corpus
			// holds must be SERVED, and a value it does not hold must be exactly
			// empty — never something else.
			for (const item of tsItems.filter((entry) => !pairs.raw.has(address(entry)))) {
				if (pairs.any.has(address(item))) {
					expect(item.entries).not.toEqual([]);
				} else {
					expect(item.entries).toEqual([]);
				}
			}
		});

		test('EDIT mode: single record, untruncated values match PHP', async () => {
			const editRqo = structuredClone(READ_RQO) as Record<string, unknown> & {
				source: Record<string, unknown>;
				sqo: Record<string, unknown>;
				show: { ddo_map: Record<string, unknown>[] };
			};
			editRqo.source.mode = 'edit';
			editRqo.sqo = {
				section_tipo: [SECTION],
				filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
				limit: 1,
				offset: 0,
			};
			for (const ddo of editRqo.show.ddo_map) {
				ddo.mode = 'edit';
			}

			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const { body } = await client.call(structuredClone(editRqo));
			// WC-2026-08-19-test-tld-replay (see the list block above).
			const adoptedEdit = adoptTipoIdMap(body, 'read_differential');
			expect(adoptedEdit.matched).toBe(true);
			expect(adoptedEdit.rewrites.tipos).toBeGreaterThan(0);
			// DEC-02 / engineering/wire_contract/ WC-001 (see above).
			// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
			const phpEdit = normalizeSectionIdTypes(
				adoptEntriesArrayContract(
					(adoptedEdit.body.result as { data: Record<string, unknown>[] }).data,
				),
			);
			const tsEdit = normalizeSectionIdTypes(
				(await readSectionRows(editRqo as unknown as Rqo)) as unknown as Record<string, unknown>[],
			);

			const targetTipos = new Set<string>(COMPONENTS);
			const phpItems = phpEdit.filter((item) => targetTipos.has(item.tipo as string));
			const tsItems = tsEdit.filter((item) => targetTipos.has(item.tipo as string));
			// Record 1 is one of the two the corpus holds RAW (the whole jsonb row),
			// so this comparison is UNREDUCED: all three components, byte for byte.
			expect(phpItems.length).toBe(COMPONENTS.length);
			expect(tsItems.map(comparableItem)).toEqual(phpItems.map(comparableItem));
			// Edit values are UNTRUNCATED: the long text_area must not end with the
			// list-mode ellipsis.
			const longText = tsItems.find((item) => item.tipo === COMPONENTS[2]) as {
				entries: { value: string }[] | null;
			};
			expect(longText.entries?.[0]?.value.includes('...</p>')).toBe(false);
		}, 30000);

		test('PHP-only fields are surfaced, not silently ignored (coverage ledger)', () => {
			const knownFields = new Set([
				'tipo',
				'section_tipo',
				'section_id',
				'mode',
				'lang',
				'from_component_tipo',
				'entries',
				'fallback_value',
				'row_section_id',
				'parent_tipo',
				'parent_section_id',
				'pagination',
				'counter',
				'transliterate_value',
				'debug_model',
				'debug_label',
				'debug_dataframe',
				'typo',
				'literal',
			]);
			const unknownFields = new Set<string>();
			for (const item of phpData.slice(1)) {
				for (const field of Object.keys(item)) {
					if (!knownFields.has(field)) unknownFields.add(field);
				}
			}
			if (unknownFields.size > 0) {
				console.warn(
					`[UNCOVERED] PHP data-item fields not yet modeled: ${[...unknownFields].join(', ')}`,
				);
			}
			expect(true).toBe(true); // ledger test never fails; it reports
		});
	},
);
