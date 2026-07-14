/**
 * Pure SQL-string builders for the MariaDB diffusion target (SPEC §4.3).
 *
 * Every function here is PURE — {sql, params} out, no I/O — so the statement
 * shapes are unit-testable without a database. Semantics ported from the old
 * engine's proven lib/sql_generator.ts (v7_php_frozen/master_dedalo/diffusion/api/v1)
 * with the deliberate spec §4.3 improvements:
 * - TRUE multi-row batched upserts (~200 rows per statement, byte-budget
 *   aware) instead of one INSERT per record;
 * - explicit plan-ordered column lists (every row of a batch binds every
 *   column, null-padded) so one statement serves the whole batch.
 *
 * KEPT oracle behaviors (published-schema compatibility):
 * - composite PRIMARY KEY (section_id, lang); section_id INT(12), lang
 *   VARCHAR(16) — identical to every table the old engine created;
 * - model→type map (field_date→DATE, field_int→INT(n), field_varchar→
 *   VARCHAR(n), field_text→TEXT, ... oracle sql_generator.ts:195-230);
 * - default index per model + explicit `index` override, incl. the (250)
 *   prefix rule for long text keys (oracle :246-291);
 * - COMMENT escaping incl. the DIFFTS-05 backslash fix (oracle :235);
 * - ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 * - DELETE ... WHERE section_id IN (?) with stringified ids.
 *
 * Identifier safety: names arriving in a SectionPlan already passed the
 * compile chokepoint (plan/identifier.ts requireSqlIdentifier), but EVERY
 * identifier is still routed through escapeSqlIdentifier here — defense in
 * depth, exactly like the oracle.
 */

import { escapeSqlIdentifier } from '../../plan/identifier.ts';
import type { ColumnDef, FieldPlan, SectionPlan } from '../../plan/types.ts';
import type { ProjectedRow } from '../../project/lang_ladder.ts';

/** A generated statement with its positional `?` parameters. */
export interface SqlStatement {
	sql: string;
	params: (string | number | null)[];
}

/** Default cap for rows per multi-row upsert statement (plan D1 default). */
export const DEFAULT_UPSERT_BATCH_ROWS = 200;
/**
 * Byte budget per upsert statement — stay comfortably under MariaDB's
 * default max_allowed_packet (16MB since 10.2; 4MB leaves generous headroom
 * for statement text + protocol overhead on older configs).
 */
export const DEFAULT_UPSERT_BATCH_BYTES = 4 * 1024 * 1024;

/**
 * The columns a section's table carries, in plan order. excludeColumn fields
 * participate in resolution only and NEVER reach the target schema or rows.
 */
export function tableColumnFields(section: SectionPlan): FieldPlan[] {
	return section.fields.filter((field) => field.excludeColumn !== true);
}

/**
 * Model→SQL type map (oracle get_column_definition:195-230, verbatim types).
 * `varcharLength` carries the ontology `varchar`/`length` value, so it sizes
 * both VARCHAR(n) and INT(n) exactly as the old engine's ctx did.
 * Fallback: a model outside the map emits TEXT — unless the field's plan
 * outputFormat says 'int' (the model didn't decide, the format hint does).
 */
function sqlTypeFor(column: ColumnDef, outputFormat: string | undefined): string {
	switch (column.fieldModel) {
		case 'field_date':
			return 'DATE';
		case 'field_datetime':
			return 'DATETIME';
		case 'field_int':
			return `INT(${column.varcharLength ?? 8})`;
		case 'field_varchar':
			return `VARCHAR(${column.varcharLength ?? 255})`;
		case 'field_text':
			return 'TEXT';
		case 'field_mediumtext':
			return 'MEDIUMTEXT';
		case 'field_year':
			return 'YEAR';
		case 'field_boolean':
			return 'TINYINT(1)';
		case 'field_decimal':
			return 'DECIMAL(19,4)';
		case 'field_point':
			return 'POINT';
		case 'field_enum':
			return 'TEXT';
		default:
			return outputFormat === 'int' ? 'INT(8)' : 'TEXT';
	}
}

/**
 * COMMENT literal escaping (oracle :235 incl. the DIFFTS-05 fix): escape
 * backslashes BEFORE doubling quotes — in MariaDB's default mode a stray
 * backslash could escape the closing quote of the literal.
 */
function escapeCommentLiteral(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/**
 * One column's definition clause. The provenance COMMENT keeps the oracle's
 * `term - tipo` intent with what the plan carries: the sanitized column name
 * (the term post-chokepoint) and the diffusion field-node tipo.
 */
function columnDefinition(field: FieldPlan): string {
	const safeColumn = escapeSqlIdentifier(field.columnName);
	const sqlType = sqlTypeFor(field.column, field.outputFormat);
	const comment = escapeCommentLiteral(`${field.columnName} - ${field.id}`);
	return `${safeColumn} ${sqlType} DEFAULT NULL COMMENT '${comment}'`;
}

/**
 * Index clause for a column (oracle get_index_definition:246-291): explicit
 * ontology `index` override first (FULLTEXT / BTREE|KEY / NONE|false), then
 * the v6-mimicking model defaults. Long text-ish keys get the (250) prefix.
 */
function indexDefinition(field: FieldPlan): string | null {
	const safeColumn = escapeSqlIdentifier(field.columnName);
	const { fieldModel, varcharLength, index } = field.column;

	const textPrefix = (): string => {
		const maxLength = Number(varcharLength) || 0;
		return maxLength > 0 && maxLength < 250 ? '' : '(250)';
	};

	if (index !== undefined && index !== null) {
		const indexUpper = typeof index === 'string' ? index.toUpperCase() : '';
		if (indexUpper === 'FULLTEXT') {
			return `FULLTEXT KEY ${safeColumn} (${safeColumn})`;
		}
		if (indexUpper === 'BTREE' || indexUpper === 'KEY') {
			const needsPrefix =
				fieldModel === 'field_varchar' ||
				fieldModel === 'field_enum' ||
				fieldModel === 'field_text';
			return `KEY ${safeColumn} (${safeColumn}${needsPrefix ? textPrefix() : ''})`;
		}
		if (indexUpper === 'NONE' || index === false) {
			return null;
		}
	}

	switch (fieldModel) {
		case 'field_text':
		case 'field_mediumtext':
			return `FULLTEXT KEY ${safeColumn} (${safeColumn})`;
		case 'field_varchar':
		case 'field_enum':
			return `KEY ${safeColumn} (${safeColumn}${textPrefix()})`;
		case 'field_boolean':
		case 'field_int':
		case 'field_year':
		case 'field_decimal':
		case 'field_date':
		case 'field_datetime':
			return `KEY ${safeColumn} (${safeColumn})`;
		default:
			return null;
	}
}

/**
 * MariaDB allows at most 64 keys per table. The oracle (diffusion_mysql::
 * generate_keys) caps secondary indexes at 50 to stay safely under that ceiling
 * — without it, a wide element (e.g. an image/resource section publishing 60+
 * indexable fields) overflows the limit and CREATE TABLE fails with
 * "Too many keys specified; max 64 keys allowed". We match the 50 cap and,
 * unlike the oracle (which capped ONLY the CREATE and could still overflow via
 * ALTER ADD), apply it through a single source of truth consulted by BOTH the
 * CREATE and the additive-ALTER path, so schema evolution can never exceed it.
 */
const MAX_SECONDARY_KEYS = 50;

/**
 * The set of column names that receive a secondary index: the first
 * MAX_SECONDARY_KEYS indexable fields in stable plan order. Deterministic so
 * generateCreateTable and generateAddColumns always agree on the same columns.
 */
function indexedColumnNames(section: SectionPlan): Set<string> {
	const names = new Set<string>();
	for (const field of tableColumnFields(section)) {
		if (indexDefinition(field) === null) continue; // model/override yields no index
		if (names.size >= MAX_SECONDARY_KEYS) break;
		names.add(field.columnName);
	}
	return names;
}

/**
 * CREATE TABLE IF NOT EXISTS for a section plan — the oracle's exact table
 * anatomy: section_id INT(12) + lang VARCHAR(16), composite PK, per-column
 * COMMENT provenance, model-default/overridden indexes, InnoDB/utf8mb4.
 */
export function generateCreateTable(section: SectionPlan): string {
	const safeTable = escapeSqlIdentifier(section.tableName);
	const fields = tableColumnFields(section);
	const indexed = indexedColumnNames(section);

	const definitionClauses = [
		'`section_id` INT(12) NOT NULL',
		'`lang` VARCHAR(16) DEFAULT NULL',
		...fields.map(columnDefinition),
		'PRIMARY KEY (section_id, lang)',
	];
	for (const field of fields) {
		if (!indexed.has(field.columnName)) continue; // 64-key ceiling guard
		const indexClause = indexDefinition(field);
		if (indexClause !== null) definitionClauses.push(indexClause);
	}

	return [
		`CREATE TABLE IF NOT EXISTS ${safeTable} (`,
		`  ${definitionClauses.join(',\n  ')}`,
		') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
	].join('\n');
}

/** INFORMATION_SCHEMA read listing a table's existing columns (ensure diff). */
export function generateColumnsQuery(database: string, tableName: string): SqlStatement {
	return {
		sql: 'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
		params: [database, tableName],
	};
}

/**
 * Additive-only schema evolution: ALTER TABLE ADD COLUMN (+ its index) for
 * every plan field missing from the live table. NEVER drops or retypes —
 * published tables only grow (oracle ensure_columns posture).
 */
export function generateAddColumns(section: SectionPlan, missingColumnNames: string[]): string[] {
	const safeTable = escapeSqlIdentifier(section.tableName);
	const fieldsByColumn = new Map(tableColumnFields(section).map((f) => [f.columnName, f]));
	const indexed = indexedColumnNames(section); // same 64-key cap as CREATE

	const statements: string[] = [];
	for (const columnName of missingColumnNames) {
		const field = fieldsByColumn.get(columnName);
		if (field === undefined) continue; // not a plan column (defensive)
		const indexClause = indexed.has(columnName) ? indexDefinition(field) : null;
		const addIndex = indexClause !== null ? `, ADD ${indexClause}` : '';
		statements.push(`ALTER TABLE ${safeTable} ADD COLUMN ${columnDefinition(field)}${addIndex};`);
	}
	return statements;
}

/** Byte-budget knobs for slicing rows into multi-row statements. */
export interface UpsertBatchLimits {
	maxRowsPerStatement: number;
	maxBytesPerStatement: number;
}

/** Rough per-value wire cost: UTF-8 bytes of the bound value + overhead. */
function estimateValueBytes(value: string | number | null): number {
	if (value === null) return 8;
	return Buffer.byteLength(String(value), 'utf8') + 8;
}

/**
 * Slice projected rows into statement-sized batches: at most
 * `maxRowsPerStatement` rows AND `maxBytesPerStatement` estimated bytes each
 * (a single oversized row still ships alone — MariaDB enforces the real
 * packet limit; we only avoid *aggregating* past it).
 */
export function planUpsertBatches(
	rows: ProjectedRow[],
	columnNames: string[],
	limits: UpsertBatchLimits = {
		maxRowsPerStatement: DEFAULT_UPSERT_BATCH_ROWS,
		maxBytesPerStatement: DEFAULT_UPSERT_BATCH_BYTES,
	},
): ProjectedRow[][] {
	const batches: ProjectedRow[][] = [];
	let currentBatch: ProjectedRow[] = [];
	let currentBytes = 0;

	for (const row of rows) {
		let rowBytes = estimateValueBytes(row.sectionId) + estimateValueBytes(row.lang);
		for (const columnName of columnNames) {
			rowBytes += estimateValueBytes(row.columns[columnName] ?? null);
		}
		const wouldOverflow =
			currentBatch.length >= limits.maxRowsPerStatement ||
			(currentBatch.length > 0 && currentBytes + rowBytes > limits.maxBytesPerStatement);
		if (wouldOverflow) {
			batches.push(currentBatch);
			currentBatch = [];
			currentBytes = 0;
		}
		currentBatch.push(row);
		currentBytes += rowBytes;
	}
	if (currentBatch.length > 0) batches.push(currentBatch);
	return batches;
}

/**
 * ONE multi-row upsert statement for a batch of projected rows:
 *   INSERT INTO t (section_id, lang, c1, c2)
 *   VALUES (?,?,?,?),(?,?,?,?)
 *   ON DUPLICATE KEY UPDATE c1 = VALUES(c1), c2 = VALUES(c2)
 * Every row binds EVERY plan column (missing values → NULL) so the column
 * list is uniform across the batch. With zero data columns the composite key
 * is the whole row — INSERT IGNORE, the oracle's no-op-on-conflict posture.
 */
export function generateBatchUpsert(
	tableName: string,
	columnNames: string[],
	rows: ProjectedRow[],
): SqlStatement {
	if (rows.length === 0) throw new Error('generateBatchUpsert requires at least one row');
	const safeTable = escapeSqlIdentifier(tableName);
	const safeColumns = columnNames.map(escapeSqlIdentifier);
	const allColumns = ['`section_id`', '`lang`', ...safeColumns].join(', ');

	const rowPlaceholders = `(${Array(columnNames.length + 2)
		.fill('?')
		.join(', ')})`;
	const valuesClause = Array(rows.length).fill(rowPlaceholders).join(',\n');

	const params: (string | number | null)[] = [];
	for (const row of rows) {
		params.push(row.sectionId, row.lang);
		for (const columnName of columnNames) {
			params.push(row.columns[columnName] ?? null);
		}
	}

	if (safeColumns.length === 0) {
		return {
			sql: `INSERT IGNORE INTO ${safeTable} (${allColumns})\nVALUES ${valuesClause}`,
			params,
		};
	}
	const updateClause = safeColumns.map((column) => `${column} = VALUES(${column})`).join(', ');
	return {
		sql: [
			`INSERT INTO ${safeTable} (${allColumns})`,
			`VALUES ${valuesClause}`,
			'ON DUPLICATE KEY UPDATE',
			updateClause,
		].join('\n'),
		params,
	};
}

/**
 * Batched removal of published records — all lang variants of each
 * section_id go (composite key). Ids are stringified like the oracle
 * (generate_delete:313) so numeric and composite string ids bind alike.
 */
export function generateDelete(tableName: string, sectionIds: (number | string)[]): SqlStatement {
	if (sectionIds.length === 0) throw new Error('generateDelete requires at least one section_id');
	const safeTable = escapeSqlIdentifier(tableName);
	const placeholders = sectionIds.map(() => '?').join(', ');
	return {
		sql: `DELETE FROM ${safeTable} WHERE section_id IN (${placeholders})`,
		params: sectionIds.map((id) => String(id)),
	};
}
