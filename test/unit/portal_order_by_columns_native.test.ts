/**
 * Portal column sort — v7 per-ddo model (WC-048). Sort directives live ON the
 * `show.ddo_map` column ddo (`order: asc|desc`, `sort_by_column: true`), NOT on
 * top-level component properties. This is the TS-native contract of a feature
 * with NO PHP oracle (opt-in; no frozen fixture declares it), pinned here:
 *
 *  - a column with `order` resolves to an ORDER step over its target section;
 *  - `order` is `asc`/`desc` (any case) or `true` (= asc); anything else means
 *    "not ordered" and the column is skipped (never a malformed ORDER BY);
 *  - `section_tipo: 'self'` resolves to the host section;
 *  - a column WITHOUT `order` is skipped; declaration order = sort priority;
 *  - no ordered column → null (caller keeps stored order);
 *  - `hasDeclaredColumnOrder` is the cheap raw-properties gate used by the read
 *    hot-path.
 *
 * The DB-backed ranking (`rankLocatorsByColumns`) and the ontology wiring
 * (`orderLocatorsByDeclaredColumns` → expandPortal) are exercised below + by the
 * relation read gates; here we lock the pure resolution.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	buildPortalOrderSpecs,
	hasDeclaredColumnOrder,
	normalizeDirection,
	rankLocatorsByColumns,
} from '../../src/core/relations/order_locators.ts';

// A resolved show.ddo_map (each entry may carry `order` / `sort_by_column`).
const columns = (specs: { tipo: string; section_tipo?: string; order?: unknown }[]) =>
	specs.map((s) => ({ section_tipo: 'rsc167', ...s }));

describe('normalizeDirection', () => {
	test('asc/desc any case, boolean true = ASC, else null', () => {
		expect(normalizeDirection('asc')).toBe('ASC');
		expect(normalizeDirection('DESC')).toBe('DESC');
		expect(normalizeDirection('Desc')).toBe('DESC');
		expect(normalizeDirection(true)).toBe('ASC');
		expect(normalizeDirection('sideways')).toBeNull();
		expect(normalizeDirection(undefined)).toBeNull();
		expect(normalizeDirection(false)).toBeNull();
		expect(normalizeDirection(1)).toBeNull();
	});
});

describe('buildPortalOrderSpecs', () => {
	test('one ordered column → one order step on its target', () => {
		const spec = buildPortalOrderSpecs(columns([{ tipo: 'rsc20', order: 'asc' }]), 'rsc167');
		expect(spec).toEqual({
			targets: ['rsc167'],
			order: [{ direction: 'ASC', path: [{ section_tipo: 'rsc167', component_tipo: 'rsc20' }] }],
		});
	});

	test('DESC honored; boolean true = ASC', () => {
		expect(
			buildPortalOrderSpecs(columns([{ tipo: 'rsc20', order: 'desc' }]), 'rsc167')?.order[0]
				?.direction,
		).toBe('DESC');
		expect(
			buildPortalOrderSpecs(columns([{ tipo: 'rsc20', order: true }]), 'rsc167')?.order[0]
				?.direction,
		).toBe('ASC');
	});

	test("section_tipo 'self' resolves to the host section", () => {
		const spec = buildPortalOrderSpecs(
			columns([{ tipo: 'rsc35', section_tipo: 'self', order: 'asc' }]),
			'rsc167',
		);
		expect(spec?.order[0]?.path[0]?.section_tipo).toBe('rsc167');
	});

	test('columns WITHOUT order are skipped; declaration order = priority', () => {
		const spec = buildPortalOrderSpecs(
			columns([
				{ tipo: 'rsc279' }, // no order → skipped
				{ tipo: 'rsc29', order: 'desc' },
				{ tipo: 'rsc20', order: 'asc' },
			]),
			'rsc167',
		);
		expect(spec?.order.map((o) => o.path[0]?.component_tipo)).toEqual(['rsc29', 'rsc20']);
		expect(spec?.order.map((o) => o.direction)).toEqual(['DESC', 'ASC']);
	});

	test('an invalid order value skips the column', () => {
		expect(
			buildPortalOrderSpecs(columns([{ tipo: 'rsc20', order: 'sideways' }]), 'rsc167'),
		).toBeNull();
	});

	test('no ordered column → null', () => {
		expect(buildPortalOrderSpecs([], 'rsc167')).toBeNull();
		expect(buildPortalOrderSpecs(columns([{ tipo: 'rsc20' }]), 'rsc167')).toBeNull();
		expect(buildPortalOrderSpecs(columns([{ tipo: '', order: 'asc' }]), 'rsc167')).toBeNull();
	});
});

describe('hasDeclaredColumnOrder (cheap raw-properties gate)', () => {
	const props = (ddoMap: unknown[]) => ({
		source: { request_config: [{ show: { ddo_map: ddoMap } }] },
	});

	test('true only when some request_config column carries a valid order', () => {
		expect(hasDeclaredColumnOrder(props([{ tipo: 'rsc85', order: 'asc' }]))).toBe(true);
		expect(hasDeclaredColumnOrder(props([{ tipo: 'rsc85', order: true }]))).toBe(true);
		expect(hasDeclaredColumnOrder(props([{ tipo: 'rsc85' }]))).toBe(false);
		expect(hasDeclaredColumnOrder(props([{ tipo: 'rsc85', order: 'nope' }]))).toBe(false);
		expect(hasDeclaredColumnOrder(null)).toBe(false);
		expect(hasDeclaredColumnOrder({})).toBe(false);
		expect(hasDeclaredColumnOrder({ source: { request_config: 'x' } })).toBe(false);
	});
});

/**
 * END-TO-END (DB): `rankLocatorsByColumns` really re-orders stored locators by a
 * target-section column search over the live test3 playground — the same engine
 * that backs both `sort_by_column` (save) and `order_by` (read). Ordering by the
 * universal `section_id` column makes the expected order deterministic, and an
 * unresolvable locator must fall to the END preserving relative order.
 */
describe('rankLocatorsByColumns (DB)', () => {
	const loc = (id: number) => ({
		section_tipo: 'test3',
		section_id: id,
		from_component_tipo: 'test218',
	});

	test('re-orders real test3 locators by section_id DESC; unresolved last', async () => {
		// Confirm the playground shape (section_ids are deterministic).
		const rows = (await sql`
			SELECT section_id FROM matrix_test WHERE section_tipo = 'test3' ORDER BY section_id
		`) as { section_id: number }[];
		const ids = rows.map((row) => Number(row.section_id));
		expect(ids.length).toBeGreaterThanOrEqual(3);

		// Scrambled stored order + one unresolvable (deleted-target) locator.
		const stored = [
			loc(ids[1] as number),
			loc(999999),
			loc(ids[0] as number),
			loc(ids[2] as number),
		];
		const sorted = (await rankLocatorsByColumns(
			stored,
			['test3'],
			[{ direction: 'DESC', path: [{ section_tipo: 'test3', component_tipo: 'section_id' }] }],
		)) as { section_id: number }[];

		const top3 = [ids[2], ids[1], ids[0]] as number[]; // section_id DESC of the three resolved
		expect(sorted.slice(0, 3).map((item) => Number(item.section_id))).toEqual(top3);
		// the unresolvable locator ranks last
		expect(Number(sorted[3]?.section_id)).toBe(999999);
	});

	test('fewer than two locators is a no-op (no DB round-trip needed)', async () => {
		const one = [loc(1)];
		expect(
			await rankLocatorsByColumns(
				one,
				['test3'],
				[{ direction: 'ASC', path: [{ section_tipo: 'test3', component_tipo: 'section_id' }] }],
			),
		).toEqual(one);
	});
});
