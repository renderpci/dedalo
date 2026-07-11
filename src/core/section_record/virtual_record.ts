/**
 * virtual_record — build and substitute MatrixRecord structs in memory.
 *
 * TS re-expression of PHP section_record's on-the-fly column substitution:
 * tm_record::get_section_record materializes a virtual dd15 record by injecting
 * component data into a section_record via set_component_data (the model→column
 * map decides where each tipo lands), and consumers then treat it exactly like
 * a DB-backed record. In TS the uniform record interface is the passive
 * MatrixRecord struct (db/matrix.ts) threaded explicitly — so substitution is
 * expressed as PURE builders over that struct:
 *
 *   makeVirtualRecord   — a record not backed by any DB row (TM/dd15, synthetic
 *                         search-data rows). Marked by id === VIRTUAL_RECORD_ID.
 *   cloneRecord         — clone-on-substitute: copy a real record before
 *                         grafting so shared/cached rows are never mutated.
 *   injectComponentData — route items into the component's mapped column,
 *                         keyed by tipo (PHP set_component_data). null removes
 *                         the key (PHP set_key_data(null)).
 *   injectColumnData    — replace one whole column (PHP set_column_data).
 *
 * Injection VOIDS the column's rawText twin: the byte-parity twin describes
 * the DB bytes, and a substituted column no longer has any. Consumers doing
 * raw-text passthrough must treat a missing twin as "re-encode via json_codec".
 *
 * These builders are the ONLY sanctioned way to synthesize or graft a record —
 * ad-hoc `record.columns[x] = y` mutation of shared rows is what this module
 * replaces (the read.ts children graft, the resolveSearchData synthetic row,
 * the read_tm.ts snapshot digging).
 */

import type { MatrixJsonbColumn, MatrixRecord } from '../db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../db/matrix.ts';
import { getColumnNameByModel } from '../ontology/resolver.ts';

/**
 * The `id` structural column of a virtual record. Real rows carry a serial
 * id >= 1; 0 marks "not backed by a DB row".
 */
export const VIRTUAL_RECORD_ID = 0;

/** True when the record was built in memory (never read from a matrix table). */
export function isVirtualRecord(record: MatrixRecord): boolean {
	return record.id === VIRTUAL_RECORD_ID;
}

/**
 * A record not backed by any DB row. All columns start absent; populate via
 * injectComponentData / injectColumnData.
 */
export function makeVirtualRecord(sectionTipo: string, sectionId: number): MatrixRecord {
	return {
		id: VIRTUAL_RECORD_ID,
		section_id: sectionId,
		section_tipo: sectionTipo,
		columns: {},
		rawText: {},
	};
}

/**
 * Deep-copy a record before substituting values into it. Use whenever the
 * source may be shared (a row another consumer also holds): grafts belong on
 * the copy, never on the shared original.
 */
export function cloneRecord(record: MatrixRecord): MatrixRecord {
	return {
		id: record.id,
		section_id: record.section_id,
		section_tipo: record.section_tipo,
		columns: structuredClone(record.columns),
		rawText: { ...record.rawText },
	};
}

/**
 * Substitute one component's items into the record, in the column its MODEL
 * maps to (PHP section_record::set_component_data → section_record_data::
 * get_column_name). `items === null` removes the key (PHP set_key_data null).
 *
 * Throws for models with no storable column: unknown models, and
 * component_section_id (its "column" is the virtual section_id PK — PHP
 * callers must special-case it, and so must ours).
 */
export function injectComponentData(
	record: MatrixRecord,
	componentTipo: string,
	model: string,
	items: unknown | null,
): void {
	const column = getColumnNameByModel(model);
	if (column === null) {
		throw new Error(`injectComponentData: no matrix column for model '${model}'`);
	}
	if (!MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) {
		// component_section_id → 'section_id' (the PK, not a jsonb column).
		throw new Error(`injectComponentData: model '${model}' maps to non-jsonb column '${column}'`);
	}
	const jsonbColumn = column as MatrixJsonbColumn;

	const current = record.columns[jsonbColumn];
	const bag =
		current !== null && current !== undefined && typeof current === 'object'
			? (current as Record<string, unknown>)
			: {};

	if (items === null) {
		delete bag[componentTipo];
	} else {
		bag[componentTipo] = items;
	}
	record.columns[jsonbColumn] = bag;
	// The DB byte twin no longer describes this column.
	record.rawText[jsonbColumn] = null;
}

/** Replace one whole column (PHP set_column_data). Voids the byte twin. */
export function injectColumnData(
	record: MatrixRecord,
	column: MatrixJsonbColumn,
	value: unknown | null,
): void {
	record.columns[column] = value;
	record.rawText[column] = null;
}
