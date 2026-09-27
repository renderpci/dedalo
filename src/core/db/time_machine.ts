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
import { ensureRecordGenerationTable, tmEpochPredicate } from './record_generation.ts';

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
 * $n::text::jsonb, per the matrix_write BUN GOTCHA). Returns the new row's id
 * (`null` when the row was skipped).
 */
export async function recordTimeMachine(
	entry: TimeMachineEntry,
	timestamp: string,
): Promise<number | null> {
	if (entry.sectionId <= 0) return null;
	if (TM_EXCLUDED_SECTIONS.has(entry.sectionTipo)) return null;

	const { encodeForJsonb } = await import('./json_codec.ts');
	const inserted = (await sql.unsafe(
		`INSERT INTO matrix_time_machine
		   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb)
		 RETURNING id`,
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
	)) as { id: number | string }[];
	const id = inserted[0]?.id;
	return id === undefined ? null : Number(id);
}

/**
 * Rewrite the `data` of ONE TM row this very transaction wrote — the CSV
 * append's post-row frame composition (`recomposeAppendTmRows`,
 * save_component.ts) and nothing else: the row is the executor's own,
 * uncommitted (invisible to every other transaction, so its read needs no
 * lock), and its main items are kept; only the frames it composes are
 * brought up to the row's end state. Never an edit of committed history.
 */
export async function replaceTimeMachineRowData(id: number, data: unknown): Promise<void> {
	const { encodeForJsonb } = await import('./json_codec.ts');
	await sql.unsafe('UPDATE matrix_time_machine SET data = $2::text::jsonb WHERE id = $1', [
		id,
		encodeForJsonb(data),
	]);
}

/**
 * THE PER-LANGUAGE HISTORY of a lang-sliced component (SQL predicate over
 * `matrix_time_machine`, `param` the bound language) — shared by the dd800
 * bulk revert's pre-batch walk and the append-baseline probe, so both read
 * one history. A row belongs to language L when it is TAGGED L, or when its
 * data CARRIES items of L whatever its tag (NULL / '' pre-migration rows, and
 * the live writers that tag ONE language but store ALL of them: tool_lang
 * translation, tool_propagate_component_data, the duplicate_record backfill).
 * A row of another tag that carries no L item says nothing about L and is
 * never eligible. Such rows are always read through `tmLangSliceSql` /
 * `tmAuditSlice`: a row speaks for L only.
 *
 * A NULL-DATA row (SQL NULL or jsonb `null`) is history of EVERY language
 * ONLY when it has the record WIPE's shape (`delete_data` empties every
 * language of the key): the wipes written before the per-language pairs (and
 * by PHP) carry ONE data-lang tag, and another language's walk skipped them and
 * restored the value they had deleted. A legacy wipe is recognised by its
 * shape, never by the null alone — an UNTAGGED null row, or one with a SIBLING
 * null row (another component of the same record, same timestamp: the wipe
 * empties several at once). A LONE null row tagged with another language is
 * that language's per-language CLEAR (PHP wrote null when a curator emptied
 * one language of a translatable component — ~96k such rows on one install)
 * and says nothing about L: read as a wipe, it made the revert of a later run
 * blank L instead of restoring it. `tmLangSliceSql` / `preBatchLangSlice`
 * read an admitted wipe row as the empty slice. The predicate is written for
 * an UNALIASED `matrix_time_machine` in the FROM clause (the sibling probe
 * correlates on the table name).
 */
export function tmLangHistoryPredicate(param: string): string {
	const isNull = (alias: string) =>
		`(${alias}.data IS NULL OR jsonb_typeof(${alias}.data) = 'null')`;
	const legacyWipe = `(${isNull('matrix_time_machine')} AND (matrix_time_machine.lang IS NULL OR matrix_time_machine.lang = '' OR EXISTS (
		SELECT 1 FROM matrix_time_machine wipe_sibling
		WHERE wipe_sibling.section_tipo = matrix_time_machine.section_tipo
		  AND wipe_sibling.section_id = matrix_time_machine.section_id
		  AND wipe_sibling.timestamp = matrix_time_machine.timestamp
		  AND wipe_sibling.tipo <> matrix_time_machine.tipo
		  AND ${isNull('wipe_sibling')}
		  AND ${tmEpochPredicate('wipe_sibling')})))`;
	return `(lang = ${param}::text OR ${legacyWipe} OR (jsonb_typeof(data) = 'array' AND data @> jsonb_build_array(jsonb_build_object('lang', ${param}::text))))`;
}

/**
 * A TM row's `data` as its slice of ONE language (SQL; the bulk revert's
 * `preBatchLangSlice` rule): the array items whose `lang` is `param`, in
 * order — plus, when the ROW is TAGGED `param`, its LANG-LESS items (no `lang`
 * key, '' or null: PHP-era rows, and the dd490 frames a main's row composes),
 * which belong to the language their row is tagged with. A non-array (SQL
 * NULL, scalar) is the empty slice — as the revert reads it. The revert stamps
 * an adopted item with the language and this compares it unstamped; the only
 * value it is compared to (an append baseline, a stored slice whose items all
 * carry the language) never equals a slice holding a lang-less main item, so
 * such a row always earns a baseline — the exact pre-append value.
 */
export function tmLangSliceSql(param: string): string {
	const own = `'$[*] ? (@.lang == $l)'`;
	const tagged = `'$[*] ? (@.lang == $l || !exists(@.lang) || @.lang == "" || @.lang == null)'`;
	return `(CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_path_query_array(data, (CASE WHEN lang = ${param}::text THEN ${tagged} ELSE ${own} END)::jsonpath, jsonb_build_object('l', ${param}::text)) ELSE '[]'::jsonb END)`;
}

/**
 * How the NEWEST Time Machine row of one component on one SOURCE record
 * compares to a given value: `'none'` (no row), `'equal'` or `'differs'`. The
 * rows read are EXACTLY the ones the dd800 bulk revert walks for its pre-batch
 * snapshot (tool_time_machine bulk_revert.ts): the P0-14 epoch predicate, id
 * DESC, and — for a lang-sliced model (`lang` given) — the rows of THIS
 * LANGUAGE's history (`tmLangHistoryPredicate`), each compared as its slice of
 * that language (`tmLangSliceSql`), so the probe and the revert see the same
 * history and the same value. Used by the CSV-import APPEND save: its
 * pre-append value needs a baseline row whenever the revert would otherwise
 * restore something else — no history, OR history whose newest row is stale
 * because a later write ran with saveTm:false (a TM-off import, legacy
 * replace-envelope frames). Compared in SQL (jsonb equality: key order and
 * whitespace never count), the value bound through the json_codec chokepoint.
 *
 * `'in_run'`: the newest row belongs to `runBulkProcessId` — the CURRENT dd800
 * run already wrote this component (a repeated section_id). The run's
 * pre-state then sits BELOW its own rows, where the revert's walk finds it; a
 * baseline written now would snapshot a value the run itself produced, stop
 * that walk early, and leave the run's earlier appends in place. Checked
 * before the content comparison, so a drift between two appends of one run
 * never earns a baseline.
 */
export async function latestTimeMachineDataMatch(
	sourceSectionTipo: string,
	sourceSectionId: number,
	componentTipo: string,
	lang: string | null,
	data: unknown,
	runBulkProcessId: number | null = null,
): Promise<'none' | 'equal' | 'differs' | 'in_run'> {
	await ensureRecordGenerationTable();
	const { encodeForJsonb } = await import('./json_codec.ts');
	const langFilter = lang === null ? '' : `AND ${tmLangHistoryPredicate('$5')}`;
	const compared = lang === null ? 'data' : tmLangSliceSql('$5');
	const params: unknown[] = [
		sourceSectionTipo,
		sourceSectionId,
		componentTipo,
		encodeForJsonb(data),
	];
	if (lang !== null) params.push(lang);
	const rows = (await sql.unsafe(
		`SELECT (${compared} = $4::text::jsonb) AS equal, bulk_process_id FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ${langFilter}
		   AND ${tmEpochPredicate()} ORDER BY id DESC LIMIT 1`,
		params,
	)) as { equal: boolean | null; bulk_process_id: number | string | null }[];
	return classifyNewestTmRow(rows[0], runBulkProcessId);
}

/** latestTimeMachineDataMatch's verdict on its one newest row (run first, then content). */
function classifyNewestTmRow(
	newest: { equal: boolean | null; bulk_process_id: number | string | null } | undefined,
	runBulkProcessId: number | null,
): 'none' | 'equal' | 'differs' | 'in_run' {
	if (newest === undefined) return 'none';
	if (runBulkProcessId !== null && Number(newest.bulk_process_id) === runBulkProcessId) {
		return 'in_run';
	}
	return newest.equal === true ? 'equal' : 'differs';
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
