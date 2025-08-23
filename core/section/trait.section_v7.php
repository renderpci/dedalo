<?php declare(strict_types=1);
/**
* CLASS SECTION
* TRAIT SECTION_V7
*
*/
trait section_v7 {



	// @V7 PROPERTIES FROM THE NEW TABLE COLUMNS

	// // object|null data. Section data value from V7 DB column 'data'
	// // Section specific data like label, diffusion info, etc.
	// protected $data;
	// // object|null relation. Section data value from V7 DB column 'relation'.
	// // Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
	// protected $relation;
	// // object|null string. Section data value from V7 DB column 'string'
	// // Stores string literals values used from component_input_text, component_text_area and others.
	// protected $string;
	// // object|null date. Section data value from V7 DB column 'date'
	// // Stores date values handled by component_date
	// protected $date;
	// // object|null iri. Section data value from V7 DB column 'iri'
	// // Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
	// protected $iri;
	// // object|null geo. Section data value from V7 DB column 'geo'
	// // Stores geo data handled by component_geolocation.
	// protected $geo;
	// // object|null number. Section data value from V7 DB column 'number'
	// // Stores numeric values handled by component_number.
	// protected $number;
	// // object|null media. Section data value from V7 DB column 'media'
	// // Stores media values handled by media components (3d,av,image,pdf,svg)
	// protected $media;
	// // object|null misc. Section data value from V7 DB column 'misc'
	// // Stores other components values like component_security_access, component_json, etc.
	// protected $misc;
	// // object|null relation_search. Section data value from V7 DB column 'relation_search'
	// // Stores relation optional data useful for search across parents like toponymy.
	// protected $relation_search;
	// // object|null counters. Section data value from V7 DB column 'counters'
	// // Stores string components counters used to get unique identifiers for the values as {"id":1,"lang":"lg-nolan","type":"dd750","value":"Hello"}
	// // The format of the counter data is {"dd750":1,"dd201":1,..}
	// protected $counters;

	// @v7 array data_columns. Assoc array with all v7 DB columns
	public $data_columns = [
		// object|null data. Section data value from V7 DB column 'data'
		// Section specific data like label, diffusion info, etc.
		'data' => null,
		// object|null relation. Section data value from V7 DB column 'relation'.
		// Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
		'relation' => null,
		// object|null string. Section data value from V7 DB column 'string'
		// Stores string literals values used from component_input_text, component_text_area and others.
		'string' => null,
		// object|null date. Section data value from V7 DB column 'date'
		// Stores date values handled by component_date
		'date' => null,
		// object|null iri. Section data value from V7 DB column 'iri'
		// Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
		'iri' => null,
		// object|null geo. Section data value from V7 DB column 'geo'
		// Stores geo data handled by component_geolocation.
		'geo' => null,
		// object|null number. Section data value from V7 DB column 'number'
		// Stores numeric values handled by component_number.
		'number' => null,
		// object|null media. Section data value from V7 DB column 'media'
		// Stores media values handled by media components (3d,av,image,pdf,svg)
		'media' => null,
		// object|null misc. Section data value from V7 DB column 'misc'
		// Stores other components values like component_security_access, component_json, etc.
		'misc' => null,
		// object|null relation_search. Section data value from V7 DB column 'relation_search'
		// Stores relation optional data useful for search across parents like toponymy.
		'relation_search' => null,
		// object|null counters. Section data value from V7 DB column 'counters'
		// Stores string components counters used to get unique identifiers for the values as {"id":1,"lang":"lg-nolan","type":"dd750","value":"Hello"}
		// The format of the counter data is {"dd750":1,"dd201":1,..}
		'counters' => null
	];



    /**
	* LOAD_SECTION_DATA @v7
	* Loads the section DB record once.
	* The data fill the '$this->data_columns' values
	* with parsed integer and JSON values.
	* To force to reload the data form DB, set the property
	* 'this->bl_loaded_matrix_data' to false.
	* @return bool
	*/
	private function load_section_data() : bool {

		// Already loaded data case
		if ($this->bl_loaded_matrix_data) {
			return true;
		}

		$table = common::get_matrix_table_from_tipo($this->tipo);

		$all_data = matrix_data::load_matrix_data(
			$table,
			$this->tipo,
			(int)$this->section_id
		);

		// Ensure $all_data is an array
		if (!is_array($all_data)) {
			return false;
		}

		foreach ($this->data_columns as $column => $value) {
			if (isset($all_data[$column])) {
				$this->data_columns[$column] = $all_data[$column];
			}
		}
			dump($this->data_columns, ' this->data_columns ++ '.to_string());

		// v6 compatibility temporal use column 'datos'
		// $this->dato = $all_data['datos'] ?? new stdClass();

		// Set as loaded
		$this->bl_loaded_matrix_data = true;

		return true;
	}//end load_section_data



	/**
	* GET_COMPONENT_FULL_DATA @v7
	* It gets all the data from the component as the database is stored,
	* with all languages, using the proper data column.
	* @param string $tipo
	* 	Component tipo
	* @param string data_column
	* 	DB data_column where to get the data (relation,string...)
	* @return array|null $component_data
	*/
	public function get_component_full_data( string $tipo, string $data_column ) : ?array {

		// Load the DB data once
		$this->load_section_data();

		$component_data = $this->data_columns[$data_column]->{$tipo} ?? null;


		return $component_data;
	}//end get_component_full_data



	/**
	* SAVE_PARTIAL @v7
	* Saves given value into the component container.
	* Creates the path from the component tipo as {dd197}.
	* @param string $column_name
	* 	DB column_name
	* @param string $tipo
	* 	Component tipo
	* @param ?array $value
	* 	Component data value
	* @return bool
	* 	Returns false if JSON fragment save fails.
	*/
	public function save_partial( string $column_name, string $tipo, ?array $value ) : bool {

		// sample SQL
			// UPDATE matrix
			// SET data = jsonb_set(
			//     data,  -- original JSONB
			//     '{numisdataXX}', -- path to the element
			//     '{"key":1,"lang":"lg-spa","type":"dd750","value":"CODE1"}'::jsonb, -- new value (must be valid JSON)
			//     true  -- create if missing (true/false)
			// )
			// WHERE section_tipo = 'numisdata224' AND section_id = 1;

		$table		= common::get_matrix_table_from_tipo($this->tipo);
		$conn		= DBi::_getConnection();
		$path		= '{'.$tipo.'}'; // JSON path
		$json_value	= json_encode($value, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); // JSONB value

		// With prepared statement
		$stmt_name = __METHOD__;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			pg_prepare(
				$conn,
				$stmt_name,
				"
					UPDATE $table
					SET $column_name = jsonb_set(
						$column_name,
						$1::text[],
						$2::jsonb,
						true
					)
					WHERE section_tipo = $3
					  AND section_id = $4
					RETURNING id
				"
			);
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			[
				$path,
				$json_value,
				$this->tipo,
				$this->section_id
			]
		);

		if ($result) {
			$rows_affected = pg_num_rows($result);
			if ($rows_affected > 0) {

				// JSON path was successfully saved
				$saved_id = pg_fetch_result($result, 0, 0);
				debug_log(__METHOD__
					. " Successfully saved JSON path '$path'. Affected record ID: $table $saved_id"
					, logger::WARNING
				);

				return true;

			}else{

				// No rows were updated (JSON path didn't exist or conditions didn't match)
				debug_log(__METHOD__
					. " No JSON data was saved - path '$path' may not exist or conditions didn't match." . PHP_EOL
					. ' path: ' . to_string($path) . PHP_EOL
					. ' section_tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' section_id: ' . to_string($this->section_id)
					, logger::ERROR
				);
			}

		}else{

			// throw new RuntimeException("Database query failed: " . pg_last_error($conn));

			// Query failed
			debug_log(__METHOD__
				. " Delete operation failed:  " . PHP_EOL
				. ' Error: ' . pg_last_error($conn) . PHP_EOL
				. ' path: ' . to_string($path) . PHP_EOL
				. ' section_tipo: ' . to_string($this->tipo) . PHP_EOL
				. ' section_id: ' . to_string($this->section_id)
				, logger::ERROR
			);
		}


		return false;
	}//end save_partial



	/**
	* DELETE_PARTIAL @v7
	* Removes section data partially using the component's column and tipo
	* as keys for path selection, like {dd197}.
	* If the path does not already exist, no error is generated.
	* @param string $column_name
	* 	Component data column_name name. E.g. 'date'
	* @param string $tipo
	* 	Component tipo
	* @return bool
	* 	Returns false if JSON fragment delete fails.
	*/
	public function delete_partial( string $column_name, string $tipo ) : bool {

		// sample SQL
			// -- Removing
			// UPDATE matrix
			// SET data = data #- '{literals,numisdataXX}'
			// WHERE section_tipo = 'numisdata224' AND section_id = 1;

		$table	= common::get_matrix_table_from_tipo($this->tipo);
		$conn	= DBi::_getConnection();
		$path	= '{'.$tipo.'}'; // JSON path

		// With prepared statement
		$stmt_name = __METHOD__;
		if (!isset(DBi::$prepared_statements[$stmt_name])) {
			pg_prepare(
				$conn,
				$stmt_name,
				"
					UPDATE $table
					SET $column_name = $column_name #- $1::text[]
					WHERE section_tipo = $2
					  AND section_id = $3
					RETURNING id
				"
			);
			// Set the statement as existing.
			DBi::$prepared_statements[$stmt_name] = true;
		}
		$result = pg_execute(
			$conn,
			$stmt_name,
			[
				$path,
				$this->tipo,
				$this->section_id
			]
		);

		if ($result) {
			$rows_affected = pg_num_rows($result);
			if ($rows_affected > 0) {

				// JSON path was successfully deleted
				$deleted_id = pg_fetch_result($result, 0, 0);
				debug_log(__METHOD__
					. " Successfully deleted JSON path '$path'. Affected record ID: $table $deleted_id"
					, logger::WARNING
				);

				return true;

			}else{

				// No rows were updated (JSON path didn't exist or conditions didn't match)
				debug_log(__METHOD__
					. " No JSON data was deleted - path '$path' may not exist or conditions didn't match." . PHP_EOL
					. ' path: ' . to_string($path) . PHP_EOL
					. ' section_tipo: ' . to_string($this->tipo) . PHP_EOL
					. ' section_id: ' . to_string($this->section_id)
					, logger::ERROR
				);
			}

		}else{

			// throw new RuntimeException("Database query failed: " . pg_last_error($conn));

			// Query failed
			debug_log(__METHOD__
				. " Delete operation failed: " . PHP_EOL
				. ' Error: ' . pg_last_error($conn) . PHP_EOL
				. ' path: ' . to_string($path) . PHP_EOL
				. ' section_tipo: ' . to_string($this->tipo) . PHP_EOL
				. ' section_id: ' . to_string($this->section_id)
				, logger::ERROR
			);
		}


		return false;
	}//end delete_partial



}//end section_v7