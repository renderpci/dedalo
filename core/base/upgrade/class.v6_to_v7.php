<?php declare(strict_types=1);
/**
* CLASS v6_to_v7
*
*
*/
class v6_to_v7 {

	public static string $table_jer_dd = 'jer_dd';
	public static string $table_dd_ontology = 'dd_ontology';
	public static string $table_matrix_time_machine = 'matrix_time_machine';



	/**
	 * PRE_UPDATE
	 *
	 * Executes the pre-update process, which runs after installing new code but BEFORE Dédalo logs out
	 * of the session to proceed with data, ontology, and tools updates.
	 *
	 * Update process flow:
	 * 1. Update code
	 * 2. Run pre_update (this method)
	 * 3. Log out
	 * 4. Log in
	 * 5. Update ontology
	 * 6. Update data
	 * 7. Update tools
	 * 8. Log out
	 *
	 * This process moves data from the legacy `jer_dd` table to the new `dd_ontology` table.
	 * It must run before log-out because the new code depends on the `dd_ontology` table,
	 * and the login process requires valid ontology nodes (at least the `dd` TLD).
	 *
	 * CRITICAL: If this process fails, Dédalo will stop working!
	 *
	 * @return object Standard response object with 'result' (bool), 'msg' (string), and 'errors' (array).
	 */
	public static function pre_update() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Pre update has failed';
			$response->errors	= [];

		// 0. Change notifications table column name (datos -> data).
		// This must be done before because the update process uses the notifications table
		// to store the PID of the process updated data.
		$result = v6_to_v7::change_notifications_table_column_name();

		if($result === false){
			$response->errors[] = 'Failed to change notifications table column name';
			return $response;
		}

		// 1. Add new columns to 'jer_dd'
		$result = v6_to_v7::expand_jer_dd_with_new_schema();

		if($result === false){
			$response->errors[] = 'Failed to expand jer_dd with new schema';
			return $response;
		}

		// 2. Fill the 'jer_dd' new columns with the compatible data
		$result = v6_to_v7::fill_new_columns_in_jer_dd();

		if($result === false){
			$response->errors[] = 'Failed to fill new columns in jer_dd';
			return $response;
		}

		// 3. Change the 'jer_dd' relations data to be coherent
		$result = v6_to_v7::refactor_jer_dd_relations();

		if($result === false){
			$response->errors[] = 'Failed to refactor jer_dd relations';
			return $response;
		}

		// 4. Create the new 'dd_ontology' table and set the columns with correct data
		$result = v6_to_v7::create_dd_ontology_table();

		if($result === false){
			$response->errors[] = 'Failed to create dd_ontology table';
			return $response;
		}

		$response->result = true;
		$response->msg = 'Pre update was done';


		return $response;
	}//end pre_update



	/**
	 * EXPAND_JER_DD_WITH_NEW_SCHEMA
	 *
	 * Modifies the `jer_dd` table structure by adding new columns aligned with the v7 schema.
	 *
	 * Mapping summary:
	 * - 'terminoID'    => 'tipo'
	 * - 'modelo'       => 'model_tipo'
	 * - 'esmodelo'     => 'is_model'
	 * - 'traducible'   => 'is_translatable'
	 * - 'norden'       => 'order_number'
	 * - 'relaciones'   => 'relations'
	 *
	 * @return bool True if the schema was successfully expanded, false otherwise.
	 */
	public static function expand_jer_dd_with_new_schema() : bool {

		$sql_query = sanitize_query ('
			ALTER TABLE "' . static::$table_jer_dd . '"
				ADD COLUMN IF NOT EXISTS "tipo" character varying(32) NULL,
				ADD COLUMN IF NOT EXISTS "model_tipo" character varying(8) NULL,
				ADD COLUMN IF NOT EXISTS "is_model" boolean NULL,
				ADD COLUMN IF NOT EXISTS "is_translatable" boolean NULL,
				ADD COLUMN IF NOT EXISTS "order_number" numeric(4,0) NULL,
				ADD COLUMN IF NOT EXISTS "relations" jsonb NULL;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to expand jer_dd with a new schema";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end expand_jer_dd_with_new_schema



	/**
	 * FILL_NEW_COLUMNS_IN_JER_DD
	 *
	 * Populates the newly created columns in `jer_dd` with transformed data from existing v6 columns.
	 * Converts legacy 'si'/'no' strings to boolean values.
	 *
	 * @return bool True if data was successfully filled, false otherwise.
	 */
	public static function fill_new_columns_in_jer_dd() : bool {

		// Check if source column exists (terminoID is representative of all old columns)
		$terminoID_exists = DBi::check_column_exists(static::$table_jer_dd, 'terminoID');
		if(!$terminoID_exists) {
			debug_log(__METHOD__
				." WARNING: Ignore fill_new_columns_in_jer_dd because terminoID column does not exist"
				, logger::WARNING
			);
			return true;
		}

		$sql_query = sanitize_query ('
			UPDATE "' . static::$table_jer_dd . '"
				SET tipo 			= "terminoID",
					model_tipo 		= modelo,
					order_number	= norden,
					is_model 		= CASE WHEN esmodelo = \'si\' THEN true ELSE false END,
					is_translatable	= CASE WHEN traducible = \'si\' THEN true ELSE false END;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to fill new columns in jer_dd";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end fill_new_columns_in_jer_dd



	/**
	 * REFACTOR_JER_DD_RELATIONS
	 *
	 * Standardizes the relationship data in `jer_dd`. Legacy relations could be stored as objects
	 * keyed by model. This refactors them into a consistent array of objects with a 'tipo' key.
	 *
	 * Example transformation:
	 * From: [{"model_x": "dd64"}]
	 * To:   [{"tipo": "dd64"}]
	 *
	 * @return bool True if relations were successfully refactorized, false otherwise.
	 */
	public static function refactor_jer_dd_relations() : bool {

		// jer_dd. delete terms (jer_dd)
			$sql_query = "
				SELECT id, relaciones FROM \"" . static::$table_jer_dd . "\";
			";
			$jer_dd_result = matrix_db_manager::exec_search($sql_query, [], false);

		if (!$jer_dd_result) {
			return false;
		}

		// iterate jer_dd_result row
		while($row = pg_fetch_assoc($jer_dd_result)) {

			$relaciones	= $row['relaciones'];
			$id			= $row['id'];

			if (empty($relaciones)) {
				continue;
			}

			$relations = json_handler::decode($relaciones) ?? [];

			$ar_relations = [];
			foreach ($relations as $item) {
				if (is_array($item) || $item instanceof stdClass) {
					foreach ($item as $value) {
						$relation = new stdClass();
							$relation->tipo = $value;
						$ar_relations[] = $relation;
					}
				}
			};

			$new_relation = ( empty($ar_relations) ) ? null : $ar_relations;

			$string_relation_object = json_handler::encode($new_relation);

			$strQuery = "UPDATE \"" . static::$table_jer_dd . "\" SET relations = $1 WHERE id = $2 ";
			$result   = matrix_db_manager::exec_search($strQuery, [$string_relation_object, $id], false);
			if($result===false) {
				$msg = "Failed to update relations in section_data (jer_dd) for ID $id";
				debug_log(__METHOD__
					." ERROR: $msg "
					, logger::ERROR
				);
				return false;
			}
		}
		return true;
	}//end refactor_jer_dd_relations



	/**
	 * CREATE_DD_ONTOLOGY_TABLE
	 *
	 * Creates the `dd_ontology` table by selecting data from the upgraded `jer_dd` table.
	 * Configures the sequence, primary key, and adds comments to the new schema.
	 *
	 * @return bool True if the table was successfully created and configured, false otherwise.
	 */
	public static function create_dd_ontology_table() : bool {

		$sql_query = sanitize_query ('
			CREATE TABLE IF NOT EXISTS "' . static::$table_dd_ontology . '" AS
				SELECT id, tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, propiedades
			FROM "' . static::$table_jer_dd . '";

			COMMENT ON TABLE "' . static::$table_dd_ontology . '" IS  \'Active ontology\';

			CREATE SEQUENCE IF NOT EXISTS "' . static::$table_dd_ontology . '_id_seq" OWNED BY "' . static::$table_dd_ontology . '"."id";

			ALTER TABLE "' . static::$table_dd_ontology . '"
			ALTER "id" TYPE integer,
			ALTER "id" SET DEFAULT nextval(\'' . static::$table_dd_ontology . '_id_seq\'),
			ALTER "id" SET NOT NULL;

			ALTER TABLE "' . static::$table_dd_ontology . '"
			DROP CONSTRAINT IF EXISTS ' . static::$table_dd_ontology . '_id_pkey;

			ALTER TABLE "' . static::$table_dd_ontology . '"
			ADD CONSTRAINT ' . static::$table_dd_ontology . '_id_pkey
			PRIMARY KEY ( id );

			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.id IS \'Unique table identifier\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.tipo IS \'Ontology identifier (ontology TLD | ontology instance ID, e.g., oh1 = Oral History)\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.parent IS \'Ontology identifier parent (ontology TLD | ontology instance ID, e.g., tch1 = Tangible Cultural Heritage -> Objects)\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.term IS \'Ontology node names in multiple languages\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.model IS \'Ontology model name as section, component_portal, etc.\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.order_number IS \'Ontology node position order\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.relations IS \'Direct connections between nodes, unidirectional\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.tld IS \'Ontology name space\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.properties IS \'Ontology node definition\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.model_tipo IS \'Ontology identifier for the node type,  e.g., dd6 = section\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.is_model IS \'Boolean to identify if the node is a type of nodes\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.is_translatable IS \'Boolean to identify if the node is a multilingual node\';
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.propiedades IS \'V5 properties, DEPRECATED\';

			-- Optionally drop the old one and rename
			-- DROP TABLE IF EXISTS "' . static::$table_jer_dd . '" CASCADE;
			-- DROP SEQUENCE IF EXISTS ' . static::$table_jer_dd . '_id_seq;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to create dd_ontology table from jer_dd";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end create_dd_ontology_table



	/**
	* GET_VALUE_TYPE_MAP
	* @return object
	*/
	public static function get_value_type_map() : object {

		return (object)[
			'component_input_text'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_text_area'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_email'			=>	DEDALO_VALUE_TYPE_STRING,
			'component_password'		=>	DEDALO_VALUE_TYPE_STRING,
			'component_number'			=>	DEDALO_VALUE_TYPE_NUMBER,
			'component_date'			=>	DEDALO_VALUE_TYPE_DATE,
			'component_3d'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_av'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_image'			=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_pdf'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_svg'				=>	DEDALO_VALUE_TYPE_MEDIA,
			'component_iri'				=>	DEDALO_VALUE_TYPE_IRI,
			'component_geolocation'		=>	DEDALO_VALUE_TYPE_GEO,
			'component_json'			=>	DEDALO_VALUE_TYPE_MISC,
			'component_filter_records'	=>	DEDALO_VALUE_TYPE_MISC,
			'component_security_access'	=>	DEDALO_VALUE_TYPE_MISC
		];
	}//end get_value_type_map



	/**
	* CONVERT_TABLE_DATA
	* Alias of update::convert_table_data
	* @param array $ar_tables
	* @param string $action
	* @return bool
	* 	true
	*/
	public static function convert_table_data(array $ar_tables, string $action) : bool {

		return update::convert_table_data($ar_tables, $action);
	}//end convert_table_data



	/**
	 * REFORMAT_MATRIX_DATA
	 *
	 * Converts legacy v6 data format (single 'datos' JSON blob) to the new v7 columnar data format.
	 * Distributes data from the v6 'datos' field into specialized columns like 'data', 'relation',
	 * 'string', 'date', etc., based on component typology.
	 *
	 * Example usage:
	 * ```php
	 * $ar_tables = ['matrix', 'matrix_activities'];
	 * $save = true; // Set to false for a dry-run check
	 * $response = v6_to_v7::reformat_matrix_data($ar_tables, $save);
	 * ```
	 *
	 * @param array $ar_tables List of database tables to process.
	 * @param bool $save If true, saves changes to DB. If false, only performs a data review.
	 * @return object Standard response object.
	 */
	public static function reformat_matrix_data( array $ar_tables, bool $save ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		debug_log(__METHOD__ . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			. ' CONVERTING ... ' . PHP_EOL
			. ' reformat_matrix_data - tables: ' . json_handler::encode($ar_tables) . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			, logger::WARNING
		);

		// Pre-fetch value type map once
		$value_type_map = v6_to_v7::get_value_type_map();

		// CLI process data initialization
		if ( running_in_cli()===true ) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->table = '';
			common::$pdata->memory = '';
			common::$pdata->counter = 0;
		}

		$conn = DBi::_getConnection();
		$ar_escaped_tables = [];

		// iterate tables
		update::tables_rows_iterator(
			$ar_tables,
			function($row, $table, $max) use ($response, $save, $conn, $value_type_map, &$ar_escaped_tables) {

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$section_id		= $row['section_id'] ?? '';

				// CLI process data status
				if ( running_in_cli()===true ) {
					common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': ' . __METHOD__
						. ' | table: '			. $table
						. ' | id: '				. $id .' - ' . $max
						. ' | section_tipo: '	. $section_tipo
						. ' | section_id: '		. ($row['section_id'] ?? '');
					common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
						? dd_memory_usage()
						: common::$pdata->memory;
					common::$pdata->table = $table;
					common::$pdata->section_tipo = $section_tipo;
					common::$pdata->counter++;
					print_cli(common::$pdata);
				}

				// datos properties
				if( isset($datos) ){

					$processed_data = self::process_matrix_row_data(
						$datos,
						$table,
						$section_tipo,
						$section_id,
						$value_type_map,
						$response
					);

					$data_cols = [
						'data'            => $processed_data->data,
						'relation'        => $processed_data->relation,
						'string'          => $processed_data->string,
						'date'            => $processed_data->date,
						'iri'             => $processed_data->iri,
						'geo'             => $processed_data->geo,
						'number'          => $processed_data->number,
						'media'           => $processed_data->media,
						'misc'            => $processed_data->misc,
						'relation_search' => $processed_data->relation_search,
						'meta'            => $processed_data->meta,
					];

					$params = [];
					foreach ($data_cols as $col_name => $col_obj) {
						$params[] = ( empty(get_object_vars($col_obj)) ) ? null : json_handler::encode($col_obj);
					}
					$params[] = $id;

					if (!isset($ar_escaped_tables[$table])) {
						$ar_escaped_tables[$table] = pg_escape_identifier($conn, $table);
					}
					$escaped_table = $ar_escaped_tables[$table];

					$strQuery = '
						UPDATE ' . $escaped_table . '
						SET data = $1,
							relation = $2,
							string = $3,
							date = $4,
							iri = $5,
							geo = $6,
							number = $7,
							media = $8,
							misc = $9,
							relation_search = $10,
							meta = $11
						WHERE id = $12
					';

					if ($save) {
						$result = matrix_db_manager::exec_search($strQuery, $params, false);
					} else {
						$result = true;
					}

					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						$response->errors[] = "Error on SQL execution for ID $id. Table: $table";
						return; // Return from closure
					}
				}
			}//end callback function
		);

		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? 'Request done successfully'
			: 'Request done with errors (' . count($response->errors) . ')';

		return $response;
	}//end reformat_matrix_data



	/**
	 * PROCESS_MATRIX_ROW_DATA
	 *
	 * Processes a single legacy v6 row (datos JSON blob) and distributes its content into
	 * specialized v7 column objects based on component typology.
	 *
	 * @param array|object $datos Legacy data blob from v6.
	 * @param string $table Target table name.
	 * @param string $section_tipo Section typology.
	 * @param mixed $section_id Section record ID.
	 * @param object $value_type_map Map of model names to DEDALO_VALUE_TYPE constants.
	 * @param object $response (by reference) Standard response object for error tracking.
	 * @return object Object containing individual column datasets.
	 */
	public static function process_matrix_row_data($datos, string $table, string $section_tipo, $section_id, object $value_type_map, &$response) : object {

		$results = (object)[
			'data'            => new stdClass(),
			'relation_search' => new stdClass(),
			'relation'        => new stdClass(),
			'string'          => new stdClass(),
			'date'            => new stdClass(),
			'number'          => new stdClass(),
			'geo'             => new stdClass(),
			'media'           => new stdClass(),
			'iri'             => new stdClass(),
			'misc'            => new stdClass(),
			'meta'            => new stdClass()
		];

		// Map of typology to target column property
		$column_map = [
			DEDALO_VALUE_TYPE_STRING => 'string',
			DEDALO_VALUE_TYPE_NUMBER => 'number',
			DEDALO_VALUE_TYPE_DATE   => 'date',
			DEDALO_VALUE_TYPE_MEDIA  => 'media',
			DEDALO_VALUE_TYPE_IRI    => 'iri',
			DEDALO_VALUE_TYPE_GEO    => 'geo',
			DEDALO_VALUE_TYPE_MISC   => 'misc'
		];

		foreach ($datos as $datos_key => $datos_value) {
			if (empty($datos_value)) continue;

			switch ($datos_key) {
				case 'relations_search':
				case 'relations':
					$target_key = ($datos_key === 'relations_search') ? 'relation_search' : 'relation';
					foreach ($datos_value as $locator) {
						if (!isset($locator->from_component_tipo)) {
							$locator_string = json_handler::encode($locator);
							debug_log(__METHOD__ . " ERROR: locator without from_component_tipo in $table/$section_id. locator: $locator_string", logger::ERROR);
							$response->errors[] = "Bad component data (locator without from_component_tipo property). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id'";
							continue;
						}

						// Skip deprecated activity project link
						if ($locator->from_component_tipo === 'dd550') continue;

						$comp_tipo = $locator->from_component_tipo;
						if (!isset($results->{$target_key}->{$comp_tipo})) {
							$results->{$target_key}->{$comp_tipo} = [];
						}
						$results->{$target_key}->{$comp_tipo}[] = $locator;
					}

					// Update IDs and meta counts for relations
					if ($datos_key === 'relations') {
						foreach ($results->relation as $comp_tipo => $rel_data) {
							foreach ($rel_data as $i => $locator) {
								$locator->id = $i + 1;
								$results->meta->{$comp_tipo} = [(object)['count' => $i + 1]];
							}
						}
					}
					break;

				case 'components':
					foreach ($datos_value as $literal_tipo => $literal_value) {

						// Get model
						$model = ontology_node::get_model_by_tipo($literal_tipo);

						// Skip v5 legacy components columns
						if (in_array($model, ['component_filter', 'component_section_id'])) continue;

						// Get target column based on typology
						$typology   = $value_type_map->{$model} ?? DEDALO_VALUE_TYPE_MISC;
						$target_col = $column_map[$typology] ?? 'misc';

						if (!isset($literal_value->dato)) {
							debug_log(__METHOD__ . " ERROR: Literal without v6 'dato' property ($literal_tipo) in $table/$section_id", logger::ERROR);
							$response->errors[] = "Bad component data (literal without v6 'dato' property). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' component_tipo: '$literal_tipo'";
							continue;
						}

						$value_key = 0;
						foreach ($literal_value->dato as $lang => $ar_value) {

							// Skip empty values
							if (empty($ar_value) && $ar_value !== '0') continue;

							// Migrate data (Add 'id' property to each value, normalize data as array, set 'lang' property if missing)
							$migrate_component_data_response = self::migrate_component_data(
								$literal_tipo,
								$ar_value,
								$lang,
								$section_tipo,
								$section_id,
								$value_key
							);

							if ($migrate_component_data_response->result === false) {
								// If the data isn't useful for saving (legacy garbage), no errors are added to the response. This is not an error, it's just a skip.
								if(!empty($migrate_component_data_response->errors)){
									$response->errors[] = "Error on SQL execution for ID $section_id. Table: $table : "
										. implode("\n", $migrate_component_data_response->errors);
								}
								continue;
							}

							// If the data is empty, skip it
							if(empty($migrate_component_data_response->result)) continue;

							// Set component data
							if (!isset($results->{$target_col}->{$literal_tipo})) {
								$results->{$target_col}->{$literal_tipo} = [];
							}
							$results->{$target_col}->{$literal_tipo} = array_merge(
								$results->{$target_col}->{$literal_tipo},
								$migrate_component_data_response->result
							);
						}//end foreach ($literal_value->dato as $lang => $ar_value)

						// Set component counter
						// get the last id iterating all items of all langs
						// Note that all langs share id across all items, like:
						// [{
						// 	id: 1,
						// 	lang: 'lg-spa'
						// },
						// {
						// 	id: 1,
						// 	lang: 'lg-eng'
						// }]
						if(isset($results->{$target_col}->{$literal_tipo})) {
							$last_id = 0;
							foreach ($results->{$target_col}->{$literal_tipo} as $value) {
								if (isset($value->id) && is_numeric($value->id) && (int)$value->id > $last_id) {
									$last_id = (int)$value->id;
								}
							}
							if($last_id > 0) {
								$results->meta->{$literal_tipo} = [(object)['count' => $last_id]];
							}
						}

						/* OLD WAY - Changed by new migrate_component_data function unified for time machine

						foreach ($literal_value->dato as $lang => $ar_value) {
							if (empty($ar_value) && $ar_value !== '0') continue;

							// Normalize non-array values (TinyMCE, etc.)
							if (!is_array($ar_value)) {
								if (($literal_tipo === 'hierarchy42' && $lang === 'lg-nolan') ||
									($ar_value === '<br data-mce-bogus="1">') ||
									($literal_tipo === 'dd23')) continue;

								$ar_value = [$ar_value];
							}

							$value_key = 0;
							foreach (array_values($ar_value) as $value) {
								if (!isset($value) || (empty($value) && $value !== '0')) continue;
								if (json_handler::encode($value) === '{"files_info":[]}') continue;

								// Skip old v5 media records pointing to self
								if (is_object($value) && isset($value->component_tipo) && $value->component_tipo === $literal_tipo &&
									isset($value->section_tipo) && $value->section_tipo === $section_tipo && $value->section_id == $section_id) continue;

								$value_key++;
								$results->meta->{$literal_tipo} = [(object)['count' => $value_key]];

								$typology = $value_type_map->{$model} ?? DEDALO_VALUE_TYPE_MISC;
								$target_col = $column_map[$typology] ?? 'misc';

								// Prepare object to store
								if ($typology === DEDALO_VALUE_TYPE_MISC &&
									in_array($model, ['component_security_access', 'component_info', 'component_filter_records']) &&
									is_object($value)) {
									$final_obj = $value;
									$final_obj->id = $value_key;
								} else {
									$final_obj = (object)[
										'id'    => $value_key,
										'value' => $value
									];
								}

								// Special handling for language-aware strings
								if ($typology === DEDALO_VALUE_TYPE_STRING) {
									$final_obj->lang = $lang;
								}

								// Check format for complex types (Date, Media, Geo, IRI)
								if (in_array($typology, [DEDALO_VALUE_TYPE_DATE, DEDALO_VALUE_TYPE_MEDIA, DEDALO_VALUE_TYPE_GEO, DEDALO_VALUE_TYPE_IRI])) {
									if (!is_object($value)) {
										$val_str = json_handler::encode($value);
										debug_log(__METHOD__ . " ERROR: component value ($literal_tipo) out of format in $table/$section_id: $val_str", logger::ERROR);
										$response->errors[] = "Bad component data (invalid format for $typology). table: '$table' tipo: '$literal_tipo'";
										continue 2;
									}
									// Update existing object properties
									$final_obj = $value;
									if (empty($final_obj->id) || $typology !== DEDALO_VALUE_TYPE_IRI) {
										$final_obj->id = $value_key;
									}
									if ($typology === DEDALO_VALUE_TYPE_IRI) {
										$final_obj->lang = $lang;
									}
								}

								if (!isset($results->{$target_col}->{$literal_tipo})) {
									$results->{$target_col}->{$literal_tipo} = [];
								}
								$results->{$target_col}->{$literal_tipo}[] = $final_obj;
							}
						}
						*/
					}
					break;

				case 'section_real_tipo':
					break; // Extinct property

				case 'created_by_userID':
					$results->data->created_by_user_id = $datos_value;
					break;

				default:
					// update other properties like section_tipo, created_date, etc.
					$results->data->{$datos_key} = $datos_value;
					break;
			}
		}

		return $results;
	}//end process_matrix_row_data



	/**
	 * REFORMAT_MATRIX_TIME_MACHINE_DATA
	 *
	 * Converts legacy v6 data format (single 'datos' JSON blob) to the new v7 columnar data format.
	 *
	 * Example usage:
	 * ```php
	 * $ar_tables = ['matrix_time_machine'];
	 * $save = true; // Set to false for a dry-run check
	 * $response = v6_to_v7::reformat_matrix_time_machine_data($ar_tables, $save);
	 * ```
	 *
	 * @param array $ar_tables List of database tables to process.
	 * @param bool $save If true, saves changes to DB. If false, only performs a data review.
	 * @return object Standard response object.
	 */
	public static function reformat_matrix_time_machine_data( array $ar_tables, bool $save ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		debug_log(__METHOD__ . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			. ' CONVERTING ... ' . PHP_EOL
			. ' reformat_matrix_time_machine_data - tables: ' . json_handler::encode($ar_tables) . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			, logger::WARNING
		);

		// $_ENV['DEDALO_UPDATING'] avoid verbose logs during update
		$_ENV['DEDALO_UPDATING'] = true;

		// Pre-fetch value type map once
		$value_type_map = v6_to_v7::get_value_type_map();

		// CLI process data initialization
		if ( running_in_cli()===true ) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->table = '';
			common::$pdata->memory = '';
			common::$pdata->counter = 0;
		}

		$conn = DBi::_getConnection();

		// iterate tables
		update::tables_rows_iterator(
			$ar_tables,
			function($row, $table, $max) use ($response, $save, $conn, $value_type_map) {

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$data			= (isset($row['data'])) ? json_handler::decode($row['data']) : null;
				$section_id		= $row['section_id'] ?? '';
				$tipo			= $row['tipo'] ?? null;
				$lang			= $row['lang'] ?? null;

				// garbage old data
				if( empty($tipo) || $tipo === 'termino' ) {
					// Delete it because it is old data garbage
					$deleted = tm_db_manager::delete( (int)$id );
					debug_log(__METHOD__ . " Ignored old data garbage for matrix_time_machine ID $id. Deleted: " . json_handler::encode($deleted), logger::DEBUG);
					return;
				}

				if( empty($lang) ) {
					$response->errors[] = "Ignored empty column lang for matrix_time_machine ID $id";
					return;
				}

				// CLI process data status
				if ( running_in_cli()===true ) {
					common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': ' . __METHOD__
						. ' | table: '			. $table
						. ' | id: '				. $id .' - ' . $max
						. ' | section_tipo: '	. $section_tipo
						. ' | section_id: '		. ($row['section_id'] ?? '');
					common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
						? dd_memory_usage()
						: common::$pdata->memory;
					common::$pdata->table = $table;
					common::$pdata->section_tipo = $section_tipo;
					common::$pdata->counter++;
					print_cli(common::$pdata);
				}

				if(empty($data)) {
					return;
				}

				// safe tipo
				$safe_tipo = safe_tipo($tipo);
				if( empty($safe_tipo) ) {
					$response->errors[] = "Ignored empty safe_tipo for matrix_time_machine ID $id. Tipo: $tipo";
					return;
				}

				// data migrate to v7
				$migrated_data_response = v6_to_v7::migrate_component_data($safe_tipo, $data, $lang, $section_tipo, $section_id);
				if( $migrated_data_response->result === false ) {
					if(!empty($migrated_data_response->errors)) {
						$response->errors[] = "matrix_time_machine ID $id";
						$response->errors = array_merge($response->errors, $migrated_data_response->errors);
					}
					return;
				}

				// Check if any transformation actually happened
				// Use JSON comparison to avoid PHP type conversion errors (e.g., comparing object with scalar)
				if(json_handler::encode($migrated_data_response->result) === json_handler::encode($data)) {
					return;
				}

				$data_json = (empty($migrated_data_response->result))
					? null
					: json_handler::encode($migrated_data_response->result, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);

				$params = [
					$data_json,
					$id
				];

				$escaped_table = pg_escape_identifier($conn, $table);

				$strQuery = 'UPDATE ' . $escaped_table . ' SET data = $1 WHERE id = $2';

				if ($save) {
					$result = matrix_db_manager::exec_search($strQuery, $params, false);
				} else {
					// Debug
					debug_log(__METHOD__
						. ' Time machine re format data: ID ' . $id . PHP_EOL
						. ' data: ' . json_encode($data, JSON_PRETTY_PRINT) . PHP_EOL
						. ' final_data: ' . json_encode($migrated_data_response->result, JSON_PRETTY_PRINT)
					    , logger::DEBUG
					);

					$result = true;
				}

				if($result===false) {
					$msg = "Failed Update section_data ($table) $id";
					debug_log(__METHOD__
						." ERROR: $msg "
						, logger::ERROR
					);
					$response->errors[] = "Error on SQL execution for ID $id. Table: $table";
					return; // Return from closure
				}

			}//end function
		);

		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? 'Request done successfully'
			: 'Request done with errors (' . count($response->errors) . ')';

		return $response;
	}//end reformat_matrix_time_machine_data



	/**
	 * MIGRATE_COMPONENT_DATA
	 *
	 * Migrates component data from v6 format to v7 format.
	 * Handles normalization of non-array values, typology mapping, language-aware strings,
	 * and specialized formatting for complex types (Date, Media, Geo, IRI).
	 *
	 * (!) It is used ONLY in TIME MACHINE transformations (matrix_time_machine table) to avoid change
	 * the actual process_matrix_row_data method.
	 *
	 * @param string $tipo The component type (e.g., 'dd12').
	 * @param mixed $raw_value The raw data to migrate. Can be a single value or an array of values.
	 * @param string $lang The language code (e.g., 'lg-eng').
	 * @param string|null $section_tipo The section type (e.g., 'oh1').
	 * @param mixed $section_id The section id (e.g., 123).
	 * @param int $value_key The key of the value to migrate. Defaults to 0.
	 * @return stdClass Response object with 'errors' (array) and 'result' (array|false).
	 *                  'result' contains the migrated data array or false if no changes were needed.
	 */
	public static function migrate_component_data(
		string $tipo,
		mixed $raw_value, // each lang value
		string $lang,
		?string $section_tipo = null,
		mixed $section_id = null,
		int $value_key = 0
	) : stdClass {

		$response = new stdClass();
		$response->errors = [];

		// safe tipo. Check if the tipo is valid
		$safe_tipo = safe_tipo($tipo);
		if( empty($safe_tipo) ) {
			$response->errors[] = "Ignored empty safe_tipo. Tipo: $tipo";
			$response->result = false;
			return $response;
		}

		$model = ontology_node::get_model_by_tipo($tipo);
		if( empty($model) ) {
			$response->errors[] = "Ignored empty model. Tipo: $tipo";
			$response->result = false;
			return $response;
		}

		// relations. Do not touch them
		$components_with_relations = component_relation_common::get_components_with_relations();
		if(in_array($model, $components_with_relations)) {
			$response->result = false;
			return $response;
		}

		// Normalize non-array values (TinyMCE, etc.)
		if (!is_array($raw_value)) {
			// To delete values
			if (($tipo === 'hierarchy42' && $lang === 'lg-nolan') || // component_text_area Space frame
				($raw_value === '<br data-mce-bogus="1">') ||
				($tipo === 'dd23')) { // component_layout Layout (Layout templates)
				// Blank value, forces to ignore the value
				$ar_value = [];
			}else{
				$ar_value = [$raw_value];
			}
		}else{
			$ar_value = $raw_value;
		}

		// typology
		$value_type_map = v6_to_v7::get_value_type_map();
		$typology = $value_type_map->{$model} ?? DEDALO_VALUE_TYPE_MISC;

		$final_data = [];
		foreach (array_values((array)$ar_value) as $value) {

			// Skip entries with no value
			if (!isset($value) || (empty($value) && $value !== '0')) continue;

			// Skip media components with empty files_info
			if (json_handler::encode($value) === '{"files_info":[]}') continue;

			// Skip old v5 media records pointing to self
			if (is_object($value) && isset($value->component_tipo) && $value->component_tipo === $tipo &&
				isset($value->section_tipo) && $value->section_tipo === $section_tipo &&
				isset($value->section_id) && $value->section_id == $section_id) {
				continue;
			}

			$value_key++;

			// Prepare object to store
			if(!is_object($value)) {

				// Check format for complex types (Date, Media, Geo, IRI)
				// This data has a bad format, inform to the user and do not save it
				if (in_array($typology, [DEDALO_VALUE_TYPE_DATE, DEDALO_VALUE_TYPE_MEDIA, DEDALO_VALUE_TYPE_GEO])) {

					$val_str = json_handler::encode($value);
					debug_log(__METHOD__ . " ERROR: component value ($tipo) out of format: $val_str (section_tipo: '$section_tipo' - section_id: '$section_id')", logger::ERROR);
					$response->errors[] = "Bad component data [1] (invalid format. typology: $typology - model: $model). tipo: '$tipo' - section_tipo: '$section_tipo' - section_id: '$section_id'";
					$response->result = false;
					return $response;
				}

				// Create a normalized object with id and value
				if ($typology === DEDALO_VALUE_TYPE_IRI) {

					// IRI case : use 'iri' instead of 'value' as property name

					$parts = explode('http', (string)$value, 2);
					$last_part = end($parts);

					$final_obj = (object)[
						'iri' => 'http' . ($last_part ?? '')
					];

					// Add label when $parts > 1
					if(count($parts) > 1 && !empty($parts[0])) {
						$final_obj->title = $parts[0];
					}

				}else{

					// Assume the value is a v6 data like string or array. Move to v7 object with 'value' property
					if(in_array($model, component_common::$components_using_value_property)) {

						$final_obj = (object)[
							'value' => $value
						];

					}else{

						$val_str = json_handler::encode($value);
						debug_log(__METHOD__ . " ERROR: component value ($tipo) out of format: $val_str (section_tipo: '$section_tipo' - section_id: '$section_id')", logger::ERROR);
						$response->errors[] = "Bad component data [2]. Expected object. (invalid format. typology: $typology - model: $model). tipo: '$tipo' - section_tipo: '$section_tipo' - section_id: '$section_id'";
						$response->result = false;
						return $response;
					}
				}
			} else {
				// Handle as object
				// This components add a new 'value' property if it is not already present.
				if(in_array($model, component_common::$components_using_value_property) && !isset($value->value)) {

					if(in_array($model, ['component_filter_records','component_info','component_security_access'])) {
						// Only set the missing property as null
						$value->value = null;
						$final_obj = $value;
					}else{
						// Wrap the value in a new object
						$final_obj = (object)[
							'value' => $value
						];
					}
				}else{
					// Other components, such as component_date, component_geolocation, component_av, etc. are already objects. However, they do not use the 'value' property.
					$final_obj = $value;
				}
			}

			// Add property 'id' to the object. ALL components except relations have an 'id' property.
			if(!isset($final_obj->id)) {
				$final_obj->id = $value_key;
			}

			// Special handling for language-aware strings
			if ($typology === DEDALO_VALUE_TYPE_STRING || $typology === DEDALO_VALUE_TYPE_IRI) {
				$final_obj->lang = $lang;
			}


			$final_data[] = $final_obj;
		}//end foreach (array_values((array)$ar_value) as $value)

		$response->result = $final_data;


		return $response;
	}//end migrate_component_data



	/**
	 * DELETE_V6_DB_INDEXES
	 *
	 * Removes existing database indexes and user-defined functions to prepare for v7 schema updates.
	 * Preserves unique indexes that are not explicitly listed for deletion.
	 *
	 * @return bool True if all indexes and functions were successfully processed, false otherwise.
	 */
	public static function delete_v6_db_indexes() : bool {

		$all_indexes = DBi::get_indexes();
		$conn = DBi::_getConnection();

		if (!$all_indexes || !$conn) {
			return false;
		}

		$unique_indexes_to_delete = [
			'matrix_section_id_section_tipo',
			'matrix_activities_section_id_section_tipo',
			'matrix_activity_section_id_section_tipo',
			'matrix_counter_tipo_unique',
			'matrix_counter_dd_tipo_unique',
			'matrix_dataframe_section_id_section_tipo_key',
			'matrix_dd_section_id_section_tipo',
			'matrix_hierarchy_section_id_section_tipo_key',
			'matrix_hierarchy_main_section_id_section_tipo_key',
			'matrix_indexations_section_id_section_tipo_key',
			'matrix_langs_section_id_section_tipo_key',
			'matrix_layout_section_id_section_tipo',
			'matrix_layout_dd_section_id_section_tipo',
			'matrix_list_section_id_section_tipo',
			'matrix_nexus_section_id_section_tipo_key',
			'matrix_nexus_main_section_id_section_tipo_key',
			'matrix_notes_section_id_section_tipo_key',
			'matrix_ontology_section_id_section_tipo_key',
			'matrix_ontology_main_section_id_section_tipo_key',
			'matrix_profiles_section_id_section_tipo',
			'matrix_projects_section_id_section_tipo',
			'matrix_stats_section_id_section_tipo_key',
			'matrix_structurations_section_id_section_tipo_key',
			'matrix_test_section_id_section_tipo_key',
			'matrix_tools_section_id_section_tipo_key',
			'matrix_users_section_id_section_tipo'
		];

		foreach ($all_indexes as $index_object) {

			$indexname = $index_object->indexname;

			$to_search		= "create unique index";
			$is_unique		= stripos($index_object->indexdef, $to_search) !== false;
			$is_to_delete	= in_array($indexname, $unique_indexes_to_delete);

			// Preserve unique indexes not in our explicit deletion list
			if ($is_unique && !$is_to_delete) {
				continue;
			}

			// CLI feedback
			if (running_in_cli()) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->msg = " Dropping index: $indexname";
				print_cli(common::$pdata);
			}

			// If explicitly listed, try to drop associated constraints first
			if ($is_to_delete) {
				$constraints = DBi::get_constraint_name_from_index($indexname);
				if (!empty($constraints)) {
					foreach ($constraints as $constraint_item) {
						$escaped_table		= pg_escape_identifier($conn, $constraint_item->table_name);
						$escaped_constraint	= pg_escape_identifier($conn, $constraint_item->constraint_name);

						$sql_query = "ALTER TABLE {$escaped_table} DROP CONSTRAINT IF EXISTS {$escaped_constraint};";
						matrix_db_manager::exec_sql($sql_query);
					}
				}
			}

			$escaped_schema	= pg_escape_identifier($conn, $index_object->schemaname);
			$escaped_index	= pg_escape_identifier($conn, $indexname);

			$sql_query = "DROP INDEX IF EXISTS {$escaped_schema}.{$escaped_index} CASCADE;";
			$result = matrix_db_manager::exec_sql($sql_query);

			if ($result === false) {
				$msg = "Failed to drop index '$indexname' in PostgreSQL!";
				debug_log(__METHOD__
					. " ERROR: $msg " . PHP_EOL
					. " Query: $sql_query "
					, logger::ERROR
				);
				return false;
			}
		}

		$all_functions = DBi::get_functions();
		if ($all_functions === false) {
			return false;
		}

		foreach ($all_functions as $function_object) {
			$func_name = $function_object->functionname;

			// CLI feedback
			if (running_in_cli()) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->msg = " Dropping function: $func_name";
				print_cli(common::$pdata);
			}

			$escaped_schema	= pg_escape_identifier($conn, $function_object->schemaname);
			$escaped_func	= pg_escape_identifier($conn, $func_name);
			$arguments		= $function_object->arguments;

			$sql_query = "DROP FUNCTION IF EXISTS {$escaped_schema}.{$escaped_func}({$arguments}) CASCADE;";
			$result = matrix_db_manager::exec_sql($sql_query);

			if ($result === false) {
				$msg = "Failed to drop function '$func_name' in PostgreSQL!";
				debug_log(__METHOD__
					. " ERROR: $msg " . PHP_EOL
					. " Query: $sql_query "
					, logger::ERROR
				);
				return false;
			}
		}

		return true;
	}//end delete_v6_db_indexes



	/**
	 * RENAME_CONSTRAINT
	 *
	 * Renames primary key constraints for core matrix tables to ensure consistency with v7 naming conventions.
	 *
	 * @return bool True if all constraints were successfully renamed, false otherwise.
	 */
	public static function rename_constraint() : bool {

		$ar_constraint = [
			'matrix'				=> ['matrix_id', 'matrix_pkey'],
			'matrix_activities'		=> ['matrix_activities_pkey', 'matrix_activities_pkey'],
			'matrix_activity'		=> ['matrix_activity_id_primary', 'matrix_activity_pkey'],
			'matrix_counter'		=> ['matrix_counter_id', 'matrix_counter_pkey'],
			'matrix_counter_dd'		=> ['matrix_counter_dd_id', 'matrix_counter_dd_pkey'],
			'matrix_dataframe'		=> ['matrix_dataframe_pkey', 'matrix_dataframe_pkey'],
			'matrix_dd'				=> ['matrix_dd_id', 'matrix_dd_pkey'],
			'matrix_hierarchy'		=> ['matrix_hierarchy_pkey', 'matrix_hierarchy_pkey'],
			'matrix_hierarchy_main'	=> ['matrix_hierarchy_main_pkey', 'matrix_hierarchy_main_pkey'],
			'matrix_indexations'	=> ['matrix_indexations_pkey', 'matrix_indexations_pkey'],
			'matrix_langs'			=> ['matrix_langs_pkey', 'matrix_langs_pkey'],
			'matrix_layout'			=> ['matrix_layout_pkey', 'matrix_layout_pkey'],
			'matrix_layout_dd'		=> ['matrix_layout_dd_pkey', 'matrix_layout_dd_pkey'],
			'matrix_list'			=> ['matrix_list_pkey', 'matrix_list_pkey'],
			'matrix_nexus'			=> ['matrix_nexus_pkey', 'matrix_nexus_pkey'],
			'matrix_nexus_main'		=> ['matrix_nexus_main_pkey', 'matrix_nexus_main_pkey'],
			'matrix_notes'			=> ['matrix_notes_pkey', 'matrix_notes_pkey'],
			'matrix_notifications'	=> ['matrix_notifications_id', 'matrix_notifications_pkey'],
			'matrix_ontology'		=> ['matrix_ontology_pkey', 'matrix_ontology_pkey'],
			'matrix_ontology_main'	=> ['matrix_ontology_main_pkey', 'matrix_ontology_main_pkey'],
			'matrix_profiles'		=> ['matrix_profiles_pkey', 'matrix_profiles_pkey'],
			'matrix_projects'		=> ['matrix_projects_id', 'matrix_projects_pkey'],
			'matrix_stats'			=> ['matrix_stats_pkey', 'matrix_stats_pkey'],
			'matrix_test'			=> ['matrix_test_pkey', 'matrix_test_pkey'],
			'matrix_time_machine'	=> ['matrix_time_machine_id', 'matrix_time_machine_pkey'],
			'matrix_tools'			=> ['matrix_tools_pkey', 'matrix_tools_pkey'],
			'matrix_updates'		=> ['matrix_updates_id', 'matrix_updates_pkey'],
			'matrix_users'			=> ['matrix_users_pkey', 'matrix_users_pkey'],
		];

		$conn = DBi::_getConnection();

		foreach ($ar_constraint as $matrix_table => $ar_constraint_to_change) {

			$escaped_table	= pg_escape_identifier($conn, $matrix_table);
			$old_constraint	= pg_escape_identifier($conn, $ar_constraint_to_change[0]);
			$new_constraint	= pg_escape_identifier($conn, $ar_constraint_to_change[1]);

			// CLI feedback
			if (running_in_cli()) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->msg = " Updating constraints for table: $matrix_table";
				print_cli(common::$pdata);
			}

			// Drop old and new (to be sure)
			$sql_query 	= "ALTER TABLE IF EXISTS {$escaped_table} DROP CONSTRAINT IF EXISTS {$old_constraint}, DROP CONSTRAINT IF EXISTS {$new_constraint};";
			$result		= matrix_db_manager::exec_sql($sql_query);

			if($result===false) {
				$msg = "Failed to delete constraint '$old_constraint' on table '$matrix_table'";
				debug_log(__METHOD__
					." ERROR: $msg " . PHP_EOL
					." Query: $sql_query "
					, logger::ERROR
				);
				return false;
			}

			// Add primary key
			if (DBi::check_column_exists($matrix_table, 'id')) {
				$sql_query 	= "ALTER TABLE IF EXISTS {$escaped_table} ADD CONSTRAINT {$new_constraint} PRIMARY KEY (id);";
				$result		= matrix_db_manager::exec_sql($sql_query);

				if($result===false) {
					$msg = "Failed to add primary key constraint '$new_constraint' on table '$matrix_table'";
					debug_log(__METHOD__
						." ERROR: $msg " . PHP_EOL
						." Query: $sql_query "
						, logger::ERROR
					);
					return false;
				}
			} else {
				debug_log(__METHOD__
					." WARNING: Table '$matrix_table' does not have 'id' column. Skipping PK constraint creation."
					, logger::WARNING
				);
			}
		}//end foreach ($ar_constraint as $matrix_table => $ar_constraint_to_change)


		return true;
	}//end rename_constraint



	/**
	 * RECREATE_DB_ASSETS
	 *
	 * Forces the re-building of PostgreSQL main assets: extensions, constraints, functions,
	 * indexes, and generic maintenance tasks.
	 *
	 * @return object $response
	 */
	public static function recreate_db_assets() : object {

		$response = new stdClass();
		$response->result	= new stdClass();
		$response->msg		= 'Request done with errors';
		$response->errors	= [];
		$response->success	= 0;

		$tasks = [
			'extensions'  => 'create_extensions',
			'constraints' => 'rebuild_constraints',
			'functions'   => 'rebuild_functions',
			'indexes'     => 'rebuild_indexes',
			'maintenance' => 'exec_maintenance' // long time process (vacuum, reindex, etc)
		];

		foreach ($tasks as $process_name => $method) {

			// CLI feedback
			if (running_in_cli()) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
					common::$pdata->counter = 0;
				}
				common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ": recreate_db_assets | $process_name -> $method";
				common::$pdata->memory = (common::$pdata->counter % 100 === 0)
					? dd_memory_usage()
					: (common::$pdata->memory ?? '');
				common::$pdata->counter++;
				print_cli(common::$pdata);
			}

			// Execute task
			if (method_exists('db_tasks', $method)) {
				$task_response = db_tasks::$method();

				$response->result->{$process_name} = $task_response->result ?? null;

				if (!empty($task_response->errors)) {
					$response->errors = array_merge($response->errors, (array)$task_response->errors);
				}

				if (($task_response->result ?? false) !== false) {
					$response->success++;
				}
			}
		}

		$response->result->success_count = $response->success;
		$response->result->total_count   = count($tasks);

		if (empty($response->errors)) {
			$response->msg = 'Request done successfully';
		}

		return $response;
	}//end recreate_db_assets



	/**
	 * REMOVE_TM_CREATED_SECTIONS
	 *
	 * Cleans up the Time Machine table by removing section-level create/update records.
	 * In Dédalo v7, the history of data is stored at the component level. Section-level
	 * records in TM are only preserved for the 'deleted' state to track deletions.
	 *
	 * @return bool True if the cleanup was successful, false otherwise.
	 */
	public static function remove_tm_created_sections() : bool {

		// CLI feedback
		if (running_in_cli()) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ": remove_tm_created_sections";
			print_cli(common::$pdata);
		}

		$sql_query = sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'' . static::$table_matrix_time_machine . '\'
					AND column_name = \'state\'
				) THEN
					DELETE FROM "' . static::$table_matrix_time_machine . '"
					WHERE "section_tipo" = "tipo"
					  AND ("state" != \'deleted\' OR "state" IS NULL);
				END IF;
			END $$;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if ($result === false) {
			$msg = 'Failed to remove TM created sections';
			debug_log(__METHOD__
				. " ERROR: $msg " . PHP_EOL
				. " Query: $sql_query "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end remove_tm_created_sections



	/**
	 * RECREATE_TM_TABLE
	 *
	 * Extends the `matrix_time_machine` table with new columns required by the v7 schema:
	 * `user_id`, `bulk_process_temp`, and `data`. Also adds relevant documentation via SQL comments.
	 *
	 * @return bool True if the table was successfully updated, false otherwise.
	 */
	public static function recreate_tm_table() : bool {

		// CLI feedback
		if (running_in_cli()) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ": recreate_tm_table";
			print_cli(common::$pdata);
		}

		$sql_query = sanitize_query ('
			ALTER TABLE "' . static::$table_matrix_time_machine . '"
				ADD COLUMN IF NOT EXISTS "user_id" character varying(8) NULL,
				ADD COLUMN IF NOT EXISTS "bulk_process_temp" integer NULL,
				ADD COLUMN IF NOT EXISTS "data" jsonb NULL;

			COMMENT ON TABLE "' . static::$table_matrix_time_machine . '" IS \'Time Machine\';

			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.section_id IS \'section_id when the change was made\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.section_tipo IS \'section_tipo when the change was made\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.tipo IS \'component tipo or section tipo when the change was made\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.lang IS \'component data lang of the change\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.timestamp IS \'timestamp of the change\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.user_id IS \'User section_id that made the change\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.bulk_process_temp IS \'Bulk process id that identify a bulk change - copy\';
			COMMENT ON COLUMN ' . static::$table_matrix_time_machine . '.data IS \'JSONB data representing the change\';
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if ($result === false) {
			$msg = "Failed to update matrix_time_machine schema";
			debug_log(__METHOD__
				. " ERROR: $msg " . PHP_EOL
				. " Query: $sql_query "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end recreate_tm_table



	/**
	* FILL_NEW_COLUMNS_IN_TM
	* Set the new columns `user_id`, `bulk_process_temp` and `data` with its previous column data
	* New columns data is compatible with previous column data.
	* @return bool
	*/
	public static function fill_new_columns_in_tm() : bool {

		$column_exists = DBi::check_column_exists(static::$table_matrix_time_machine, 'userID');
		if(!$column_exists) {
			debug_log(__METHOD__
				." WARNING: Ignore fill_new_columns_in_tm because userID column does not exist"
				, logger::WARNING
			);
			return true;
		}

		// Check if bulk_process_id column exists (source for migration)
		$bulk_process_id_exists = DBi::check_column_exists(static::$table_matrix_time_machine, 'bulk_process_id');
		if(!$bulk_process_id_exists) {
			debug_log(__METHOD__
				." WARNING: Ignore fill_new_columns_in_tm because bulk_process_id column does not exist"
				, logger::WARNING
			);
			return true;
		}

		// Check if dato column exists (source for migration)
		$dato_exists = DBi::check_column_exists(static::$table_matrix_time_machine, 'dato');
		if(!$dato_exists) {
			debug_log(__METHOD__
				." WARNING: Ignore fill_new_columns_in_tm because dato column does not exist"
				, logger::WARNING
			);
			return true;
		}

		$sql_query = sanitize_query ('
			UPDATE "' . static::$table_matrix_time_machine . '"
				SET user_id 		  = "userID",
					bulk_process_temp = bulk_process_id,
					data 			  = dato;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed Update matrix_time_machine new columns with its data";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end fill_new_columns_in_tm



	/**
	 * DELETE_TM_COLUMNS
	 * Delete obsolete columns to matrix_time_machine table
	 * @return bool
	 */
	public static function delete_tm_columns() : bool {

		$sql_query = sanitize_query ('
			ALTER TABLE "' . static::$table_matrix_time_machine . '"
				DROP COLUMN IF EXISTS "section_id_key",
				DROP COLUMN IF EXISTS "state",
				DROP COLUMN IF EXISTS "userID",
				DROP COLUMN IF EXISTS "dato";
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to delete tm section_id_key and state columns";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end delete_tm_columns



	/**
	 * RENAME_TM_COLUMN_BULK_PROCESS
	 * Rename column "bulk_process_temp" to "bulk_process_id" in tm table (matrix_time_machine) in PostgreSQL.
	 * @return bool
	 */
	public static function rename_tm_column_bulk_process() : bool {

		// column 'bulk_process_temp' already exists check
		$bulk_process_temp_exists = DBi::check_column_exists(static::$table_matrix_time_machine, 'bulk_process_temp');
		if($bulk_process_temp_exists===false) {
			debug_log(__METHOD__
				." WARNING: Ignore rename_tm_column_bulk_process because bulk_process_temp column does not exist"
				, logger::WARNING
			);
			return true;
		}

		// column 'bulk_process_id' already exists check
		$bulk_process_id_exists = DBi::check_column_exists(static::$table_matrix_time_machine, 'bulk_process_id');
		if($bulk_process_id_exists===true) {
			debug_log(__METHOD__
				." WARNING: Ignore rename_tm_column_bulk_process because bulk_process_id column already exists"
				, logger::WARNING
			);
			return true;
		}

		$sql_query = sanitize_query ('
			ALTER TABLE "' . static::$table_matrix_time_machine . '" RENAME COLUMN bulk_process_temp TO bulk_process_id;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to rename tm bulk_process_temp column to bulk_process_id";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end rename_tm_column_bulk_process



	/**
	 * CREATE_MATRIX_ACTIVITY_DIFFUSION_TABLE
	 * Create matrix_activity_diffusion table
	 * @return bool
	 */
	public static function create_matrix_activity_diffusion_table() : bool {

		$sql_query = file_get_contents(DEDALO_ROOT_PATH . '/install/db/matrix_activity_diffusion.sql');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to create matrix_activity_diffusion table ";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end create_matrix_activity_diffusion_table



	/**
	 * DROP_LEGACY_DATOS_COLUMN
	 *
	 * Removes the legacy 'datos' column from the specified tables after successful data migration.
	 *
	 * @param array $ar_tables List of database tables to process.
	 * @return bool True if all columns were successfully dropped or didn't exist, false on error.
	 */
	public static function drop_legacy_datos_column(array $ar_tables) : bool {

		$conn = DBi::_getConnection();

		foreach ($ar_tables as $table) {
			// CLI feedback
			if (running_in_cli()) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->msg = " Dropping legacy 'datos' column from table: $table";
				print_cli(common::$pdata);
			}

			$escaped_table = pg_escape_identifier($conn, $table);

			$sql_query = sanitize_query("
				DO $$
				BEGIN
					IF EXISTS (
						SELECT 1
						FROM information_schema.columns
						WHERE table_name = '$table'
						AND column_name = 'datos'
					) THEN
						ALTER TABLE $escaped_table DROP COLUMN \"datos\";
					END IF;
				END $$;
			");

			$result = matrix_db_manager::exec_sql($sql_query);

			if ($result === false) {
				$msg = "Failed to drop legacy 'datos' column from table '$table'";
				debug_log(__METHOD__ . " ERROR: $msg", logger::ERROR);
				return false;
			}
		}

		return true;
	}//end drop_legacy_datos_column



	/**
	 * CHANGE_NOTIFICATIONS_TABLE_COLUMN_NAME
	 *
	 * Change notifications table column name from 'datos' to 'data'
	 * @return bool
	 */
	public static function change_notifications_table_column_name() : bool {

		$sql_query = sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'matrix_notifications\'
					AND column_name = \'datos\'
				) THEN
					EXECUTE \'ALTER TABLE "matrix_notifications" RENAME COLUMN "datos" TO "data"\';
				END IF;
			END $$;
		');

		$result = matrix_db_manager::exec_sql($sql_query);

		if($result===false) {
			$msg = "Failed to change notifications table column name";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end change_notifications_table_column_name



}//end class v6_to_v7
