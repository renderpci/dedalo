<?php declare(strict_types=1);
/**
* CLASS TM_DB_MANAGER
* Dedicated PostgreSQL data-access layer for the `matrix_time_machine` table.
*
* `matrix_time_machine` is Dédalo's versioning store: every time a component value is
* saved, a snapshot row is written here so that the time-machine tool can later restore
* any prior state of a record.  Each row captures who changed what, when, and which
* language was active, together with the serialised component data itself.
*
* Responsibilities of this class:
* - Owns the closed allowlist of the single writable table ($table) and its permitted
*   column names ($columns) so that no caller can inject arbitrary SQL identifiers.
* - Serialises JSONB columns ($json_columns) automatically before binding parameters.
* - Documents which columns PostgreSQL returns as strings that callers must cast to int
*   ($int_columns) and which carry a timestamp value ($timestamp_columns).
* - Delegates all prepared-statement recycling, slow-query logging, and error reporting
*   to matrix_db_manager::exec_search(), which it calls for every query.
*
* All methods are static; this class is never instantiated.
*
* Row shape (table columns):
*   id              — auto-assigned serial primary key (int)
*   section_tipo    — ontology tipo of the section whose value changed (string)
*   section_id      — numeric record ID within that section (int)
*   tipo            — ontology tipo of the component that changed (string)
*   lang            — active language code at the time of the change (string)
*   timestamp       — server-side creation time, set by PostgreSQL DEFAULT now()
*   user_id         — section_id of the user who made the change (int)
*   bulk_process_id — optional reference to the bulk-process that triggered the save (int|null)
*   data            — JSONB snapshot of the component datum that was saved (array|object)
*
* Related classes:
*   tm_record        — domain object wrapping a single time-machine row
*   tm_record_data   — CRUD façade that delegates to this class
*   matrix_db_manager — sibling DAL for all main matrix tables; supplies exec_search()
*   class.search_tm.php — search layer that queries matrix_time_machine via SQO
*
* @package Dédalo
* @subpackage Core
*/
class tm_db_manager {

	/**
	* Sole writable table managed by this class.
	* Hardcoded as a class constant to prevent any caller from redirecting writes to
	* an arbitrary table.  Read by tm_record_data and the search layer to avoid
	* duplicating the string.
	* @var string $table
	*/
	public static string $table = 'matrix_time_machine';

	/**
	* Closed allowlist of column names that may appear in INSERT / UPDATE statements.
	* The `id` column is intentionally absent: it is auto-assigned by PostgreSQL on
	* INSERT and is only permitted in WHERE clauses, never in SET lists.
	* The map value is always `true`; only the key's existence matters.
	* @var array<string,true> $columns
	*/
	public static array $columns = [
		'section_id'		=> true,
		'section_tipo'		=> true,
		'tipo'				=> true,
		'lang'				=> true,
		'timestamp'			=> true,
		'user_id'			=> true,
		'bulk_process_id'	=> true,
		'data'				=> true
	];

	/**
	* Subset of $columns whose values must be JSON-encoded before binding to PostgreSQL.
	* In create() and update(), any column listed here receives a `::jsonb` cast in the
	* placeholder and its value is serialised with json_handler::encode() before being
	* added to the parameter array.
	* Currently only `data` stores a JSONB payload; scalar columns (section_id, tipo,
	* lang, user_id, …) are bound as plain strings/integers.
	* @var array<string,true> $json_columns
	*/
	public static array $json_columns = [
		'data'				=> true
	];

	/**
	* Columns whose raw values PostgreSQL returns as strings that must be cast to int.
	* pg_fetch_* functions always return text; callers that need typed integers (e.g.
	* when building a locator) should check this map and cast with (int).
	* `id` is included even though it never appears in $columns because read() fetches
	* it via SELECT *.
	* @var array<string,true> $int_columns
	*/
	public static array $int_columns = [
		'id'				=> true,
		'section_id'		=> true,
		'user_id'			=> true,
		'bulk_process_id'	=> true
	];

	/**
	* Columns that carry a PostgreSQL timestamp value.
	* Callers that need a PHP DateTime object or a formatted string should parse these
	* columns rather than treating them as plain strings.
	* @var array<string,true> $timestamp_columns
	*/
	public static array $timestamp_columns = [
		'timestamp'			=> true
	];



	/**
	* CREATE
	* Inserts a single row into `matrix_time_machine` and returns the new auto-assigned id.
	*
	* The method iterates over the fixed $columns allowlist rather than the caller-supplied
	* keys, so the column order in the INSERT is always deterministic and no unknown column
	* can slip through.  JSONB columns receive a `::jsonb` cast in the placeholder so
	* PostgreSQL validates the JSON at bind time.
	*
	* The id column is excluded from the INSERT list; PostgreSQL assigns it via the
	* table's DEFAULT SERIAL / GENERATED ALWAYS AS IDENTITY definition and the value is
	* retrieved via a RETURNING "id" clause in the same round-trip.
	*
	* Query execution is delegated to matrix_db_manager::exec_search(), which manages
	* prepared-statement recycling (pool cap of 1 000 plans) and logs errors.
	*
	* @param object|null $values = null - Object keyed by column name.  Missing keys are
	*   treated as NULL.  Unknown keys (not in $columns) are silently ignored because
	*   the loop iterates $columns, not $values.
	* @return int|false - The new row id on success, or false if query preparation or
	*   execution fails, or if the RETURNING clause yields no id.
	*/
	public static function create( ?object $values = null): int|false {

		$table = self::$table;

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= []; // required columns
		$placeholders	= []; // placeholders for them
		$params			= []; // param values
		$param_index	= 1; // next param index ($2, $3, ...)

		// Add fixed columns (this allows use prepared statements)
		foreach (self::$columns as $col => $col_value) {
			// Prevent double columns. Already added by default (required).
			if ($col==='id') continue;

			$columns[] = pg_escape_identifier($conn, $col);

			$value = $values->$col ?? null;

			// Placeholders / Values
			 if ($value !== null && isset(self::$json_columns[$col])) {
				// Encode PHP array/object as JSON string
				$params[]		= json_handler::encode($value);
				$placeholders[]	= '$' . $param_index . '::jsonb';
			}else{
				$params[]		= $value;
				$placeholders[]	= '$' . $param_index;
			}

			// Increase param index value
			$param_index++;
		}

		// SQL query for insert
		$sql = "
			INSERT INTO $table (" . implode(', ', $columns) . ")
			VALUES (" . implode(', ', $placeholders) . ")
			RETURNING \"id\"
		";

		// exec_search manages prepared statement recycling and error logging
		$result = matrix_db_manager::exec_search($sql, $params);

		if (!$result) {
			return false;
		}

		// Fetch id
		$id = pg_fetch_result($result, 0, 'id');
		// Check valid id
		if ($id === false) {
			debug_log(__METHOD__
				. " Error giving the new id" . PHP_EOL
				. ' last_error: ' . pg_last_error($conn) . PHP_EOL
				. ' sql: ' . to_string($sql)
				, logger::ERROR
			);
			return false;
		}


		// Cast to INT always (received is string by default)
		return (int)$id;
	}//end create



	/**
	* READ
	* Retrieves a single row from `matrix_time_machine` by its primary key.
	*
	* Returns the raw pg_fetch_object result without post-processing (no JSON decoding,
	* no int casting).  Callers such as tm_record_data::get_data() are responsible for
	* applying the $json_columns and $int_columns maps after calling this method.
	*
	* SELECT * is used intentionally: the table schema is stable and bounded, and
	* listing all columns explicitly in every call would add maintenance overhead without
	* a measurable performance benefit for single-row lookups.
	*
	* @param int $id - Primary key of the time-machine row to fetch.
	* @return object|false - stdClass with one property per column on success, or false
	*   if the row does not exist or if the query fails.
	*/
	public static function read(int $id): object|false	{

		$table = self::$table;

		$select_fields	= '*'; // Select all because is faster than the list of the columns
		$sql = 'SELECT ' . $select_fields . ' FROM "' . $table . '" WHERE id = $1 LIMIT 1';

		// exec_search manages prepared statement recycling and error logging
		$result = matrix_db_manager::exec_search($sql, [$id]);

		if (!$result) {
			return false;
		}

		// Fetch all row into a single associative array
		$row = pg_fetch_object($result);
		pg_free_result($result);


		// Return the result or false if not found
		return $row ?: false;
	}//end read



	/**
	* UPDATE
	* Safely updates one or more columns of an existing `matrix_time_machine` row.
	*
	* Security guardrails applied on every call:
	* - Empty $values objects are rejected immediately with a WARNING log and false return
	*   to avoid issuing an ill-formed "UPDATE … SET  WHERE id = $1" query.
	* - Each key in $values is validated against the $columns allowlist; an unknown column
	*   name returns false immediately (fail-fast, not skip-and-continue) to surface bugs
	*   in callers early rather than silently discarding data.
	* - The `id` column is excluded from the SET list; it is only used in the WHERE clause
	*   as the positional $1 parameter.
	* - Column identifiers are quoted with pg_escape_identifier() to guard against
	*   identifier injection even though the allowlist check already rejects unknowns.
	* - JSONB columns are serialised via json_handler::encode() before binding.
	*
	* Parameter order: $1 is always `id` (the WHERE value), and SET parameters start at
	* $2.  This means the params array is built with $id at index 0 before the loop.
	*
	* @param int $id - Primary key of the row to update.
	* @param object $values - Object keyed by column name.  The `id` key is silently
	*   skipped.  Any other unknown key causes an immediate false return.
	* @return bool - true on success; false if $values is empty, contains an invalid column,
	*   or if query execution fails.
	*/
	public static function update(int $id, object $values): bool {

		$table = self::$table;

		// Check for empty update payload. Cast to array to avoid empty() false positives
		if (empty((array)$values)) {
			debug_log(
				__METHOD__
					. " Ignored update with empty values" . PHP_EOL
					. ' values: ' . json_encode($values),
				logger::WARNING
			);
			return false;
		}

		// DB connection
		$conn = DBi::_getConnection();

		// Initialize parameters with the WHERE clause values
		$params = [
			$id // $1 in SQL
		];

		$set_clauses = [];
		$param_index = 2;

		// Single-pass loop: Validate columns, prepare values, and build SQL parts simultaneously.
		foreach ($values as $column => $value) {

			// Skip id column as it is used in the WHERE clause
			if ($column === 'id') {
				continue;
			}

			// Validate column name (Security/Guardrail)
			if (!isset(self::$columns[$column])) {
				debug_log(
					__METHOD__
						. " Ignored update with invalid column name: $column" . PHP_EOL
						. ' values: ' . json_encode($values),
					logger::WARNING
				);
				return false;
			}

			// Prepare value: JSON encode if it's a designated JSON column and not null
			$safe_value = ($value !== null && isset(self::$json_columns[$column]))
				? json_handler::encode($value)
				: $value;

			// Build the SET clause, safely quoting the column name for PostgreSQL
			$set_clauses[] = pg_escape_identifier($conn, $column) . ' = $' . $param_index++;

			// Add the prepared value directly to the parameter array
			$params[] = $safe_value;
		}

		// SQL Execution
		// Construct the final query string
		$sql = 'UPDATE ' . $table
			. ' SET ' . implode(', ', $set_clauses)
			. ' WHERE id = $1';

		// exec_search manages prepared statement recycling and error logging
		$result = matrix_db_manager::exec_search($sql, $params);

		if (!$result) {
			return false;
		}

		return true;
	}//end update



	/**
	* DELETE
	* Removes a single row from `matrix_time_machine` by its primary key.
	*
	* Used by the time-machine tool (tool_time_machine) to purge snapshot rows when
	* cleaning up superseded versions, and by the v6-to-v7 migration script to remove
	* orphaned entries.  The WHERE clause uses only the auto-assigned `id` column so
	* no composite-key mis-match is possible.
	*
	* (!) This operation is irreversible. There is no soft-delete or recycle bin for
	* time-machine rows.  Callers must confirm the correct id before calling delete().
	*
	* @param int $id - Primary key of the row to delete.
	* @return bool - true on success; false if query preparation or execution fails.
	*/
	public static function delete( int $id ) : bool {

		$table = self::$table;

		// Index use sample:
		// Index Scan using matrix_section_tipo_section_id_desc_idx on matrix
		$sql = 'DELETE FROM "' . $table . '"'
			. ' WHERE id = $1';

		// exec_search manages prepared statement recycling and error logging
		$result = matrix_db_manager::exec_search($sql, [$id]);

		if (!$result) {
			return false;
		}

		return true;
	}//end delete



}//end class tm_db_manager
