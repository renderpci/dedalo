<?php declare(strict_types=1);
/**
* Class MATRIX_TEMP_MANAGER
*
* Provides core operations for managing matrix records.
* This class ensures data consistency by enforcing predefined
* table and column definitions within the matrix model.
*
* Supported actions include:
* - Loading record data (read)
* - Updating existing records (update)
* - Inserting new records with optional initial data (create)
* - Deleting existing records (delete)
*/
class matrix_temp_manager extends matrix_db_manager {

	public static array $tables = [
		'temp' => true
	];

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

	public static array $json_columns = [
		'value' => true,
	];


	/**
	 * CREATE
	 * Inserts a new record into the temp table or updates it if it exists using an upsert pattern.
	 * This method performs an atomic operation: if a record with the specified key exists, it merges
	 * the new values into the existing JSONB data using PostgreSQL's JSONB merge operator; otherwise,
	 * it creates a new record with the provided values. The function defaults to an empty object if
	 * no values are provided.
	 *
	 * @param string $section_tipo The section tipo identifier used to generate the unique key
	 * @param string $table The table name to operate on (default: 'temp')
	 * @param object|null $values An object containing the values to insert or merge (defaults to empty object)
	 *
	 * @return int|false Returns 0 on success, false if the operation fails
	 *
	 * @package Dedalo
	 * @subpackage Core
	 */
	public static function create(string $section_tipo, string $table='temp', ?object $values = null): int|false {

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
	 * Retrieves temporal data from the temp table and formats it as a matrix record.
	 * This method fetches the JSONB data stored in the temp table for a given section tipo,
	 * then constructs a fake database row object that mimics the structure of a matrix table.
	 * The section_id is set to 0 to indicate this is a temporary record, and all non-string
	 * values are JSON-encoded to match the expected format. If no record is found, the method
	 * returns false.
	 *
	 * @param string $table The table name to read from (default: 'temp')
	 * @param string $section_tipo The section tipo identifier used to generate the unique key
	 * @param int|string $section_id The section ID (ignored, uses section_tipo as key for lookup)
	 *
	 * @return object|false Returns a fake matrix row object with section_id=0, or false if no record found
	 *
	 * @package Dedalo
	 * @subpackage Core
	 */
	public static function read(string $table, string $section_tipo, int|string $section_id): object|false	{

		$key = self::get_uid($section_tipo);

		$sql = "SELECT value FROM \"$table\" WHERE key = $1";
		$res = self::exec_search($sql, [$key]);

		if ($res && pg_num_rows($res) > 0) {
			$row = pg_fetch_object($res);
			$data = json_decode($row->value);

			// Mimic a database row for matrix tables
			$fake_row = new stdClass();
			$fake_row->section_id = 0;
			$fake_row->section_tipo = $section_tipo;

			foreach (matrix_db_manager::get_columns_name() as $col) {
				$fake_row->$col = $data->$col ?? null;
				if ($fake_row->$col !== null && !is_string($fake_row->$col)) {
					$fake_row->$col = json_encode($fake_row->$col);
				}
			}
			return $fake_row;
		}

		return false;
	}//end read



	/**
	* UPDATE
	* Merges new values into the existing JSONB 'value' column in the temp table using PostgreSQL's JSONB merge operator.
	* This method performs an upsert operation: if a record with the specified key exists, it merges the new values
	* into the existing JSONB data; otherwise, it creates a new record with the provided values.
	*
	* @param string $table The table name (default: 'temp')
	* @param string $section_tipo The section tipo identifier used to generate the unique key
	* @param int|string $section_id The section ID (ignored, kept for API compatibility)
	* @param object $values An object containing the values to merge into the JSONB column
	* @return bool True if the update was successful, false if values are empty or operation failed
	*
	* @package Dedalo
	* @subpackage Core
	*/
	public static function update(string $table, string $section_tipo, int|string $section_id, object $values): bool {

		if (empty((array)$values)) {
			return false;
		}

		$key = self::get_uid($section_tipo);

		// Prepare values for JSONB merge. Ensure all columns are JSON encoded if needed.
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

		return (bool)$result;
	}//end update



	/**
	* UPDATE_BY_KEY
	* Updates individual component values within the JSONB 'value' column of the temp table.
	* 
	* This method performs granular updates to specific component fields within a JSONB structure,
	* using PostgreSQL's jsonb_set and jsonb_set_lax functions. Updates are grouped by column,
	* allowing for efficient batch updates to multiple components within the same section.
	*
	* The data structure is: 
	 * - Column-level objects: Each key represents a database column name
	 * - Component-level objects: Each component is stored within its column object with the
	 *   component tipo as the key and the component value as the value
	 * - Null values are removed from the JSONB structure using the 'delete_key' option
	 *
	 * The function constructs nested jsonb_set expressions like:
	 * SET value = jsonb_set(jsonb_set(value, '{column}', 
	 *   jsonb_set_lax(COALESCE(value->'column', '{}'), '{comp_id}', value, true, 'delete_key')
	 * ), '{column}', ..., true)
	 * 
	 * @param string $table The table name to update (default: 'temp')
	 * @param string $section_tipo The section tipo identifier used to generate the unique key
	 * @param int|string $section_id The section ID (kept for API compatibility, not used in logic)
	 * @param array $data_to_save Array of objects, each containing:
	 *                             - column: string The column name in the JSONB structure
	 *                             - key: string The component tipo (used as the JSON path key)
	 *                             - value: mixed The value to set for the component (null removes the key)
	 * @return bool True if the update was successful, false if data_to_save is empty or operation failed
	 * @throws Exception If database operation fails during exec_search
	 *
	 * @package Dedalo
	 * @subpackage Core
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
		$sql_ensure = "INSERT INTO \"$table\" (key, value)
				VALUES ($1, '{}'::jsonb)
				ON CONFLICT (key) DO NOTHING";
		self::exec_search($sql_ensure, [$key]);


		// Group updates by column
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
	 * Removes the record from the temp table based on section_tipo.
	 *
	 * Deletes the temporary record associated with the given section tipo. The function generates
	 * a unique key using get_uid() and executes a DELETE statement against the specified table.
	 * This is used to clean up temporary data when a section record is no longer needed.
	 *
	 * @param string $table The table name to delete from (default: 'temp')
	 * @param string $section_tipo The section tipo identifier used to generate the unique key
	 * @param int|string $section_id The section ID (kept for API compatibility, not used in logic)
	 *
	 * @return bool True if the record was deleted, false if no record was found or operation failed
	 *
	 * @throws Exception If database operation fails
	 *
	 * @package Dedalo
	 * @subpackage Core
	 */
	public static function delete(string $table, string $section_tipo, int|string $section_id) : bool {

		$key = self::get_uid($section_tipo);
		$sql = "DELETE FROM \"$table\" WHERE key = $1";
		$result = self::exec_search($sql, [$key]);

		return (bool)$result;
	}//end delete



	/**
	 * GET_UID
	 * Generates a unique key for the temp table by combining the section tipo with the logged-in user's ID.
	 * This ensures that temporary data is isolated per user and section, preventing conflicts when multiple
	 * users work on the same section simultaneously.
	 *
	 * @param string $section_tipo The section tipo identifier used to generate the unique key
	 *
	 * @return string The unique key composed of section_tipo and logged_user_id()
	 *
	 * @package Dedalo
	 * @subpackage Core
	 */
	public static function get_uid(string $section_tipo) : string {
		return $section_tipo . logged_user_id();
	}//end get_uid



}//end class matrix_temp_manager
