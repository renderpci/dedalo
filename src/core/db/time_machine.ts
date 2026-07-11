/**
 * Time Machine access — the matrix_time_machine audit table.
 *
 * TM is Dédalo's per-component change history, surfaced in the app as the
 * VIRTUAL section 'dd15'. Its table does NOT follow the standard matrix
 * contract (matrix.ts): rows are FLAT audit columns, one row per component
 * change (verified against the live dedalo_mib_v7 schema):
 *
 *   id               int PK    TM row id — this is what dd15 uses as section_id
 *   section_id       int       SOURCE record's section_id
 *   section_tipo     text      SOURCE record's section_tipo (e.g. 'oh1' — NEVER 'dd15'!)
 *   tipo             text      component tipo that changed
 *   lang             text      language of the changed data
 *   timestamp        text      when the change happened
 *   user_id          int       who changed it
 *   bulk_process_id  int|null  bulk operation identifier
 *   bulk_process_temp         (transient bulk bookkeeping)
 *   data             jsonb     the component data snapshot
 *
 * CONTRACT POINTS the rewrite must keep (PHP: core/tm_record/class.tm_record.php,
 * core/search/class.search_tm.php):
 *
 * - section_tipo MISMATCH: the dd15 virtual section addresses TM rows by the
 *   TM row `id` (as its section_id), while the row's own section_tipo column
 *   holds the SOURCE section. Never filter TM by section_tipo='dd15' — the
 *   PHP search_tm build_main_where() is intentionally empty for this reason.
 * - APPEND-ONLY (header re-dated 2026-07-07, S2-45 — the old "this module
 *   exposes no write functions" claim was false): this module exports
 *   recordTimeMachine, the ONE writer the save/delete/restore pipelines
 *   append through. TM rows are never UPDATEd or DELETEd — the dd15 surface
 *   is a read-only view over an append-only table.
 * - Default ordering is timestamp DESC (search_tm default).
 * - SQO mode 'tm' routes to the TM search engine (Phase 3).
 */

import { sql } from './postgres.ts';

/** The dd15 virtual section tipo (PHP DEDALO_TIME_MACHINE_SECTION_TIPO). */
export const TIME_MACHINE_SECTION_TIPO = 'dd15';

/** One matrix_time_machine row (flat audit contract). */
export interface TimeMachineRow {
	/** TM row primary key — what dd15 components receive as their section_id. */
	id: number;
	/** SOURCE record coordinates (NOT dd15). */
	section_id: number;
	section_tipo: string;
	/** Component tipo whose data changed. */
	tipo: string;
	lang: string | null;
	timestamp: string | null;
	user_id: number | null;
	bulk_process_id: number | null;
	/** Parsed component data snapshot. */
	data: unknown;
	/** Raw data::text twin for parity diffing (byte-compat rule, spec §2.2). */
	dataText: string | null;
}

function rowFromDb(row: Record<string, unknown>): TimeMachineRow {
	return {
		id: row.id as number,
		section_id: row.section_id as number,
		section_tipo: row.section_tipo as string,
		tipo: row.tipo as string,
		lang: (row.lang as string | null) ?? null,
		timestamp: (row.timestamp as string | null) ?? null,
		user_id: (row.user_id as number | null) ?? null,
		bulk_process_id: (row.bulk_process_id as number | null) ?? null,
		data: row.data,
		dataText: (row.data__text as string | null) ?? null,
	};
}

/** Read one TM row by its primary key (the dd15 'section_id'). */
export async function readTimeMachineRow(tmRowId: number): Promise<TimeMachineRow | null> {
	const rows = (await sql`
		SELECT id, section_id, section_tipo, tipo, lang, timestamp, user_id,
		       bulk_process_id, data, data::text AS data__text
		FROM matrix_time_machine
		WHERE id = ${tmRowId}
		LIMIT 1
	`) as Record<string, unknown>[];
	const row = rows[0];
	return row === undefined ? null : rowFromDb(row);
}

/**
 * TIME MACHINE WRITE HOOK (Phase 2 stub — wired by the section_record save
 * pipeline in Phase 6).
 *
 * In PHP, every component data save ALSO appends an audit row to
 * matrix_time_machine (core/db/class.tm_db_manager.php, called from the
 * section_record save path). The TS save pipeline must do the same or the
 * dd15 history silently stops recording — this interface is the contract so
 * Phase 6 cannot forget it: the save pipeline takes a TimeMachineWriteHook
 * and calls it once per component data change, in the same transaction.
 */
// TM timestamps come from db_timestamp.ts dbTimestamp() — the ONE shared
// DEDALO_TIMEZONE-aware helper (S1-03). A UTC `nowDbTimestamp` used to live
// here and skewed the save-path TM rows 2h against the PHP-stamped local rows;
// never reintroduce a second clock.

export interface TimeMachineEntry {
	/** SOURCE record coordinates. */
	sectionTipo: string;
	sectionId: number;
	/** Component tipo whose data changed. */
	componentTipo: string;
	lang: string;
	userId: number;
	/** The component data snapshot to audit (encoded via json_codec at write). */
	data: unknown;
	bulkProcessId?: number | null;
}

export type TimeMachineWriteHook = (entry: TimeMachineEntry) => Promise<void>;

/**
 * Sections excluded from Time Machine (PHP tm_record::$excluded_section_tipos —
 * volatile/utility sections). dd15 itself is also refused.
 */
export const TM_EXCLUDED_SECTIONS: ReadonlySet<string> = new Set([TIME_MACHINE_SECTION_TIPO]);

/**
 * Append one audit row for a component data change (PHP tm_record::create →
 * tm_db_manager::create). Stores the NEW component data snapshot with the
 * source coordinates, a DB timestamp, and the acting user. Skipped for
 * excluded sections and non-positive section ids.
 *
 * The data value goes through the json_codec byte-compat chokepoint (bound as
 * $n::text::jsonb, per the matrix_write BUN GOTCHA).
 */
export async function recordTimeMachine(entry: TimeMachineEntry, timestamp: string): Promise<void> {
	if (entry.sectionId <= 0) return;
	if (TM_EXCLUDED_SECTIONS.has(entry.sectionTipo)) return;

	const { encodeForJsonb } = await import('./json_codec.ts');
	await sql.unsafe(
		`INSERT INTO matrix_time_machine
		   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb)`,
		[
			entry.sectionId,
			entry.sectionTipo,
			entry.componentTipo,
			entry.lang,
			timestamp,
			entry.userId,
			entry.bulkProcessId ?? null,
			encodeForJsonb(entry.data),
		],
	);
}

/**
 * Change history of one component on one SOURCE record, newest first
 * (the search_tm default ordering).
 */
export async function readTimeMachineHistory(
	sourceSectionTipo: string,
	sourceSectionId: number,
	componentTipo: string,
	limit = 50,
): Promise<TimeMachineRow[]> {
	const rows = (await sql`
		SELECT id, section_id, section_tipo, tipo, lang, timestamp, user_id,
		       bulk_process_id, data, data::text AS data__text
		FROM matrix_time_machine
		WHERE section_tipo = ${sourceSectionTipo}
		  AND section_id = ${sourceSectionId}
		  AND tipo = ${componentTipo}
		ORDER BY timestamp DESC
		LIMIT ${limit}
	`) as Record<string, unknown>[];
	return rows.map(rowFromDb);
}
