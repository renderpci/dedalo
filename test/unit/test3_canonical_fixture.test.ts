/**
 * TRIPWIRE: the canonical test3 fixture (src/core/test_data/) is the SINGLE
 * VERIFIED SOURCE of the playground test data. Four contracts:
 *
 *  1. fixture ↔ manifest (no DB) — the record set matches (live-captured base +
 *     the per-suite isolation CLONES of record 1), every REQUIRED_SHAPES
 *     predicate holds, no null/'' holes anywhere, the ledgered-empty list is
 *     not stale (a populated tipo must leave it), and each clone is a true copy
 *     of record 1 (same shapes, own data.section_id).
 *  2. ontology coverage (DB) — every data-bearing component of the test3
 *     subtree is populated on record 1 OR consciously ledgered; no fixture
 *     key is an orphan (subtree tipo or declared extra).
 *  3. restore round-trip (DB) — restoreCanonicalTest3() reproduces the
 *     fixture exactly (parsed deep-equality via canonicalTest3Drift) and the
 *     engine READS every populated record-1 component (entries non-empty).
 *  4. reset semantics (DB, snapshot-protected) — resetTestSection() leaves
 *     exactly the canonical records, serial ids 1..N, exact-set counter.
 *
 * The DB blocks write ONLY the test3 rows of matrix_test (block 4 snapshots
 * and restores the whole table + counter + sequence). Healing is a feature:
 * a green run leaves the live playground canonical.
 */

import { describe, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getColumnNameByModel, getOrderedSubtree } from '../../src/core/ontology/resolver.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import {
	BASE_RECORD_IDS,
	CANONICAL_RECORD_IDS,
	CANONICAL_SECTION_TIPO,
	CANONICAL_TABLE,
	CLONE_RECORD_IDS,
	CLONE_SOURCE_ID,
	COMPONENT_DATA_COLUMNS,
	EXTRA_COMPONENT_TIPOS,
	LEDGERED_EMPTY_TIPOS,
	REQUIRED_SHAPES,
	SUITE_ISOLATION_RECORDS,
} from '../../src/core/test_data/manifest.ts';
import {
	type CanonicalRecord,
	canonicalTest3Drift,
	loadCanonicalTest3Fixture,
	resetTestSection,
	restoreCanonicalTest3,
} from '../../src/core/test_data/seed.ts';

const fixture = await loadCanonicalTest3Fixture();

function record(sectionId: number): CanonicalRecord {
	const found = fixture.records.find((entry) => entry.section_id === sectionId);
	if (!found) throw new Error(`fixture record ${sectionId} missing`);
	return found;
}

function componentItems(rec: CanonicalRecord, column: string, tipo: string): unknown[] {
	const columnValue = rec[column as keyof CanonicalRecord];
	if (columnValue === null || typeof columnValue !== 'object') return [];
	const items = (columnValue as Record<string, unknown>)[tipo];
	return Array.isArray(items) ? items : [];
}

function populatedAnywhere(rec: CanonicalRecord, tipo: string): boolean {
	return COMPONENT_DATA_COLUMNS.some((column) => componentItems(rec, column, tipo).length > 0);
}

describe('1. fixture ↔ manifest (no DB)', () => {
	test('record set matches the manifest', () => {
		expect(fixture.section_tipo).toBe(CANONICAL_SECTION_TIPO);
		expect(fixture.records.map((entry) => entry.section_id).sort((a, b) => a - b)).toEqual([
			...CANONICAL_RECORD_IDS,
		]);
		// The canonical set = live-captured base + per-suite isolation clones.
		expect([...CANONICAL_RECORD_IDS]).toEqual(
			[...BASE_RECORD_IDS, ...CLONE_RECORD_IDS].sort((a, b) => a - b),
		);
		// No base id doubles as a clone id (a clone would shadow a captured record).
		for (const cloneId of CLONE_RECORD_IDS) {
			expect(BASE_RECORD_IDS as readonly number[]).not.toContain(cloneId);
		}
	});

	test('per-suite isolation clones are true copies of record 1', () => {
		// The isolation map and the clone-id list are the same set (no drift).
		expect(
			Object.keys(SUITE_ISOLATION_RECORDS)
				.map(Number)
				.sort((a, b) => a - b),
		).toEqual([...CLONE_RECORD_IDS]);
		const source = record(CLONE_SOURCE_ID);
		for (const cloneId of CLONE_RECORD_IDS) {
			const clone = record(cloneId);
			// Same component shapes on every jsonb column EXCEPT the self-identity
			// metadata blob (`data.section_id` is rewritten to the clone id).
			for (const column of MATRIX_JSONB_COLUMNS) {
				if (column === 'data') continue;
				expect(clone[column], `clone test3/${cloneId} column ${column} != record 1`).toEqual(
					source[column],
				);
			}
			const data = clone.data as Record<string, unknown> | null;
			expect(data?.section_id, `clone test3/${cloneId} data.section_id`).toBe(cloneId);
		}
	});

	test('every REQUIRED_SHAPES predicate holds', () => {
		for (const shape of REQUIRED_SHAPES) {
			const items = componentItems(record(shape.sectionId), shape.column, shape.tipo);
			expect(
				items.length,
				`${shape.tipo} on test3/${shape.sectionId} (${shape.why})`,
			).toBeGreaterThan(0);
			if (shape.langs) {
				const langs = new Set(
					items.map((item) => (item as { lang?: string } | null)?.lang ?? '<no lang>'),
				);
				expect([...langs].sort(), `${shape.tipo} on test3/${shape.sectionId} langs`).toEqual(
					[...shape.langs].sort(),
				);
			}
		}
	});

	test('no null/empty-string holes in any component item array', () => {
		for (const rec of fixture.records) {
			for (const column of COMPONENT_DATA_COLUMNS) {
				const columnValue = rec[column];
				if (columnValue === null || typeof columnValue !== 'object') continue;
				for (const [tipo, items] of Object.entries(columnValue as Record<string, unknown>)) {
					if (!Array.isArray(items)) continue;
					for (const item of items) {
						expect(item, `hole in ${column}.${tipo} on test3/${rec.section_id}`).not.toBeNull();
						expect(item, `hole in ${column}.${tipo} on test3/${rec.section_id}`).not.toBe('');
					}
				}
			}
		}
	});

	test('ledgered-empty list is not stale (no ledgered tipo is populated)', () => {
		const rec1 = record(1);
		for (const tipo of Object.keys(LEDGERED_EMPTY_TIPOS)) {
			expect(populatedAnywhere(rec1, tipo), `${tipo} is populated — remove its ledger entry`).toBe(
				false,
			);
		}
	});

	test('every declared extra tipo is actually used by the fixture', () => {
		for (const tipo of Object.keys(EXTRA_COMPONENT_TIPOS)) {
			const used = fixture.records.some((rec) => populatedAnywhere(rec, tipo));
			expect(used, `extra tipo ${tipo} unused — remove its entry`).toBe(true);
		}
	});
});

describe('2. ontology coverage (DB)', () => {
	test('every data-bearing test3 component is populated on record 1 or ledgered', async () => {
		const subtree = await getOrderedSubtree(CANONICAL_SECTION_TIPO);
		const components = subtree.filter(
			(node) => typeof node.model === 'string' && node.model.startsWith('component_'),
		);
		expect(components.length).toBeGreaterThan(30); // the playground census floor
		const rec1 = record(1);
		const undecided: string[] = [];
		for (const node of components) {
			const column = getColumnNameByModel(node.model as string);
			if (column === null || !(COMPONENT_DATA_COLUMNS as readonly string[]).includes(column)) {
				continue; // no jsonb data slot (section_id, html_text, …)
			}
			const covered = componentItems(rec1, column, node.tipo as string).length > 0;
			if (!covered && LEDGERED_EMPTY_TIPOS[node.tipo as string] === undefined) {
				undecided.push(`${node.tipo} (${node.model} → ${column})`);
			}
		}
		// A new test3 component forces a fixture decision: populate it via
		// scripts/capture_test3_fixture.ts or ledger it in manifest.ts.
		expect(undecided).toEqual([]);
	});

	test('no orphan fixture keys (subtree tipo or declared extra)', async () => {
		const subtree = await getOrderedSubtree(CANONICAL_SECTION_TIPO);
		const subtreeTipos = new Set(subtree.map((node) => node.tipo as string));
		const orphans: string[] = [];
		for (const rec of fixture.records) {
			for (const column of COMPONENT_DATA_COLUMNS) {
				const columnValue = rec[column];
				if (columnValue === null || typeof columnValue !== 'object') continue;
				for (const tipo of Object.keys(columnValue as Record<string, unknown>)) {
					if (!subtreeTipos.has(tipo) && EXTRA_COMPONENT_TIPOS[tipo] === undefined) {
						orphans.push(`${tipo} (${column} on test3/${rec.section_id})`);
					}
				}
			}
		}
		expect(orphans).toEqual([]);

		// Ledger hygiene: every ledgered tipo is a real subtree component.
		for (const tipo of Object.keys(LEDGERED_EMPTY_TIPOS)) {
			expect(subtreeTipos.has(tipo), `ledgered tipo ${tipo} left the section`).toBe(true);
		}
	});
});

describe('3. restore round-trip (DB)', () => {
	test('restoreCanonicalTest3 reproduces the fixture exactly', async () => {
		const { restored } = await restoreCanonicalTest3();
		expect(restored).toBe(fixture.records.length);
		expect(await canonicalTest3Drift()).toEqual([]);
		const counter = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
			CANONICAL_SECTION_TIPO,
		])) as { value: number }[];
		const maxCanonicalId = Math.max(...fixture.records.map((entry) => entry.section_id));
		expect(Number(counter[0]?.value)).toBeGreaterThanOrEqual(maxCanonicalId);
	});

	test('the engine reads every populated record-1 component (entries non-empty)', async () => {
		const rec1 = record(1);
		for (const column of COMPONENT_DATA_COLUMNS) {
			const columnValue = rec1[column];
			if (columnValue === null || typeof columnValue !== 'object') continue;
			for (const [tipo, items] of Object.entries(columnValue as Record<string, unknown>)) {
				if (!Array.isArray(items) || items.length === 0) continue;
				// Translatable components slice by lang: read with the stored lang.
				const lang = (items[0] as { lang?: string } | null)?.lang ?? 'lg-eng';
				const emitted = await readComponentData({
					action: 'read',
					source: {
						tipo,
						section_tipo: CANONICAL_SECTION_TIPO,
						section_id: '1',
						mode: 'edit',
						lang,
					},
				} as never);
				const own = emitted.find((item) => item.tipo === tipo);
				expect(
					Array.isArray(own?.entries) && (own?.entries as unknown[]).length > 0,
					`${tipo} (${column}, lang ${lang}) emitted no entries`,
				).toBe(true);
			}
		}
	}, 60000);
});

describe('4. reset semantics (DB, snapshot-protected)', () => {
	test('resetTestSection leaves exactly the canonical records', async () => {
		const snapshot = (await sql.unsafe(
			`SELECT * FROM "${CANONICAL_TABLE}" ORDER BY id`,
			[],
		)) as Record<string, unknown>[];
		const counterBefore = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
			CANONICAL_SECTION_TIPO,
		])) as { value: number }[];
		try {
			const { records } = await resetTestSection();
			expect(records).toBe(fixture.records.length);

			const rows = (await sql.unsafe(
				`SELECT id, section_id, section_tipo FROM "${CANONICAL_TABLE}" ORDER BY section_id`,
				[],
			)) as { id: number; section_id: number; section_tipo: string }[];
			expect(rows.length).toBe(fixture.records.length);
			expect(rows.map((row) => Number(row.section_id))).toEqual([...CANONICAL_RECORD_IDS]);
			expect(rows.every((row) => row.section_tipo === CANONICAL_SECTION_TIPO)).toBe(true);
			// serial ids restart at 1 (ascending insert order)
			expect(rows.map((row) => Number(row.id))).toEqual(
				fixture.records.map((_, index) => index + 1),
			);
			expect(await canonicalTest3Drift()).toEqual([]);

			const counter = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
				CANONICAL_SECTION_TIPO,
			])) as { value: number }[];
			const maxCanonicalId = Math.max(...fixture.records.map((entry) => entry.section_id));
			expect(Number(counter[0]?.value)).toBe(maxCanonicalId);
		} finally {
			// restore the snapshot verbatim (columns + ids + sequence + counter)
			await sql.unsafe(`TRUNCATE TABLE "${CANONICAL_TABLE}"`, []);
			for (const row of snapshot) {
				const columns = Object.keys(row);
				const placeholders = columns.map((column, position) =>
					['id', 'section_id', 'section_tipo'].includes(column)
						? `$${position + 1}`
						: `$${position + 1}::text::jsonb`,
				);
				await sql.unsafe(
					`INSERT INTO "${CANONICAL_TABLE}" (${columns.map((c) => `"${c}"`).join(', ')})
					 VALUES (${placeholders.join(', ')})`,
					columns.map((column) =>
						row[column] === null || ['id', 'section_id', 'section_tipo'].includes(column)
							? (row[column] as string | number | null)
							: JSON.stringify(row[column]),
					) as (string | number | null)[],
				);
			}
			await sql.unsafe(
				`SELECT setval('${CANONICAL_TABLE}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM "${CANONICAL_TABLE}"))`,
				[],
			);
			if (counterBefore.length > 0) {
				await sql.unsafe('UPDATE matrix_counter SET value = $1 WHERE tipo = $2', [
					Number(counterBefore[0]?.value),
					CANONICAL_SECTION_TIPO,
				]);
			}
		}
	}, 60000);
});
