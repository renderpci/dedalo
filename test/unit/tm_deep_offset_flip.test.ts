/**
 * Deep-page ORDER-FLIP equivalence (read_tm.ts queryTmRows).
 *
 * The bare dd15 browse orders by the unique PK `id`. "Navigate to the last
 * records" sends a plain OFFSET ≈ row-count, which makes Postgres walk and
 * discard every skipped row (≈3.7 s at offset 50 M on the 50 M-row perf DB).
 * queryTmRows rewrites a far-half page into the SAME rows fetched from the
 * opposite end with a small offset, reversed in memory (last page → OFFSET 0).
 *
 * THIS is the contract that rewrite must never break: for every offset —
 * shallow (plain path), deep near-half (late-lookup, no flip), far-half + last
 * page (flip) — the acquired page must equal the ground-truth
 * `ORDER BY id DESC LIMIT L OFFSET O` byte-for-byte in id and order.
 *
 * Scratch hygiene: seeds > threshold disposable rows on a scratch section_tipo
 * so the flip regime is actually reached on a small test DB (the perf DB is
 * proven separately via EXPLAIN); all seeded rows deleted in afterAll. The bare
 * browse counts EVERY row, so ground truth and acquisition see the same total.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Sqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { tmReadSource } from '../../src/core/resolve/read_tm.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';

const LIMIT = 5;
const threshold = config.ops.searchLateRowLookupOffset;
const SCRATCH_TIPO = 'test_tm_flip'; // disposable scratch section_tipo
// Enough rows that offset === threshold is already in the far half (flips).
const SEED = Math.max(threshold, 0) + 100;

/** The bare dd15 list sqo (whereSql 'true', default id DESC order). */
function bareSqo(offset: number): Sqo {
	return { section_tipo: ['dd15'], limit: LIMIT, offset } as unknown as Sqo;
}

/** Ground truth: the plain page the flip must reproduce. */
async function plainPageIds(offset: number): Promise<number[]> {
	const rows = (await sql.unsafe(
		'SELECT id FROM matrix_time_machine ORDER BY id DESC LIMIT $1 OFFSET $2',
		[LIMIT, offset],
	)) as { id: number }[];
	return rows.map((r) => r.id);
}

async function acquiredPageIds(offset: number): Promise<number[]> {
	const rows = await tmReadSource.getRows(bareSqo(offset));
	return rows.map((r) => r.section_id);
}

async function totalRows(): Promise<number> {
	const rows = (await sql.unsafe('SELECT COUNT(*)::int AS c FROM matrix_time_machine')) as {
		c: number;
	}[];
	return Number(rows[0]?.c ?? 0);
}

beforeAll(async () => {
	if (threshold < 0) return; // rewrite disabled — nothing to seed/exercise
	await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id)
		 SELECT g, $1, 'numisdata16', 'lg-spa', NOW(), '-1'
		 FROM generate_series(1, $2) AS g`,
		[SCRATCH_TIPO, SEED],
	);
	// The bare-browse count is cached (30 s TTL): a save/delete clears it, but this
	// raw INSERT does not — force an exact count so the flip sees the seeded total.
	await tmReadSource.count({ section_tipo: ['dd15'] } as unknown as Sqo);
});

afterAll(async () => {
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SCRATCH_TIPO]);
	// The seed cached a bare-count total that included the now-deleted rows. A raw
	// DELETE does not clear the module-level cache; invalidate it so no stale total
	// leaks into the next test file sharing this process (cf. tm_count_cache).
	await fireSaveEvent('test3');
});

describe('TM deep-page order-flip equivalence (real DB)', () => {
	test('rewrite is enabled (threshold >= 0) — else this gate is vacuous', () => {
		// A -1 (disabled) install would pass every assertion trivially; surface it.
		expect(threshold).toBeGreaterThanOrEqual(0);
	});

	test('shallow page (offset 0, plain path) matches ground truth', async () => {
		expect(await acquiredPageIds(0)).toEqual(await plainPageIds(0));
	}, 30000);

	test('deep + last-page offsets (flip path) match ground truth', async () => {
		const total = await totalRows();
		expect(total).toBeGreaterThan(threshold + LIMIT); // the seed must have reached the flip regime

		const lastPage = Math.max(0, total - LIMIT); // "navigate to the last records"
		const offsets = [
			threshold, // just into the deep regime → far half here, flips
			Math.floor(total / 2), // the crossover
			Math.max(threshold, total - 20), // deepest full page → flips, near OFFSET 0
			lastPage, // the reported slow case → OFFSET 0 after flip
		];

		for (const offset of offsets) {
			expect(await acquiredPageIds(offset)).toEqual(await plainPageIds(offset));
		}
	}, 60000);

	test('last partial page (offset within LIMIT of the end) matches ground truth', async () => {
		const total = await totalRows();
		const offset = total - 2; // only 2 rows remain → ascLimit clamp exercised
		expect(await acquiredPageIds(offset)).toEqual(await plainPageIds(offset));
	}, 30000);

	test('ASC order also flips exactly (opposite direction)', async () => {
		const total = await totalRows();
		const offset = Math.max(threshold, total - 20);
		const ascSqo = {
			section_tipo: ['dd15'],
			limit: LIMIT,
			offset,
			order: [{ path: [{ component_tipo: 'id' }], direction: 'ASC' }],
		} as unknown as Sqo;
		const acquired = (await tmReadSource.getRows(ascSqo)).map((r) => r.section_id);
		const ground = (
			(await sql.unsafe('SELECT id FROM matrix_time_machine ORDER BY id ASC LIMIT $1 OFFSET $2', [
				LIMIT,
				offset,
			])) as { id: number }[]
		).map((r) => r.id);
		expect(acquired).toEqual(ground);
	}, 60000);
});
