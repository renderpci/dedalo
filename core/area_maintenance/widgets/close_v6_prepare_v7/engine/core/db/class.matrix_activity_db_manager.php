<?php declare(strict_types=1);
/**
* CLASS MATRIX_ACTIVITY_DB_MANAGER
* Specialised DB manager for the `matrix_activity` audit-log table.
*
* Extends matrix_db_manager and overrides `create()` with a simplified
* insert strategy that bypasses the parent's advisory-lock counter
* mechanism. `matrix_activity` relies on a native PostgreSQL sequence
* (`matrix_activity_section_id_seq`) for row identity, so there is no
* need to synchronise with the shared `matrix_counter` table.
*
* Responsibilities:
* - Gate write access to the single allowed table ('matrix_activity').
* - Enumerate and insert all schema columns in a fixed, deterministic
*   order so the same prepared statement can be recycled across calls
*   (high-frequency: every user action generates at least one insert).
* - Encode JSONB columns transparently via json_handler.
* - Return a stable non-false sentinel (int 1) on success; the real
*   auto-assigned section_id is not fetched because callers (notably
*   logger_backend_activity::log_message_defer) do not use it.
*
* Relationships:
* - Extends matrix_db_manager (inherits exec_search, update, delete, …).
* - Used exclusively by logger_backend_activity to write activity records.
* - Its sibling matrix_activity_diffusion_db_manager mirrors this pattern
*   for the 'matrix_activity_diffusion' diffusion-log table.
* - section_record selects this class as data_handler when table === 'matrix_activity'.
*
* @package Dédalo
* @subpackage Core
*/
class matrix_activity_db_manager extends matrix_db_manager {



	/**
	* Whitelist of tables this manager is permitted to write.
	* Overrides the parent's broad table list to restrict operations to
	* the activity-log table only, preventing accidental writes elsewhere.
	* @var array<string, true> $tables
	*/
	public static array $tables = [
		'matrix_activity' => true
	];



	/**
	* CREATE
	* Inserts one row into the `matrix_activity` table with a simplified
	* strategy that skips the counter/advisory-lock mechanism used by the
	* parent class.
	*
	* Unlike matrix_db_manager::create(), this override:
	* - Does NOT touch matrix_counter or matrix_counter_dd.
	* - Does NOT include section_id in the INSERT column list; the column
	*   is auto-populated by the table sequence
	*   'matrix_activity_section_id_seq'.
	* - Iterates self::$columns in a fixed order (inherited from the parent)
	*   so that the resulting SQL is always identical and the prepared
	*   statement stored in DBi::$prepared_statements can be recycled on
	*   every subsequent call — this is important because activity logging
	*   is called very frequently.
	* - Returns the sentinel value 1 instead of the actual new section_id
	*   because callers never need the assigned id; skipping the extra
	*   pg_fetch_result() saves a round-trip per call.
	*
	* (!) The commented-out empty-values guard (lines 55-63) was intentionally
	* left disabled: the logger may legitimately create sparse rows where all
	* typed columns are null, and blocking those would silence audit events.
	*
	* @param string $table
	*   Name of the target table. Must be present in self::$tables or the
	*   call is rejected to prevent SQL injection.
	* @param string $section_tipo
	*   Section tipo that identifies the activity-log section
	*   (DEDALO_ACTIVITY_SECTION_TIPO, normally 'dd542').
	*   Always inserted as the first positional parameter ($1).
	* @param object|null $values [= null]
	*   Optional stdClass whose properties match matrix column names.
	*   Keys not present in self::$columns are silently ignored here
	*   (the iteration walks self::$columns, not $values).
	*   JSON columns are encoded via json_handler::encode(); scalar columns
	*   are passed through unmodified. Pass null to create an empty row.
	* @return int|false
	*   Returns 1 on successful insert (not the real section_id).
	*   Returns false if the table guard fails, the prepared statement
	*   cannot be compiled, or pg_execute reports an error.
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

		// Check for empty update payload. Cast to array to avoid empty() false positives
		// if (empty((array)$values)) {
		// 	debug_log(
		// 		__METHOD__
		// 			. " Ignored create with empty values" . PHP_EOL
		// 			. ' values: ' . json_encode($values),
		// 		logger::ERROR
		// 	);
		// 	return false;
		// }

		// Connection
		$conn = DBi::_getConnection();

		// Start building query
		$columns		= ['"section_tipo"']; // required columns
		$placeholders	= ['$1']; // placeholders for them
		$params			= [$section_tipo]; // param values (first one for tipo)
		$param_index	= 2; // next param index ($2, $3, ...)

		// Add fixed columns (this allows use prepared statements)
		// Iterating self::$columns (the parent's canonical schema list) rather
		// than $values ensures the column order — and therefore the generated
		// SQL string — is always the same, enabling prepared-statement reuse.
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
		// auto created by table sequence 'matrix_activity_section_id_seq', not by the counter.

		// SQL query for insert
		// section_id is intentionally absent from the column list; the table
		// sequence assigns it automatically, avoiding any counter coordination.
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



}//end class matrix_activity_db_manager
