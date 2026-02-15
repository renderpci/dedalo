/**
 * SQL_GENERATOR
 * Generates SQL statements from processed diffusion data.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE with composite key (section_id, lang).
 */

import type { processed_table, processed_record } from './types';



/**
 * Generated SQL statement with its parameter values.
 */
export interface sql_statement {
	sql:    string;
	params: (string | number | null)[];
}



/**
 * GENERATE_UPSERT
 * Generates an INSERT ... ON DUPLICATE KEY UPDATE statement for a single record.
 * The composite key is (section_id, lang).
 *
 * @param table_name - Target table name
 * @param record     - Processed record with section_id, lang, and columns
 * @returns SQL statement with parameterized values
 */
export function generate_upsert(table_name: string, record: processed_record): sql_statement {

	const safe_table = escape_identifier(table_name);

	// Build column list: section_id + lang + all data columns
	const column_names: string[]                = ['section_id', 'lang'];
	const values: (string | number | null)[]    = [record.section_id, record.lang];
	const update_parts: string[]                = [];

	for (const [col_name, col_value] of Object.entries(record.columns)) {
		const safe_col = escape_identifier(col_name);
		column_names.push(safe_col);
		values.push(col_value);
		update_parts.push(`${safe_col} = VALUES(${safe_col})`);
	}

	const placeholders = column_names.map(() => '?').join(', ');
	const columns_str  = column_names.map(c =>
		c === 'section_id' || c === 'lang' ? c : c
	).join(', ');

	const sql = [
		`INSERT INTO ${safe_table} (${columns_str})`,
		`VALUES (${placeholders})`,
		`ON DUPLICATE KEY UPDATE`,
		update_parts.join(', ')
	].join('\n');

	return { sql, params: values };
}



/**
 * GENERATE_BATCH_UPSERT
 * Generates batch upsert statements for all records in a processed table.
 *
 * @param table - Processed table with records
 * @returns Array of SQL statements
 */
export function generate_batch_upsert(table: processed_table): sql_statement[] {

	return table.records.map(record => generate_upsert(table.table_name, record));
}



/**
 * GENERATE_CREATE_TABLE
 * Generates a CREATE TABLE IF NOT EXISTS statement based on the
 * column names found in the records and metadata in columns_context.
 *
 * @param table - Processed table with metadata
 * @returns SQL CREATE TABLE statement
 */
export function generate_create_table(table: processed_table): string {

	const safe_table = escape_identifier(table.table_name);

	// Collect all unique column names across all records
	const all_columns = new Set<string>();
	for (const record of table.records) {
		for (const col_name of Object.keys(record.columns)) {
			all_columns.add(col_name);
		}
	}

	const column_defs = [
		get_column_definition('section_id', table),
		get_column_definition('lang', table),
	];

	for (const col_name of all_columns) {
		column_defs.push(get_column_definition(col_name, table));
	}

	// Composite primary key
	column_defs.push('PRIMARY KEY (section_id, lang)');

	return [
		`CREATE TABLE IF NOT EXISTS ${safe_table} (`,
		'  ' + column_defs.join(',\n  '),
		') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
	].join('\n');
}



/**
 * GENERATE_ADD_COLUMN_SQL
 * Generates ALTER TABLE ADD COLUMN statements for columns that
 * don't yet exist in the table. Uses metadata in columns_context for typing.
 *
 * @param table           - Full processed table object
 * @param missing_columns - Column names that need to be added
 * @returns Array of ALTER TABLE SQL strings
 */
export function generate_add_column_sql(table: processed_table, missing_columns: string[]): string[] {

	const safe_table = escape_identifier(table.table_name);

	return missing_columns.map(col_name => {
		const def = get_column_definition(col_name, table);
		return `ALTER TABLE ${safe_table} ADD COLUMN ${def};`;
	});
}



/**
 * GET_COLUMN_DEFINITION
 * Maps a column name to its SQL definition (type + constraints + comment).
 */
function get_column_definition(col_name: string, table: processed_table): string {

	const safe_col = escape_identifier(col_name);

	if (col_name === 'section_id') {
		return `${safe_col} INT(12) NOT NULL`;
	}
	if (col_name === 'lang') {
		return `${safe_col} VARCHAR(16) DEFAULT NULL`;
	}

	const ctx = table.columns_context[col_name];
	if (!ctx) {
		// Fallback for columns found in data but missing from context (unlikely)
		return `${safe_col} TEXT DEFAULT NULL`;
	}

	let type = 'TEXT';
	switch (ctx.model) {
		case 'field_date':
			type = 'DATE';
			break;
		case 'field_int':
			type = `INT(${ctx.length || 8})`;
			break;
		case 'field_varchar':
			type = `VARCHAR(${ctx.varchar || 255})`;
			break;
		case 'field_text':
			type = 'TEXT';
			break;
	}

	const comment = `${ctx.term} - ${ctx.tipo}`.replace(/'/g, "''");
	return `${safe_col} ${type} DEFAULT NULL COMMENT '${comment}'`;
}



/**
 * GENERATE_DELETE
 * Generates a DELETE statement to remove all rows for specific section_ids.
 * This removes all language variants since the key is (section_id, lang).
 *
 * @param table_name   - Target table name
 * @param section_ids  - Section IDs to delete
 * @returns SQL statement with parameterized values
 */
export function generate_delete(
	table_name:  string,
	section_ids: (string | number)[]
): sql_statement {
	const safe_table   = escape_identifier(table_name);
	const placeholders = section_ids.map(() => '?').join(', ');
	return {
		sql:    `DELETE FROM ${safe_table} WHERE section_id IN (${placeholders})`,
		params: section_ids.map(id => String(id)),
	};
}



/**
 * ESCAPE_IDENTIFIER
 * Escapes a SQL identifier (table or column name) with backticks.
 */
export function escape_identifier(name: string): string {
	return '`' + name.replace(/`/g, '``') + '`';
}
