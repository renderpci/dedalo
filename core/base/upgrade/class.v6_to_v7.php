<?php declare(strict_types=1);
/**
* CLASS V6_TO_V7
* One-shot migration helper that upgrades a Dédalo v6 PostgreSQL database to the v7 schema.
*
* Responsibilities:
* - Transforms the legacy `jer_dd` ontology table into the v7 `dd_ontology` table,
*   renaming columns and converting 'si'/'no' booleans.
* - Migrates all data matrices from the v6 monolithic `datos` JSONB blob to the v7
*   columnar layout (data, relation, string, date, iri, geo, number, media, misc, meta).
* - Migrates the Time Machine table (`matrix_time_machine`) to the v7 schema,
*   adding `user_id`, `bulk_process_temp`/`bulk_process_id`, and `data` columns.
* - Cleans up obsolete indexes, constraints, and user-defined functions that are
*   incompatible with the v7 schema.
* - Migrates search preset records from the v6 filter format to the v7 id-bearing format.
*
* Usage flow (invoked by the upgrade controller, never directly by user code):
*   1. pre_update()         — runs before logout; migrates ontology table.
*   2. reformat_matrix_data()  — converts all data matrices row-by-row.
*   3. reformat_matrix_time_machine_data() — converts TM rows.
*   4. Various schema-cleanup helpers (delete_v6_db_indexes, rename_constraint,
*      recreate_db_assets, drop_legacy_datos_column, etc.).
*
* All methods are static. The class is never instantiated.
* Relates to: update (tables_rows_iterator, convert_table_data),
*             db_tasks (create_extensions, rebuild_constraints, rebuild_indexes, …),
*             matrix_db_manager (exec_sql, exec_search),
*             tm_db_manager (delete), DBi, ontology_node.
*
* @package Dédalo
* @subpackage Core
*/
class v6_to_v7 {

	/**
	* Name of the legacy v6 ontology table. Kept as a class property to allow
	* subclass or test overrides without changing every SQL statement.
	* @var string $table_jer_dd
	*/
	public static string $table_jer_dd = 'jer_dd';

	/**
	* Name of the v7 ontology table created from `jer_dd` during pre_update().
	* The login process requires at least the `dd` TLD row to be present here.
	* @var string $table_dd_ontology
	*/
	public static string $table_dd_ontology = 'dd_ontology';

	/**
	* Name of the Time Machine audit table migrated by recreate_tm_table() and
	* reformat_matrix_time_machine_data().
	* @var string $table_matrix_time_machine
	*/
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
	 * - 'tld+0'        => 'is_main'
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
				ADD COLUMN IF NOT EXISTS "is_main" boolean NULL,
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
					is_translatable	= CASE WHEN traducible = \'si\' THEN true ELSE false END,
					is_main			= CASE WHEN "terminoID" = CONCAT(tld, 0) THEN true ELSE false END;
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
				SELECT id, tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, is_main, propiedades
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

			ALTER TABLE "' . static::$table_dd_ontology . '"
			DROP CONSTRAINT IF EXISTS ' . static::$table_dd_ontology . '_tipo_key;

			ALTER TABLE "' . static::$table_dd_ontology . '"
			ADD CONSTRAINT ' . static::$table_dd_ontology . '_tipo_key
			UNIQUE ( tipo );

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
			COMMENT ON COLUMN ' . static::$table_dd_ontology . '.is_main IS \'Boolean to identify if the node is a main/root node (tipo = tld + 0)\';
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
	* Returns a map from component model name to the DEDALO_VALUE_TYPE_* constant that
	* determines which v7 columnar slot (string, number, date, media, iri, geo, misc)
	* the migrated data must be placed in.
	*
	* Only component models that require explicit type routing are listed here.
	* Any model absent from this map defaults to DEDALO_VALUE_TYPE_MISC → 'misc' column.
	* Relation-bearing components (component_relation_*) are handled separately and
	* are intentionally omitted.
	*
	* Called once per batch in reformat_matrix_data() and reformat_matrix_time_machine_data()
	* and cached locally; calling it per-row would be needlessly expensive.
	*
	* @return object Keyed by model name, values are DEDALO_VALUE_TYPE_* string constants.
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
	* Thin delegation wrapper that forwards to update::convert_table_data().
	*
	* Exists so that upgrade scripts can call v6_to_v7::convert_table_data() without
	* depending on the update class name directly.
	*
	* @param array $ar_tables - list of matrix table names to operate on.
	* @param string $action   - action identifier passed through to update::convert_table_data().
	* @return bool - result of update::convert_table_data(); true on success.
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
		// Avoids a redundant object construction for every row; the map is read-only
		// and shared across the closure via 'use'.
		$value_type_map = v6_to_v7::get_value_type_map();

		// CLI process data initialization
		// common::$pdata is a shared status object polled by the CLI shell to display
		// live progress without flooding stdout with full log lines.
		if ( running_in_cli()===true ) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->table = '';
			common::$pdata->memory = '';
			common::$pdata->counter = 0;
		}

		$conn = DBi::_getConnection();
		// Escaped-table cache
		// pg_escape_identifier() is called once per unique table name and cached here
		// because the iterator visits thousands of rows per table.
		$ar_escaped_tables = [];

		// iterate tables
		// update::tables_rows_iterator streams rows in batches, calling the closure for
		// each row. Using a streaming cursor avoids loading the entire table into memory.
		update::tables_rows_iterator(
			$ar_tables,
			function($row, $table, $max) use ($response, $save, $conn, $value_type_map, &$ar_escaped_tables) {

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				// Decode the legacy v6 monolithic blob; null when the column is absent or empty.
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$section_id		= $row['section_id'] ?? '';

				// CLI process data status
				// Memory is sampled only every 5 000 rows to avoid calling memory_get_usage()
				// on every iteration, which would add measurable overhead over millions of rows.
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
				// Rows without a 'datos' value (already migrated or empty) are skipped silently.
				if( isset($datos) ){

					$processed_data = self::process_matrix_row_data(
						$datos,
						$table,
						$section_tipo,
						$section_id,
						$value_type_map,
						$response
					);

					// Build the ordered parameter array for the UPDATE statement.
					// Empty column objects (no keys) are stored as SQL NULL to preserve
					// storage efficiency; the v7 search layer treats NULL and empty-object
					// identically when querying JSONB columns.
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

		// Column routing map
		// Maps each DEDALO_VALUE_TYPE_* constant to the property name on $results
		// that holds the corresponding v7 column data. Absent types fall through
		// to 'misc' as the safe default.
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
					// Relation routing
					// v6 stored both live relations ('relations') and the search-index
					// copy ('relations_search') inside the same datos blob. v7 separates
					// them into two distinct JSONB columns: 'relation' and 'relation_search'.
					$target_key = ($datos_key === 'relations_search') ? 'relation_search' : 'relation';
					foreach ($datos_value as $locator) {
						if (!isset($locator->from_component_tipo)) {
							$locator_string = json_handler::encode($locator);
							debug_log(__METHOD__ . " ERROR: locator without from_component_tipo in $table/$section_id. locator: $locator_string", logger::ERROR);
							$response->errors[] = "Bad component data (locator without from_component_tipo property). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id'";
							continue;
						}

						// Skip deprecated activity project link
						// dd550 was a v5/v6 internal link from activities to their project; it has no
						// equivalent in v7 and must be discarded during migration.
						if ($locator->from_component_tipo === 'dd550') continue;

						$comp_tipo = $locator->from_component_tipo;
						if (!isset($results->{$target_key}->{$comp_tipo})) {
							$results->{$target_key}->{$comp_tipo} = [];
						}
						$results->{$target_key}->{$comp_tipo}[] = $locator;
					}

					// Assign sequential ids and meta counters to live relations
					// v7 requires every locator to carry a numeric 'id' field (1-based) and a
					// corresponding meta entry {count: N} so the UI can manage additions/deletions
					// without re-querying counts from the DB.
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

						// Resolve component model
						// ontology_node::get_model_by_tipo() returns the PHP class name without the
						// 'class.' prefix, e.g. 'component_input_text', or null for unknown tipos.
						$model = ontology_node::get_model_by_tipo($literal_tipo);

						// Skip v5 legacy components columns
						// component_filter and component_section_id were v5 internal pseudo-components
						// that stored filter configuration inside the data matrix. v7 does not use them.
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
					break; // Extinct property — was used in v5/v6 to track the canonical section type; dropped in v7.

				case 'created_by_userID':
					// Column rename: v6 used camelCase 'created_by_userID'; v7 uses snake_case.
					$results->data->created_by_user_id = $datos_value;
					break;

				default:
					// Scalar metadata pass-through
					// Properties like section_tipo, created_date, modified_date, and any future
					// top-level metadata are copied verbatim into the 'data' column object.
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

		// Suppress verbose logs during bulk update
		// When DEDALO_UPDATING is set, lower-level classes reduce their logging output
		// to avoid flooding the log file with millions of routine debug entries.
		$_ENV['DEDALO_UPDATING'] = true;

		// Pre-fetch value type map once
		// Shared across the closure via 'use'; see get_value_type_map() for the contract.
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

				// Garbage old data guard
				// 'termino' was a v5-era tipo value used for standalone thesaurus term records.
				// These rows have no equivalent in v7 and must be hard-deleted rather than
				// migrated; leaving them would cause type-resolution failures later.
				if( empty($tipo) || $tipo === 'termino' ) {
					// Delete it because it is old data garbage
					$deleted = tm_db_manager::delete( (int)$id );
					debug_log(__METHOD__ . " Ignored old data garbage for matrix_time_machine ID $id. Deleted: " . json_handler::encode($deleted), logger::DEBUG);
					return;
				}

				// Lang guard
				// Every TM component row must carry a language code. A row without one cannot
				// be routed to the correct columnar slot and is treated as corrupt.
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

				// Determine record kind: section snapshot vs. component snapshot
				// In the TM table the 'tipo' column holds either the section_tipo (for a
				// whole-section snapshot) or a component tipo (for a single-component change).
				// The two cases need completely different migration paths.
				$is_section = $safe_tipo === $section_tipo;

				if($is_section) {

					// Temporary fix for invalid import rows
					// Some rows imported from external sources wrapped the section snapshot
					// inside an extra data.0 envelope. Unwrap it before migrating.
					$safe_data = $data;
					if(isset($data->data->{'0'})) {
						$safe_data = $data->data->{'0'};
					}

					// section case
					$migrated_data_response = v6_to_v7::migrate_section_data(
						$section_tipo,
						$section_id,
						$safe_data // Normally an array as [{"id":1."label":"xx","relations":[],..}]
					);

				}else{

					// component case
					$migrated_data_response = v6_to_v7::migrate_component_data(
						$safe_tipo,
						$data,
						$lang,
						$section_tipo,
						$section_id
					);
				}

				// data migrate to v7
				if( $migrated_data_response->result === false ) {
					if(!empty($migrated_data_response->errors)) {
						$response->errors[] = "matrix_time_machine ID $id";
						$response->errors = array_merge($response->errors, $migrated_data_response->errors);
					}
					return;
				}

				// Skip unchanged rows
				// JSON round-trip comparison is used here instead of PHP strict equality
				// because $data may contain stdClass objects that PHP would compare as
				// equal even when their JSON representations differ (numeric vs. string keys,
				// etc.). Serialising both sides ensures a consistent comparison.
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

		// Guard: do not touch relation components
		// Relation data (locators) in the TM table was already migrated by the
		// relations branch of process_matrix_row_data(); re-processing it here would
		// double-wrap the locators and corrupt the data.
		$components_with_relations = component_relation_common::get_components_with_relations();
		if(in_array($model, $components_with_relations)) {
			$response->result = false;
			return $response;
		}

		// Normalize non-array values (TinyMCE, etc.)
		// In v6, TinyMCE-backed components stored their value as a plain string (the HTML)
		// rather than an array. A few known garbage values must be silently discarded:
		//   - hierarchy42 with lang 'lg-nolan': a Space-frame artifact with no real content.
		//   - '<br data-mce-bogus="1">': a TinyMCE cursor placeholder, not real data.
		//   - tipo 'dd23' (component_layout Layout templates): v5-era internal record, dropped in v7.
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

				// Build normalized v7 datum object from a scalar value
				if ($typology === DEDALO_VALUE_TYPE_IRI) {

					// IRI scalar normalization
					// In v6, component_iri sometimes stored the full IRI as a plain string,
					// optionally prefixed with a human-readable label (e.g. "My Label http://…").
					// Split on 'http' to separate label from IRI, then reconstruct the v7 shape:
					// { iri: "http://…", title: "My Label" }.
					// Limit to 2 parts so that 'http' within the IRI path is not split again.
					$parts = explode('http', (string)$value, 2);
					$last_part = end($parts);

					$final_obj = (object)[
						'iri' => 'http' . ($last_part ?? '')
					];

					// Add label when $parts > 1
					// $parts[0] is the text before the first 'http'; only include it when non-empty.
					if(count($parts) > 1 && !empty($parts[0])) {
						$final_obj->title = $parts[0];
					}

				}else{

					// Non-IRI scalar: wrap in {value: …} for components that use that property shape.
					// component_common::$components_using_value_property lists the models whose v7
					// datum objects must carry a 'value' property (e.g. component_input_text,
					// component_number, component_date when stored as a scalar — unusual but possible).
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
	 * MIGRATE_SECTION_DATA
	 *
	 * Migrates section data from v6 format to v7 format.
	 * Handles normalization of non-array values, typology mapping, language-aware strings,
	 * and specialized formatting for complex types (Date, Media, Geo, IRI).
	 *
	 * (!) It is used ONLY in TIME MACHINE transformations (matrix_time_machine table) to avoid change
	 * the actual process_matrix_row_data method.
	 *
	 * @param string $section_tipo The section type (e.g., 'oh1').
	 * @param mixed $section_id The section id (e.g., 123).
	 * @param array|object $section_data The raw data to migrate.
	 * @return stdClass Response object with 'errors' (array) and 'result' (array|false).
	 *                  'result' contains the migrated data array or false if no changes were needed.
	 */
	public static function migrate_section_data(
		string $section_tipo,
		mixed $section_id,
		array|object $section_data
	) : object {

		$response = new stdClass();
			$response->errors = [];
			$response->result = false;

		// safe tipo. Check if the tipo is valid
		$safe_tipo = safe_tipo($section_tipo);
		if( empty($safe_tipo) ) {
			$response->errors[] = "Ignored empty safe_tipo. Tipo: $section_tipo";
			$response->result = false;
			return $response;
		}

		// model check
		$model = ontology_node::get_model_by_tipo($section_tipo);
		if( empty($model) ) {
			$response->errors[] = "Ignored empty model. Tipo: $section_tipo";
			$response->result = false;
			return $response;
		}
		if($model!=='section'){
			$response->errors[] = "Ignored non section model ($model). Tipo: $section_tipo";
			$response->result = false;
			return $response;
		}

		$value_type_map = self::get_value_type_map();

		// Unwrap optional array envelope
		// Section snapshots in the TM table were historically stored as a single-element
		// array [{ … section data … }]. Unwrap it so process_matrix_row_data() receives
		// a plain object, which is what it expects.
		$section_data_object = is_array($section_data) ? $section_data[0] : $section_data;

		$result = self::process_matrix_row_data(
			$section_data_object,
			'matrix_time_machine',
			$section_tipo,
			$section_id,
			$value_type_map,
			$response
		);

		$response->result = $result;


		return $response;
	}//end migrate_section_data



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
			// Non-listed unique indexes are assumed to belong to constraints created by
			// the application itself (e.g. project-specific custom uniques) and must not
			// be touched. Only the well-known v6 system indexes are dropped.
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

			// Drop associated constraints before dropping the index
			// In PostgreSQL a UNIQUE or PRIMARY KEY constraint creates a backing index.
			// Dropping the index directly while the constraint exists raises an error.
			// We must drop the constraint first; the backing index is then dropped implicitly,
			// but we issue a DROP INDEX CASCADE as well for any standalone indexes.
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

			// Drop both old and new constraint names before re-adding
			// PostgreSQL does not support RENAME CONSTRAINT without first dropping the existing one.
			// Dropping both old and new ensures the operation is idempotent: a previous partial run
			// that added the new constraint will not cause a "constraint already exists" error.
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
	* Forces the full rebuild of all PostgreSQL schema assets after schema migration.
	*
	* Runs these db_tasks methods in sequence:
	* 1. create_extensions   — ensures required PostgreSQL extensions (e.g. pgcrypto, unaccent) exist.
	* 2. rebuild_constraints — re-adds foreign keys and check constraints that were dropped.
	* 3. rebuild_functions   — re-creates all user-defined PL/pgSQL functions.
	* 4. rebuild_indexes     — re-creates all JSONB and standard indexes for the v7 schema.
	* 5. exec_maintenance    — runs VACUUM ANALYZE and REINDEX (long-running; should be last).
	*
	* Individual task failures are recorded in response->errors but do not abort the remaining
	* tasks. The caller should inspect response->errors and response->success_count afterwards.
	*
	* @return object - stdClass with properties:
	*   result  stdClass  — per-task result keyed by task name, plus success_count/total_count.
	*   msg     string    — human-readable summary.
	*   errors  array     — collected error messages from all tasks.
	*   success int       — number of tasks that returned a truthy result.
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
	* Copies v6 Time Machine column values into their v7 equivalents.
	*
	* Column mapping performed by a single bulk UPDATE:
	* - 'userID'          → 'user_id'         (camelCase to snake_case; content identical)
	* - 'bulk_process_id' → 'bulk_process_temp' (temporarily renamed to avoid constraint
	*                        conflicts; later renamed back by rename_tm_column_bulk_process())
	* - 'dato'            → 'data'             (v6 used 'dato'; v7 uses 'data')
	*
	* Prerequisites: recreate_tm_table() must have been called first to add the target columns.
	* Silently succeeds (returns true) when the source columns ('userID', 'bulk_process_id',
	* 'dato') do not exist, which means the migration was already completed.
	*
	* @return bool - true on success or when source columns are absent, false on SQL error.
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
	* Drops obsolete v6 columns from `matrix_time_machine` after data has been migrated
	* into the v7 equivalents by fill_new_columns_in_tm().
	*
	* Columns removed:
	* - 'section_id_key' — v5-era composite key helper; superseded by (section_id, section_tipo).
	* - 'state'          — section-level create/update/delete state; v7 tracks this differently.
	* - 'userID'         — replaced by 'user_id' (see fill_new_columns_in_tm).
	* - 'dato'           — replaced by 'data' (see fill_new_columns_in_tm).
	*
	* Uses IF EXISTS guards so the statement is idempotent and safe to re-run.
	*
	* (!) Must only be called AFTER fill_new_columns_in_tm() has successfully completed.
	*
	* @return bool - true on success, false on SQL error.
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
	* Renames the staging column 'bulk_process_temp' back to its final name 'bulk_process_id'
	* in the `matrix_time_machine` table.
	*
	* Why the two-step rename?
	* fill_new_columns_in_tm() copies the old 'bulk_process_id' value into 'bulk_process_temp'
	* instead of directly into 'bulk_process_id', because the source column and the target column
	* share the same name and a single UPDATE cannot write to a column while reading from it in
	* some PostgreSQL planner paths. Once the old 'bulk_process_id' column is dropped (by
	* delete_tm_columns), this method finalizes the rename.
	*
	* Guards against:
	* - 'bulk_process_temp' absent → already renamed or migration not run; returns true silently.
	* - 'bulk_process_id' already present → rename would cause a name collision; returns true.
	*
	* @return bool - true on success or when rename is not needed, false on SQL error.
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
	* Creates the `matrix_activity_diffusion` table by executing the canonical SQL DDL file
	* from the install/db directory.
	*
	* This table tracks diffusion (publishing) events per activity record and is part of the
	* v7 diffusion subsystem. The DDL is read from disk rather than inlined here so that the
	* install and upgrade paths share a single authoritative schema definition.
	*
	* (!) Requires DEDALO_ROOT_PATH to be defined and the file
	*     install/db/matrix_activity_diffusion.sql to be present and readable.
	*
	* @return bool - true on success, false on SQL error.
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
	 * CREATE_STRING_SEARCH_STORE
	 *
	 * Creates the v7 per-value text-search store `matrix_string_search`
	 * (extension btree_gin, table, sync trigger function, composite trigram
	 * index — DDL in install/db/matrix_string_search.sql, all idempotent),
	 * installs the `{table}_string_search_sync` row trigger on every existing
	 * string-searchable matrix table, and BACKFILLS the store from the
	 * migrated data (TRUNCATE + INSERT..SELECT — safe to re-run).
	 *
	 * (!) Must run at the END of the pipeline:
	 *  - after recreate_db_assets (needs f_unaccent and pg_trgm), and
	 *  - after every data migration that writes string values (the backfill
	 *    must read the FINAL v7 data; later writes stay in sync via the
	 *    triggers themselves).
	 * The TS engine gates its search pre-filter on the trigger presence per
	 * table: a trigger without backfilled rows would wrongly EXCLUDE records
	 * from searches, so the backfill is correctness, not an optimization.
	 *
	 * @return bool True when the store, triggers and backfill completed.
	 */
	public static function create_string_search_store() : bool {

		// DDL: extension + table + trigger function + indexes (idempotent)
			$sql_query = file_get_contents(DEDALO_ROOT_PATH . '/install/db/matrix_string_search.sql');
			$result = matrix_db_manager::exec_sql($sql_query);
			if($result===false) {
				debug_log(__METHOD__
					." ERROR: Failed to create matrix_string_search store (DDL) "
					, logger::ERROR
				);
				return false;
			}

		// The string-searchable matrix tables (the all_matrix_string_gin_idx
		// list minus the log tables matrix_activity / matrix_activity_diffusion
		// / matrix_stats — mirror of the TS ar_trigger declaration). Tables
		// absent on this installation are skipped.
			$ar_tables = [
				'matrix',
				'matrix_activities',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			];

		// Backfill is TRUNCATE + re-insert so a re-run never duplicates rows.
			$result = matrix_db_manager::exec_sql('TRUNCATE public.matrix_string_search;');
			if($result===false) {
				debug_log(__METHOD__
					." ERROR: Failed to truncate matrix_string_search before backfill "
					, logger::ERROR
				);
				return false;
			}

		$conn = DBi::_getConnection();
		foreach ($ar_tables as $table) {

			// skip tables not present on this installation
				$exists_result = pg_query_params(
					$conn,
					"SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1",
					[$table]
				);
				if ($exists_result===false || pg_num_rows($exists_result)===0) {
					continue;
				}

			// CLI feedback
				if (running_in_cli()) {
					if (!isset(common::$pdata)) {
						common::$pdata = new stdClass();
					}
					common::$pdata->msg = " Creating string search trigger + backfill for table: $table";
					print_cli(common::$pdata);
				}

			$escaped_table = pg_escape_identifier($conn, $table);

			// trigger (drop + create = idempotent re-run)
				$sql_query = sanitize_query('
					DROP TRIGGER IF EXISTS "'.$table.'_string_search_sync" ON '.$escaped_table.';
					CREATE TRIGGER "'.$table.'_string_search_sync"
					AFTER INSERT OR DELETE OR UPDATE OF string, section_id, section_tipo ON '.$escaped_table.'
					FOR EACH ROW EXECUTE FUNCTION public.matrix_string_search_sync();
				');
				$result = matrix_db_manager::exec_sql($sql_query);
				if($result===false) {
					debug_log(__METHOD__
						." ERROR: Failed to create string search trigger on table '$table' "
						, logger::ERROR
					);
					return false;
				}

			// backfill this table's values
				$sql_query = sanitize_query('
					INSERT INTO public.matrix_string_search (section_tipo, section_id, component_tipo, string)
					SELECT m.section_tipo, m.section_id, kv.key, lower(public.f_unaccent(e->>\'value\'))
					FROM '.$escaped_table.' m, jsonb_each(m.string) kv, jsonb_array_elements(kv.value) e
					WHERE m.string IS NOT NULL
					  AND jsonb_typeof(kv.value) = \'array\'
					  AND e->>\'value\' IS NOT NULL
					  AND e->>\'value\' <> \'\';
				');
				$result = matrix_db_manager::exec_sql($sql_query);
				if($result===false) {
					debug_log(__METHOD__
						." ERROR: Failed to backfill matrix_string_search from table '$table' "
						, logger::ERROR
					);
					return false;
				}
		}

		return true;
	}//end create_string_search_store



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
	* Renames the 'datos' column to 'data' in the `matrix_notifications` table.
	*
	* This is the very first step of pre_update() because the update process itself
	* writes PID and status entries into `matrix_notifications`, and the new v7 code
	* expects the column to be named 'data'. Running this before any other migration
	* step ensures compatibility even if later steps fail and need to be retried.
	*
	* Uses an anonymous DO block with an IF EXISTS guard so the statement is idempotent
	* and safe to re-run after a partial failure.
	*
	* @return bool - true on success, false on SQL error.
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



	/**
	 * MIGRATE_SEARCH_PRESETS_V6_TO_V7
	 *
	 * Migrates search preset data from v6 to v7 format by adding mandatory `id` properties.
	 * Presets are stored in `matrix_list` table, section_tipo 'dd655', component_json 'dd625'.
	 * (!) This feature is in process of implementation.
	 *
	 * Transformation rules:
	 * - Add `"id": 1` to top-level preset object
	 * - When `q` is not null: add `"id": 1` to each item in the `q` array
	 * - When `q` is null: remove any existing `id` property from the filter item
	 * - Idempotent: skips already-converted data (checks for top-level id)
	 *
	 * @param bool $save If true, saves changes to DB. If false, dry-run only.
	 * @return object Standard response with result, msg, errors
	 */
	public static function migrate_search_presets_v6_to_v7(bool $save) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		debug_log(__METHOD__ . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			. ' MIGRATING SEARCH PRESETS ... ' . PHP_EOL
			. ' ))))))))))))))))))))))))))))))))))))))))))))))))))))))) ' . PHP_EOL
			, logger::WARNING
		);

		// CLI process data initialization
		if (running_in_cli() === true) {
			if (!isset(common::$pdata)) {
				common::$pdata = new stdClass();
			}
			common::$pdata->table		= 'matrix_list';
			common::$pdata->memory		= '';
			common::$pdata->counter		= 0;
			common::$pdata->modified	= 0;
		}

		$conn		= DBi::_getConnection();
		$table		= 'matrix_list';
		$section_tipo	= 'dd655'; // temp presets section tipo
		$component_tipo	= 'dd625'; // component_json tipo

		$escaped_table = pg_escape_identifier($conn, $table);

		// Query records with section_tipo dd655
		$strQuery = "
			SELECT id, section_id, misc
			FROM $escaped_table
			WHERE section_tipo = $1
		";
		$result = matrix_db_manager::exec_search($strQuery, [$section_tipo]);

		if ($result === false) {
			$msg = "Failed to query matrix_list for section_tipo $section_tipo";
			debug_log(__METHOD__ . " ERROR: $msg", logger::ERROR);
			$response->errors[] = $msg;
			return $response;
		}

		$rows_processed	= 0;
		$rows_modified	= 0;

		while ($row = pg_fetch_assoc($result)) {

			$id		= $row['id'];
			$section_id	= $row['section_id'];
			$misc_json	= $row['misc'];

			// CLI process data status
			if (running_in_cli() === true) {
				common::$pdata->msg = (label::get_label('processing') ?? 'Processing') . ': ' . __METHOD__
					. ' | table: ' . $table
					. ' | id: ' . $id
					. ' | section_id: ' . $section_id;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage()
					: common::$pdata->memory;
				common::$pdata->counter++;
				print_cli(common::$pdata);
			}

			if (empty($misc_json)) {
				continue;
			}

			$misc = json_handler::decode($misc_json);
			if (empty($misc) || !isset($misc->{$component_tipo})) {
				continue;
			}

			$preset_data = $misc->{$component_tipo};

			// Check if already migrated (idempotent check)
			if (is_array($preset_data) && isset($preset_data[0]) && is_object($preset_data[0]) && isset($preset_data[0]->id)) {
				// Already has top-level id, skip
				continue;
			}

			// Transform the preset data
			$transformed = self::transform_search_preset($preset_data);

			if ($transformed === null) {
				// No changes needed
				continue;
			}

			// Update misc with transformed data
			$misc->{$component_tipo} = $transformed;
			$new_misc_json = json_handler::encode($misc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

			$update_query = "
				UPDATE $escaped_table
				SET misc = $1
				WHERE id = $2
			";

			if ($save) {
				$update_result = matrix_db_manager::exec_search($update_query, [$new_misc_json, $id]);
				if ($update_result === false) {
					$msg = "Failed to update matrix_list id $id";
					debug_log(__METHOD__ . " ERROR: $msg", logger::ERROR);
					$response->errors[] = $msg;
					continue;
				}
			}

			$rows_modified++;
			$rows_processed++;
		}

		pg_free_result($result);

		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? "Migration completed. Processed: $rows_processed, Modified: $rows_modified"
			: 'Request done with errors (' . count($response->errors) . ')';
		$response->processed	= $rows_processed;
		$response->modified	= $rows_modified;

		return $response;
	}//end migrate_search_presets_v6_to_v7



	/**
	* TRANSFORM_SEARCH_PRESET
	* Transforms a single search preset from v6 to v7 format by assigning the mandatory
	* top-level 'id' property and recursively processing nested filter operators ($and/$or).
	*
	* In v7, every preset wrapper object must carry id:1 so the UI can address it by id.
	* The method mutates the preset object in place (stdClass properties are passed by reference)
	* and wraps the result back in a single-element array to match the storage shape.
	*
	* Returns null (no-op) when:
	* - $preset_data is empty or its first element is not a stdClass.
	* - The preset already has an 'id' property (idempotent guard).
	*
	* @param array $preset_data - single-element array containing the preset stdClass.
	* @return array|null - the transformed single-element array, or null when no change is needed.
	*/
	private static function transform_search_preset(array $preset_data) : ?array {

		if (empty($preset_data) || !isset($preset_data[0])) {
			return null;
		}

		$preset = $preset_data[0];

		if (!is_object($preset)) {
			return null;
		}

		// Check if already has id (idempotent)
		if (isset($preset->id)) {
			return null;
		}

		// Add id to top-level preset
		$preset->id = 1;

		// Process value object if exists
		if (isset($preset->value) && is_object($preset->value)) {
			self::process_filter_operators($preset->value);
		}

		return [$preset];
	}//end transform_search_preset



	/**
	* PROCESS_FILTER_OPERATORS
	* Entry point for recursive filter-tree transformation.
	* Dispatches '$and' and '$or' arrays from a filter value object to process_filter_items(),
	* which handles the per-item id assignment and deeper recursion.
	*
	* Called by transform_search_preset() on the top-level 'value' object of a preset.
	*
	* @param object $filter_object - filter value object that may contain '$and' and/or '$or' arrays.
	* @return void
	*/
	private static function process_filter_operators(object $filter_object) : void {

		// Process $and array if exists
		if (isset($filter_object->{'$and'}) && is_array($filter_object->{'$and'})) {
			self::process_filter_items($filter_object->{'$and'});
		}

		// Process $or array if exists
		if (isset($filter_object->{'$or'}) && is_array($filter_object->{'$or'})) {
			self::process_filter_items($filter_object->{'$or'});
		}
	}//end process_filter_operators



	/**
	* PROCESS_FILTER_ITEMS
	* Iterates over a flat array of filter item objects, assigning id:1 to each item's
	* 'q' entries (when q is a non-null array), or removing the 'id' property (when q is null).
	* Descends into nested '$and'/'$or' arrays by calling itself recursively.
	*
	* Mutation semantics: array items are modified by reference via 'foreach … &$filter_item';
	* the caller's array is updated in place. The trailing 'unset($filter_item)' is required
	* to break the reference after the loop (standard PHP safety pattern).
	*
	* @param array $filter_items - array of filter item stdClass objects (may be deeply nested).
	* @return void
	*/
	private static function process_filter_items(array $filter_items) : void {

		foreach ($filter_items as &$filter_item) {

			if (!is_object($filter_item)) {
				continue;
			}

			// Check for nested operators ($and or $or) - recurse into them
			if (isset($filter_item->{'$and'}) && is_array($filter_item->{'$and'})) {
				self::process_filter_items($filter_item->{'$and'});
				continue; // Skip further processing for nested operator objects
			}

			if (isset($filter_item->{'$or'}) && is_array($filter_item->{'$or'})) {
				self::process_filter_items($filter_item->{'$or'});
				continue; // Skip further processing for nested operator objects
			}

			// Handle q property for regular filter items
			if (property_exists($filter_item, 'q')) {

				if ($filter_item->q !== null && is_array($filter_item->q)) {
					// q is array: add id to each item
					foreach ($filter_item->q as &$q_item) {
						if (is_object($q_item) && !isset($q_item->id)) {
							$q_item->id = 1;
						}
					}
					unset($q_item);
				} elseif ($filter_item->q === null) {
					// q is null: remove id property if exists
					if (isset($filter_item->id)) {
						unset($filter_item->id);
					}
				}
			}
		}
		unset($filter_item);
	}//end process_filter_items



}//end class v6_to_v7
