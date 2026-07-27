<?php declare(strict_types=1);
/**
* CLASS MATRIX_ACTIVITY_DIFFUSION_DB_MANAGER
* Specialised DB manager for the `matrix_activity_diffusion` table, which
* stores the diffusion activity log (section dd1758).
*
* Responsibilities:
* - Restrict all inherited CRUD operations to the single allowed table
*   `matrix_activity_diffusion`, preventing accidental writes to other matrix tables.
* - Override `create()` with a simplified INSERT that relies on the PostgreSQL
*   sequence `matrix_activity_diffusion_section_id_seq` for `section_id` assignment
*   rather than the shared `matrix_counter` / `matrix_counter_dd` advisory-lock
*   mechanism used by the generic `matrix_db_manager::create()`.  The activity log
*   is append-only and high-volume, so skipping the counter avoids contention.
* - Inherit read/update/delete/search/exec_search unchanged from matrix_db_manager.
*
* Table structure (defined in install/db/matrix_activity_diffusion.sql):
*   id            INTEGER  — auto-incrementing surrogate PK (matrix_activity_diffusion_id_seq)
*   timestamp     TIMESTAMP DEFAULT now()
*   section_id    INTEGER  — logical section counter, driven by matrix_activity_diffusion_section_id_seq
*   section_tipo  VARCHAR  — ontology type identifier (always 'dd1758' in practice)
*   data, relation, string, date, iri, geo, number, media, misc,
*   relation_search, meta — JSONB component data columns (same schema as matrix)
*
* The sole writer is diffusion_activity_logger::log(), which calls create() once per
* diffusion event (publish / unpublish / unpublish_pending).
* diffusion_delete::retry_pending() reads and updates rows via the inherited read()
* and update() methods.
*
* Extends matrix_db_manager — inherits all CRUD helpers and exec_search.
*
* @package Dédalo
* @subpackage Core
*/
class matrix_activity_diffusion_db_manager extends matrix_db_manager {



	/**
	* @var array $tables
	* Allowlist of tables this manager may touch. Restricts the full parent
	* whitelist down to a single table, so any call that specifies a different
	* table name is rejected before a query is executed.
	*/
	// Allowed matrix tables
	public static array $tables = [
		'matrix_activity_diffusion' => true
	];



	/**
	* CREATE
	* Inserts a single row into `matrix_activity_diffusion` with automatic
	* handling for JSONB columns and guaranteed inclusion of `section_tipo`.
	*
	* Key difference from the parent matrix_db_manager::create():
	* - This override does NOT use the counter table (matrix_counter) or an
	*   advisory lock. Instead, `section_id` is left out of the INSERT
	*   entirely, so the table's own sequence
	*   (`matrix_activity_diffusion_section_id_seq`) assigns it automatically.
	*   This avoids counter contention on the high-frequency activity log.
	* - The returned value is always 1 (not the actual new section_id), because
	*   the section_id from the sequence is not needed by callers and fetching
	*   it with RETURNING would add unnecessary overhead.
	*
	* Column enumeration strategy:
	* All columns defined in self::$columns (inherited from matrix_db_manager)
	* are always included in the INSERT statement, including those for which the
	* caller provided no value (they receive NULL). This produces a fixed,
	* predictable column list that lets PostgreSQL reuse the prepared statement
	* across calls with different payloads without re-preparing.
	*
	* @param string $table
	*   The target table name. Must be 'matrix_activity_diffusion'; any other
	*   value causes an early return of false.
	* @param string $section_tipo
	*   Ontology type identifier stored in the section_tipo column.
	*   In practice this is always 'dd1758' (diffusion log section).
	* @param object|null $values [= null]
	*   Optional data payload: a stdClass where each property name matches a
	*   column name and the property value is the data to store. JSONB columns
	*   (data, relation, string, date, iri, geo, number, media, misc,
	*   relation_search, meta) are JSON-encoded automatically. Columns absent
	*   from $values receive NULL.
	* @return int|false
	*   Returns 1 on success (constant — the real section_id is not returned;
	*   see note above), or false if table validation or query execution fails.
	*/
	public static function create( string $table, string $section_tipo, ?object $values=null ) : int|false {

		// Validate table
		if (!isset(self::$tables[$table])) {
			debug_log(
				__METHOD__
				. " Invalid table. This table is not allowed to create records." . PHP_EOL
				. ' table: ' . $table . PHP_EOL
				. ' allowed_tables: ' . json_encode(self::$tables)
				, logger::ERROR
			);
			return false;
		}

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"section_tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$section_tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Add fixed columns (this allows use prepared statements)
		// Iterate the full schema column list rather than only the columns
		// present in $values, so that the INSERT column list is always identical
		// regardless of the caller's payload. A fixed column list enables
		// prepared-statement recycling via exec_search.
		foreach (self::$columns as $col => $col_value) {
			// Prevent double columns (section_tipo and section_id are added by default)
			if ($col==='section_tipo' || $col==='section_id') continue;

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

		// (!) Note that value returned by save action, in case of activity, is the section_id
		// auto created by table sequence 'matrix_activity_diffusion_section_id_seq', not by the counter.

		// SQL query for insert
		$sql  = "INSERT INTO $table (" . implode(',', $columns) . ")" . PHP_EOL;
		$sql .= "VALUES (" . implode(',', $placeholders) . ")";

		// exec_search manages prepared statement recycling and error logging
		$result = self::exec_search($sql, $params);

		if (!$result) {
			return false;
		}

		// Removed real return section_id for performance reasons (its not used)
		// Return 1 to be compatible with previous behavior
		return 1;
	}//end create



}//end class matrix_activity_diffusion_db_manager
