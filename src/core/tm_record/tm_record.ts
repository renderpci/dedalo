/**
 * tm_record — materialize a virtual dd15 section record from one
 * matrix_time_machine row (PHP core/tm_record/class.tm_record.php
 * ::get_section_record, :569).
 *
 * A TM row is a FLAT audit snapshot (who / when / which component / which lang /
 * the jsonb datum). dd15 is a VIRTUAL section: it has no matrix table of its
 * own. To display TM history through the ordinary component pipeline with no
 * special-cased UI, PHP reconstructs a section_record keyed under dd15 and
 * injects each flat field as component data via the model→column map. TS does
 * the same over the passive MatrixRecord struct using the substitution API
 * (section_record/virtual_record.ts) — this module is the SINGLE place that
 * knows the dd15 field mapping (it used to be duplicated in read_tm.ts and
 * tool_time_machine.ts).
 *
 * Field mapping (PHP get_section_record):
 *   section_id      → dd1212 (number)      numeric id of the source record
 *   timestamp       → dd559  (date)        when the change was recorded
 *   tipo            → dd577  (input_text)  label of the changed component tipo
 *   section_tipo    → dd1772 (input_text)  label of the owning section tipo
 *   user_id         → dd578  (relation)    locator to the user record in dd128,
 *                                          ALSO written to dd200 (text_area compat)
 *   bulk_process_id → dd1371 (number)      enclosing bulk operation id (null→null)
 *   annotation      → rsc329 (text_area)   the TM note: looked up in the notes
 *                     section (rsc832) by its Code (rsc835) = the TM row id;
 *                     the note record's section_id rides on the FIRST item as
 *                     parent_section_id (PHP class.tm_record.php:690-755). The
 *                     inspector component_history note view consumes it.
 *   data            → source model 'section': adopt the snapshot's own component
 *                     columns wholesale (skip structural 'data'/'id'); other
 *                     models: inject under dd1574 (generic) + the component's own
 *                     tipo so component get_data() finds it — EXCEPT models with
 *                     no storable jsonb column (component_section_id, whose
 *                     "column" is the section_id PK): the own-tipo inject is
 *                     skipped (it would throw), matching PHP set_component_data
 *                     which logs + continues. The dd1574 copy still carries it.
 */

import type { MatrixJsonbColumn, MatrixRecord } from '../db/matrix.ts';
import { MATRIX_JSONB_COLUMNS, assertMatrixTable, readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import type { TimeMachineRow } from '../db/time_machine.ts';
import { TIME_MACHINE_SECTION_TIPO } from '../db/time_machine.ts';
import { termByTipo } from '../ontology/labels.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import {
	injectColumnData,
	injectComponentData,
	makeVirtualRecord,
} from '../section_record/virtual_record.ts';

/** dd15 virtual-section column-component tipos (PHP dd_tipos.php:208-220). */
export const TM_COLUMN_SECTION_ID = 'dd1212'; // component_number
export const TM_COLUMN_TIMESTAMP = 'dd559'; // component_date
export const TM_COLUMN_TIPO = 'dd577'; // component_input_text
export const TM_COLUMN_SECTION_TIPO = 'dd1772'; // component_input_text
export const TM_COLUMN_USER_ID = 'dd578'; // component_autocomplete_hi (relation)
export const TM_COLUMN_BULK_PROCESS_ID = 'dd1371'; // component_number
export const TM_COLUMN_DATA = 'dd1574'; // generic data column
export const TM_NOTES_TEXT = 'rsc329'; // component_text_area (annotation)
export const TM_NOTES_SECTION_TIPO = 'rsc832'; // DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO (dd_tipos.php:220)
const TM_NOTES_CODE_TIPO = 'rsc835'; // the notes section's Code (component_number): the annotated TM row id
const CREATED_BY_USER = 'dd200'; // DEDALO_SECTION_INFO_CREATED_BY_USER
const USERS_SECTION_TIPO = 'dd128'; // DEDALO_SECTION_USERS_TIPO
const RELATION_TYPE_LINK = 'dd151'; // DEDALO_RELATION_TYPE_LINK

/** The dataframe relation-type marker (PHP DEDALO_DATAFRAME_TYPE). */
const DATAFRAME_TYPE_TIPO = 'dd490';

/**
 * PHP component_common::is_dataframe_entry — dual-read: the unified dd490 type
 * marker OR the legacy pairing-key shape (main_component_tipo present).
 */
function isTmDataframeEntry(entry: unknown): boolean {
	if (entry === null || typeof entry !== 'object') return false;
	const candidate = entry as { type?: unknown; main_component_tipo?: unknown };
	return candidate.type === DATAFRAME_TYPE_TIPO || candidate.main_component_tipo !== undefined;
}

/**
 * Strip dataframe FRAME entries from a component's TM MAIN data (PHP
 * component_common::get_data data_source='tm' branch AND tool_time_machine::
 * apply_value): a TM snapshot of a dataframe-paired component carries BOTH the
 * main items and dd490 frame objects; the main render/restore must drop the
 * frames or a frame leaks into the main column. component_iri keeps only entries
 * carrying `iri` (frames never do); every other model drops entries flagged by
 * the dual-read dataframe predicate. Non-array data passes through unchanged.
 *
 * This is the SINGLE definition shared by the TM preview read (read.ts) and the
 * TM restore (tool_time_machine.ts) so the value the tool previews is exactly
 * the value "Apply and save" would write.
 */
export function stripDataframeFramesFromTmMain(model: string, data: unknown): unknown {
	if (!Array.isArray(data)) return data;
	if (model === 'component_iri') {
		return data.filter(
			(entry) => entry !== null && typeof entry === 'object' && Object.hasOwn(entry, 'iri'),
		);
	}
	return data.filter((entry) => !isTmDataframeEntry(entry));
}

/** '2026-07-01 10:13:08' → the dd_date object PHP emits for dd559. */
export function ddDateFromTimestamp(timestamp: string | null): Record<string, number> {
	if (timestamp === null) return {};
	const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (match === null) return {};
	return {
		day: Number(match[3]),
		month: Number(match[2]),
		year: Number(match[1]),
		hour: Number(match[4]),
		minute: Number(match[5]),
		second: Number(match[6]),
	};
}

/**
 * Inject one dd15 field into the virtual record via its ontology model
 * (PHP set_section_record_factory: resolve model → column, then set). Skips the
 * field (returns) when the ontology cannot resolve a model — PHP logs and
 * continues so the remaining fields still build.
 */
async function injectTmField(
	record: MatrixRecord,
	tipo: string,
	items: unknown[] | null,
): Promise<void> {
	const model = await getModelByTipo(tipo);
	if (model === null) return;
	const column = getColumnNameByModel(model);
	if (column === null || !MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) return;
	injectComponentData(record, tipo, model, items);
}

/**
 * The rsc329 annotation value for one TM row (PHP class.tm_record.php:690-755):
 * search the notes section (rsc832) for the record whose Code (rsc835) equals
 * the TM row id, adopt its rsc329 data verbatim (all langs — the emit side
 * lang-filters like PHP get_data_lang), and pin the note record's section_id on
 * the FIRST item as parent_section_id — component_text_area's 'tm' branch lifts
 * it onto the data item so the client note view can open/create the note record.
 * No note (or a note with no stored text) → PHP's single empty placeholder item
 * carrying only parent_section_id.
 */
async function tmNoteValue(tmRowId: number): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(TM_NOTES_SECTION_TIPO);
	const model = await getModelByTipo(TM_NOTES_TEXT);
	const column = model !== null ? getColumnNameByModel(model) : null;

	// PHP carries the searched section_id as the DB driver's string — the client
	// echoes it back into the note open/delete RQOs; keep the string shape.
	let noteSectionId: string | null = null;
	let noteItems: unknown[] | null = null;
	if (table !== null && column !== null) {
		assertMatrixTable(table);
		// PHP searches rsc835 as component_number with q = the TM row id; the
		// jsonb text projection matches both number and numeric-string storage.
		// Table identifier is allowlist-gated above; values are bound params.
		const rows = (await sql.unsafe(
			`SELECT section_id
			 FROM "${table}"
			 WHERE section_tipo = $1
			   AND EXISTS (
			     SELECT 1 FROM jsonb_array_elements(COALESCE(number->$2, '[]'::jsonb)) AS code
			     WHERE code->>'value' = $3
			   )
			 ORDER BY section_id ASC
			 LIMIT 1`,
			[TM_NOTES_SECTION_TIPO, TM_NOTES_CODE_TIPO, String(tmRowId)],
		)) as { section_id: number }[];
		const found = rows[0]?.section_id ?? null;
		if (found !== null) {
			noteSectionId = String(found);
			const noteRecord = await readMatrixRecord(table, TM_NOTES_SECTION_TIPO, Number(found));
			const columnValue = noteRecord?.columns[column as MatrixJsonbColumn];
			const items = (columnValue as Record<string, unknown> | null | undefined)?.[TM_NOTES_TEXT];
			// PHP get_data coerces non-array data to [$data]; null keeps the placeholder.
			noteItems = items == null ? null : Array.isArray(items) ? items : [items];
		}
	}

	const value = noteItems !== null && noteItems.length > 0 ? [...noteItems] : [{}];
	const first = value[0];
	value[0] =
		first !== null && typeof first === 'object'
			? { ...(first as Record<string, unknown>), parent_section_id: noteSectionId }
			: { parent_section_id: noteSectionId };
	return value;
}

/**
 * Reconstruct the virtual dd15 section record for one TM row. `lang` selects
 * the term-label language for the dd577/dd1772 fields (PHP uses the fixed data
 * lang; the caller passes the request lang for list rendering parity).
 */
export async function buildTmSectionRecord(
	row: TimeMachineRow,
	lang: string,
): Promise<MatrixRecord> {
	const record = makeVirtualRecord(TIME_MACHINE_SECTION_TIPO, row.id);

	// --- data (the snapshot) — done first so the meta overlay merges cleanly ---
	const sourceModel = await getModelByTipo(row.tipo);
	if (sourceModel === 'section' && row.data !== null && typeof row.data === 'object') {
		// The snapshot IS a full matrix-record columns object; adopt each of its
		// component columns wholesale (structural 'data'/'id' are not components).
		for (const [column, components] of Object.entries(row.data as Record<string, unknown>)) {
			if (column === 'data' || column === 'id') continue;
			if (MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn) && components != null) {
				injectColumnData(record, column as MatrixJsonbColumn, components);
			}
		}
	} else {
		// Per-component history snapshot: inject under dd1574 + the component's tipo.
		const dataParsed = Array.isArray(row.data) ? row.data : row.data === null ? null : [row.data];
		await injectTmField(record, TM_COLUMN_DATA, dataParsed);
		// Inject under the component's own tipo only when its model maps to a real
		// jsonb column. Models with no storable column (e.g. component_section_id,
		// whose "column" is the section_id PK) have nowhere to land — injecting
		// would throw. PHP set_component_data logs + continues past them; the
		// dd1574 copy above (via the guarded injectTmField) still carries the data.
		if (sourceModel !== null) {
			const sourceColumn = getColumnNameByModel(sourceModel);
			if (sourceColumn !== null && MATRIX_JSONB_COLUMNS.includes(sourceColumn as MatrixJsonbColumn)) {
				injectComponentData(record, row.tipo, sourceModel, dataParsed);
			}
		}
	}

	// --- who / when / where / what ---
	await injectTmField(record, TM_COLUMN_SECTION_ID, [{ id: 1, value: Number(row.section_id) }]);
	await injectTmField(record, TM_COLUMN_TIMESTAMP, [
		{ id: 1, start: ddDateFromTimestamp(row.timestamp) },
	]);
	await injectTmField(record, TM_COLUMN_TIPO, [
		{ id: 1, lang: 'lg-nolan', value: await termByTipo(row.tipo, lang) },
	]);
	await injectTmField(record, TM_COLUMN_SECTION_TIPO, [
		{ id: 1, lang: 'lg-nolan', value: await termByTipo(row.section_tipo, lang) },
	]);

	// user locator (PHP reuses the SAME object for dd578 and dd200 — from_component_tipo stays dd578).
	const userLocator = {
		id: 1,
		type: RELATION_TYPE_LINK,
		section_id: String(row.user_id),
		section_tipo: USERS_SECTION_TIPO,
		from_component_tipo: TM_COLUMN_USER_ID,
	};
	await injectTmField(record, TM_COLUMN_USER_ID, [userLocator]);
	await injectTmField(record, CREATED_BY_USER, [userLocator]);

	await injectTmField(record, TM_COLUMN_BULK_PROCESS_ID, [{ id: 1, value: row.bulk_process_id }]);

	// annotation (rsc329): the rsc832/rsc835 notes lookup (PHP tm_record :690-755).
	await injectTmField(record, TM_NOTES_TEXT, await tmNoteValue(row.id));

	return record;
}
