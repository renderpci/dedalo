/**
 * THE MUSEUM-SCALE SCRATCH CORPUS — its own contract gate.
 *
 * `src/core/test_data/situations/zzscale_corpus.ts` exists so the budget and
 * behaviour questions that have no repro on the suite database get one: a WIDE
 * node, a DEEP subtree, a POLY-HIERARCHY island, dd96 indexation locators (the
 * suite holds zero) and a string distribution covering every regex
 * metacharacter `builder_string.ts` names. A corpus that silently lost one of
 * those shapes would make every gate built on it vacuous while staying green,
 * so each shape is asserted HERE, measured through the ENGINE's own doors
 * (getChildren / getChildrenRecursive / findInverseReferenceLocators / the
 * ontology resolver), never by re-reading the generator that wrote it.
 *
 * The corpus is NOT resident: this gate builds it and tears it down, and the
 * teardown leg asserts the residue is 0 — including the TRIGGER-DERIVED rows
 * (matrix_relation_index / matrix_string_search) that `residueOf` does not
 * count, because 1,220 records with relation and string columns derive plenty
 * of them and a sweep that left those behind would grow the suite DB on every
 * run while reporting clean.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	getChildrenNodes,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import { getSectionMap } from '../../src/core/ontology/section_map.ts';
import { getChildren, getChildrenRecursive } from '../../src/core/relations/children.ts';
import { findInverseReferenceLocators } from '../../src/core/search/search_related.ts';
import { resolveListCellMap } from '../../src/core/section/list_definitions/section_list.ts';
import {
	ZZSCALE_CONTAINS_TERM,
	ZZSCALE_EXACT_TERM,
	ZZSCALE_INDEX_OWNER_COMPONENT,
	ZZSCALE_INDEX_OWNER_ID,
	ZZSCALE_INDEX_RELATION_TYPE,
	ZZSCALE_INDEX_TARGET_IDS,
	ZZSCALE_LEVEL1_FIRST_ID,
	ZZSCALE_LEVEL1_LAST_ID,
	ZZSCALE_LEVEL2_FIRST_ID,
	ZZSCALE_LEVEL3_FIRST_ID,
	ZZSCALE_ORDER_COMPONENT,
	ZZSCALE_PARENT_COMPONENT,
	ZZSCALE_POLY_CHILD_ID,
	ZZSCALE_POLY_ORDER_A,
	ZZSCALE_POLY_ORDER_B,
	ZZSCALE_POLY_PARENT_A_ID,
	ZZSCALE_POLY_PARENT_B_ID,
	ZZSCALE_REGEX_META_CHARS,
	ZZSCALE_ROOT_DESCENDANT_COUNT,
	ZZSCALE_ROOT_ID,
	ZZSCALE_SECTION,
	ZZSCALE_STRING_VALUES,
	ZZSCALE_TERM_COMPONENT,
	ZZSCALE_TOTAL_RECORDS,
	ZZSCALE_WIDE_CHILD_COUNT,
	ZZSCALE_WIDE_PARENT_ID,
	zzScaleMetaValue,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';

/** The floors the consumers force — stated here so a shrunk corpus goes red. */
const WIDE_CHILD_FLOOR = 400;
const DESCENDANT_FLOOR = 1000;
const META_CHAR_FLOOR = 10;

const SCRATCH_TABLE = 'matrix_test';

beforeAll(async () => {
	await ensureZzScaleCorpus();
}, 60000);

afterAll(async () => {
	// Idempotent: the teardown leg below already dropped it on a green run; this
	// is the safety net for a run that threw before reaching it.
	await dropZzScaleCorpus();
});

/** Every record id the corpus actually wrote, ascending — read from the table. */
async function storedIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${SCRATCH_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[ZZSCALE_SECTION],
	)) as { section_id: number }[];
	return rows.map((r) => Number(r.section_id));
}

/**
 * The regex-metacharacter class as `builder_string.ts` DECLARES it, parsed out
 * of the source. Derived, never transcribed: a character added to the engine's
 * class without a corpus value must turn this gate red, which a hand-copied
 * list could never do.
 */
function declaredRegexMetaChars(source: string): string[] {
	const match = source.match(/const REGEX_META = \/\[([^\n]*?)\]\/;/);
	if (match === null) return [];
	const body = match[1] as string;
	const chars: string[] = [];
	for (let i = 0; i < body.length; i++) {
		const char = body[i] as string;
		if (char === '\\') {
			i += 1;
			chars.push(body[i] as string);
			continue;
		}
		chars.push(char);
	}
	return chars;
}

/** Metacharacters the corpus has NO value for — the coverage predicate. */
function uncoveredMetaChars(declared: readonly string[], values: readonly string[]): string[] {
	return declared.filter((char) => !values.includes(zzScaleMetaValue(char)));
}

describe('zzscale corpus — the structure it declares', () => {
	test('the section is an ordinary section on the scratch table, with its components', async () => {
		expect(await getModelByTipo(ZZSCALE_SECTION)).toBe('section');
		// NEVER the installation's `matrix`: a corpus that landed there would be
		// swept — and residue-counted — in the wrong table.
		expect(await getMatrixTableFromTipo(ZZSCALE_SECTION)).toBe(SCRATCH_TABLE);
		const children = await getChildrenNodes(ZZSCALE_SECTION);
		expect(children.length).toBeGreaterThan(5);
		const models = new Map(children.map((c) => [c.tipo, c.model]));
		expect(models.get(ZZSCALE_TERM_COMPONENT)).toBe('component_input_text');
		expect(models.get(ZZSCALE_PARENT_COMPONENT)).toBe('component_relation_parent');
		expect(models.get(ZZSCALE_ORDER_COMPONENT)).toBe('component_number');
		expect(models.get(ZZSCALE_INDEX_OWNER_COMPONENT)).toBe('component_portal');
	});

	test('it carries LIST COLUMNS — a render budget has something to render', async () => {
		const cellMap = await resolveListCellMap(ZZSCALE_SECTION);
		const columns = cellMap.implicitRelations ?? [];
		expect(columns.length).toBeGreaterThan(1);
		expect(columns).toContain(ZZSCALE_TERM_COMPONENT);
		expect(columns).toContain(ZZSCALE_ORDER_COMPONENT);
	});

	test('section_map declares thesaurus.order — getChildren ordering branch is OPEN', async () => {
		const map = await getSectionMap(ZZSCALE_SECTION);
		const thesaurus = map?.thesaurus as Record<string, unknown> | undefined;
		expect(thesaurus?.order).toBe(ZZSCALE_ORDER_COMPONENT);
		expect(thesaurus?.parent).toBe(ZZSCALE_PARENT_COMPONENT);
	});
});

describe('zzscale corpus — the volume and the topology', () => {
	test('1,220 records, ids CONTIGUOUS from 1 (no holes)', async () => {
		const ids = await storedIds();
		expect(ids.length).toBeGreaterThan(DESCENDANT_FLOOR);
		expect(ids.length).toBe(ZZSCALE_TOTAL_RECORDS);
		expect(ids[0]).toBe(1);
		expect(ids[ids.length - 1]).toBe(ZZSCALE_TOTAL_RECORDS);
		const holes = ids.filter((id, index) => id !== index + 1);
		expect(holes).toEqual([]);
	});

	test('the WIDE node holds >= 400 direct children, ORDERED (not id order)', async () => {
		const children = await getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION);
		expect(children.length).toBeGreaterThanOrEqual(WIDE_CHILD_FLOOR);
		expect(children.length).toBe(ZZSCALE_WIDE_CHILD_COUNT);
		const ids = children.map((c) => c.section_id);
		// findChildHits returns ascending section_id; the corpus's order values
		// invert that, so a DESCENDING answer proves orderChildHits actually ran
		// — the branch whose per-child record read is the whole cost.
		const ascending = [...ids].sort((a, b) => a - b);
		expect(ids).not.toEqual(ascending);
		expect(ids).toEqual([...ascending].reverse());
	});

	test('depth is exactly 3 below the root, ~1,200 descendants', async () => {
		const level1 = await getChildren(ZZSCALE_ROOT_ID, ZZSCALE_SECTION);
		expect(level1.length).toBe(ZZSCALE_LEVEL1_LAST_ID - ZZSCALE_LEVEL1_FIRST_ID + 1);
		const level2 = await getChildren(ZZSCALE_WIDE_PARENT_ID, ZZSCALE_SECTION);
		expect(level2.length).toBeGreaterThan(0);
		const level3 = await getChildren(ZZSCALE_LEVEL2_FIRST_ID, ZZSCALE_SECTION);
		expect(level3.length).toBeGreaterThan(0);
		// …and nothing below it: depth 3, not 4.
		expect(await getChildren(ZZSCALE_LEVEL3_FIRST_ID, ZZSCALE_SECTION)).toEqual([]);

		const descendants = await getChildrenRecursive(ZZSCALE_ROOT_ID, ZZSCALE_SECTION);
		expect(descendants.length).toBeGreaterThan(DESCENDANT_FLOOR);
		expect(descendants.length).toBe(ZZSCALE_ROOT_DESCENDANT_COUNT);
	}, 30000);

	test('the POLY-HIERARCHY island: one term reachable from TWO parents', async () => {
		const fromA = await getChildren(ZZSCALE_POLY_PARENT_A_ID, ZZSCALE_SECTION);
		const fromB = await getChildren(ZZSCALE_POLY_PARENT_B_ID, ZZSCALE_SECTION);
		expect(fromA.map((c) => c.section_id)).toEqual([ZZSCALE_POLY_CHILD_ID]);
		expect(fromB.map((c) => c.section_id)).toEqual([ZZSCALE_POLY_CHILD_ID]);
		// The island is DISJOINT from the tree, so it can never move its counts.
		const rootDescendants = await getChildrenRecursive(ZZSCALE_ROOT_ID, ZZSCALE_SECTION);
		expect(rootDescendants.some((c) => c.section_id === ZZSCALE_POLY_CHILD_ID)).toBe(false);
	}, 30000);

	test('the poly child stores TWO parent locators with per-parent order values', async () => {
		const row = await readMatrixRecord(SCRATCH_TABLE, ZZSCALE_SECTION, ZZSCALE_POLY_CHILD_ID);
		expect(row).not.toBeNull();
		const relation = row?.columns.relation as Record<string, { section_id: number }[]>;
		const parents = relation[ZZSCALE_PARENT_COMPONENT] ?? [];
		expect(parents.map((p) => Number(p.section_id))).toEqual([
			ZZSCALE_POLY_PARENT_A_ID,
			ZZSCALE_POLY_PARENT_B_ID,
		]);
		const number = row?.columns.number as Record<string, { value: number }[]>;
		const orders = (number[ZZSCALE_ORDER_COMPONENT] ?? []).map((o) => Number(o.value));
		// Distinct per parent — a single-parent record cannot express this, which
		// is exactly why the id_key pairing had no repro before this corpus.
		expect(orders).toEqual([ZZSCALE_POLY_ORDER_A, ZZSCALE_POLY_ORDER_B]);
		expect(ZZSCALE_POLY_ORDER_A).not.toBe(ZZSCALE_POLY_ORDER_B);
	});
});

describe('zzscale corpus — dd96 indexation and the deterministic-sort probe', () => {
	test('exactly TWO dd96 locators target the section, from ONE owner record', async () => {
		const hits = await findInverseReferenceLocators(
			[{ type: ZZSCALE_INDEX_RELATION_TYPE, section_tipo: ZZSCALE_SECTION }],
			{ limit: false, order: 'section_id' },
		);
		expect(hits.length).toBe(ZZSCALE_INDEX_TARGET_IDS.length);
		expect(hits.length).toBeGreaterThan(1);
		const owners = new Set(hits.map((h) => h.section_id));
		expect([...owners]).toEqual([ZZSCALE_INDEX_OWNER_ID]);
		const targets = hits.map((h) => Number((h.locator_data as { section_id: number }).section_id));
		expect([...targets].sort((a, b) => a - b)).toEqual(
			[...ZZSCALE_INDEX_TARGET_IDS].sort((a, b) => a - b),
		);
	});

	test('the two locators are STORED descending — an ascending answer proves a sort', async () => {
		const row = await readMatrixRecord(SCRATCH_TABLE, ZZSCALE_SECTION, ZZSCALE_INDEX_OWNER_ID);
		const relation = row?.columns.relation as Record<string, { section_id: number }[]>;
		const stored = (relation[ZZSCALE_INDEX_OWNER_COMPONENT] ?? []).map((l) => Number(l.section_id));
		expect(stored).toEqual([...ZZSCALE_INDEX_TARGET_IDS]);
		const ascending = [...stored].sort((a, b) => a - b);
		// The discriminating property: storage order != sorted order, so a
		// consumer that echoes storage and one that sorts give DIFFERENT answers.
		expect(stored).not.toEqual(ascending);
	});
});

describe('zzscale corpus — the string distribution (search-store pre-filter)', () => {
	test('the exact/contains pair: contains 2, exact 1', async () => {
		const rows = (await sql`
			SELECT string FROM matrix_string_search
			 WHERE section_tipo = ${ZZSCALE_SECTION} AND component_tipo = ${ZZSCALE_TERM_COMPONENT}
			   AND string LIKE ${`%${ZZSCALE_EXACT_TERM.toLowerCase()}%`}`) as { string: string }[];
		expect(rows.length).toBeGreaterThan(1);
		expect(rows.length).toBe(2);
		const values = rows.map((r) => r.string).sort();
		expect(values).toEqual(
			[ZZSCALE_EXACT_TERM.toLowerCase(), ZZSCALE_CONTAINS_TERM.toLowerCase()].sort(),
		);
	});

	test('EVERY metacharacter builder_string declares has a corpus value', () => {
		const source = readFileSync('src/core/search/builders/builder_string.ts', 'utf8');
		const declared = declaredRegexMetaChars(source);
		// Corpus floor: the class is 14 characters today; a parse that silently
		// found none would make this leg vacuous.
		expect(declared.length).toBeGreaterThan(META_CHAR_FLOOR);
		expect([...declared].sort()).toEqual([...ZZSCALE_REGEX_META_CHARS].sort());
		expect(uncoveredMetaChars(declared, ZZSCALE_STRING_VALUES)).toEqual([]);
	});

	test('POSITIVE CONTROL: a metacharacter with no corpus value is REPORTED', () => {
		// The offender is planted in the DECLARED class, not in the corpus — the
		// exact drift this leg exists to catch (a character added to
		// builder_string.ts while the corpus stands still).
		const planted = [...ZZSCALE_REGEX_META_CHARS, '~'];
		expect(uncoveredMetaChars(planted, ZZSCALE_STRING_VALUES)).toEqual(['~']);
	});

	test('each metacharacter value is actually STORED and indexed', async () => {
		const rows = (await sql`
			SELECT section_id, string FROM matrix_string_search
			 WHERE section_tipo = ${ZZSCALE_SECTION} AND component_tipo = ${ZZSCALE_TERM_COMPONENT}`) as {
			string: string;
		}[];
		expect(rows.length).toBeGreaterThan(DESCENDANT_FLOOR);
		const stored = new Set(rows.map((r) => r.string));
		const missing = ZZSCALE_STRING_VALUES.filter((v) => !stored.has(v.toLowerCase()));
		expect(missing).toEqual([]);
	});
});

describe('zzscale corpus — teardown', () => {
	test('drop leaves ZERO residue, derived index rows INCLUDED', async () => {
		// Pre-condition, so a vacuous "0 after 0" cannot pass: the derived rows
		// exist right now.
		const before = (await sql`
			SELECT count(*)::int AS n FROM matrix_string_search WHERE section_tipo = ${ZZSCALE_SECTION}`) as {
			n: number;
		}[];
		expect(before[0]?.n ?? 0).toBeGreaterThan(DESCENDANT_FLOOR);

		expect(await dropZzScaleCorpus()).toBe(0);

		const strings = (await sql`
			SELECT count(*)::int AS n FROM matrix_string_search WHERE section_tipo = ${ZZSCALE_SECTION}`) as {
			n: number;
		}[];
		expect(strings[0]?.n).toBe(0);
		const relations = (await sql`
			SELECT count(*)::int AS n FROM matrix_relation_index
			 WHERE section_tipo = ${ZZSCALE_SECTION} OR target_section_tipo = ${ZZSCALE_SECTION}`) as {
			n: number;
		}[];
		expect(relations[0]?.n).toBe(0);
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${SCRATCH_TABLE}" WHERE section_tipo = $1`,
			[ZZSCALE_SECTION],
		)) as { n: number }[];
		expect(rows[0]?.n).toBe(0);
	}, 30000);
});
