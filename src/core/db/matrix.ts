/**
 * Matrix table access — the JSONB record store shared with the PHP server.
 *
 * Every Dédalo section stores its records as one row per (section_tipo,
 * section_id) in a matrix table. v7 splits component data across TYPED JSONB
 * columns (verified against the live dedalo_mib_v7 schema):
 *
 *   data, relation, string, date, iri, geo, number, media, misc,
 *   relation_search, meta
 *
 * plus the structural columns id (serial), section_id, section_tipo.
 * Which matrix table a section lives in is resolved FROM THE ONTOLOGY
 * (common::get_matrix_table_from_tipo in PHP) — hardcoding table names outside
 * the allowlist below is forbidden.
 *
 * BYTE-COMPAT RULE (spec §2.2): reads return the JSONB columns BOTH parsed
 * (for logic) and as raw ::text (for parity diffing). All WRITES will go
 * through json_codec.ts (Phase 2) — none exist yet.
 *
 * SECURITY: table names are identifiers and cannot be parameterized; they are
 * validated against MATRIX_TABLE_ALLOWLIST before interpolation (§7.6 pattern).
 * section_tipo/section_id are always bound parameters.
 */

import { sql } from './postgres.ts';

/** JSONB data columns of a v7 matrix table (mirrors search trait.utils allowlist). */
export const MATRIX_JSONB_COLUMNS = [
	'data',
	'relation',
	'string',
	'date',
	'iri',
	'geo',
	'number',
	'media',
	'misc',
	'relation_search',
	'meta',
] as const;
export type MatrixJsonbColumn = (typeof MATRIX_JSONB_COLUMNS)[number];

/**
 * Matrix tables that follow the STANDARD record contract (the typed JSONB
 * column set above + id/section_id/section_tipo). Verified against the live
 * dedalo_mib_v7 information_schema. The ontology resolver (Phase 2) will own
 * tipo→table mapping; this allowlist is the identifier gate either way.
 *
 * Deliberately NOT here — different column contracts, separate modules:
 * - matrix_time_machine        → flat audit columns; see time_machine.ts
 * - matrix_counter / _dd       → (tipo, value, ref) counter store
 * - matrix_notifications       → (id, data) queue
 * - matrix_updates             → (id, data) queue
 * - matrix_structurations      → legacy v6 leftover ('datos' column)
 *
 * matrix_activity / matrix_activity_diffusion carry one EXTRA column
 * (timestamp) on top of the standard set; the standard reader works for them
 * because it projects explicit columns only.
 */
export const MATRIX_TABLE_ALLOWLIST: readonly string[] = [
	'matrix',
	'matrix_activities',
	'matrix_activity',
	'matrix_activity_diffusion',
	'matrix_dataframe',
	'matrix_dd',
	'matrix_hierarchy',
	'matrix_hierarchy_main',
	'matrix_indexations',
	'matrix_langs',
	'matrix_layout',
	'matrix_layout_dd',
	'matrix_list',
	'matrix_nexus',
	'matrix_nexus_main',
	'matrix_notes',
	'matrix_ontology',
	'matrix_ontology_main',
	'matrix_profiles',
	'matrix_projects',
	'matrix_stats',
	'matrix_test',
	'matrix_tools',
	'matrix_users',
];

/** A matrix row: structural columns + parsed JSONB + raw text twins for parity. */
export interface MatrixRecord {
	id: number;
	section_id: number;
	section_tipo: string;
	/** Parsed JSONB columns (null when the column is NULL). */
	columns: Partial<Record<MatrixJsonbColumn, unknown>>;
	/** Raw `column::text` twins — byte-exact for parity diffing. */
	rawText: Partial<Record<MatrixJsonbColumn, string | null>>;
}

/** Throws unless tableName is a known matrix table (identifier gate). */
export function assertMatrixTable(tableName: string): void {
	if (!MATRIX_TABLE_ALLOWLIST.includes(tableName)) {
		throw new Error(
			`Refusing unknown matrix table '${tableName}' (identifier allowlist, spec §7.6)`,
		);
	}
}

/**
 * Read one record by (section_tipo, section_id) from a matrix table.
 * Returns null when the record does not exist.
 */
/**
 * Which of `sectionIds` already exist in the section — ONE query for the whole
 * set. A bulk import must decide create-or-update per row; asking the DB once
 * per row turns a 10k-row CSV into 10k round-trips for a question a single
 * `= ANY()` answers.
 */
export async function readExistingSectionIds(
	tableName: string,
	sectionTipo: string,
	sectionIds: readonly number[],
): Promise<Set<number>> {
	assertMatrixTable(tableName);
	if (sectionIds.length === 0) return new Set();
	// The table identifier is allowlist-validated; both values are bound. The id set
	// rides as a comma string through string_to_array (the driver does not bind a JS
	// array to ANY($n::int[]) — same pattern as relations/select_lang.ts).
	const rows = (await sql.unsafe(
		`SELECT section_id
		   FROM "${tableName}"
		  WHERE section_tipo = $1
		    AND section_id = ANY(string_to_array($2, ',')::int[])`,
		[sectionTipo, [...new Set(sectionIds)].join(',')],
	)) as { section_id: number }[];
	return new Set(rows.map((row) => row.section_id));
}

export async function readMatrixRecord(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
): Promise<MatrixRecord | null> {
	assertMatrixTable(tableName);

	// Build the projection once: each JSONB column plus its ::text twin.
	// Column names come from the fixed const above — never from input.
	const jsonbProjection = MATRIX_JSONB_COLUMNS.map(
		(column) => `"${column}", "${column}"::text AS "${column}__text"`,
	).join(', ');

	// Table and column identifiers are allowlist-validated constants; the two
	// user-facing values are bound parameters ($1, $2).
	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, ${jsonbProjection}
		 FROM "${tableName}"
		 WHERE section_tipo = $1 AND section_id = $2
		 LIMIT 1`,
		[sectionTipo, sectionId],
	)) as Record<string, unknown>[];

	const row = rows[0];
	if (row === undefined) {
		return null;
	}

	const columns: MatrixRecord['columns'] = {};
	const rawText: MatrixRecord['rawText'] = {};
	for (const column of MATRIX_JSONB_COLUMNS) {
		columns[column] = row[column];
		rawText[column] = row[`${column}__text`] as string | null;
	}

	return {
		id: row.id as number,
		section_id: row.section_id as number,
		section_tipo: row.section_tipo as string,
		columns,
		rawText,
	};
}

/**
 * Read MANY records of one section by id — ONE `= ANY()` query for the whole
 * set, the batch twin of readMatrixRecord (identical projection, ::text twins
 * included). A section-list page resolving each row's record one query at a
 * time turns a 30-row page into 30 round-trips for a question a single ANY()
 * answers. Missing ids are simply absent from the returned map.
 */
export async function readMatrixRecordBatch(
	tableName: string,
	sectionTipo: string,
	sectionIds: readonly number[],
): Promise<Map<number, MatrixRecord>> {
	assertMatrixTable(tableName);
	const byId = new Map<number, MatrixRecord>();
	if (sectionIds.length === 0) return byId;

	const jsonbProjection = MATRIX_JSONB_COLUMNS.map(
		(column) => `"${column}", "${column}"::text AS "${column}__text"`,
	).join(', ');

	// Identifiers are allowlist-validated constants; values are bound. The id
	// set rides as a comma string through string_to_array (the driver does not
	// bind a JS array to ANY($n::int[]) — same pattern as readExistingSectionIds).
	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, ${jsonbProjection}
		 FROM "${tableName}"
		 WHERE section_tipo = $1
		   AND section_id = ANY(string_to_array($2, ',')::int[])`,
		[sectionTipo, [...new Set(sectionIds)].join(',')],
	)) as Record<string, unknown>[];

	for (const row of rows) {
		const columns: MatrixRecord['columns'] = {};
		const rawText: MatrixRecord['rawText'] = {};
		for (const column of MATRIX_JSONB_COLUMNS) {
			columns[column] = row[column];
			rawText[column] = row[`${column}__text`] as string | null;
		}
		byId.set(row.section_id as number, {
			id: row.id as number,
			section_id: row.section_id as number,
			section_tipo: row.section_tipo as string,
			columns,
			rawText,
		});
	}
	return byId;
}
