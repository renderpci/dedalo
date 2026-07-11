/**
 * Matrix write path — mirrors the PHP upsert contract byte-compatibly.
 *
 * PHP reference: class.matrix_db_manager.php update():
 *   1. UPDATE <table> SET col=$n... WHERE section_id=$1 AND section_tipo=$2
 *   2. if 0 rows affected → INSERT the same columns (upsert-by-update).
 *   Values are bound as JSON TEXT parameters; Postgres parses them to jsonb.
 *   Table and column names are allowlist-validated identifiers.
 *
 * This module reproduces exactly that, with every JSON value forced through
 * json_codec (the byte-compat chokepoint): callers hand either a JS value
 * (encoded via encodeForJsonb) or a RawJsonText (lossless passthrough of an
 * unmodified column). SQL NULL is expressed as null.
 *
 * TIME MACHINE: in PHP, component saves also append an audit row to
 * matrix_time_machine (tm_db_manager). That belongs to the section_record
 * save pipeline (Phase 6); the hook contract lives in time_machine.ts as
 * TimeMachineWriteHook so this layer stays free of business logic.
 *
 * BUN GOTCHA (discovered 2026-07-01, Bun 1.3.9): when a parameter's inferred
 * type is jsonb, Bun's SQL client JSON-ENCODES the JS value itself — a
 * pre-encoded JSON string arrives DOUBLE-encoded (a jsonb string!). We
 * therefore bind every jsonb value as $n::text::jsonb: the param is typed
 * text (sent verbatim), and Postgres parses it — keeping json_codec, not Bun,
 * in charge of the byte-compat semantics. Verified canonical-text-identical
 * against real rows.
 */

import { type RawJsonText, asRawJsonText, encodeForJsonb } from './json_codec.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn, assertMatrixTable } from './matrix.ts';
import { sql } from './postgres.ts';

/**
 * The EXPLICIT ordered column list of a standard matrix table, exactly as PHP
 * matrix_db_manager::get_columns_name() (array_keys of the $columns allowlist,
 * class.matrix_db_manager.php:80-94) returns it. Consumed by the ontology
 * data-IO psql `\copy` export (core/ontology/data_io.ts): listing columns
 * explicitly — instead of SELECT * — keeps the COPY file schema-stable if new
 * columns are ever added to the tables, and keeps TS export files
 * column-order-identical to PHP-produced ones. Pinned as a literal on purpose:
 * do NOT derive it from MATRIX_JSONB_COLUMNS.
 */
export const MATRIX_COPY_COLUMNS: readonly string[] = [
	'section_id',
	'section_tipo',
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
];

/**
 * One column's new content: a JS value to encode, a RawJsonText to pass
 * through untouched, or null for SQL NULL.
 */
export type MatrixColumnWrite = unknown | RawJsonText | null;

/** Values keyed by jsonb column name (only allowlisted columns accepted). */
export type MatrixWriteValues = Partial<Record<MatrixJsonbColumn, MatrixColumnWrite>>;

/**
 * Resolve one MatrixColumnWrite into the SQL parameter to bind.
 *
 * The RawJsonText brand is compile-time only (a runtime string is just a
 * string, and a bare string is ALSO a legal jsonb value — encoded as "..."),
 * so raw passthrough must be requested explicitly per call via
 * options.rawTextPassthrough. With it on, string values are bound verbatim;
 * with it off (default), every value — strings included — goes through the
 * codec.
 */
function toBoundParameter(value: MatrixColumnWrite, treatStringsAsRaw: boolean): string | null {
	if (value === null) {
		return null;
	}
	if (treatStringsAsRaw && typeof value === 'string') {
		return value;
	}
	return encodeForJsonb(value);
}

/** Options for updateMatrixRecord. */
export interface MatrixWriteOptions {
	/**
	 * When true, string values in `values` are treated as RawJsonText
	 * (lossless passthrough). Use for round-trip writes of unmodified
	 * columns read via rawText. Default false: strings are encoded as JSON
	 * strings like any other JS value.
	 */
	rawTextPassthrough?: boolean;
}

/**
 * Upsert component data columns for one record — the PHP update() contract.
 * Returns 'updated' | 'inserted'.
 */
export async function updateMatrixRecord(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	values: MatrixWriteValues,
	options: MatrixWriteOptions = {},
): Promise<'updated' | 'inserted'> {
	assertMatrixTable(tableName);

	const columnNames = Object.keys(values) as MatrixJsonbColumn[];
	if (columnNames.length === 0) {
		throw new Error('updateMatrixRecord: empty values payload');
	}
	for (const columnName of columnNames) {
		// Identifier gate: column names must be in the fixed jsonb column set.
		if (!MATRIX_JSONB_COLUMNS.includes(columnName)) {
			throw new Error(
				`updateMatrixRecord: column '${columnName}' is not an allowlisted jsonb column (spec §7.6)`,
			);
		}
	}

	const rawPassthrough = options.rawTextPassthrough === true;
	const boundValues = columnNames.map((columnName) =>
		toBoundParameter(values[columnName], rawPassthrough),
	);

	// Mirror PHP param layout: $1=section_id, $2=section_tipo, then columns.
	const parameters: (string | number | null)[] = [sectionId, sectionTipo, ...boundValues];
	// ::text::jsonb — see the BUN GOTCHA note in the module header.
	const setClauses = columnNames
		.map((columnName, index) => `"${columnName}" = $${index + 3}::text::jsonb`)
		.join(', ');

	const updateResult = (await sql.unsafe(
		`UPDATE "${tableName}" SET ${setClauses}
		 WHERE section_id = $1 AND section_tipo = $2
		 RETURNING id`,
		parameters,
	)) as unknown[];

	if (updateResult.length > 0) {
		return 'updated';
	}

	// No existing record → INSERT, same columns and parameter order as PHP.
	const insertColumns = ['section_id', 'section_tipo', ...columnNames.map((c) => `"${c}"`)].join(
		', ',
	);
	// $1/$2 are section_id/section_tipo (plain); jsonb columns get the text cast.
	const insertPlaceholders = parameters
		.map((_, index) => (index < 2 ? `$${index + 1}` : `$${index + 1}::text::jsonb`))
		.join(', ');
	await sql.unsafe(
		`INSERT INTO "${tableName}" (${insertColumns}) VALUES (${insertPlaceholders})`,
		parameters,
	);
	return 'inserted';
}

/**
 * Per-KEY update of one component's slice inside a jsonb column — the PHP
 * matrix_db_manager::update_by_key contract (jsonb_set style). This is the
 * write shape the save path MUST use: it touches ONLY the component's tipo
 * key, so concurrent writes by the PHP server to OTHER components in the same
 * column are never clobbered (two-server coexistence, spec §2.2).
 *
 * The key (component tipo) is an identifier inside the jsonb path — validated
 * by the caller via the ontology (a resolved tipo), and defensively checked
 * here against the tipo grammar.
 */
export async function updateMatrixKeyData(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	columnName: string,
	key: string,
	value: unknown,
): Promise<void> {
	await updateMatrixKeysData(tableName, sectionTipo, sectionId, [
		{ column: columnName as MatrixJsonbColumn, key, value },
	]);
}

/** One {column, key, value} write unit of update_by_key. null value ⇒ remove the key. */
export interface MatrixKeyWrite {
	column: MatrixJsonbColumn;
	key: string;
	value: unknown;
}

/**
 * Multi-key form of update_by_key — ONE UPDATE statement covering every
 * {column, key} pair, exactly like PHP matrix_db_manager::update_by_key. This
 * is what lets a component value and the record's modified-audit stamps land
 * in a single DB update (PHP section_record::save_component_data).
 *
 * Keys targeting the same column nest their expressions. A NULL value REMOVES
 * the key using the `#-` operator, which reproduces the PHP end state exactly
 * (oracle-verified by delete_data_differential):
 *  - a column that loses its LAST key keeps '{}' (PHP delete_key contract);
 *  - a column that is SQL NULL stays NULL (`NULL #- path` propagates) — the
 *    PHP save_key_data "columns_to_delete" guard, which exists to stop
 *    update_by_key from materializing '{}' in a previously-NULL column.
 * Non-null values upsert via jsonb_set_lax over COALESCE(col,'{}').
 *
 * Returns the AFFECTED ROW COUNT (0 or 1): a caller racing a concurrent
 * record delete gets 0 instead of a silent no-op and can fail loud (S2-02).
 */
export async function updateMatrixKeysData(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	writes: readonly MatrixKeyWrite[],
): Promise<number> {
	assertMatrixTable(tableName);
	if (writes.length === 0) {
		throw new Error('updateMatrixKeysData: empty writes payload');
	}
	for (const write of writes) {
		if (!MATRIX_JSONB_COLUMNS.includes(write.column)) {
			throw new Error(
				`updateMatrixKeysData: column '${write.column}' is not allowlisted (spec §7.6)`,
			);
		}
		if (!/^[a-z]+[0-9]+$/.test(write.key)) {
			throw new Error(
				`updateMatrixKeysData: key '${write.key}' fails the tipo grammar (spec §7.6)`,
			);
		}
	}

	// Group by column, preserving write order inside each column: the column's
	// SET expression nests one wrapper per key around the current column value.
	const writesByColumn = new Map<MatrixJsonbColumn, MatrixKeyWrite[]>();
	for (const write of writes) {
		const group = writesByColumn.get(write.column);
		if (group) {
			group.push(write);
		} else {
			writesByColumn.set(write.column, [write]);
		}
	}

	const parameters: (string | number | null)[] = [sectionTipo, sectionId];
	const setClauses: string[] = [];
	for (const [column, columnWrites] of writesByColumn) {
		let expression = `"${column}"`;
		for (const write of columnWrites) {
			if (write.value === null) {
				// Key removal: NULL column stays NULL, last key leaves '{}' (see doc).
				expression = `(${expression}) #- '{${write.key}}'`;
			} else {
				parameters.push(encodeForJsonb(write.value));
				// ::text::jsonb — see the BUN GOTCHA note in the module header.
				expression = `jsonb_set_lax(COALESCE(${expression}, '{}'::jsonb), '{${write.key}}', $${parameters.length}::text::jsonb, true, 'delete_key')`;
			}
		}
		setClauses.push(`"${column}" = ${expression}`);
	}

	const updated = (await sql.unsafe(
		`UPDATE "${tableName}"
		 SET ${setClauses.join(', ')}
		 WHERE section_tipo = $1 AND section_id = $2
		 RETURNING id`,
		parameters,
	)) as unknown[];
	return updated.length;
}

/**
 * Atomically allocate the next data-item id for a component on one record.
 *
 * PHP kept a per-component counter in the 'meta' jsonb column under the
 * component tipo ({"count": N}) and allocated ids under a per-record advisory
 * lock. The TS single UPDATE … RETURNING increments atomically at the row
 * level: two concurrent TS allocations can never return the same id, so
 * TS↔TS safety rests on single-statement row atomicity alone. (During the
 * coexistence window this additionally took PHP's S2-05 advisory allocation
 * lock — removed at the 2026-07-11 cutover, PHP engine retired;
 * rewrite/COEXISTENCE.md history.)
 */
export async function allocateComponentItemId(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<number> {
	assertMatrixTable(tableName);
	if (!/^[a-z]+[0-9]+$/.test(componentTipo)) {
		throw new Error(
			`allocateComponentItemId: key '${componentTipo}' fails the tipo grammar (spec §7.6)`,
		);
	}
	// PHP stores the counter as an ARRAY of one object: {tipo: [{count: N}]}
	// (canonical shape on every real record) — read/write element 0.
	const rows = (await sql.unsafe(
		`UPDATE "${tableName}"
		 SET meta = jsonb_set(
			COALESCE(meta, '{}'::jsonb),
			'{${componentTipo}}',
			jsonb_build_array(jsonb_build_object('count', COALESCE((meta->'${componentTipo}'->0->>'count')::int, 0) + 1))
		 )
		 WHERE section_tipo = $1 AND section_id = $2
		 RETURNING (meta->'${componentTipo}'->0->>'count')::int AS new_id`,
		[sectionTipo, sectionId],
	)) as { new_id: number }[];
	const newId = rows[0]?.new_id;
	if (newId === undefined) {
		throw new Error(
			`allocateComponentItemId: record ${sectionTipo}/${sectionId} not found in ${tableName}`,
		);
	}
	return newId;
}

/**
 * Insert a NEW section record, allocating its section_id through the matrix
 * counter like PHP matrix_db_manager::create: one statement that (1) computes
 * MAX(section_id)+1 as the missing-counter fallback, (2) upserts the per-tipo
 * counter (initialising to that fallback, else incrementing), and (3) inserts
 * the row with the counter value as section_id. Atomicity rests on the single
 * statement — the `locked` advisory-lock CTE PHP carried (and this module
 * copied) was DEAD CODE: unreferenced plain-SELECT CTEs are never evaluated
 * (S3-51; removed here. The standing upstream-PHP notice is moot since the
 * 2026-07-11 cutover — the PHP engine is retired and unmaintained).
 *
 * SELF-HEAL (S2-01, PHP class.matrix_db_manager.php:293-320 posture): when the
 * counter row EXISTS but lags behind MAX(section_id) (post-restore, external
 * import, PHP-side writes during coexistence), the allocated id collides with
 * the squatter row. The insert uses ON CONFLICT DO NOTHING on the
 * (section_id, section_tipo) unique key, detects the miss, realigns the
 * counter to GREATEST(value, MAX(section_id)) and retries ONCE (depth guard) —
 * a wedged-writes incident becomes a self-healing blip. ON CONFLICT (instead
 * of catching 23505) keeps the path usable inside an ambient transaction,
 * where a raised error would abort the whole tx.
 *
 * Returns the new section_id.
 */
/**
 * Raise a component's item-id counter to at least the max of the given item
 * ids (PHP component_common::set_data :1009-1019 raise_component_counter):
 * explicit ids — imports, migrations, seeded/restored data — are ABSORBED so
 * later allocations can never reuse them. Never lowers the counter; a no-op
 * when the items carry no numeric ids. PHP runs this on EVERY set_data.
 */
export async function absorbComponentItemIds(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	items: readonly unknown[],
): Promise<void> {
	assertMatrixTable(tableName);
	if (!/^[a-z]+[0-9]+$/.test(componentTipo)) {
		throw new Error(
			`absorbComponentItemIds: key '${componentTipo}' fails the tipo grammar (spec §7.6)`,
		);
	}
	let maxId = 0;
	for (const item of items) {
		const id = Number((item as { id?: unknown } | null)?.id);
		if (Number.isFinite(id) && id > maxId) maxId = Math.trunc(id);
	}
	if (maxId <= 0) return;
	// Single guarded UPDATE: GREATEST + the WHERE recheck make the raise
	// atomic at the row level (never lowers, never lost between engines —
	// there is only this one since the 2026-07-11 cutover).
	await sql.unsafe(
		`UPDATE "${tableName}"
		 SET meta = jsonb_set(
			COALESCE(meta, '{}'::jsonb),
			'{${componentTipo}}',
			jsonb_build_array(jsonb_build_object('count',
				GREATEST(COALESCE((meta->'${componentTipo}'->0->>'count')::int, 0), $3::int)))
		 )
		 WHERE section_tipo = $1 AND section_id = $2
		   AND COALESCE((meta->'${componentTipo}'->0->>'count')::int, 0) < $3::int`,
		[sectionTipo, sectionId, maxId],
	);
}

export async function insertMatrixRecordWithCounter(
	tableName: string,
	sectionTipo: string,
	jsonbColumns: Partial<Record<MatrixJsonbColumn, unknown>>,
	depth = 0,
): Promise<number> {
	assertMatrixTable(tableName);
	// '_dd' ontology tables use the master-managed counter (PHP DB-01).
	const counterTable = tableName.endsWith('_dd') ? 'matrix_counter_dd' : 'matrix_counter';

	// Dynamic jsonb columns: section_tipo is $1, section_id comes from the CTE,
	// each provided column binds as $n::text::jsonb (the BUN GOTCHA — see header).
	const columnNames: string[] = ['"section_tipo"', '"section_id"'];
	const selectExprs: string[] = ['$1', 'updated_counter.value'];
	const params: (string | RawJsonText)[] = [sectionTipo];
	let paramIndex = 2;
	for (const [columnName, value] of Object.entries(jsonbColumns)) {
		if (value === undefined) continue;
		if (!MATRIX_JSONB_COLUMNS.includes(columnName as MatrixJsonbColumn)) {
			throw new Error(
				`insertMatrixRecordWithCounter: '${columnName}' is not a matrix jsonb column`,
			);
		}
		columnNames.push(`"${columnName}"`);
		selectExprs.push(`$${paramIndex}::text::jsonb`);
		params.push(encodeForJsonb(value));
		paramIndex++;
	}

	const rows = (await sql.unsafe(
		`WITH calc_start AS (
			SELECT COALESCE(MAX(section_id), 0) + 1 AS next_start FROM "${tableName}" WHERE section_tipo = $1
		),
		updated_counter AS (
			INSERT INTO ${counterTable} (tipo, value)
			SELECT $1, next_start FROM calc_start
			ON CONFLICT (tipo) DO UPDATE SET value = ${counterTable}.value + 1
			RETURNING value
		)
		INSERT INTO "${tableName}" (${columnNames.join(', ')})
		SELECT ${selectExprs.join(', ')} FROM updated_counter
		ON CONFLICT (section_id, section_tipo) DO NOTHING
		RETURNING section_id`,
		params as (string | number | null)[],
	)) as { section_id: number }[];
	const sectionId = rows[0]?.section_id;
	if (sectionId === undefined) {
		// Counter collision: the allocated id already exists (stale counter).
		// Realign to GREATEST(value, MAX(section_id)) and retry once (S2-01).
		if (depth < 1) {
			await sql.unsafe(
				`UPDATE ${counterTable}
				 SET value = GREATEST(
					${counterTable}.value,
					(SELECT COALESCE(MAX(section_id), 0) FROM "${tableName}" WHERE section_tipo = $1)
				 )
				 WHERE tipo = $1`,
				[sectionTipo],
			);
			console.error(
				`insertMatrixRecordWithCounter: stale counter for '${sectionTipo}' on ${tableName} — realigned to MAX(section_id), retrying once (S2-01 self-heal)`,
			);
			return insertMatrixRecordWithCounter(tableName, sectionTipo, jsonbColumns, depth + 1);
		}
		throw new Error(
			`insertMatrixRecordWithCounter: insert into ${tableName} returned no section_id (counter for '${sectionTipo}' still colliding after realign)`,
		);
	}
	return Number(sectionId);
}

/**
 * Insert a NEW section record with an EXPLICIT section_id (the PHP import /
 * explicit-id create path used by ontology provisioning: `<tld>0` node records
 * whose section_id is chosen by the caller, e.g. descriptor=1, model=2, typology
 * groupers). Mirrors insertMatrixRecordWithCounter's advisory lock so a
 * concurrent counter-driven insert on the same tipo can't race, and raises the
 * per-tipo counter to GREATEST(value, section_id) so a later auto-allocation
 * never reuses this id. By default throws if the (section_tipo, section_id)
 * row already exists (PHP create returns false → provisioning rolls back);
 * with options.onConflict='ignore' an existing row is TOLERATED (ON CONFLICT
 * DO NOTHING — no error, so an ambient transaction survives) and the given
 * sectionId is returned — the save path's lost-create race (S1-02: two saves
 * both find no row and both try to materialize it). Returns section_id.
 */
export async function insertMatrixRecordWithExplicitId(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
	jsonbColumns: Partial<Record<MatrixJsonbColumn, unknown>>,
	options: { onConflict?: 'throw' | 'ignore' } = {},
): Promise<number> {
	assertMatrixTable(tableName);
	const counterTable = tableName.endsWith('_dd') ? 'matrix_counter_dd' : 'matrix_counter';

	// $1 = section_tipo, $2 = section_id, then each provided jsonb column.
	const columnNames: string[] = ['"section_tipo"', '"section_id"'];
	const valuePlaceholders: string[] = ['$1', '$2'];
	const params: (string | number | RawJsonText)[] = [sectionTipo, sectionId];
	let paramIndex = 3;
	for (const [columnName, value] of Object.entries(jsonbColumns)) {
		if (value === undefined) continue;
		if (!MATRIX_JSONB_COLUMNS.includes(columnName as MatrixJsonbColumn)) {
			throw new Error(
				`insertMatrixRecordWithExplicitId: '${columnName}' is not a matrix jsonb column`,
			);
		}
		columnNames.push(`"${columnName}"`);
		valuePlaceholders.push(`$${paramIndex}::text::jsonb`);
		params.push(encodeForJsonb(value));
		paramIndex++;
	}

	const tolerateConflict = options.onConflict === 'ignore';
	const rows = (await sql.unsafe(
		`WITH locked AS (
			SELECT pg_advisory_xact_lock(hashtext($1))
		),
		raise_counter AS (
			INSERT INTO ${counterTable} (tipo, value)
			SELECT $1, $2::int FROM locked
			ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(${counterTable}.value, EXCLUDED.value)
			RETURNING value
		)
		INSERT INTO "${tableName}" (${columnNames.join(', ')})
		SELECT ${valuePlaceholders.join(', ')} FROM raise_counter
		${tolerateConflict ? 'ON CONFLICT (section_id, section_tipo) DO NOTHING' : ''}
		RETURNING section_id`,
		params as (string | number | null)[],
	)) as { section_id: number }[];
	const inserted = rows[0]?.section_id;
	if (inserted === undefined) {
		if (tolerateConflict) {
			// The row already exists (concurrent create won the race) — that is
			// exactly the tolerated outcome; the caller re-reads under its lock.
			return sectionId;
		}
		throw new Error(
			`insertMatrixRecordWithExplicitId: insert into ${tableName} returned no section_id`,
		);
	}
	return Number(inserted);
}

/** Delete one record. Returns the number of rows removed (0 or 1). */
export async function deleteMatrixRecord(
	tableName: string,
	sectionTipo: string,
	sectionId: number,
): Promise<number> {
	assertMatrixTable(tableName);
	const deleted = (await sql.unsafe(
		`DELETE FROM "${tableName}" WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
		[sectionTipo, sectionId],
	)) as unknown[];
	return deleted.length;
}

export { asRawJsonText };
