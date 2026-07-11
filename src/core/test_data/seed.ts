/**
 * Seed/restore the canonical test3 playground records from the single
 * verified source (test3_canonical.json; shape contract in manifest.ts).
 *
 * Two write modes:
 *  - resetTestSection()       — the unit_test maintenance-widget semantics:
 *    TRUNCATE matrix_test, restart its id sequence, insert the canonical
 *    records, exact-set the test3 counter. Destroys EVERY row in the table
 *    (scratch tipos included) — maintenance/install surfaces only.
 *  - restoreCanonicalTest3()  — surgical: replaces only the test3 rows
 *    (canonical + accumulated strays), leaves other tipos, the sequence and
 *    higher counter values untouched. Safe for test harness self-healing.
 *
 * matrix_time_machine rows are deliberately untouched in both modes — the PHP
 * unit_test widget never touched them either, and the surviving TM history is
 * why the surgical counter update is raise-only (GREATEST): lowering it would
 * re-issue section_ids that still have TM rows.
 *
 * ALS note: no request principal/lang is read here — callable from the widget
 * handler, tests, scripts and the installer alike. fireSaveEvent self-defers
 * inside the ambient transaction (save_event.ts), so data-derived caches are
 * notified post-commit.
 */

import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn, readMatrixRecord } from '../db/matrix.ts';
import { updateMatrixRecord } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';
import {
	CANONICAL_RECORD_IDS,
	CANONICAL_SECTION_TIPO,
	CANONICAL_TABLE,
	CLONE_RECORD_IDS,
	CLONE_SOURCE_ID,
} from './manifest.ts';

export type CanonicalRecord = { section_id: number } & Record<MatrixJsonbColumn, unknown>;

export interface CanonicalFixture {
	meta: Record<string, unknown>;
	section_tipo: string;
	records: CanonicalRecord[];
}

export async function loadCanonicalTest3Fixture(): Promise<CanonicalFixture> {
	// Dynamic import: rarely-hit lazy loading (CONVENTIONS §2 rationale 3) —
	// the fixture only loads when a seed/verify path actually runs.
	const module = await import('./test3_canonical.json');
	const base = module.default as unknown as CanonicalFixture;
	return materializeCloneRecords(base);
}

/**
 * Deep-copy record CLONE_SOURCE_ID into every per-suite isolation id
 * (CLONE_RECORD_IDS). The clones carry the SAME component shapes as record 1,
 * so every manifest predicate / hole-check / coverage rule holds by
 * construction; only the record's self-identity metadata (data.section_id) is
 * rewritten to the clone id. The captured JSON stays the pure base capture —
 * the isolation records are a deterministic, in-code derivation.
 */
function materializeCloneRecords(base: CanonicalFixture): CanonicalFixture {
	const source = base.records.find((record) => record.section_id === CLONE_SOURCE_ID);
	if (source === undefined) {
		throw new Error(
			`clone source ${CANONICAL_SECTION_TIPO}/${CLONE_SOURCE_ID} missing from fixture`,
		);
	}
	const clones = CLONE_RECORD_IDS.map((cloneId) => cloneCanonicalRecord(source, cloneId));
	return { ...base, records: [...base.records, ...clones] };
}

function cloneCanonicalRecord(source: CanonicalRecord, sectionId: number): CanonicalRecord {
	const clone = structuredClone(source);
	clone.section_id = sectionId;
	// Keep the record's self-identity metadata consistent with the clone id
	// (the `data` blob's own section_id — NOT a coverage-counted component).
	const data = clone.data as Record<string, unknown> | null;
	if (data !== null && typeof data === 'object' && 'section_id' in data) {
		data.section_id = sectionId;
	}
	return clone;
}

function maxCanonicalSectionId(fixture: CanonicalFixture): number {
	return Math.max(...fixture.records.map((record) => record.section_id));
}

async function writeCanonicalRecord(record: CanonicalRecord): Promise<void> {
	const values: Record<string, string | null> = {};
	for (const column of MATRIX_JSONB_COLUMNS) {
		const value = record[column];
		values[column] = value === null || value === undefined ? null : JSON.stringify(value);
	}
	await updateMatrixRecord(CANONICAL_TABLE, CANONICAL_SECTION_TIPO, record.section_id, values, {
		rawTextPassthrough: true,
	});
}

/**
 * Maintenance/install reset: truncate matrix_test, restart the sequence,
 * insert the canonical records (ascending — serial ids land 1..N), exact-set
 * the test3 counter to MAX(canonical section_id).
 */
export async function resetTestSection(): Promise<{ records: number }> {
	const fixture = await loadCanonicalTest3Fixture();
	const records = [...fixture.records].sort((a, b) => a.section_id - b.section_id);
	await withTransaction(async () => {
		const tipoRows = (await sql.unsafe(
			`SELECT DISTINCT section_tipo FROM "${CANONICAL_TABLE}"`,
			[],
		)) as { section_tipo: string }[];
		await sql.unsafe(`TRUNCATE TABLE "${CANONICAL_TABLE}"`, []);
		await sql.unsafe(`ALTER SEQUENCE "${CANONICAL_TABLE}_id_seq" RESTART WITH 1`, []);
		for (const record of records) {
			await writeCanonicalRecord(record);
		}
		await sql.unsafe(
			`INSERT INTO matrix_counter (tipo, value) VALUES ($1, $2)
			 ON CONFLICT (tipo) DO UPDATE SET value = EXCLUDED.value`,
			[CANONICAL_SECTION_TIPO, maxCanonicalSectionId(fixture)],
		);
		// Every wiped tipo's data-derived caches must drop (post-commit).
		for (const row of tipoRows) {
			await fireSaveEvent(row.section_tipo);
		}
		if (!tipoRows.some((row) => row.section_tipo === CANONICAL_SECTION_TIPO)) {
			await fireSaveEvent(CANONICAL_SECTION_TIPO);
		}
	});
	return { records: records.length };
}

/**
 * Surgical restore: replace ALL test3 rows (canonical values + any strays a
 * client sweep or a crashed test left behind) without touching other tipos,
 * the id sequence, or TM history. Counter is raise-only.
 */
export async function restoreCanonicalTest3(): Promise<{ restored: number }> {
	const fixture = await loadCanonicalTest3Fixture();
	const records = [...fixture.records].sort((a, b) => a.section_id - b.section_id);
	await withTransaction(async () => {
		await sql.unsafe(`DELETE FROM "${CANONICAL_TABLE}" WHERE section_tipo = $1`, [
			CANONICAL_SECTION_TIPO,
		]);
		for (const record of records) {
			await writeCanonicalRecord(record);
		}
		await sql.unsafe(
			`INSERT INTO matrix_counter (tipo, value) VALUES ($1, $2)
			 ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(matrix_counter.value, EXCLUDED.value)`,
			[CANONICAL_SECTION_TIPO, maxCanonicalSectionId(fixture)],
		);
		await fireSaveEvent(CANONICAL_SECTION_TIPO);
	});
	return { restored: records.length };
}

/**
 * Which canonical records drifted from the fixture? Compares the live rows
 * column-by-column (parsed jsonb text, strict deep-equality — never byte
 * compare) and counts extra live test3 rows beyond the canonical set as
 * drift. Empty result = live is canonical.
 */
export async function canonicalTest3Drift(): Promise<number[]> {
	const fixture = await loadCanonicalTest3Fixture();
	const drifted: number[] = [];
	for (const record of fixture.records) {
		const live = await readMatrixRecord(CANONICAL_TABLE, CANONICAL_SECTION_TIPO, record.section_id);
		if (live === null) {
			drifted.push(record.section_id);
			continue;
		}
		for (const column of MATRIX_JSONB_COLUMNS) {
			const liveText = live.rawText[column];
			const liveValue = typeof liveText === 'string' ? JSON.parse(liveText) : null;
			const fixtureValue = record[column] ?? null;
			if (!Bun.deepEquals(liveValue, fixtureValue, true)) {
				drifted.push(record.section_id);
				break;
			}
		}
	}
	const canonicalIds = new Set<number>(CANONICAL_RECORD_IDS);
	const liveRows = (await sql.unsafe(
		`SELECT section_id FROM "${CANONICAL_TABLE}" WHERE section_tipo = $1 ORDER BY section_id`,
		[CANONICAL_SECTION_TIPO],
	)) as { section_id: number }[];
	for (const row of liveRows) {
		if (!canonicalIds.has(Number(row.section_id))) {
			drifted.push(Number(row.section_id));
		}
	}
	return drifted;
}
