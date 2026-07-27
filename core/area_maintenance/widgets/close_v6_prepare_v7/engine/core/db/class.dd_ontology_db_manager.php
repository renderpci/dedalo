<?php declare(strict_types=1);
/**
* CLASS DD_ONTOLOGY_DB_MANAGER
* Abstract data-access layer for the `dd_ontology` PostgreSQL table.
*
* Encapsulates all CRUD and search operations against the ontology table so
* that callers never build raw SQL for ontology rows. It enforces:
* - A fixed, audited column allowlist (no dynamic column injection).
* - Automatic type coercions on read (JSON → object, int, bool).
* - Automatic type coercions on write (object → JSON string, bool → 't'/'f').
* - Per-request in-memory cache keyed by `tipo` for read().
* - Reuse of named PostgreSQL prepared statements (via DBi::$prepared_statements)
*   so that frequently called operations (read, delete) avoid repeated parse/plan
*   overhead on every request.
*
* Declared abstract because the class contains only static methods and must
* never be instantiated. Consumers call the static methods directly:
*   dd_ontology_db_manager::read($tipo)
*   dd_ontology_db_manager::update($tipo, $values)
*
* The `dd_ontology` schema (one row per ontology node):
*   tipo          — unique string identifier, e.g. 'oh1', 'dd345' (primary key semantics)
*   parent        — tipo of the parent node; null for root nodes
*   term          — JSONB object mapping language codes to display labels, e.g. {"lg-eng":"Oral History"}
*   model         — string discriminator for the node kind, e.g. 'section', 'component', 'database'
*   order_number  — integer sort position among siblings
*   relations     — JSONB array of related node tipos
*   tld           — top-level domain string used for diffusion scoping
*   properties    — JSONB object carrying v7 configuration (source, request_config, etc.)
*   model_tipo    — tipo of the component model this node follows
*   is_model      — boolean; true when the node defines a reusable component model
*   is_translatable — boolean; true when the node's term is translatable
*   is_main       — boolean; true for nodes belonging to the main ontology tree
*   propiedades   — (!) v6 legacy text column; retained for migration reading only.
*                    In v7, always read/write configuration via `properties`.
*                    See diffusion/migration/migrate_diffusion_properties.php.
*
* Fuzzy-search capability relies on two PostgreSQL extensions defined in
* core/db/db_pg_definitions.php:
*   - f_unaccent()           — accent-insensitive wrapper around unaccent()
*   - jsonb_values_as_text() — flattens a JSONB object's values to a single string
*
* @package Dédalo
* @subpackage Core
*/
abstract class dd_ontology_db_manager {



	/**
	* Name of the PostgreSQL table that stores all ontology nodes.
	* Every static method in this class targets this table exclusively.
	* @var string $table
	*/
	public static string $table = 'dd_ontology';

	/**
	* Per-request cache of whether the ontology table exists. Used to skip reads QUIETLY on a
	* connectable-but-not-yet-imported database (a fresh install), so the installer's context build
	* does not spew "relation dd_ontology does not exist" pg errors. null = not yet checked.
	* @var bool|null
	*/
	private static ?bool $table_exists_cache = null;

	/**
	* Allowlist of every column that this class is permitted to read or write.
	* Keys are column names; values are always `true` (used as a lookup set).
	* Any column name not present here is rejected as invalid in update() and search(),
	* preventing SQL injection through dynamic column names.
	* @var array<string,true> $columns
	*/
	public static array $columns = [
		'tipo'				=> true,
		'parent'			=> true,
		'term'				=> true,
		'model'				=> true,
		'order_number'		=> true,
		'relations'			=> true,
		'tld'				=> true,
		'properties'		=> true,
		'model_tipo'		=> true,
		'is_model'			=> true,
		'is_translatable'	=> true,
		'is_main'			=> true,
		'propiedades'		=> true
	];

	/**
	* Subset of $columns whose values are stored as JSONB in the database.
	* On read(), matching columns are passed through json_decode(..., false) so
	* callers always receive PHP objects/arrays rather than raw JSON strings.
	* On write (create/update), matching values are encoded with json_handler::encode()
	* and cast to `::jsonb` in the prepared statement placeholder.
	* Note: `propiedades` is deliberately excluded — it is a text column (v6 legacy).
	* @var array<string,true> $json_columns
	*/
	public static array $json_columns = [
		'term'				=> true,
		'relations'			=> true,
		'properties'		=> true
	];

	/**
	* Subset of $columns whose values must be cast to PHP int on read.
	* PostgreSQL returns all scalar columns as strings; this map drives the
	* (int) cast applied during row hydration in read().
	* @var array<string,true> $int_columns
	*/
	public static array $int_columns = [
		'order_number'		=> true
	];

	/**
	* Subset of $columns whose values are boolean flags in the database.
	* PostgreSQL returns boolean columns as the strings 't' or 'f'.
	* On read(), values are normalised to PHP bool by comparing against 't'.
	* On write, PHP bool is serialised to the literals 'true'/'false' (search)
	* or 't'/'f' (create/update) to satisfy the respective query modes.
	* @var array<string,true> $boolean_columns
	*/
	public static array $boolean_columns = [
		'is_model'			=> true,
		'is_translatable'	=> true,
		'is_main'			=> true
	];

	/**
	* Per-request in-memory cache for read().
	* Keyed by `tipo`; value is the fully hydrated associative array returned by
	* read(), or an empty array `[]` when the tipo was queried but not found.
	* Cache entries are invalidated (unset) immediately after any create(),
	* update(), or delete() that touches the same tipo, ensuring that subsequent
	* reads within the same request see fresh data.
	* @var array<string,array<string,mixed>> $load_cache
	*/
	public static array $load_cache = [];



	/**
	* CREATE
	* Upserts a single row into the ontology table using a fixed-shape prepared statement.
	*
	* The SQL always includes every column in $columns (in declaration order) with `tipo`
	* first. This keeps the prepared statement SQL structure identical across calls so
	* PostgreSQL can reuse its plan — dynamic `$values` only affect parameter bindings, not
	* the statement shape. The `ON CONFLICT (tipo) DO UPDATE SET …` clause means this method
	* is safe to call even when the node already exists; it will overwrite all columns with
	* the supplied (or default) values rather than inserting a duplicate.
	*
	* Type coercions applied before binding:
	*   - JSONB columns: encoded via json_handler::encode(), placeholder cast to ::jsonb
	*   - Boolean columns: converted to 't'/'f' string, placeholder cast to ::boolean
	*   - All other columns: passed as-is; null is valid and stored as SQL NULL
	*
	* On success the in-memory cache entry for $tipo is invalidated so that the next
	* read() call fetches the newly created/updated row.
	*
	* @param string $tipo - unique ontology node identifier, e.g. 'oh1' or 'dd345'
	* @param ?object $values = null - optional initial column values; keys must exist in
	*   $columns (the `tipo` key is ignored here — it is always taken from $tipo). Omitting
	*   a column causes boolean columns to default to false, all others to null.
	* @return int|false - the auto-assigned `id` of the inserted/updated row, or false on
	*   prepare/execute failure
	*/
	public static function create( string $tipo, ?object $values = null ) : int|false {

		$table = self::$table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Iterate every column in declaration order
		// The fixed iteration order over self::$columns guarantees that the placeholder
		// sequence ($1, $2, …) is always identical across calls, which is a prerequisite
		// for pg_prepare() to reuse a single named statement regardless of which $values
		// were supplied by the caller.
		foreach (self::$columns as $col => $col_value) {
			// Prevent double columns. Already added by default (required).
			if ($col==='tipo') continue;

			$columns[] = pg_escape_identifier($conn, $col);

			$default_value = isset(self::$boolean_columns[$col]) ? false : null;

			$value = $values?->$col ?? $default_value;

			// Placeholders / Values (type determined by column definition, not runtime value,
			// to ensure the prepared statement SQL structure is always identical)
			if (isset(self::$json_columns[$col])) {
				// Encode PHP array/object as JSON string, or pass null directly
				$params[]		= ($value !== null) ? json_handler::encode($value) : null;
				$placeholders[]	= '$' . $param_index . '::jsonb';
			}elseif (isset(self::$boolean_columns[$col])) {
				// Parse boolean values to safe save as t|f
				$params[]		= is_bool($value) ? ($value ? 't' : 'f') : 'f';
				$placeholders[]	= '$' . $param_index . '::boolean';
			}else{
				$params[]		= $value;
				$placeholders[]	= '$' . $param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// Build ON CONFLICT update parts using the EXCLUDED pseudo-table
		// PostgreSQL's EXCLUDED virtual table exposes the values that would have been
		// inserted, so `col = EXCLUDED.col` effectively replaces the existing row's
		// column value with the incoming one — producing a full upsert.
		// The conflict column itself (tipo) must be excluded from the SET list because
		// updating the conflict target is not allowed and would cause a syntax error.
		$conflict_column = '"tipo"';
		$update_parts = [];
		foreach ($columns as $column) {
			if ($column !== $conflict_column) { // Don't update the conflict column
				$update_parts[] = "$column = EXCLUDED.$column";
			}
		}

		// SQL. Note that counter (id) is updated auto-handled by the database.
		// If a previous record with the same value for the 'tipo' column exists:
		// Update the record using the ON CONFLICT clause.
		// RETURNING "id" lets us return the row id without a second SELECT,
		// covering both the INSERT path and the ON CONFLICT UPDATE path (PostgreSQL
		// returns the id of the affected row in both cases).
		$sql = "
			INSERT INTO \"$table\" (" . implode(', ', $columns) . ")
			VALUES (" . implode(', ', $placeholders) . ")
			ON CONFLICT ($conflict_column)
			DO UPDATE SET " . implode(', ', $update_parts) . "
			RETURNING \"id\"
		";

		// Execute query with prepared statement
		$stmt_name = 'dd_ontology_create_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql)
			) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;

			// debug
			// if(SHOW_DEBUG) {
			// 	$debug_sql = debug_prepared_statement($sql, $params, $conn);
			// 	debug_log(__METHOD__
			// 		.' debug_sql: ' . PHP_EOL . $debug_sql
			// 		, logger::WARNING
			// 	);
			// }
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			$params
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error Processing Request Load ".to_string($sql) . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch id
		$id = pg_fetch_result($result, 0, 'id');
		if ($id===false) {
			debug_log(__METHOD__
				. " Error giving the new id". PHP_EOL
				. ' last_error: '. pg_last_error($conn) .PHP_EOL
				. ' sql: ' . to_string($sql)
				, logger::ERROR
			);
			return false;
		}

		// Invalidate cache, before return (could be an update on conflict)
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
		}


		// Cast to INT always (received is string by default)
		return (int)$id;
	}//end create



	/**
	* READ
	* Fetches and hydrates the ontology row for a given $tipo.
	*
	* Lookup order:
	*   1. In-memory cache ($load_cache[$tipo]) — avoids a DB round-trip for repeated
	*      lookups of the same node within a single request.
	*   2. PostgreSQL prepared statement — `SELECT <explicit columns> FROM dd_ontology
	*      WHERE tipo = $1 LIMIT 1`. Using an explicit column list (not `SELECT *`) keeps
	*      the result set stable even if the DB schema adds new columns.
	*
	* Row hydration applies the type maps defined on the class:
	*   - $json_columns  → json_decode($value, false) (returns objects, not arrays)
	*   - $int_columns   → (int) cast
	*   - $boolean_columns → compared to 't' to produce PHP bool
	*   Null database values are left as null without hydration.
	*
	* When SHOW_DEBUG is on, query time is measured and added to the
	* 'ontology_total_time' and 'ontology_total_calls' metrics. Queries exceeding
	* SLOW_QUERY_MS (default 100 ms) are logged at WARNING level.
	*
	* @param string $tipo - unique ontology node identifier to look up
	* @return array|false - hydrated associative array of column→value pairs on success;
	*   empty array [] when the tipo does not exist; false on DB/prepare error
	*/
	public static function read( string $tipo ) : array|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			// metrics
			metrics::inc('ontology_total_calls');
		}

		// cache check - only return cached successful results
		if (isset(self::$load_cache[$tipo])) {
			if(SHOW_DEBUG===true) {
				// metrics
				metrics::inc('ontology_total_calls_cached');
			}
			return self::$load_cache[$tipo];
		}

		// from cache file
		// @TODO Working progress
		// $cache_data = dd_cache::cache_from_file((object)[
		// 	'file_name' => 'cache_ontology.php',
		// 	'prefix' => ''
		// ]);
		// if( isset($cache_data[$tipo]) ) {
		// 	$row = $cache_data[$tipo]; // raw db data without parse
		// 	foreach ($row as $key => $value) {
		// 		if ($value === null) {
		// 			continue;
		// 		}
		// 		// parse values
		// 		if (isset(dd_ontology_db_manager::$json_columns[$key])) {
		// 			$row[$key] = json_decode($value, false);
		// 		} elseif (isset(dd_ontology_db_manager::$int_columns[$key])) {
		// 			$row[$key] = (int)$value;
		// 		} elseif (isset(dd_ontology_db_manager::$boolean_columns[$key])) {
		// 			$row[$key] = ($value === 't' || $value === true || $value === '1');
		// 		}
		// 	}

		// 	// metrics
		// 	$total_time_ms = exec_time_unit($start_time,'ms');
		// 	metrics::$ontology_total_time += $total_time_ms;
		// 	metrics::$ontology_total_calls_cached++;

		// 	return $row;
		// }


		$conn = DBi::_getConnection();
		// No database yet (e.g. a fresh install before the DB is configured): degrade gracefully
		// instead of passing a false connection into pg_prepare (which fatals with a TypeError).
		// The installer must build its context with no DB; callers already handle a false read.
		if ($conn === false) {
			return false;
		}

		// During install the schema may not exist yet. On a connectable-but-empty DB, skip QUIETLY
		// when the ontology table is absent (checked once per request) so the installer's context
		// build doesn't log noisy "relation does not exist" pg errors. Installed systems skip this.
		if (!(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS === 'installed')) {
			if (self::$table_exists_cache === null) {
				self::$table_exists_cache = DBi::check_table_exists(self::$table);
			}
			if (self::$table_exists_cache === false) {
				return false;
			}
		}

		$table = self::$table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			$select_fields = '"' . implode('","', array_keys(self::$columns)) . '"';
			// $select_fields = '*';
			$sql = 'SELECT '.$select_fields.' FROM "'.$table.'" WHERE tipo = $1 LIMIT 1';
			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql)
			) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error executing READ" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Fetch all rows into a single associative array
		$row = pg_fetch_assoc($result);
		pg_free_result($result);

		// No results found - cache empty array
		if (!$row) {
			self::$load_cache[$tipo] = [];
			return [];
		}

		// Parse column values
		// Overwrite JSON parsed values, boolean and integers to return formatted data
		foreach ($row as $key => $value) {
			if ($value === null) {
				continue;
			}
			// parse values
			if (isset(self::$json_columns[$key])) {
				$row[$key] = json_decode($value, false);
			} elseif (isset(self::$int_columns[$key])) {
				$row[$key] = (int)$value;
			} elseif (isset(self::$boolean_columns[$key])) {
				$row[$key] = ($value === 't' || $value === true || $value === '1');
			}
		}

		// cache
		self::$load_cache[$tipo] = $row;

		// debug
		if(SHOW_DEBUG===true) {
			$total_time_ms = exec_time_unit($start_time,'ms');
			$slow_threshold = defined('SLOW_QUERY_MS') ? SLOW_QUERY_MS : 100;
			if($total_time_ms > $slow_threshold) {
				debug_log(__METHOD__
					. " Slow query detected" .PHP_EOL
					. ' total_time_ms: ' .$total_time_ms
					, logger::WARNING
				);
			}
			// metrics
			metrics::add_time_ms('ontology_total_time', $total_time_ms);
		}


		return $row;
	}//end read



	/**
	* UPDATE
	* Updates one or more columns in the ontology table row identified by $tipo.
	*
	* Unlike create(), the SQL shape varies with the columns supplied in $values,
	* so this method uses pg_query_params() rather than a named prepared statement.
	*
	* Security: each key in $values is validated against $columns before being
	* interpolated into the query. Invalid column names are logged and skipped
	* (the update continues with remaining valid columns rather than aborting
	* entirely — callers should not rely on partial-update semantics; prefer
	* passing only validated column sets).
	*
	* Upsert fallback: when the UPDATE affects zero rows (the tipo does not yet
	* exist), an INSERT is executed automatically. The $params array is reused
	* directly, so the INSERT column/value order matches the UPDATE SET order
	* (tipo first, then the validated columns from $values).
	*
	* Type coercions applied before binding:
	*   - Non-null JSONB columns: encoded via json_handler::encode(); cast to ::jsonb
	*   - Boolean columns: converted to 't'/'f' literal string (no explicit ::boolean cast)
	*   - All other columns: passed as-is
	*
	* On success the $load_cache entry for $tipo is invalidated.
	*
	* @param string $tipo - unique ontology node identifier
	* @param object $values - column→value map; keys must exist in $columns
	* @return bool - true on success; false if $values is empty, an unknown column is
	*   encountered and all columns are skipped, or the DB execute fails
	*/
	public static function update( string $tipo, object $values ) : bool {

		// Check for empty update payload. Cast to array to avoid empty() false positives
		if (empty((array)$values)) {
			debug_log(
				__METHOD__
					. " Ignored update with empty values " . PHP_EOL
					. ' values: ' . json_encode($values),
				logger::WARNING
			);
			return false;
		}

		$table = self::$table;

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$tipo, // $1 in SQL
		];

		$set_clauses = [];
		$param_index = 2;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		$columns = ['tipo'];
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(self::$columns[$column])) {
				debug_log(__METHOD__
					." Invalid column name: $column" . PHP_EOL
					.' values: ' . json_encode($values)
					, logger::ERROR
				);
				continue;
			}

			// Placeholders / Values
			 if ($value !== null && isset(self::$json_columns[$column])) {
				// Encode PHP array/object as JSON string
				$params[] = json_handler::encode($value);
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ . '::jsonb';
			}else if(isset(self::$boolean_columns[$column])) {
				// Change to normalized string for Boolean value
				$params[] = ($value === true) ? 't' : 'f';
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++ ;
			}else{
				$params[] = $value;
				// Build the SET clause, safely quoting the column name for PostgreSQL
				$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;
			}

			// Column add
			$columns[] = $column;
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE tipo = $1';

		// Execute using pg_query_params for performance and security
		$result = pg_query_params($conn, $sql, $params);

		// Upsert fallback: zero affected rows means the tipo did not yet exist
		// When the UPDATE matched no row, fall back to INSERT using the same
		// $params array. $params[0] is $tipo (the WHERE value from the UPDATE),
		// which becomes the column value in the INSERT — the positional indexes
		// match because $columns starts with 'tipo' and $params starts with $tipo.
		if ($result && pg_affected_rows($result) == 0) {

			$placeholders = [];
			foreach($columns as $key => $column){
				$placeholders[] = '$'. ($key+1);
			}

			$sql_insert = 'INSERT INTO ' . $table . ' ('
				. implode(', ', $columns) . ')
				VALUES ('
				. implode(', ', $placeholders) . ')';

			$result = pg_query_params($conn, $sql_insert, $params);
		}

		if (!$result) {
			debug_log(__METHOD__
				." Error executing UPDATE" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Delete cache
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
		}


		return true;
	}//end update



	/**
	* DELETE
	* Removes the ontology row for the given $tipo using a named prepared statement.
	*
	* The statement `DELETE FROM dd_ontology WHERE tipo = $1` is prepared once per
	* process and reused (tracked in DBi::$prepared_statements) to avoid repeated
	* parse/plan cycles for bulk delete operations such as ontology rebuilds.
	*
	* On success the $load_cache entry for $tipo is invalidated so that any
	* subsequent read() call correctly returns an empty array for the deleted tipo.
	*
	* Note: this method does not cascade; callers are responsible for removing
	* child nodes or related data (relations, matrix rows, etc.) before or after
	* calling delete() when referential integrity is required.
	*
	* @param string $tipo - unique ontology node identifier to delete
	* @return bool - true if the DELETE executed without error; false on prepare or
	*   execute failure. Returns true even when the tipo did not exist (0 affected rows).
	*/
	public static function delete( string $tipo ) : bool {

		$conn = DBi::_getConnection();

		$table = self::$table;

		// With prepared statement
		$stmt_name = __METHOD__ . '_' . $table;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {

			$sql = 'DELETE FROM "'.$table.'" WHERE tipo = $1';
			if (!pg_prepare(
				$conn,
				$stmt_name,
				$sql)
			) {
				debug_log(__METHOD__ . " Prepare failed: " . pg_last_error($conn), logger::ERROR);
				return false;
			}
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}

		// Execute
		$result = pg_execute(
			$conn,
			$stmt_name,
			[$tipo]
		);

		if (!$result) {
			debug_log(__METHOD__
				." Error executing DELETE" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Delete cache
		if (isset(self::$load_cache[$tipo])) {
			unset(self::$load_cache[$tipo]);
		}


		return true;
	}//end delete



	/**
	* SEARCH
	* Queries the ontology table with one or more column filters and returns
	* matching `tipo` strings.
	*
	* Each entry in $values can be either:
	*   - A scalar — compared with `=` (equality match).
	*   - An object with `operator` and `value` properties — the operator is
	*     validated against an allowlist before use. Supported operators:
	*     '=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', '@>'
	*     The '@>' (JSONB containment) operator is used by search_exact_term()
	*     to query inside the `term` JSONB column.
	*
	* Security:
	*   - Column names are validated against $columns; an invalid name causes
	*     search() to return false immediately.
	*   - Operators are validated against a static allowlist; an invalid operator
	*     causes search() to return false immediately.
	*   - Values are passed as positional parameters (pg_query_params), never
	*     interpolated into the SQL string.
	*
	* Unlike read(), this method uses pg_query_params() without a named prepared
	* statement because the WHERE clause shape varies per call (different columns,
	* different operators). Each call compiles a new query string at runtime.
	*
	* Boolean values in $values are normalised to the string 'true'/'false'
	* before binding (PostgreSQL's pg_query_params requires string parameters;
	* the column's native type handles final coercion).
	*
	* When SHOW_DEBUG is on, timing, backtrace, and per-call counters are
	* recorded in the metrics system; slow queries (> SLOW_QUERY_MS) increment
	* a dedicated 'exec_dd_ontology_search_slow_calls' metric.
	*
	* @param array<string,mixed> $values - column→value or column→{operator,value} filter map
	* @param bool $order = false - when true, appends `ORDER BY order_number ASC`
	* @param ?int $limit = null - when provided and > 0, appends `LIMIT $limit`
	* @return array|false - flat array of matching `tipo` strings (may be empty);
	*   false when $values is empty, a column name is invalid, an operator is invalid,
	*   or the DB execute fails
	*/
	public static function search( array $values, bool $order=false, ?int $limit=null ) : array|false {

		// check values
		if (empty($values)) {
			debug_log(__METHOD__
				." Ignored search with empty values" . PHP_EOL
				.' values: ' . json_encode($values)
				, logger::WARNING
			);
			return false;
		}

		// debug
		if(SHOW_DEBUG===true) {
			$start_time = start_time();

			// metrics
			metrics::inc('exec_dd_ontology_search_total_calls');
		}

		$table = self::$table;

		$conn = DBi::_getConnection();

		$params			= []; // param values (first one for tipo)
		$param_index	= 1; // next param index ($2, $3, ...)

		$where_clauses = [];

		// Operator allowlist — declared static to allocate the array only once per process.
		// (!) Any operator not in this list is rejected and search() returns false.
		// The '@>' operator enables JSONB containment queries (used by search_exact_term()).
		static $allowed_ops = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', '@>'];
		foreach ($values as $col => $value) {

			// Columns. Only accepts normalized columns
			if (!isset(self::$columns[$col])) {
				debug_log(__METHOD__
					." Invalid column name: $col" . PHP_EOL
					.' values: ' . json_encode($values)
					, logger::ERROR
				);
				return false;
			}

			if (is_object($value)) {

				// Object form: {operator, value} — allows non-equality comparisons and JSONB ops.
				if (!in_array($value->operator, $allowed_ops)) {
					debug_log(__METHOD__
						." Invalid operator: " . $value->operator . PHP_EOL
						.' values: ' . json_encode($values)
						, logger::ERROR
					);
					return false;
				}
				$param_value = $value->value;
				// PostgreSQL requires boolean literals as strings when passed via pg_query_params;
				// convert PHP bool to 'true'/'false' so the DB coerces them correctly.
				if (isset(self::$boolean_columns[$col]) && is_bool($param_value)) {
					$param_value = ($param_value === true) ? 'true' : 'false';
				}
				$params[] = $param_value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' '.$value->operator.' $'.$param_index;

			}else{
				// Scalar form: simple equality match.
				if (isset(self::$boolean_columns[$col])) {
					$value = ($value === true) ? 'true' : 'false';
				}
				$params[] = $value;
				$where_clauses[] = pg_escape_identifier($conn, $col) . ' = $'.$param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// Without prepared statement (more dynamic and appropriate for changing columns scenarios)
			$sql = 'SELECT tipo FROM '.$table
				 .' WHERE '. implode(' AND ', $where_clauses)
				 . (($order===true) ? ' ORDER BY order_number ASC' : '')
				 . (!empty($limit)  ? " LIMIT $limit" : '');

			$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				." Error executing SEARCH" . PHP_EOL
				.' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		// Build and array of tipos
		$tipos = pg_fetch_all_columns($result, 0);

		// debug
		if(SHOW_DEBUG===true) {
			// time
			$total_time_ms = exec_time_unit($start_time, 'ms');

			// metrics
			metrics::add_time_ms('exec_dd_ontology_search_total_time', $total_time_ms);
			metrics::observe_max('exec_dd_ontology_search_max_time', $total_time_ms); // tail latency
			if ($total_time_ms > SLOW_QUERY_MS) {
				metrics::inc('exec_dd_ontology_search_slow_calls');
			}

			// query additional info
			$bt = debug_backtrace();
			if (isset($bt[1]['function'])) {

				$sql_prepend = '-- exec_search: ' . $total_time_ms . ' ms' . PHP_EOL;

				foreach ([1,2,3,4,5,6,7,8] as $key) {
					if (isset($bt[$key]['function'])) {
						$sql_prepend .= '--  ['.$key.'] ' . $bt[$key]['function'] . "\n";
					}
				}
				$sql = $sql_prepend . trim($sql);
			}

			// debug log sql query. See PHP log file
			$sql = '-- exec_search: ' . implode('|', array_reverse(get_backtrace_sequence())) . PHP_EOL . $sql;
			$sql_debug = debug_prepared_statement($sql, $params, $conn);
			$level = $total_time_ms > 2 ? logger::ERROR : logger::DEBUG;
			// debug_log(__METHOD__
			// 	. ' sql_debug: ' . PHP_EOL
			// 	. PHP_EOL . $sql_debug . PHP_EOL
			// 	, $level
			// );
		}


		return $tipos;
	}//end search



	/**
	* SEARCH_EXACT_TERM
	* Finds ontology nodes whose `term` JSONB object contains an exact match for
	* a given language key and display text.
	*
	* Delegates to search() with an '@>' (JSONB containment) filter on the `term`
	* column, e.g. `term @> '{"lg-eng":"Oral History"}'`. This is a case-sensitive,
	* accent-sensitive exact match — use search_fuzzy_term() for tolerant lookups.
	*
	* The containment query benefits from the GIN index on `term` defined as
	* dd_ontology_term_jsonpath_idx in db_pg_definitions.php.
	*
	* Note: the $model parameter is included in this signature but the $lang
	* parameter has no corresponding entry in the $values map checked by search()
	* for column allowlisting — the language key is baked into the JSONB literal
	* string passed as the operator value, not treated as a separate column filter.
	*
	* @param string $text - exact label text to match, e.g. 'Oral History'
	* @param string $lang - language code key inside the term object, e.g. 'lg-eng'
	* @param ?string $model = null - optional model discriminator filter, e.g. 'section'
	* @param bool $is_main = false - when true, restricts to nodes where is_main = true
	* @param int $limit = 50 - maximum number of matching tipos to return
	* @return array|false - flat array of matching tipo strings; false on DB error
	*/
	public static function search_exact_term(
		string $text,
		string $lang,
		?string $model = null,
		bool $is_main = false,
		int $limit = 50
	) : array|false {

		$json_search = (object)[
			'operator' => '@>',
			'value' => '{"' . $lang . '":"' . $text . '"}'
		];

		$search_values = [
			'term' => $json_search
		];

		if (!empty($model)) {
			$search_values['model'] = $model;
		}

		if ($is_main) {
			$search_values['is_main'] = $is_main;
		}

		return self::search($search_values, false, $limit);
	}//end search_exact_term



	/**
	* SEARCH_FUZZY_TERM
	* Finds ontology nodes whose `term` labels fuzzy-match a search string,
	* ranked by trigram similarity score descending.
	*
	* Two-phase query strategy:
	*   Phase 1 — JSONPath pre-filter (GIN index hit):
	*     `term @? '$.* ? (@ like_regex "pattern" flag "i")'`
	*     Narrows the candidate set quickly using the dd_ontology_term_jsonpath_idx
	*     GIN index. This is a case-insensitive regex over all JSONB values in `term`.
	*     The pattern is derived by escaping $text for JSONPath like_regex syntax
	*     (backslash, double-quote) and single-quoting for PostgreSQL string literals.
	*     Because the JSONPath literal is inlined rather than parameterised, the
	*     escaping must be done in PHP before query construction.
	*   Phase 2 — Trigram similarity (pg_trgm GIN index hit):
	*     `f_unaccent(jsonb_values_as_text(term)) % f_unaccent($1)`
	*     The `%` operator uses the similarity threshold set by pg_trgm.similarity_threshold
	*     (PostgreSQL default 0.3). The dd_ontology_term_trgm_values_idx index is used here.
	*     Both sides are passed through f_unaccent() for accent-insensitive matching.
	*
	* The two phase conditions are combined with OR so that a node passes if either
	* the JSONPath regex or the trigram threshold matches. Nodes passing the WHERE
	* clause are then sorted by the similarity() score computed against $1 (DESC),
	* so the closest trigram matches appear first even when the regex alone matched.
	*
	* Database prerequisites (all defined in db_pg_definitions.php):
	*   - pg_trgm extension
	*   - f_unaccent(text) — accent-stripping wrapper around unaccent()
	*   - jsonb_values_as_text(jsonb) — flattens all JSONB leaf values to a single text
	*   - dd_ontology_term_jsonpath_idx — GIN index on the term column for JSONPath
	*   - dd_ontology_term_trgm_values_idx — GIN trigram index on jsonb_values_as_text(term)
	*
	* Unlike search(), this method builds its own SQL and calls pg_query_params()
	* directly (not via the search() dispatcher) because the SELECT list includes
	* the computed `score` column needed for ORDER BY.
	*
	* @param string $text - search string, e.g. 'Oral History'
	* @param ?string $model = null - optional model discriminator filter, e.g. 'section'
	* @param bool $is_main = false - when true, restricts to nodes where is_main = true
	* @param int $limit = 50 - maximum number of results; 0 disables the LIMIT clause
	* @return array|false - flat array of tipo strings ordered by similarity score (DESC);
	*   false on DB execute failure
	*/
	public static function search_fuzzy_term(
		string $text,
		?string $model = null,
		bool $is_main = false,
		int $limit = 50
	) : array|false {

		$table = self::$table;
		$conn = DBi::_getConnection();

		// Build JSONPath regex pattern from input text.
		// PostgreSQL does not support pg_query_params placeholders inside a JSONPath
		// string literal — the JSONPath operator @? takes its argument as a string
		// constant in the SQL text, not as a bind parameter. Therefore the user
		// input must be escaped in PHP before being inlined:
		//   1. Escape backslash and double-quote for JSONPath like_regex syntax
		//   2. Double single-quotes for PostgreSQL string literal quoting
		// (!) This inline-escaping means callers must trust that preg_replace and
		//     str_replace fully neutralise the input. All other search parameters
		//     ($1, $2, …) are safely parameterised via pg_query_params.
		$jsonpath_regex = preg_replace('/([\\\\"])/', '\\\\$1', $text);
		$jsonpath_regex = str_replace("'", "''", $jsonpath_regex);

		$params = [];
		$param_idx = 1;

		// $1 — the search text, bound once but referenced in two SQL clauses.
		// $trigram_param remembers the positional index so both the WHERE trigram
		// clause and the SELECT similarity() expression can reference the same
		// bind slot without duplicating the value in $params.
		$params[] = $text;
		$trigram_param = $param_idx;
		$param_idx++;

		// Build WHERE clause:
		//   Phase 1: JSONPath pre-filter (uses GIN index)
		//     term @? '$.* ? (@ like_regex "pattern" flag "i")'
		//     The $.* is JSONPath syntax, NOT a pg param placeholder.
		//   Phase 2: Trigram similarity with accent-insensitive matching
		//     f_unaccent(jsonb_values_as_text(term)) % f_unaccent($1)
		//     Uses pg_query_params parameter substitution for the text value.
		$like_regex_clause = "term @? '\$.* ? (@ like_regex \"" . $jsonpath_regex . "\" flag \"i\")'";
		$trigram_clause = 'f_unaccent(jsonb_values_as_text(term)) % f_unaccent($' . $trigram_param . ')';
		$where_parts = [];
		$where_parts[] = '(' . $like_regex_clause . ' OR ' . $trigram_clause . ')';

		if (!empty($model)) {
			$params[] = $model;
			$where_parts[] = 'model = $' . $param_idx;
			$param_idx++;
		}


		$params[] = ($is_main === true) ? 'true' : 'false';
		$where_parts[] = 'is_main = $' . $param_idx;
		$param_idx++;


		$limit_clause = ($limit > 0) ? ' LIMIT ' . $limit : '';

		$sql = 'SELECT tipo, '
			. 'similarity(f_unaccent(jsonb_values_as_text(term)), f_unaccent($' . $trigram_param . ')) AS score '
			. 'FROM "' . $table . '" '
			. 'WHERE ' . implode(' AND ', $where_parts) . ' '
			. 'ORDER BY score DESC'
			. $limit_clause;
		$result = pg_query_params($conn, $sql, $params);

		if (!$result) {
			debug_log(__METHOD__
				. ' Error executing fuzzy search: ' . pg_last_error($conn)
				. ' SQL: ' . $sql
				, logger::ERROR
			);
			return false;
		}

		// Extract tipo column (first column) from results
		$tipos = pg_fetch_all_columns($result, 0);

		return $tipos;
	}//end search_fuzzy_term



}//end class dd_ontology_db_manager
