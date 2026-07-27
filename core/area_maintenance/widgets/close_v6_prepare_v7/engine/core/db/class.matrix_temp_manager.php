<?php declare(strict_types=1);
/**
* CLASS MATRIX_TEMP_MANAGER
* PostgreSQL data-access layer for the 'temp' table — Dédalo's per-user, ephemeral
* section storage used to stage unsaved work without touching the main matrix tables.
*
* The 'temp' table has a different schema from the standard matrix tables: instead of
* the composite (section_tipo, section_id) primary key, each row is identified by a
* string 'key' column whose value is constructed by get_uid() as the concatenation of
* section_tipo and the currently logged-in user's ID.  This design means:
*  - Two users editing the same section_tipo simultaneously never collide.
*  - The section_id concept does not apply; every temp row is addressed by tipo+user.
*  - The 'value' column is a flat JSONB object that mirrors the combined column payload
*    (data, string, relation, …) that the parent matrix tables store in separate columns.
*
* This class extends matrix_db_manager to inherit exec_search() and get_columns_name(),
* but overrides ALL four CRUD methods so that they operate on the 'temp' table schema
* rather than the standard (section_tipo, section_id) schema of the parent.
*
* Overridden static allowlists:
*  - $tables   — only 'temp' is allowed (parent allows 20+ matrix_* tables).
*  - $columns  — only 'key' and 'value' (the two columns of the temp table).
*  - $json_columns — only 'value' requires JSON encoding.
*
* Used by:
*  - section_record_temp: sets $data_handler = 'matrix_temp_manager' and calls
*    create/read/update/delete through the standard section_record interface.
*
* All methods are static.  The class is never instantiated.
* Uses: matrix_db_manager::exec_search() (prepared-statement pool), json_handler,
* logged_user_id() (session helper), logger, debug_log.
*
* @package Dédalo
* @subpackage Core
*/
class matrix_temp_manager extends matrix_db_manager {

	/**
	* Closed allowlist of writable temp tables.
	* Overrides the parent's $tables to restrict access to the 'temp' table only.
	* All CRUD methods validate the $table argument against this map.
	* @var array<string,true> $tables
	*/
	public static array $tables = [
		'temp' => true
	];

	/**
	* Closed allowlist of column names for the temp table.
	* The temp table only has two payload columns:
	*  - 'key'   : string primary key (section_tipo + user_id via get_uid())
	*  - 'value' : JSONB object containing all component data for the staged record
	* Overrides the parent's richer $columns allowlist.
	* @var array<string,array<string,mixed>> $columns
	*/
	public static array $columns = [
		'key' => [
			'type' => 'string',
			'required' => true,
		],
		'value' => [
			'type' => 'jsonb',
			'required' => true,
		],
	];

	/**
	* Subset of $columns whose values must be JSON-encoded before being bound to PostgreSQL.
	* Only 'value' requires encoding; 'key' is a plain string scalar.
	* @var array<string,true> $json_columns
	*/
	public static array $json_columns = [
		'value' => true,
	];


	/**
	* CREATE
	* Inserts a new temporary record or merges new values into an existing one (upsert).
	*
	* The key is derived from section_tipo + logged-in user ID via get_uid(), ensuring
	* per-user isolation.  If a row with that key already exists, the incoming values are
	* shallow-merged into the stored JSONB with PostgreSQL's || operator; otherwise a new
	* row is created.  When $values is null or empty, the row is initialised with an empty
	* JSONB object ({}).
	*
	* Unlike the parent's create(), this method does NOT allocate a section_id from a
	* counter table.  It always returns 0 as a sentinel section_id because temp records
	* have no persistent integer identity.
	*
	* @param string $table The table to write to — must be 'temp'.
	* @param string $section_tipo Section tipo identifier; combined with logged user ID to form the row key.
	* @param object|null $values [= null] Column-keyed payload to insert or merge. Defaults to empty object.
	* @return int|false Returns 0 on success (sentinel for "temp record saved"), false on failure.
	*/
	public static function create(string $table, string $section_tipo, ?object $values = null): int|false {

		$key = self::get_uid($section_tipo);
		$value = json_handler::encode($values ?: new stdClass());

		$sql = "INSERT INTO \"$table\" (key, value)
				VALUES ($1, $2)
				ON CONFLICT (key) DO UPDATE SET value = COALESCE(temp.value, '{}'::jsonb) || EXCLUDED.value
				RETURNING 0 as section_id"; // Always return 0 as section_id for temp

		$result = self::exec_search($sql, [$key, $value]);

		return $result ? 0 : false;
	}//end create



	/**
	* READ
	* Retrieves a temporary record from the temp table and returns it as a fake matrix row.
	*
	* Looks up the row whose key matches get_uid($section_tipo), decodes the stored JSONB
	* 'value' object, and constructs a stdClass that mimics the shape of a real matrix row:
	*  - section_tipo is set from the parameter.
	*  - Each column returned by matrix_db_manager::get_columns_name() is populated from
	*    the decoded JSONB object; non-string values are re-JSON-encoded to match the raw
	*    string format that callers expect from pg_fetch_object on a real matrix table.
	*  - section_id is always set to 0 (the sentinel for temp records).
	*
	* The $section_id parameter is accepted for API compatibility with the parent's
	* read() signature but is never used; the lookup key is always tipo+user.
	*
	* @param string $table The table to read from — must be 'temp'.
	* @param string $section_tipo Section tipo identifier; combined with logged user ID to form the row key.
	* @param int|string $section_id Ignored — kept for API compatibility with matrix_db_manager::read().
	* @return object|false Synthetic matrix-row object with section_id=0 on success, false if no record found.
	*/
	public static function read(string $table, string $section_tipo, int|string $section_id): object|false	{

		$key = self::get_uid($section_tipo);

		$sql = "SELECT value FROM \"$table\" WHERE key = $1";
		$res = self::exec_search($sql, [$key]);

		if ($res && pg_num_rows($res) > 0) {
			$row = pg_fetch_object($res);
			$data = json_decode($row->value);

			// Mimic a database row for matrix tables
			// Build a fake row that callers can treat like a real pg_fetch_object result.
			// Each column from the canonical matrix column list is populated from the flat
			// JSONB blob; values that are already strings are passed through as-is,
			// while nested objects/arrays are re-encoded so callers see the same raw
			// string format they would get from a SELECT on a real matrix table.
			$fake_row = new stdClass();
			$fake_row->section_tipo = $section_tipo;

			foreach (matrix_db_manager::get_columns_name() as $col) {
				$fake_row->$col = $data->$col ?? null;
				if ($fake_row->$col !== null && !is_string($fake_row->$col)) {
					$fake_row->$col = json_encode($fake_row->$col);
				}
			}
			$fake_row->section_id = 0;
			return $fake_row;
		}

		return false;
	}//end read



	/**
	* UPDATE
	* Merges new values into the existing JSONB 'value' column via an upsert.
	*
	* Encodes the full $values object as JSONB and issues an INSERT … ON CONFLICT DO UPDATE
	* with the || merge operator, so existing top-level keys in the stored JSONB are
	* replaced while unmentioned keys are preserved.  If the row does not yet exist it is
	* created.  Returns false immediately when $values is empty to avoid a no-op write.
	*
	* The $section_id parameter is accepted for API compatibility with the parent's
	* update() signature but is never used.
	*
	* (!) The error branch at line ~164 references an undefined variable $conn.  This is a
	* pre-existing bug: exec_search() owns the connection internally and $conn is never
	* declared in this method scope.  pg_last_error() will fall back to the last open
	* connection in that case, so the error message may still be correct at runtime, but
	* the reference is technically undefined and will emit an E_WARNING in strict contexts.
	*
	* @param string $table The table to update — must be 'temp'.
	* @param string $section_tipo Section tipo identifier; combined with logged user ID to form the row key.
	* @param int|string $section_id Ignored — kept for API compatibility with matrix_db_manager::update().
	* @param object $values Column-keyed payload whose top-level keys are shallow-merged into the stored value.
	* @return bool True on successful upsert, false if $values is empty or the database operation fails.
	*/
	public static function update(string $table, string $section_tipo, int|string $section_id, object $values): bool {

		if (empty((array)$values)) {
			return false;
		}

		$key = self::get_uid($section_tipo);

		// Prepare values for JSONB merge. Ensure all columns are JSON encoded if needed.
		// Note: the two branches of this if/else produce identical results — both assign
		// $val to $prepared_values->$col regardless of the condition.  The dead branch is
		// left in place as-is per the doc-only rule.
		$prepared_values = new stdClass();
		foreach ($values as $col => $val) {
			if ($val !== null && !is_string($val)) {
				$prepared_values->$col = $val;
			} else {
				$prepared_values->$col = $val;
			}
		}

		$json_values = json_handler::encode($prepared_values);

		$sql = "INSERT INTO \"$table\" (key, value)
				VALUES ($1, $2)
				ON CONFLICT (key) DO UPDATE
				SET value = COALESCE(\"$table\".value, '{}'::jsonb) || EXCLUDED.value";

		$result = self::exec_search($sql, [$key, $json_values]);

		if (!$result) {
			// (!) $conn is not declared in this scope — pre-existing bug; see method doc-block.
			debug_log(__METHOD__
				. " Error execution UPDATE/INSERT on table: $table " . PHP_EOL
				. ' error: ' . pg_last_error($conn)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end update



	/**
	* UPDATE_BY_KEY
	* Granularly updates individual component values within the JSONB 'value' column.
	*
	* Where update() replaces entire top-level keys via shallow merge, this method
	* performs surgical writes to nested JSON paths: each entry in $data_to_save targets
	* a specific matrix column key (e.g. 'string') and a specific component tipo key
	* inside it (e.g. 'oh25').  Null values remove the targeted key via PostgreSQL's
	* jsonb_set_lax 'delete_key' option.
	*
	* Algorithm:
	*  1. Guarantee-insert: INSERT … ON CONFLICT DO NOTHING ensures the row exists before
	*     the UPDATE so that the subsequent jsonb_set expression never operates on NULL.
	*  2. Group $data_to_save entries by their column field to minimise the number of
	*     nested jsonb_set_lax calls needed in the final SQL.
	*  3. For each column group, build a chain of nested jsonb_set_lax() calls that
	*     start from COALESCE(value->'column', '{}') and thread in each component update.
	*  4. Wrap each column's chain with jsonb_set(value, '{column}', ..., true) so the
	*     outer 'value' JSONB object is updated atomically.
	*  5. Execute a single UPDATE … SET value = <expression> WHERE key = $1.
	*
	* The resulting SQL expression is dynamic SQL (column names and JSON function calls
	* are interpolated as strings) but all user-supplied values (JSON path and payload)
	* are passed as positional parameters ($2, $3, …) to prevent injection.
	*
	* The $section_id parameter is accepted for API compatibility with the parent's
	* update_by_key() signature but is never used.
	*
	* @param string $table The table to update — must be 'temp'.
	* @param string $section_tipo Section tipo identifier; combined with logged user ID to form the row key.
	* @param int|string $section_id Ignored — kept for API compatibility with matrix_db_manager::update_by_key().
	* @param array $data_to_save Array of objects, each with:
	*   - column string  Top-level key in the stored JSONB (e.g. 'string', 'relation').
	*   - key    string  Component tipo used as the JSON path sub-key (e.g. 'oh25').
	*   - value  mixed   New value to set; null removes the key via 'delete_key'.
	* @return bool True on successful update, false if $data_to_save is empty or the operation fails.
	*/
	public static function update_by_key(
		string $table,
		string $section_tipo,
		int|string $section_id,
		array $data_to_save
		): bool {

		if (empty($data_to_save)) {
			return false;
		}

		$key = self::get_uid($section_tipo);

		// Ensure record exists to avoid UPDATE on non-existent key
		// A plain UPDATE WHERE key = $1 on a missing row silently affects 0 rows.
		// The guarantee-insert creates an empty JSONB object {} if the row is absent,
		// so the subsequent SET expression always has a valid target to modify.
		$sql_ensure = "INSERT INTO \"$table\" (key, value)
				VALUES ($1, '{}'::jsonb)
				ON CONFLICT (key) DO NOTHING";
		self::exec_search($sql_ensure, [$key]);


		// Group updates by column
		// Grouping lets us produce one jsonb_set chain per column rather than one per
		// data entry, reducing the depth of nesting for single-column batches.
		$column_updates = [];
		foreach ($data_to_save as $data) {
			$column = $data->column;
			if (!isset($column_updates[$column])) {
				$column_updates[$column] = [];
			}
			$column_updates[$column][] = $data;
		}


		// Build the SQL expression
		// We want to achieve: SET value = jsonb_set(value, '{string}', NewStringObj, true) ...
		// where NewStringObj = jsonb_set(COALESCE(value->'string', '{}'), '{comp_id}', val, true) ...

		$expression = "value"; // Start with existing value
		$params = [$key];
		$param_index = 2;

		foreach ($column_updates as $column => $updates) {

			// Build the expression for this specific column's new object
			// Start with existing column data or empty object
			$col_expr = "COALESCE(value->'$column', '{}'::jsonb)";

			foreach ($updates as $data) {
				$comp_tipo = $data->key;
				$val = $data->value;

				$json_val = ($val === null) ? null : json_handler::encode($val);

				$current_param_index = $param_index; // Index for path '{comp_tipo}'
				$value_param_index = $param_index + 1; // Index for value

				// jsonb_set(target, path, value)
				// Note: using jsonb_set_lax for better null handling if needed, but standard logic:
				// If val is null, we want to remove the key. jsonb_set_lax with 'delete_key' does this.
				$col_expr = "jsonb_set_lax($col_expr, \${$current_param_index}::text[], \${$value_param_index}::jsonb, true, 'delete_key')";

				$params[] = '{' . $comp_tipo . '}';
				$params[] = $json_val;
				$param_index += 2;
			}

			// Now wrap the expression to update the main value
			// value = jsonb_set(value, '{column}', NewColumnObject, true)
			// effectively ensuring the column key exists
			$col_param_index = $param_index;
			$params[] = '{' . $column . '}';
			$param_index++;

			// We cannot use $col_expr as a parameter because it contains SQL function calls.
			// carefully construct the string.
			$expression = "jsonb_set($expression, \${$col_param_index}::text[], $col_expr, true)";
		}

		$sql = "UPDATE \"$table\"
				SET value = $expression
				WHERE key = $1";

		$result = self::exec_search($sql, $params);

		return (bool)$result;
	}//end update_by_key




	/**
	* DELETE
	* Removes the temporary record for the given section_tipo and current user.
	*
	* Constructs the row key via get_uid() and issues a DELETE against the temp table.
	* Returns true when the DELETE statement executes successfully (even when zero rows
	* were actually deleted — the row may have already been removed or never existed).
	* Returns false only on a database-level execution failure.
	*
	* The $section_id parameter is accepted for API compatibility with the parent's
	* delete() signature but is never used.
	*
	* @param string $table The table to delete from — must be 'temp'.
	* @param string $section_tipo Section tipo identifier; combined with logged user ID to form the row key.
	* @param int|string $section_id Ignored — kept for API compatibility with matrix_db_manager::delete().
	* @return bool True if the DELETE executed without error, false on database failure.
	*/
	public static function delete(string $table, string $section_tipo, int|string $section_id) : bool {

		$key = self::get_uid($section_tipo);
		$sql = "DELETE FROM \"$table\" WHERE key = $1";
		$result = self::exec_search($sql, [$key]);

		return (bool)$result;
	}//end delete



	/**
	* GET_UID
	* Derives the unique string key used to identify a temp row for the current session.
	*
	* The key is the concatenation of the section_tipo string and the integer user ID
	* returned by logged_user_id() (which reads $_SESSION['dedalo']['auth']['user_id']).
	* Example: for section_tipo 'oh1' and user ID 42, the key is 'oh142'.
	*
	* This encoding ensures that two users editing the same section_tipo simultaneously
	* have completely independent temp rows and cannot overwrite each other's staged data.
	*
	* (!) logged_user_id() can return null when called outside an authenticated session
	* (e.g. CLI scripts or unit tests). In that case the key becomes section_tipo + ''
	* (empty string), which may cause unintended key collisions across unauthenticated
	* callers. Callers must ensure a valid session exists before invoking any method that
	* routes through get_uid().
	*
	* @param string $section_tipo Section tipo identifier (e.g. 'oh1', 'numisdata224').
	* @return string Concatenation of $section_tipo and the logged-in user's integer ID.
	*/
	public static function get_uid(string $section_tipo) : string {
		return $section_tipo . logged_user_id();
	}//end get_uid



}//end class matrix_temp_manager
