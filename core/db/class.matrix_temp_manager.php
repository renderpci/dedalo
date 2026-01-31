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



	/**
	* CREATE
	* Creates the session.
	* @param string $table
	* 	Table name. E.g. 'matrix'
	* @param string $section_tipo
	* 	Section tipo. E.g. 'oh1'
	* @param object $values
	* 	Object with {column name : value} structure
	* 	Keys are column names, values are their new values.
	* @return int|false
	* 	Returns true on success, or false on failure.
	*/
	public static function create(string $table, string $section_tipo, ?object $values = null): int|false {

		if(isset($values->section_id)) {
			$section_id = $values->section_id;
			$temp_data_uid = self::get_uid($section_tipo); // E.g. 'oh1'
			if(!isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
				$_SESSION['dedalo']['section_temp_data'][$temp_data_uid] = new stdClass();
			}

			return (int)$section_id;
		}

		return false;
	}//end create



	/**
	* READ
	* Retrieves a single row of data from a specified PostgreSQL table
	* based on section_id and section_tipo.
	* It's designed to provide a unified way of accessing data from
	* various "matrix" tables within the Dédalo application.
	* @param string $table
	* 	Table name. E.g. 'matrix'
	* @param string $section_tipo
	* 	Section tipo. E.g. 'oh1'
	* @param int|string $section_id
	* 	Section id. E.g. '1'
	* @return object|false $row
	* 	Returns the processed data as an object with parsed JSON values.
	* 	If no row is found, or if a critical error occurs, it returns false.
	*/
	public static function read(string $table, string $section_tipo, int|string $section_id): object|false	{

		$temp_data_uid = self::get_uid($section_tipo); // E.g. 'oh1'
		$data = $_SESSION['dedalo']['section_temp_data'][$temp_data_uid] ?? null;

		// Return the result or false if not found
		return $data ?: false;
	}//end read



	/**
	* UPDATE
	* Safely updates one or more columns in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param string $table
	* 	Table name. E.g. 'matrix'
	* @param string $section_tipo
	* 	Section tipo. E.g. 'oh1'
	* @param int|string $section_id
	* 	Section id. E.g. '1'
	* @param object $values
	* 	Object with {column name : value} structure
	* 	Keys are column names, values are their new values.
	* @return bool
	* 	Returns `true` on success, or `false` on failure.
	*/
	public static function update(string $table, string $section_tipo, int|string $section_id, object $values): bool {

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

		$temp_data_uid = self::get_uid($section_tipo); // E.g. 'oh1'
		if(!isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
			$_SESSION['dedalo']['section_temp_data'][$temp_data_uid] = new stdClass();
		}

		// Add values to session
		foreach ($values as $column => $value) {
			// Validate column name (Security/Guardrail)
			if (!isset(matrix_db_manager::$columns[$column])) {
				debug_log(
					__METHOD__
						. " Ignored invalid column name: $column" . PHP_EOL
						. ' allowed_columns: ' . json_encode(matrix_db_manager::$columns),
					logger::ERROR
				);
				continue;
			}

			// Prepare value: JSON encode if it's a designated JSON column and not null
			$safe_value = ($value !== null && isset(self::$json_columns[$column]))
				? json_handler::encode($value)
				: $value;

			$_SESSION['dedalo']['section_temp_data'][$temp_data_uid]->$column = $safe_value;
		}


		return true;
	}//end update



	/**
	* UPDATE_BY_KEY
	* Saves given value into the specified JSON key, it could be:
	* a component container
	* a section property data as created_date
	* a component counter data
	* Creates the path from the given key as componente_tipo {dd197} or property {created_date}.
	* If the given value is empty, the path will be removed for clean database.
	* @param string $table
	* 	Table name. E.g. 'matrix'
	* @param string $section_tipo
	* 	Section tipo. E.g. 'oh1'
	* @param int|string $section_id
	* 	Section id. E.g. '1'
	* @param array $data_to_save
	* 	Array of objects with the column, key and value to be update
	* 	[{
	* 		"column" 	: "relation",
	* 		"key"		: "oh25",
	* 		"value"		: [{"section_id":3,"section_tipo":"oh1"}]
	* 	}]
	* @return bool
	* 	Returns false if JSON fragment save fails.
	*/
	public static function update_by_key(
		string $table,
		string $section_tipo,
		int|string $section_id,
		array $data_to_save
		): bool {

		// check data_to_save
		if (empty($data_to_save)) {
			debug_log(
				__METHOD__
					. " Wrong data_to_save. Expected non empty array:  " . PHP_EOL
					. ' type: ' . gettype($data_to_save) . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT),
				logger::ERROR
			);
			return false;
		}

		// Group data by column to handle multiple updates to the same column
		$columns_data = [];
		foreach ($data_to_save as $data) {

			// Check valid data
			if (!is_object($data)) {
				// Query failed
				debug_log(
					__METHOD__
						. " Wrong data_to_save => data. Expected object:  " . PHP_EOL
						. ' type: ' . gettype($data) . PHP_EOL
						. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
						. ' data_to_save: ' . json_encode($data_to_save, JSON_PRETTY_PRINT),
					logger::ERROR
				);
				return false;
			}

			$column		= $data->column;
			$key		= $data->key;
			$value		= $data->value;

			// Group by column
			if (!isset($columns_data[$column])) {
				$columns_data[$column] = [];
			}

			$columns_data[$column][] = [
				'key' => $key,
				'value' => $value
			];
		}

		$temp_data_uid = self::get_uid($section_tipo); // E.g. 'oh1'
		if(!isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
			$_SESSION['dedalo']['section_temp_data'][$temp_data_uid] = new stdClass();
		}

		// Update the session data - one per column
		foreach ($columns_data as $column => $updates) {

			// Current column value in session
			$current_column_value = $_SESSION['dedalo']['section_temp_data'][$temp_data_uid]->$column ?? null;

			// Decode if it's a string (simulation of DB row where JSON columns are strings)
			if (is_string($current_column_value)) {
				$column_object = json_decode($current_column_value);
			} else {
				$column_object = $current_column_value ?: new stdClass();
			}

			foreach ($updates as $update) {
				$key = $update['key'];
				$value = $update['value'];

				if ($value === null) {
					if (is_object($column_object)) {
						unset($column_object->$key);
					} else if (is_array($column_object)) {
						unset($column_object[$key]);
					}
				} else {
					if (is_object($column_object)) {
						$column_object->$key = $value;
					} else if (is_array($column_object)) {
						$column_object[$key] = $value;
					}
				}
			}

			// Re-encode and store back
			$_SESSION['dedalo']['section_temp_data'][$temp_data_uid]->$column = json_encode($column_object, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		}

		return true;
	}//end update_by_key



	/**
	* DELETE
	* Safely deletes one record in a "matrix" table row,
	* identified by a composite key of `section_id` and `section_tipo`.
	* @param string $section_tipo
	* A string identifier representing the type of section. Used as part of the WHERE clause in the SQL query.
	* @return bool
	* Returns `true` on success, or `false` if validation fails,
	* query preparation fails, or execution fails.
	*/
	public static function delete(string $table, string $section_tipo, int|string $section_id) : bool {

		$temp_data_uid = self::get_uid($section_tipo); // E.g. 'oh1'
		if(isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])) {
			unset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid]);
		}

		return true;
	}//end delete



	/**
	* GET_UID
	* Returns the unic id of the temp data
	* @return string
	*/
	public static function get_uid(string $section_tipo) : string {
		return $section_tipo;
	}//end get_uid



}//end class matrix_temp_manager
