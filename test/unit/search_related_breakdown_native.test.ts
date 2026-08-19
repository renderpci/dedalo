/**
 * TRIPWIRE for the two-plan BREAKDOWN split (2026-08-07, DEC-12).
 *
 * findInverseReferenceLocators has TWO code paths that MUST return the
 * identical row SEQUENCE (not merely the same multiset — the ORDER BY is total
 * since WC-2026-08-07-breakdown-total-order):
 *  - the fast path — owners resolved by a standalone matrix_relation_index
 *    probe, then carried into the per-table UNION as array parameters;
 *  - the legacy path — the original single-statement inline semi-join, taken
 *    when the probe exceeds BREAKDOWN_OWNER_CAP (hub records, the
 *    builder_relation_index sweep on its largest section).
 *
 * A second code path with no gate rots. `ownerCap` is the named test seam
 * (documented as such on the options type): `ownerCap: 0` always takes the
 * legacy path, the default always takes the fast one. Every case below runs
 * BOTH and compares the FULL rows, locator_data included.
 *
 * THREE hazards this file exists for:
 *  1. per-locator field pairing (the DISJOINT case),
 *  2. the duplicate-row trap when one locator SUBSUMES another (OVERLAPPING),
 *  3. the tie-cutting page — the ORDER BY keys PHP defines are not total over a
 *     breakdown row set (one owner contributes one row per matching locator
 *     entry), so before WC-2026-08-07-breakdown-total-order a LIMIT/OFFSET window that cut through a tie
 *     group returned a different row on each plan. The fixture's owner 999911
 *     contributes two rows that share EVERY PHP key and differ only in
 *     locator_data; the pagination case below cuts straight through that pair.
 *
 * The fixture is seeded here (matrix_test scratch, cleaned in afterAll) rather
 * than borrowed from live data: the hazards need an owner that satisfies two
 * locators at once, which no live record is guaranteed to provide.
 *
 * TIMEOUTS ARE EXPLICIT ON EVERY CASE. bunfig.toml's `[test] timeout` is NOT
 * honoured by bun 1.3.9 (its preloads are) — the runner still enforces the 5 s
 * default, and a multi-locator LEGACY breakdown is inherently multi-second on a
 * real database: its WHERE is `(A₁∧F₁) OR (A₂∧F₂)`, which is not index-drivable,
 * so it scans matrix_hierarchy (2.3M rows / 5.4 GB on the suite DB). Measured
 * here: 3.3-4.4 s bare, 0.55-0.82 s with sectionTipos narrowing, against 3-13 ms
 * for the fast arm. A gate that is red on `bun test <file>` is worse than no
 * gate — it gets muted, and then the above-cap fallback (which no production
 * caller reaches on a small install) has no gate at all.
 */
// BINDS INSTALL TLDs: numisdata — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	breakdownUsesOwnerCarrier,
	findInverseReferenceLocators,
	type InverseReferenceLocatorHit,
	type RelatedLocatorFilter,
	resolveBreakdownOwnerCap,
} from '../../src/core/search/search_related.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/** Synthetic target: two ids, so per-locator pairing has something to separate. */
const TARGET_TIPO = 'test55';
const TARGET_A = '777001';
const TARGET_B = '777002';

const OWNER_TIPO = 'test2';
const SEEDED_IDS = [999911, 999912, 999913, 999914];

/** One legacy multi-locator breakdown can cost seconds — see the header. */
const SLOW = 120_000;
const FAST = 30_000;

const locator = (sectionId: string, fromComponentTipo: string): Record<string, string> => ({
	type: 'dd151',
	section_tipo: TARGET_TIPO,
	section_id: sectionId,
	from_component_tipo: fromComponentTipo,
});

/** Seed rows: raw INSERT — the _relation_index_sync trigger indexes them. */
const FIXTURE: Record<number, Record<string, Record<string, string>[]>> = {
	// owner of A through TWO different components (the overlapping-locator trap
	// AND the tie group: both rows share table/section_tipo/section_id)
	999911: { test99: [locator(TARGET_A, 'test99')], test98: [locator(TARGET_A, 'test98')] },
	// owner of A and B through the same component (two entries in one array)
	999912: { test99: [locator(TARGET_A, 'test99'), locator(TARGET_B, 'test99')] },
	// owner of B only — must never surface under a locator that asks for A
	999913: { test98: [locator(TARGET_B, 'test98')] },
	// pure noise: an owner that points somewhere else entirely
	999914: { test99: [locator('777999', 'test99')] },
};

/** The FULL row, locator_data included — the contract is the whole row. */
const rowKey = (hit: InverseReferenceLocatorHit): string =>
	JSON.stringify([hit.table, hit.section_tipo, hit.section_id, hit.locator_data]);

/**
 * Run one shape on BOTH plans and assert they agree ROW FOR ROW, in order.
 *
 * Sequence equality is the real assertion: the ORDER BY is total (WC-2026-08-07-breakdown-total-order), so
 * any tie-order difference between the two plans — the class that made a
 * paginated read return a different row per plan — fails here. Multiset
 * equality is asserted first only because it names the failure better when a
 * row is actually lost or duplicated.
 */
async function bothPlans(
	locators: RelatedLocatorFilter[],
	options: Parameters<typeof findInverseReferenceLocators>[1] = {},
): Promise<InverseReferenceLocatorHit[]> {
	const fast = await findInverseReferenceLocators(locators, options);
	const legacy = await findInverseReferenceLocators(locators, { ...options, ownerCap: 0 });
	expect(legacy.map(rowKey).sort()).toEqual(fast.map(rowKey).sort());
	expect(legacy.map(rowKey)).toEqual(fast.map(rowKey));
	return fast;
}

describe('breakdown fast path === legacy fallback (ownerCap seam)', () => {
	beforeAll(async () => {
		for (const [id, relation] of Object.entries(FIXTURE)) {
			await sql.unsafe(
				`INSERT INTO matrix_test (section_id, section_tipo, relation)
				 VALUES ($1, $2, $3::text::jsonb)
				 ON CONFLICT (section_id, section_tipo) DO UPDATE SET relation = EXCLUDED.relation`,
				[id, OWNER_TIPO, JSON.stringify(relation)],
			);
		}
	});

	afterAll(async () => {
		for (const id of SEEDED_IDS) await cleanScratchRecord(OWNER_TIPO, id);
	});

	test(
		'single locator — every seeded entry for the target, both plans',
		async () => {
			const hits = await bothPlans([{ section_tipo: TARGET_TIPO, section_id: TARGET_A }]);
			// 999911 twice (test99 + test98) + 999912 once = 3 entries.
			expect(hits.length).toBe(3);
			expect(hits.every((hit) => hit.locator_data.section_id === TARGET_A)).toBe(true);
			expect(new Set(hits.map((hit) => hit.section_id))).toEqual(new Set([999911, 999912]));
		},
		FAST,
	);

	test(
		'from_component_tipo narrowing, order section_id',
		async () => {
			const hits = await bothPlans(
				[{ section_tipo: TARGET_TIPO, section_id: TARGET_A, from_component_tipo: 'test99' }],
				{ limit: false, order: 'section_id' },
			);
			expect(hits.length).toBe(2);
			expect(hits.every((hit) => hit.locator_data.from_component_tipo === 'test99')).toBe(true);
		},
		FAST,
	);

	test(
		'OVERLAPPING locators emit each entry ONCE (the duplication hazard)',
		async () => {
			// Locator B (bare target) SUBSUMES locator A (target + component), so the
			// union must equal the bare-locator result exactly — never 1 + n rows.
			// Deliberately NOT narrowed by sectionTipos: this is the one case that
			// gates the un-narrowed multi-locator legacy SQL (seconds — see SLOW).
			const overlapping = await bothPlans(
				[
					{ section_tipo: TARGET_TIPO, section_id: TARGET_A, from_component_tipo: 'test99' },
					{ section_tipo: TARGET_TIPO, section_id: TARGET_A },
				],
				{ limit: false, order: 'section_id' },
			);
			const bare = await findInverseReferenceLocators(
				[{ section_tipo: TARGET_TIPO, section_id: TARGET_A }],
				{ limit: false, order: 'section_id' },
			);
			expect(overlapping.length).toBe(3);
			expect(overlapping.map(rowKey)).toEqual(bare.map(rowKey));
			// and no row is duplicated
			expect(new Set(overlapping.map(rowKey)).size).toBe(overlapping.length);
		},
		SLOW,
	);

	test(
		'DISJOINT locators keep their field pairing (no cross-contamination)',
		async () => {
			const hits = await bothPlans(
				[
					{ section_tipo: TARGET_TIPO, section_id: TARGET_A, from_component_tipo: 'test99' },
					{ section_tipo: TARGET_TIPO, section_id: TARGET_B, from_component_tipo: 'test98' },
				],
				// sectionTipos narrows the OWNER on both plans (the legacy path prunes
				// its per-arm scans with it) — 4× cheaper, same pairing coverage.
				{ limit: false, order: 'section_id', sectionTipos: [OWNER_TIPO] },
			);
			// A/test99 → 999911 + 999912 ; B/test98 → 999913. 999911's test98 entry
			// points at A, so the B-locator's fields must NOT pick it up.
			expect(hits.length).toBe(3);
			for (const hit of hits) {
				const id = hit.locator_data.section_id;
				const fct = hit.locator_data.from_component_tipo;
				expect(`${id}|${fct}`).toBeOneOf([`${TARGET_A}|test99`, `${TARGET_B}|test98`]);
			}
		},
		SLOW,
	);

	test(
		'sectionTipos narrows the OWNER; a disjoint scope short-circuits to []',
		async () => {
			const kept = await bothPlans([{ section_tipo: TARGET_TIPO, section_id: TARGET_A }], {
				sectionTipos: [OWNER_TIPO],
			});
			expect(kept.length).toBe(3);
			// The reported record's shape: real owners exist, but none in the
			// requested sections — the fast path returns [] without touching a
			// single relation table, and the seam still emits the legacy SQL for the
			// comparison (ownerCap 0 skips the probe entirely).
			const none = await bothPlans([{ section_tipo: TARGET_TIPO, section_id: TARGET_A }], {
				sectionTipos: ['numisdata3'],
			});
			expect(none).toEqual([]);
		},
		FAST,
	);

	test(
		'PAGINATION cuts through a tie group and both plans agree (WC-2026-08-07-breakdown-total-order)',
		async () => {
			// Owner 999911 contributes two rows with the same table/section_tipo/
			// section_id: under `order: 'section_id'` the whole 3-row result is one
			// tie group under the PHP key, so EVERY window here cuts a tie.
			const target = [{ section_tipo: TARGET_TIPO, section_id: TARGET_A }];
			const full = await bothPlans(target, { limit: false, order: 'section_id' });
			expect(full.length).toBe(3);
			// The tie group is real: two rows share every PHP ORDER BY key.
			const phpKey = (hit: InverseReferenceLocatorHit) =>
				`${hit.table}|${hit.section_tipo}|${hit.section_id}`;
			expect(new Set(full.map(phpKey)).size).toBeLessThan(full.length);

			for (const order of ['section_id', 'table'] as const) {
				const ordered = await bothPlans(target, { limit: false, order });
				for (let offset = 0; offset < 3; offset++) {
					for (const limit of [1, 2]) {
						// both plans agree on the page …
						const page = await bothPlans(target, { limit, offset, order });
						// … and the page is the corresponding window of the full result
						// (pagination COHERENCE: pages tile, they do not reshuffle).
						expect(page.map(rowKey)).toEqual(ordered.slice(offset, offset + limit).map(rowKey));
					}
				}
			}
		},
		SLOW,
	);

	test(
		'the seam really switches plans (a cap of 0 can never use the owner carrier)',
		async () => {
			// The decision itself, not a proxy for it: every comparison above is
			// worthless if `ownerCap: 0` can reach the fast path.
			expect(breakdownUsesOwnerCarrier(0, 0, 1)).toBe(false); // zero owners — the case that used to slip through
			expect(breakdownUsesOwnerCarrier(0, 5, 1)).toBe(false);
			expect(breakdownUsesOwnerCarrier(1_000, 5, 1)).toBe(true);
			expect(breakdownUsesOwnerCarrier(1_000, 1_001, 1)).toBe(false); // above the owner cap
			expect(breakdownUsesOwnerCarrier(1_000, 1_000, 10)).toBe(true); // 10,000 carrier entries — the bound
			expect(breakdownUsesOwnerCarrier(1_000, 1_000, 11)).toBe(false); // 11,000 — above it

			// …and the cap this call gets is the SHAPE's cap, lowered only.
			const targeted = [{ section_tipo: TARGET_TIPO, section_id: TARGET_A }];
			const sweep = [{ section_tipo: TARGET_TIPO, type: 'dd151' }];
			expect(resolveBreakdownOwnerCap(targeted)).toBe(10_000); // record-targeted: the memory bound
			expect(resolveBreakdownOwnerCap(sweep)).toBe(1_000); // section-wide sweep: its own measured cap
			expect(resolveBreakdownOwnerCap([...sweep, ...targeted])).toBe(10_000); // one id ⇒ targeted
			expect(resolveBreakdownOwnerCap(targeted, 0)).toBe(0); // the seam
			expect(resolveBreakdownOwnerCap(targeted, 1e9)).toBe(10_000); // NEVER raised
			expect(resolveBreakdownOwnerCap(sweep, 1e9)).toBe(1_000);
			expect(resolveBreakdownOwnerCap(targeted, Number.NaN)).toBe(10_000); // no `LIMIT NaN`
			expect(resolveBreakdownOwnerCap(targeted, Number.POSITIVE_INFINITY)).toBe(10_000);
			expect(resolveBreakdownOwnerCap(targeted, -5)).toBe(0);

			// …and the fixture really does have an owner, so the seam has something
			// to switch on.
			const owners = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM matrix_relation_index r
				 WHERE r.target_section_tipo = $1 AND r.target_section_id = $2`,
				[TARGET_TIPO, TARGET_A],
			)) as { n: number }[];
			expect(owners[0]?.n ?? 0).toBeGreaterThan(0);
		},
		FAST,
	);
});
