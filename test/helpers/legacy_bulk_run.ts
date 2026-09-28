/**
 * LEGACY BULK RUNS — the shape a bulk run left in `matrix_time_machine` BEFORE
 * the undo log (WC-2026-09-27-bulk-revert-undo-log): ONE visible row per write
 * (tm_role NULL) carrying the run's bulk id, and no hidden BEFORE row. Every
 * PHP-era run looks like that forever — its main rows COMPOSED (the main + all
 * its frames) — so the revert's legacy path (§2.6) must keep working on them.
 * (TS-era beta runs are unsupported history, decision 2026-09-28.)
 *
 * No door writes that shape any more (every save under a bulk id writes a
 * BEFORE/AFTER pair, decision D1), so a gate BUILDS it here, raw:
 *   - `insertLegacyBulkRow` — one visible row with an explicit bulk id (or
 *     none), as a pre-undo-log / PHP-era save wrote it (optionally with a
 *     PHP-era lang tag, a null payload for a wipe, or an explicit timestamp for
 *     a sibling-wipe shape). Its id is ordinary: a PHP row reads exactly like
 *     an engine row (the one reading rule, decision 2026-09-28);
 *   - `demoteToLegacyRun` — take a run written today and strip its undo log
 *     (the hidden rows of that bulk id), leaving exactly what a legacy run of
 *     the same writes would have left.
 *
 * THE MARKER LAW: both call `assertTestDatabase()` before their first write —
 * they write the time machine's own table, which nothing but a suite database
 * may see a test write to.
 */

import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

export interface LegacyBulkRow {
	sectionTipo: string;
	sectionId: number;
	tipo: string;
	/** The row's language tag; null/'' for the PHP-era untagged shape. */
	lang: string | null;
	bulkId: number | null;
	/** The row's image; `null` stores SQL NULL (a wipe / a per-language clear). */
	data: unknown;
	userId?: number;
	/** Explicit timestamp (text) — for a wipe whose sibling rows must share it. Default now(). */
	timestamp?: string;
}

/** Insert one VISIBLE legacy row (tm_role NULL). Returns its id. */
export async function insertLegacyBulkRow(row: LegacyBulkRow): Promise<number> {
	await assertTestDatabase('insertLegacyBulkRow');
	const inserted = (await sql.unsafe(
		`INSERT INTO matrix_time_machine
		   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
		 VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, now()), $6, $7,
		         CASE WHEN $8::text IS NULL THEN NULL ELSE $8::text::jsonb END)
		 RETURNING id`,
		[
			row.sectionId,
			row.sectionTipo,
			row.tipo,
			row.lang,
			row.timestamp ?? null,
			String(row.userId ?? -1),
			row.bulkId,
			row.data === null ? null : encodeForJsonb(row.data),
		],
	)) as { id: number }[];
	return Number(inserted[0]?.id ?? 0);
}

/**
 * Strip the undo log of a run (every row of `bulkId` whose tm_role is set),
 * leaving the visible rows — composed, like a PHP-era run's — which is the
 * legacy shape of the same writes. Returns the number of hidden rows removed.
 */
export async function demoteToLegacyRun(bulkId: number): Promise<number> {
	await assertTestDatabase('demoteToLegacyRun');
	const removed = (await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE bulk_process_id = $1 AND tm_role IS NOT NULL
		 RETURNING id`,
		[bulkId],
	)) as unknown[];
	return removed.length;
}
