/**
 * DUAL-PROBE CONTAINMENT GATE — SQL-EXECUTING
 * (WC-2026-08-10-section-id-int-canonical, D19; src/core/search/containment.ts).
 *
 * jsonb `@>` is type-strict, so during the expand window locator probes must
 * match BOTH typed forms of section_id — including MIXED forms inside one
 * stored array (a half-migrated row). This gate executes real SQL against
 * scratch rows in the test DB and pins:
 *
 *   1. positive containment matches string-stored, int-stored and MIXED rows;
 *   2. NEGATED containment (the '!=' / '!==' conjunction form) does NOT
 *      wrongly match rows that contain the relation in the other typed form —
 *      the polarity law: an OR pair under a single NOT would;
 *   3. multi-locator q decomposes per element (the AND-of-OR shape) so a
 *      mixed-typed row containing all elements still matches;
 *   4. external-shaped (non-convertible) ids probe verbatim, single-variant.
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	composeContains,
	composeNotContains,
	relationProbeGroups,
	sectionIdTypeVariants,
} from '../../src/core/search/containment.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
const SECTION_TIPO = 'zzdualprobe1';
const COMPONENT = 'zzdp1';

/** Scratch rows: one per storage form. */
const ROWS: { id: number; entries: Record<string, unknown>[] }[] = [
	// string-stored (pre-sweep form)
	{ id: 920001, entries: [{ type: 'dd151', section_tipo: 'test6813', section_id: '7' }] },
	// int-stored (post-sweep / new-writer form)
	{ id: 920002, entries: [{ type: 'dd151', section_tipo: 'test6813', section_id: 7 }] },
	// MIXED array: element A string, element B int
	{
		id: 920003,
		entries: [
			{ type: 'dd151', section_tipo: 'test6813', section_id: '7' },
			{ type: 'dd151', section_tipo: 'test6813', section_id: 9 },
		],
	},
	// a different target — must NEVER match q=7
	{ id: 920004, entries: [{ type: 'dd151', section_tipo: 'test6813', section_id: 8 }] },
	// external-shaped (zero-padded) — verbatim probes only
	{ id: 920005, entries: [{ type: 'dd151', section_tipo: 'test7342', section_id: '007' }] },
];

/** Run a composed containment clause against the scratch tipo; return ids. */
async function matchedIds(clause: string, params: unknown[]): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${TABLE}" WHERE section_tipo = '${SECTION_TIPO}' AND ${clause} ORDER BY section_id`,
		params,
	)) as unknown as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

/** Compose with real $n placeholders. */
function binder(): { bind: (payload: string) => string; params: unknown[] } {
	const params: unknown[] = [];
	return {
		params,
		bind: (payload: string) => {
			params.push(payload);
			return `$${params.length}`;
		},
	};
}

beforeAll(async () => {
	for (const row of ROWS) {
		await cleanScratchRecord(SECTION_TIPO, row.id, TABLE);
		await createScratchRecord(
			SECTION_TIPO,
			row.id,
			{ relation: { [COMPONENT]: row.entries } },
			{ table: TABLE },
		);
	}
});

afterAll(async () => {
	for (const row of ROWS) {
		await cleanScratchRecord(SECTION_TIPO, row.id, TABLE);
	}
});

describe('variant generation', () => {
	test('convertible ids produce both typed forms; non-convertible one verbatim', () => {
		expect(sectionIdTypeVariants({ section_id: 7 })).toEqual([
			{ section_id: 7 },
			{ section_id: '7' },
		]);
		expect(sectionIdTypeVariants({ section_id: '7' })).toEqual([
			{ section_id: '7' },
			{ section_id: 7 },
		]);
		expect(sectionIdTypeVariants({ section_id: '007' })).toEqual([{ section_id: '007' }]);
		expect(sectionIdTypeVariants({ section_id: 'Q42' })).toEqual([{ section_id: 'Q42' }]);
	});
});

describe('positive containment (law 1)', () => {
	test('an INT q matches string-stored, int-stored AND mixed rows', async () => {
		const { bind, params } = binder();
		const clause = composeContains(
			'relation',
			relationProbeGroups(COMPONENT, [{ type: 'dd151', section_tipo: 'test6813', section_id: 7 }]),
			bind,
		);
		expect(await matchedIds(clause, params)).toEqual([920001, 920002, 920003]);
	});

	test('a STRING q matches the same set (symmetry)', async () => {
		const { bind, params } = binder();
		const clause = composeContains(
			'relation',
			relationProbeGroups(COMPONENT, [
				{ type: 'dd151', section_tipo: 'test6813', section_id: '7' },
			]),
			bind,
		);
		expect(await matchedIds(clause, params)).toEqual([920001, 920002, 920003]);
	});

	test('multi-locator q decomposes per element: the MIXED row (str 7 + int 9) matches q=[7,9]', async () => {
		const { bind, params } = binder();
		const clause = composeContains(
			'relation',
			relationProbeGroups(COMPONENT, [
				{ type: 'dd151', section_tipo: 'test6813', section_id: 7 },
				{ type: 'dd151', section_tipo: 'test6813', section_id: 9 },
			]),
			bind,
		);
		// Whole-array single-form probes would find NOTHING here — the row holds
		// one string element and one int element.
		expect(await matchedIds(clause, params)).toEqual([920003]);
	});
});

describe('negated containment (law 2 — polarity)', () => {
	test("'does not contain 7' excludes ALL rows holding 7 in EITHER form", async () => {
		const { bind, params } = binder();
		const clause = composeNotContains(
			'relation',
			relationProbeGroups(COMPONENT, [{ type: 'dd151', section_tipo: 'test6813', section_id: 7 }]),
			bind,
		);
		// The WRONG composition — NOT(str) OR NOT(int) per variant — would match
		// 920001/920002/920003 (each lacks ONE of the two forms). The correct
		// conjunction excludes them all.
		expect(await matchedIds(clause, params)).toEqual([920004, 920005]);
	});

	test('multi-locator negation is the De Morgan dual: rows missing ANY element match', async () => {
		const { bind, params } = binder();
		const clause = composeNotContains(
			'relation',
			relationProbeGroups(COMPONENT, [
				{ type: 'dd151', section_tipo: 'test6813', section_id: 7 },
				{ type: 'dd151', section_tipo: 'test6813', section_id: 9 },
			]),
			bind,
		);
		// Only 920003 holds BOTH elements; everything else "does not contain q".
		expect(await matchedIds(clause, params)).toEqual([920001, 920002, 920004, 920005]);
	});

	test('external-shaped id: single verbatim probe, exact byte match', async () => {
		const { bind, params } = binder();
		const contains = composeContains(
			'relation',
			relationProbeGroups(COMPONENT, [
				{ type: 'dd151', section_tipo: 'test7342', section_id: '007' },
			]),
			bind,
		);
		expect(await matchedIds(contains, params)).toEqual([920005]);
	});
});
