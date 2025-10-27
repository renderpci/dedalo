<?php declare(strict_types=1);
/**
* CLASS v6_to_v7
*
*
*/
class v6_to_v7 {



	/**
	* PRE_UPDATE
	* This is a pre-update, running after install new code but before Dédalo log_out of the session to go data, ontology and tools updates.
	* Update process flow:
	* 	Update code --> pre update --> log out --> log in --> update ontology --> update data --> update tools --> log out
	* The change move data from current jer_dd to new dd_ontology table.
	* Is not possible to run this update as normal data update because it change the active ontology
	* The new code only call to `dd_ontology` table, therefore is necessary to run it before the update log-out
	* The login process needs a valid ontology nodes in `dd_ontology` at least with the `dd` tld
	* If this process fails, Dédalo will not work!
	* @return bool
	*/
	public static function pre_update() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Pre update has failed';
			$response->errors	= [];

		// 1.  add new columns to jer_dd
		$result = v6_to_v7::expand_jer_dd_with_new_schema();

		if($result== false){
			return $response;
		}

		// 2. fill the new columns with the compatible data
		$result = v6_to_v7::fill_new_columns_in_jer_dd();

		if($result== false){
			return $response;
		}

		// 3. Change the relations data of jer_dd, to be coherent
		$result = v6_to_v7::refactor_jer_dd_relations();

		if($result== false){
			return $response;
		}

		// 4. Create the new `dd_ontology` table and set the columns with correct data
		$result = v6_to_v7::create_dd_ontology_table();

		if($result== false){
			return $response;
		}

		$response->result = true;
		$response->msg = 'Pre update was done';


		return $response;
	}//end pre_update



	/**
	* EXPAND_JER_DD_WITH_NEW_SCHEMA
	* Change the jer_dd structure in DDBB adding new columns with different names and data type
	* new map:
	* 	'terminoID'			=> 'tipo',
	* 	'modelo'			=> 'model_tipo',
	* 	'esmodelo'			=> 'is_model',
	* 	'esdescriptor'		=> 'is_descriptor',
	* 	'traducible'		=> 'translatable',
	* 	'norden'			=> 'order',
	* 	'relaciones'		=> 'relations'
	* @return bool
	*/
	public static function expand_jer_dd_with_new_schema() : bool {

		$sql_query = sanitize_query ('
			ALTER TABLE "jer_dd"
				ADD COLUMN IF NOT EXISTS "tipo" character varying(32) NULL,
				ADD COLUMN IF NOT EXISTS "model_tipo" character varying(8) NULL,
				ADD COLUMN IF NOT EXISTS "is_model" boolean NULL,
				ADD COLUMN IF NOT EXISTS "is_translatable" boolean NULL,
				ADD COLUMN IF NOT EXISTS "order_number" numeric(4,0) NULL,
				ADD COLUMN IF NOT EXISTS "relations" jsonb NULL;
		');

		$result 	= pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			$msg = "Failed Update jer_dd with a new schema ";
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
	* Collect data and transform from existing columns and fill the new schema with new data.
	* 'si' -> true
	* 'no' -> false
	* @return bool
	*/
	public static function fill_new_columns_in_jer_dd() {

		$sql_query = sanitize_query ('
			UPDATE "jer_dd"
				SET tipo 			= "terminoID",
					model_tipo 		= modelo,
					order_number	= norden,
					is_model 		= CASE WHEN esmodelo = \'si\' THEN true ELSE false END,
					is_translatable	= CASE WHEN traducible = \'si\' THEN true ELSE false END;
		');

		$result 	= pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			$msg = "Failed add new data into the new schema of jer_dd ";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end fill_new_columns_in_jer_dd



	/**
	* REFACTOR_JER_DD_relations
	* 'relaciones' => 'relations'
	* Unification of relations data. In some rows, relations is an object with the model as key, in other the key is the string 'tipo'
	* As model will not use anymore, all data will change to a object with 'tipo' string as key.
	* [{
	* 	"tipo": "dd64"
	* }]
	* @return bool
	*/
	public static function refactor_jer_dd_relations() : bool {

		// jer_dd. delete terms (jer_dd)
			$sql_query = '
				SELECT * FROM "jer_dd";
			';
			$jer_dd_result 	= pg_query(DBi::_getConnection(), $sql_query);

		// iterate jer_dd_result row
		while($row = pg_fetch_assoc($jer_dd_result)) {

			$relaciones	= $row['relaciones'];
			$id			= $row['id'];

			$relations = json_decode($relaciones) ?? [];

			$ar_relations = [];
			foreach ($relations as $item) {
				foreach ($item as $value) {
					$relation = new stdClass();
						$relation->tipo = $value;
					$ar_relations[] = $relation;
				}
			};

			$new_relation = ( empty($ar_relations) ) ? null : $ar_relations;

			$string_relation_object = json_encode($new_relation) ?? '';

			$strQuery	= "UPDATE \"jer_dd\" SET relations = $1 WHERE id = $2 ";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $string_relation_object, $id ));
			if($result===false) {
				$msg = "Failed Update section_data (jer_dd) $id";
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
	* @return bool
	*/
	public static function create_dd_ontology_table() : bool {

		$sql_query = sanitize_query ('
			CREATE TABLE IF NOT EXIST dd_ontology AS
				SELECT id, tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, propiedades
			FROM jer_dd;

			COMMENT ON TABLE "dd_ontology" IS  \'Active ontology\';

			CREATE SEQUENCE IF NOT EXISTS "dd_ontology_id_seq" OWNED BY "dd_ontology"."id";

			ALTER TABLE "dd_ontology"
			ALTER "id" TYPE integer,
			ALTER "id" SET DEFAULT nextval(\'dd_ontology_id_seq\'),
			ALTER "id" SET NOT NULL;

			ALTER TABLE "dd_ontology"
			ADD CONSTRAINT dd_ontology_id_pkey
			PRIMARY KEY ( id );

			COMMENT ON COLUMN dd_ontology.id IS \'Unique table identifier\';
			COMMENT ON COLUMN dd_ontology.tipo IS \'Ontology identifier (ontology TLD | ontology instance ID, e.g., oh1 = Oral History)\';
			COMMENT ON COLUMN dd_ontology.parent IS \'Ontology identifier parent (ontology TLD | ontology instance ID, e.g., tch1 = Tangible Cultural Heritage -> Objects)\';
			COMMENT ON COLUMN dd_ontology.term IS \'Ontology node names in multiple languages\';
			COMMENT ON COLUMN dd_ontology.model IS \'Ontology model name as section, componnet_portal, etc.\';
			COMMENT ON COLUMN dd_ontology.order_number IS \'Ontology node position order\';
			COMMENT ON COLUMN dd_ontology.relations IS \'Direct connections between nodes, unidirectional\';
			COMMENT ON COLUMN dd_ontology.tld IS \'Ontology name space\';
			COMMENT ON COLUMN dd_ontology.properties IS \'Ontology node definition\';
			COMMENT ON COLUMN dd_ontology.model_tipo IS \'Ontology identifier for the node type,  e.g., dd6 = section\';
			COMMENT ON COLUMN dd_ontology.is_model IS \'Boolean to identify if the node is a type of nodes\';
			COMMENT ON COLUMN dd_ontology.is_translatable IS \'Boolean to identify if the node is a multilingual node\';
			COMMENT ON COLUMN dd_ontology.propiedades IS \'V5 properties, DEPRECATED\';

			-- Optionally drop the old one and rename
			-- DROP TABLE IF EXISTS "jer_dd" CASCADE;
			-- DROP SEQUENCE IF EXISTS jer_dd_id_seq;
		');

		$result 	= pg_query(DBi::_getConnection(), $sql_query);

		if($result===false) {
			$msg = "Failed add new data into the new schema of jer_dd ";
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
	* Converts v6 data to v7 data format
	* @param array $ar_tables
	* @param bool $save. On false, only data review is made.
	* @return object $response
	*/
	public static function reformat_matrix_data( array $ar_tables, bool $save ) : object {

		// ALTER TABLE "matrix" ADD "data" jsonb NULL;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " reformat_matrix_data - tables: " . json_encode($ar_tables) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// CLI process data
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
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use ($response, $save, $conn) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$section_id		=  $row['section_id'] ?? '';

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': reformat_matrix_data'
							. ' | table: '			. $table
							. ' | id: '				. $id .' - ' . $max
							. ' | section_tipo: '	. $section_tipo
							. ' | section_id: '		. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// datos. Common matrix tables
				if( isset($datos) ){

					$new_matrix_data = new stdClass();

					$column_data				= new stdClass();
					$column_relation_search		= new stdClass();
					$column_relation			= new stdClass();
					$column_string				= new stdClass();
					$column_date				= new stdClass();
					$column_number				= new stdClass();
					$column_geo					= new stdClass();
					$column_media				= new stdClass();
					$column_iri					= new stdClass();
					$column_misc				= new stdClass();
					$column_counters			= new stdClass();

					$value_type_map = v6_to_v7::get_value_type_map();

					// datos properties
					foreach ($datos as $datos_key => $datos_value) {

						if( empty($datos_value) ){
							continue;
						}

						switch ($datos_key) {

							case 'relations_search':
							case 'relations':

								// update relations array
								$relations = $datos_value ?? [];
								foreach ($relations as $locator) {

									// check locator from_component_tipo
									if( !isset($locator->from_component_tipo) ){
										$locator_string = json_encode($locator);
										debug_log(__METHOD__
											. " **-------- ERROR locator without from_component_tipo --------** " . PHP_EOL
											. " section tipo: ". $section_tipo . PHP_EOL
											. " section id: ". $section_id . PHP_EOL
											. " table: ". $table . PHP_EOL
											. " locator: ". $locator_string
											, logger::ERROR
										);
										$response->errors[] = "Bad component data (locator without from_component_tipo property). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' locator: '$locator_string'";
										continue;
									}

									$target = ($datos_key === 'relations_search') ? $column_relation_search : $column_relation;
									if (!isset($target->{$locator->from_component_tipo})) {
										$target->{$locator->from_component_tipo} = [];
									}
									$target->{$locator->from_component_tipo}[] = $locator;
								}
								break;

							case 'components':

								// add literals property
								$new_matrix_data->literals = new stdClass();

								// update components object
								$literal_components = $datos_value ?? [];
								foreach ($literal_components as $literal_tipo => $literal_value) {

									$model = ontology_node::get_model_by_tipo($literal_tipo);

									// skip v5 data
									if( in_array($model, ['component_filter','component_section_id']) ){
										continue;
									}

									// literal without v6 'dato' property case
									if( !isset($literal_value->dato) ){
										debug_log(__METHOD__
											. " **-------- ERROR Literal without v6 'dato' property --------** " . PHP_EOL
											. " model: " . $model. PHP_EOL
											. " component tipo: ". $literal_tipo . PHP_EOL
											. " section tipo: ". $section_tipo . PHP_EOL
											. " section id: ". $section_id . PHP_EOL
											. " table: ". $table . PHP_EOL
											. " literal_value: ". json_encode( $literal_value ). PHP_EOL
											. " literal_value type: " . gettype( $literal_value )
											, logger::ERROR
										);
										$response->errors[] = "Bad component data (literal without v6 'dato' property). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' component_tipo: '$literal_tipo'";
										continue;
									}

									$old_data = $literal_value->dato;
									foreach ($old_data as $lang => $ar_value) {

										// Ignore empty component values
										if( !isset($ar_value) || empty($ar_value) ){
											debug_log(__METHOD__
												. " **-------- IGNORED Data without information --------** " . PHP_EOL
												. " model: " . $model. PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " table: ". $table . PHP_EOL
												. " value: ". json_encode( $ar_value ). PHP_EOL
												. " value type: " . gettype( $ar_value )
												, logger::WARNING
											);
											continue;
										}

										// Not array cases
										if( !is_array($ar_value) ){
											// ignore old recycled component order data (hierarchy42)
											if($literal_tipo === 'hierarchy42' && $lang==='lg-nolan'){
												continue;
											}
											// ignore TinyMCE empty data values
											if($ar_value==='<br data-mce-bogus="1">' || $ar_value==='[<br data-mce-bogus="1">]'){
												continue;
											}
											// ignore not used anymore component_layout dd23
											if($literal_tipo === 'dd23'){
												continue;
											}
											debug_log(__METHOD__
												. " <<-------- CHANGED Data with wrong format: is not array -------->> " . PHP_EOL
												. " model: " . $model. PHP_EOL
												. " component tipo: ". $literal_tipo . PHP_EOL
												. " section tipo: ". $section_tipo . PHP_EOL
												. " section id: ". $section_id . PHP_EOL
												. " table: ". $table . PHP_EOL
												. " value: ". json_encode( $ar_value ). PHP_EOL
												. " value type: " . gettype( $ar_value )
												, logger::WARNING
											);
											$ar_value = [$ar_value];
										}

										// safe array keys
										$ar_value = array_values($ar_value);

										$value_key = 0;
										foreach ($ar_value as $key => $value) {

											// Ignore null component values
											if( !isset($value) ){
												debug_log(__METHOD__
													. " <<-------- IGNORED empty value. -------->> " . PHP_EOL
													. " model: " . $model. PHP_EOL
													. " component tipo: ". $literal_tipo . PHP_EOL
													. " section tipo: ". $section_tipo . PHP_EOL
													. " section id: ". $section_id . PHP_EOL
													. " table: ". $table . PHP_EOL
													. " value: ". json_encode( $value ) . PHP_EOL
													. " value type: " . gettype( $value ) . PHP_EOL
													. " ar_value: ". json_encode( $ar_value ) . PHP_EOL
													. " key: ". $key
													, logger::WARNING
												);
												continue;
											}

											// empty case. Ignore empty values
											if (empty($value) && $value!='0') {
												continue;
											}

											// empty media. Skip save empty media values
											if (json_encode($value)==='{"files_info":[]}') {
												continue;
											}

											// old media v5 value
											if (is_object($value) &&
												isset($value->component_tipo) && $value->component_tipo === $literal_tipo &&
												isset($value->section_tipo) && $value->section_tipo === $section_tipo &&
												isset($value->section_id) && $value->section_id == $section_id
												) {
												continue;
											}

											$value_key++;

											$column_counters->{$literal_tipo} = $value_key;

											$typology = $value_type_map->{$model} ?? DEDALO_VALUE_TYPE_MISC;

											// new literal object with value
											$new_literal_obj = new stdClass();
												$new_literal_obj->id		= $value_key; // starts from 1
												$new_literal_obj->lang		= $lang;
												$new_literal_obj->value		= $value;

											switch ($typology) {
												case DEDALO_VALUE_TYPE_STRING:

													// set component path if not already set
													if (!property_exists($column_string, $literal_tipo)) {
														$column_string->{$literal_tipo} = [];
													}

													$column_string->{$literal_tipo}[] = $new_literal_obj;
													break;

												case DEDALO_VALUE_TYPE_NUMBER:

													// set component path if not already set
													if (!property_exists($column_number, $literal_tipo)) {
														$column_number->{$literal_tipo} = [];
													}

													$column_number->{$literal_tipo}[] = $new_literal_obj;
													break;

												case DEDALO_VALUE_TYPE_MISC:

													// set component path if not already set
													if (!property_exists($column_misc, $literal_tipo)) {
														$column_misc->{$literal_tipo} = [];
													}

													$column_misc->{$literal_tipo}[] = $new_literal_obj;
													break;

												case DEDALO_VALUE_TYPE_DATE:

													if(is_object($value)){
														$date_literal_obj = $value;
															$date_literal_obj->id	= $value_key;
															$date_literal_obj->lang	= $lang;

														// set component path if not already set
														if (!property_exists($column_date, $literal_tipo)) {
															$column_date->{$literal_tipo} = [];
														}

														$column_date->{$literal_tipo}[] = $date_literal_obj;
													}else{
														$value_string = json_encode( $value );
														debug_log(__METHOD__
															. " **-------- ERROR component value out of format, is an not object --------** " . PHP_EOL
															. " section tipo: ". $section_tipo . PHP_EOL
															. " section id: ". $section_id . PHP_EOL
															. " table: ". $table . PHP_EOL
															. " value type: " . gettype( $value ) . PHP_EOL
															. " value: ". $value_string
															, logger::ERROR
														);
														$response->errors[] = "Bad component data (invalid component data, it is not an object). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' tipo: '$literal_tipo' value: '$value_string'";
														continue 2;
													}
													break;

												case DEDALO_VALUE_TYPE_MEDIA:

													if(is_object($value)){
														$media_literal_obj = $value;
															$media_literal_obj->id		= $value_key;
															$media_literal_obj->lang	= $lang;

														// set component path if not already set
														if (!property_exists($column_media, $literal_tipo)) {
															$column_media->{$literal_tipo} = [];
														}

														$column_media->{$literal_tipo}[] = $media_literal_obj;
													}else{
														$value_string = json_encode( $value );
														debug_log(__METHOD__
															. " **-------- ERROR component value out of format, is not an object --------** " . PHP_EOL
															. " section tipo: ". $section_tipo . PHP_EOL
															. " section id: ". $section_id . PHP_EOL
															. " table: ". $table . PHP_EOL
															. " value type: " . gettype( $value ) . PHP_EOL
															. " value: ". $value_string
															, logger::ERROR
														);
														$response->errors[] = "Bad component data (invalid component data, it is not an object). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' tipo: '$literal_tipo' value: '$value_string'";
														continue 2;
													}
													break;

												case DEDALO_VALUE_TYPE_IRI:

													if(is_object($value)){
														$iri_literal_obj = $value;
															$iri_literal_obj->id	= $value_key;
															$iri_literal_obj->lang	= $lang;

														// set component path if not already set
														if (!property_exists($column_iri, $literal_tipo)) {
															$column_iri->{$literal_tipo} = [];
														}

														$column_iri->{$literal_tipo}[] = $iri_literal_obj;
													}else{
														$value_string = json_encode( $value );
														debug_log(__METHOD__
															. " **-------- ERROR component value out of format, is not an object --------** " . PHP_EOL
															. " section tipo: ". $section_tipo . PHP_EOL
															. " section id: ". $section_id . PHP_EOL
															. " table: ". $table . PHP_EOL
															. " value type: " . gettype( $value ) . PHP_EOL
															. " value: ". $value_string
															, logger::ERROR
														);
														$response->errors[] = "Bad component data (invalid component data, it is not an object). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' tipo: '$literal_tipo' value: '$value_string'";
														continue 2;
													}
													break;

												case DEDALO_VALUE_TYPE_GEO:

													if(is_object($value)){
														$geo_literal_obj = $value;
															$geo_literal_obj->id	= $value_key;
															$geo_literal_obj->lang	= $lang;

														// set component path if not already set
														if (!property_exists($column_geo, $literal_tipo)) {
															$column_geo->{$literal_tipo} = [];
														}

														$column_geo->{$literal_tipo}[] = $geo_literal_obj;


													}else{
														$value_string = json_encode( $value );
														debug_log(__METHOD__
															. " **-------- ERROR component value out of format, is not an object --------** " . PHP_EOL
															. " section tipo: ". $section_tipo . PHP_EOL
															. " section id: ". $section_id . PHP_EOL
															. " table: ". $table . PHP_EOL
															. " value type: " . gettype( $value ) . PHP_EOL
															. " value: ". $value_string
															, logger::ERROR
														);
														$response->errors[] = "Bad component data (invalid component data, it is not an object). table: '$table' section_tipo: '$section_tipo' section_id: '$section_id' tipo: '$literal_tipo' value: '$value_string'";
														continue 2;
													}
													break;
											}

											// temporal add info for easy debug in beta 7
												// if (isset($new_literal_obj->literal_value->info)) {
												// 	$new_literal_obj->info = $new_literal_obj->literal_value->info;
												// }else{
												// 	$label = ontology_node::get_term_by_tipo($literal_tipo);
												// 	$new_literal_obj->info = "$label [$model]";
												// }
										}
									}
								}//end reach ($literal_components as $literal_tipo => $literal_value)
								break;

							default:

								// update other properties like section_tipo, section_real_tipo, etc.
								$column_data->{$datos_key} = $datos_value;
								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded				= ( empty(get_object_vars($column_data)) ) ? null : json_encode($column_data);
					$section_relation_encoded			= ( empty(get_object_vars($column_relation)) ) ? null : json_encode($column_relation);
					$section_string_encoded				= ( empty(get_object_vars($column_string)) ) ? null : json_encode($column_string);
					$section_date_encoded				= ( empty(get_object_vars($column_date)) ) ? null : json_encode($column_date);
					$section_iri_encoded				= ( empty(get_object_vars($column_iri)) ) ? null : json_encode($column_iri);
					$section_geo_encoded				= ( empty(get_object_vars($column_geo)) ) ? null : json_encode($column_geo);
					$section_number_encoded				= ( empty(get_object_vars($column_number)) ) ? null : json_encode($column_number);
					$section_media_encoded				= ( empty(get_object_vars($column_media)) ) ? null : json_encode($column_media);
					$section_misc_encoded				= ( empty(get_object_vars($column_misc)) ) ? null : json_encode($column_misc);
					$section_relation_search_encoded	= ( empty(get_object_vars($column_relation_search)) ) ? null : json_encode($column_relation_search);
					$section_counters_encoded			= ( empty(get_object_vars($column_counters)) ) ? null : json_encode($column_counters);

					$escaped_table = pg_escape_identifier($conn, $table);

					$strQuery = "
						UPDATE {$escaped_table}
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
							counters = $11
						WHERE id = $12
					";

					if ($save) {

						// With prepared statement
						// Prepared statement name is unique per table
						$stmt_name = __METHOD__ . $table;
						if (!isset(DBi::$prepared_statements[$stmt_name])) {
							pg_prepare(
								$conn,
								$stmt_name,
								$strQuery
							);
							// Set the statement as existing.
							DBi::$prepared_statements[$stmt_name] = true;
						}
						$result = pg_execute(
							$conn,
							$stmt_name,
							[
								$section_data_encoded,
								$section_relation_encoded,
								$section_string_encoded,
								$section_date_encoded,
								$section_iri_encoded,
								$section_geo_encoded,
								$section_number_encoded,
								$section_media_encoded,
								$section_misc_encoded,
								$section_relation_search_encoded,
								$section_counters_encoded,
								$id
							]
						);

					}else{

						// 1. Start a transaction
						pg_query($conn, "BEGIN");

						// 2. Perform the update (in the transaction)
						$result	= pg_query_params(
							$conn,
							$strQuery,
							[
								$section_data_encoded,
								$section_relation_encoded,
								$section_string_encoded,
								$section_date_encoded,
								$section_iri_encoded,
								$section_geo_encoded,
								$section_number_encoded,
								$section_media_encoded,
								$section_misc_encoded,
								$section_relation_search_encoded,
								$section_counters_encoded,
								$id
							]
						);

						// 3. Rollback (undo changes)
						pg_query($conn, "ROLLBACK");
					}

					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						$response->errors[] = "Error on SQL execution. strQuery: '$strQuery'";

						$response->msg = 'Error on SQL execution. Stop function execution';
						return $response;
					}
				}//end if( isset($datos) )
			}//end anonymous function
		);//end update::tables_rows_iterator

		$response->result	= empty($response->errors);
		$response->msg		= empty($response->errors)
			? 'Request done successfully'
			: 'Request done with errors';


		return $response;
	}//end reformat_matrix_data



	/**
	* DELETE_V6_DB_INDEXES
	* Remove database indexes to create new ones.
	* @return
	*/
	public static function delete_v6_db_indexes() : bool {

		$all_indexes = DBi::get_indexes();

		$unique_indexes_to_delete = [
			// 'terminoID_unique',
			// 'tld',
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

			$to_search = "create unique index";
			$found_unique = stripos( $index_object->indexdef, $to_search);
			$found_fixed = in_array($index_object->indexname, $unique_indexes_to_delete);

			if( $found_unique !== false && $found_fixed === false ){
				continue;
			}

			if( $found_fixed === true ){
				$constraints = DBi::get_constraint_name_from_index( $index_object->indexname );

				if( !empty($constraints) ){

					foreach ($constraints as $constraint_item) {

						$sql_query	= "ALTER TABLE {$constraint_item->table_name} DROP CONSTRAINT IF EXISTS {$constraint_item->constraint_name};";
						$result		= pg_query(DBi::_getConnection(), $sql_query);
					}
				}
			}

			$sql_query	= "DROP INDEX IF EXISTS {$index_object->schemaname}.\"{$index_object->indexname}\" CASCADE;";
			$result		= pg_query(DBi::_getConnection(), $sql_query);

			if($result===false) {
				die();
				$msg = "Failed to delete indexes in PostgreSQL!";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					." Index failed: $sql_query "
					, logger::ERROR
				);
				return false;
			}
		}


		$all_functions = DBi::get_functions();

		foreach ($all_functions as $function_object) {
			$sql_query 	= "DROP FUNCTION IF EXISTS {$function_object->schemaname}.\"{$function_object->functionname}\" CASCADE;";
			$result		= pg_query(DBi::_getConnection(), $sql_query);

			if($result===false) {
				$msg = "Failed to delete functions in PostgreSQL!";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					." Function failed: $sql_query "
					, logger::ERROR
				);
				return false;
			}
		}

		return true;
	}//end delete_v6_db_indexes


	/**
	* RENAME_CONSTRAINT
	* @return
	*/
	public static function rename_constraint() {

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

		foreach ($ar_constraint as $matrix_table => $ar_constraint_to_change) {

			$sql_query 	= "ALTER TABLE {$matrix_table} DROP CONSTRAINT IF EXISTS {$ar_constraint_to_change[0]};";
			$result		= pg_query(DBi::_getConnection(), $sql_query);

			if($result===false) {
				$msg = "Failed to delete constraints in PostgreSQL!";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					." Function failed: $sql_query "
					, logger::ERROR
				);
				return false;
			}

			$sql_query 	= "ALTER TABLE IF EXISTS {$matrix_table} ADD CONSTRAINT {$ar_constraint_to_change[1]} PRIMARY KEY (id) ;";
			$result		= pg_query(DBi::_getConnection(), $sql_query);

			if($result===false) {
				$msg = "Failed to create constraints in PostgreSQL!";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					." Function failed: $sql_query "
					, logger::ERROR
				);
				return false;
			}
		}

	}//end rename_constraint



	/**
	* RECREATE_DB_ASSETS
	* Force to re-build the PostgreSQL main indexes, extensions and functions
	* @return object $response
	*/
	public static function recreate_db_assets() : object {

		$response = new stdClass();
			$response->result	= new stdClass();
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;


		// CLI process data
			$proces_name = 'extensions';
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->counter = 0;
				common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': recreate_db_assets'	. ' | '.$proces_name;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage() // update memory information once every 5000 items
					: common::$pdata->memory;
				common::$pdata->counter++;
				// send to output
				print_cli(common::$pdata);
			}
		//extensions
		$response_extensions	= db_tasks::create_extensions();
			$response->result->extensions	= $response_extensions->result;
			$response->errors				= $response_extensions->errors;
		//constraints
			$proces_name = 'constraints';
			if ( running_in_cli()===true ) {
				common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': recreate database assets'	. ' | '.$proces_name;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage() // update memory information once every 5000 items
					: common::$pdata->memory;
				common::$pdata->counter++;
				// send to output
				print_cli(common::$pdata);
			}
		$response_constaints	= db_tasks::rebuild_constaints();
			$response->result->constaints	= $response_constaints->result;
			$response->errors				= array_merge($response->errors, $response_constaints->errors);
		// functions
			$proces_name = 'functions';
			if ( running_in_cli()===true ) {
				common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': recreate database assets'	. ' | '.$proces_name;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage() // update memory information once every 5000 items
					: common::$pdata->memory;
				common::$pdata->counter++;
				// send to output
				print_cli(common::$pdata);
			}
		$response_functions		= db_tasks::rebuild_functions();
			$response->result->functions	= $response_functions->result;
			$response->errors[]				= array_merge($response->errors, $response_functions->errors);
		// indexes
			$proces_name = 'indexes';
			if ( running_in_cli()===true ) {
				common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': recreate database assets'	. ' | '.$proces_name;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage() // update memory information once every 5000 items
					: common::$pdata->memory;
				common::$pdata->counter++;
				// send to output
				print_cli(common::$pdata);
			}
		$response_indexes		= db_tasks::rebuild_indexes();
			$response->result->indexes		= $response_indexes->result;
			$response->errors[]				= array_merge($response->errors, $response_indexes->errors);
		// maintenance
			$proces_name = 'maintenance';
			if ( running_in_cli()===true ) {
				common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': recreate database assets'	. ' | '.$proces_name;
				common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
					? dd_memory_usage() // update memory information once every 5000 items
					: common::$pdata->memory;
				common::$pdata->counter++;
				// send to output
				print_cli(common::$pdata);
			}
		$response_maintenance	= db_tasks::exec_maintenance();
			$response->result->maintenance	= $response_maintenance->result;
			$response->errors[]				= array_merge($response->errors, $response_maintenance->errors);


		return $response;
	}//end recreate_db_assets




}//end class v6_to_v7
