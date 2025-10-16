<?php declare(strict_types=1);
require_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* CLASS TRANSFORM_DATA
* This class is used to transform existing data, e.g. to migrate
* portals with dataframe v5 to other models such as Bibliographic references
*
*/
class transform_data {



	/**
	* ADD_PORTAL_LEVEL
	* Transform component portal data from DS configuration on one level to a
	* bibliographic references like model, with a sub-level in between
	* @param object $options
	*  sample:
		* {
		*		"original" : [
		*			{
		*				"model" : "section",
		*				"tipo" : "numisdata3",
		*				"role" : "section",
		*				"info" : "Types"
		*			},
		*			{
		*				"model" : "component_portal",
		*				"tipo" : "numisdata261",
		*				"role" : "source_portal",
		*				"info" : "Creators deprecated"
		*			},
		*			{
		*				"model" : "component_portal",
		*				"tipo" : "numisdata1362",
		*				"role" : "target_portal",
		*				"info" : "Creators (new)"
		*			},
		*			{
		*				"model" : "component_portal",
		*				"tipo" : "numisdata887",
		*				"role" : "ds",
		*				"info" : "Role"
		*			}
		*		],
		*		"new" : [
		*			{
		*				"model" : "section",
		*				"tipo" : "rsc1152",
		*				"role" : "section",
		*				"info" : "People references"
		*			},
		*			{
		*				"model" : "component_portal",
		*				"tipo" : "rsc1156",
		*				"role" : "target_portal",
		*				"info" : "People"
		*			},
		*			{
		*				"model" : "component_portal",
		*				"tipo" : "rsc1155",
		*				"role" : "ds",
		*				"info" : "Role"
		*			}
		*		],
		*		"delete_old_data" : true,
		*	}
	* @return object $response
	*/
	public static function add_portal_level( object $options ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// options
			$tld				= $options->tld; // string like 'numisdata'
			$original			= $options->original ?? []; // array of object
			$new				= $options->new ?? []; // array of objects
			$delete_old_data	= $options->delete_old_data; // bool true by default

		// check Ontology
			if (!in_array($tld, DEDALO_PREFIX_TIPOS)) {
				$response->result	= true;
				$response->msg		= 'Script ignored. Your installation does not use this TLD: '.$tld;
				return $response;
			}

		// check Ontology tipos before do anything
			foreach ([...$original, ...$new] as $item) {
				$current_model = RecordObj_dd::get_modelo_name_by_tipo($item->tipo, true);
				if ($current_model!==$item->model) {
					$response->msg = 'Invalid current_model from tipo: '.$item->tipo.' Check your Ontology for configuration errors';
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' calculated model: ' . to_string($current_model) . PHP_EOL
						. ' item: ' . to_string($item)
						, logger::ERROR
					);
					return $response;
				}
			}

		// short vars
			// original (source section)
				$original_section_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='section';
				})->tipo;
				$original_component_portal_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='source_portal';
				})->tipo;
				$original_component_portal_ds_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='ds';
				})->tipo;
				$original_component_portal_target_tipo = array_find($original, function($el){
					return isset($el->role) && $el->role==='target_portal';
				})->tipo;

			// new (target section)
				$new_section_tipo = array_find($new, function($el){
					return $el->model==='section';
				})->tipo;
				$new_component_portal_tipo = array_find($new, function($el){
					return isset($el->role) && $el->role==='target_portal';
				})->tipo;
				$new_component_portal_ds_tipo = array_find($new, function($el){
					return isset($el->role) && $el->role==='ds';
				})->tipo;

			$table = common::get_matrix_table_from_tipo($original_section_tipo);
			if (empty($table)) {
				$response->msg = 'Invalid table from tipo: '.$original_section_tipo.'. Check your Ontology for configuration errors';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' original_section_tipo: ' . to_string($original_section_tipo)
					, logger::ERROR
				);
				return $response;
			}

			$created_records = 0;

		// section records
			$result	= JSON_RecordDataBoundObject::search_free(
				"SELECT id, section_id, datos FROM $table WHERE section_tipo = '$original_section_tipo' ORDER BY section_ID ASC"
			);
			// iterate resource row
			while($row = pg_fetch_assoc($result)) {

				$section_id	= (int)$row['section_id'];
				$datos		= json_handler::decode($row['datos']);
				$relations	= $datos->relations ?? [];

				// empty case
				if (empty($relations)) {
					continue;
				}

				// original_locators
					$original_locators = array_filter($relations, function($el) use($original_component_portal_tipo) {
						return $el->from_component_tipo === $original_component_portal_tipo;
					});
					// empty case
					if (empty($original_locators)) {
						continue;
					}

				// original_ds_locators
					$original_ds_locators = array_filter($relations, function($el) use($original_component_portal_ds_tipo) {
						return $el->from_component_tipo === $original_component_portal_ds_tipo;
					});

				// iterate original_locators
					foreach ($original_locators as $current_locator) {

						// create new record on target section
							$new_section = section::get_instance(
								null, // string|null section_id
								$new_section_tipo // string section_tipo
							);
							$new_section_id = $new_section->Save();

						// update counter
							$created_records++;

						// append new locator to new portal. sample: add created locator to portal 'Creators'
							$original_component_portal_target = component_common::get_instance(
								RecordObj_dd::get_modelo_name_by_tipo($original_component_portal_target_tipo,true), // string model
								$original_component_portal_target_tipo, // string tipo
								$section_id, // string section_id
								'list', // string mode
								DEDALO_DATA_NOLAN, // string lang
								$original_section_tipo // string section_tipo
							);

							$new_locator = new locator();
								$new_locator->set_section_tipo($new_section_tipo);
								$new_locator->set_section_id($new_section_id);
								$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

							$original_component_portal_target->add_locator_to_dato($new_locator);
							// save component
							$original_component_portal_target->Save();

						// target section : add elements. sample: add current emperor to portal 'People' in the new section
							$new_component_portal = component_common::get_instance(
								RecordObj_dd::get_modelo_name_by_tipo($new_component_portal_tipo,true), // string model
								$new_component_portal_tipo, // string tipo
								$new_section_id, // string section_id
								'list', // string mode
								DEDALO_DATA_NOLAN, // string lang
								$new_section_tipo // string section_tipo
							);

							$new_locator = new locator();
								$new_locator->set_section_tipo($current_locator->section_tipo);
								$new_locator->set_section_id($current_locator->section_id);
								$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

							$new_component_portal->add_locator_to_dato($new_locator);
							// save component
							$new_component_portal->Save();

						// ds
							$current_ds_locators = array_filter($original_ds_locators, function($el) use($current_locator) {
								return $el->section_id_key == $current_locator->section_id;
							});
							// empty case
							if (empty($current_ds_locators)) {
								continue;
							}
							foreach ($current_ds_locators as $ds_locator) {

								// new_component_portal_ds. sample: add role 'Series arrangement' to portal 'Role' in the new section
								$new_component_portal_ds = component_common::get_instance(
									RecordObj_dd::get_modelo_name_by_tipo($new_component_portal_ds_tipo,true), // string model
									$new_component_portal_ds_tipo, // string tipo
									$new_section_id, // string section_id
									'list', // string mode
									DEDALO_DATA_NOLAN, // string lang
									$new_section_tipo // string section_tipo
								);

								$new_locator = new locator();
									$new_locator->set_section_tipo($ds_locator->section_tipo);
									$new_locator->set_section_id($ds_locator->section_id);
									$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

								$new_component_portal_ds->add_locator_to_dato($new_locator);
								// save component
								$new_component_portal_ds->Save();
							}

					}//end foreach ($original_locators as $current_locator)

				// delete_old_data (default is true). Remove previous portal locators and DS locators
					if ($delete_old_data===true) {
						self::delete_relations_dato(
							$original_section_tipo,
							$section_id,
							[...$original_locators, ...$original_ds_locators] // locators_to_remove
						);
					}
			}//end while($row = pg_fetch_assoc($result))

		// response
			$response->result	= true;
			$response->msg		= 'OK. created_records: ' . $created_records;


		return $response;
	}//end add_portal_level



	/**
	* DELETE_RELATIONS_DATO
	* Removes a portion of the section relations in raw mode
	* This does not generate Time Machine or Activity log
	* @param string $section_tipo
	* @param string|int $section_id
	* @param array $locators_to_remove
	* @return bool
	*/
	private static function delete_relations_dato(string $section_tipo, string|int $section_id, array $locators_to_remove) : bool {

		// Retrieve the matrix table associated with the given section_tipo.
		$table = common::get_matrix_table_from_tipo($section_tipo);
		if (empty($table)) {
			debug_log(__METHOD__
				. ' Invalid table from tipo. Check your Ontology for configuration errors' . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo)
				, logger::ERROR
			);
			return false;
		}

		$current_result	= JSON_RecordDataBoundObject::search_free(
			"SELECT id, section_id, datos FROM $table WHERE section_tipo = '$section_tipo' AND  section_id = $section_id"
		);
		while($row = pg_fetch_assoc($current_result)) {

			$id		= $row['id'];
			$datos	= json_handler::decode( $row['datos'] );

			// relations empty case
				if (empty($datos) && empty($datos->relations)) {
					continue;
				}

			$clean_relations = [];
			foreach ($datos->relations as $locator) {

				$match = locator::in_array_locator($locator, $locators_to_remove, ['section_id','section_tipo']);
				if ($match===true) {
					continue; // skip locator
				}

				$clean_relations[] = $locator;
			}

			if (count($datos->relations)===count($clean_relations)) {
				debug_log(__METHOD__
					." Ignored delete action because nothing is changed. id: $id ($section_tipo-$section_id)"
					, logger::ERROR
				);
				continue;
			}

			// overwrite relations
			$datos->relations = $clean_relations;

			$section_data_encoded = json_handler::encode($datos);

			// save record
			$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
			if($result===false) {
				$msg = "Failed Update section_data id: $id ($section_tipo-$section_id)";
				debug_log(__METHOD__
					." ERROR: $msg "
					, logger::ERROR
				);
				return false;
			}else{
				debug_log(__METHOD__
					." OK. record updated id: $id ($section_tipo-$section_id)"
					, logger::WARNING
				);
				return true;
			}
		}

		// No records found for the given section_tipo, section_id.
		return false;
	}//end delete_relations_dato



	/**
	* UPDATE_DATAFRAME_TO_V6_1
	* @return bool
	*/
	public static function update_dataframe_to_v6_1() : bool {

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			// 'matrix_activities',
			// 'matrix_dataframe',
			// 'matrix_dd',
			// 'matrix_hierarchy',
			// 'matrix_hierarchy_main',
			// 'matrix_indexations',
			// 'matrix_langs',
			// 'matrix_layout',
			// 'matrix_layout_dd',
			// 'matrix_list',
			// 'matrix_notes',
			// 'matrix_profiles',
			// 'matrix_projects',
			// 'matrix_structurations',
			// 'matrix_tools',
			// 'matrix_users',
			// 'matrix_stats'
		];
		$action = 'transform_data::fix_dataframe_action';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_dataframe_to_v6_1



	/**
	* FIX_DATAFRAME_ACTION
	* Updates dataframe matrix and time machine data
	* @param object|null $datos
	* @return object|null $datos
	*/
	public static function fix_dataframe_action(?object $datos) : ?object {

		// empty relations cases
			if (empty($datos->relations)) {
				return null;
			}

		// fixed tipos
			$target_section_tipo	= 'rsc1242'; // dataframe active
			$ratting_tipo			= 'rsc1246'; // Weight

		// dataframe_to_save initial is false
			$dataframe_to_save = false;

		// relations container iteration
			$relations = $datos->relations ?? [];
			foreach ($relations as $locator) {

				if(isset($locator->section_id_key)) {

					$dataframe_to_save = true;

					// section
						$create_new_rating_section = function() use ($target_section_tipo){
							$section = section::get_instance(
								null, // string|null section_id
								$target_section_tipo // string section_tipo
							);
							$new_target_section_id = $section->Save();

							return $new_target_section_id;
						};

					// locator edit
						switch ($locator->from_component_tipo) {
							case 'numisdata885':
								// Numismatic object Type data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1447';
								break;

							case 'numisdata1017':
								// types Mint data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1448';
								break;

							case 'numisdata865':
								// types Denomination data frame
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1449';
								break;

							case 'oh126':
								// Informants role
								$locator->from_component_tipo	= 'oh115';
								break;

							case 'rsc1057':
								// Entities role
								$locator->from_component_tipo	= 'rsc1265';
								break;

							default:
								// Nothing to change
								break;
						}
				}//end if(isset($locator->section_id_key))

			}//end foreach ($relations as $locator)

		// no changes case
			if($dataframe_to_save === false){
				return null;
			}


		return $datos;
	}//end fix_dataframe_action



	/**
	* FIX_DATAFRAME_TM
	* Updates time_machine rows for current element
	* @param string|int $section_id
	* @param string $section_tipo
	* @param string $component_tipo
	* @param string|int $section_id_key
	* @param string|int $new_target_section_id
	*
	* @return array|null $tm_ar_changed
	*/
	public function fix_dataframe_tm(string|int $section_id, string $section_tipo, $old_locator, $locator) : array {

		$tm_ar_changed = [];

		$component_tipo			= (string) $old_locator->from_component_tipo;
		$section_id_key			= (int) $old_locator->section_id_key;
		$new_target_section_id	= (int) $locator->section_id;

		$strQuery = "
			SELECT * FROM matrix_time_machine
			WHERE section_id = '$section_id'
			AND section_tipo = '$section_tipo'
			AND tipo = '$component_tipo'
			ORDER BY id ASC
		";
		$result = JSON_RecordDataBoundObject::search_free($strQuery);
		// query error case
		if($result===false){
			return $tm_ar_changed;
		}
		// empty records case
		$n_rows = pg_num_rows($result);
		if ($n_rows<1) {
			return $tm_ar_changed;
		}

		while($row = pg_fetch_assoc($result)) {

			$id			= $row['id'];
			$section_id	= $row['section_id'];
			$dato		= json_decode($row['dato']);

			if (isset($dato[0])) {
				$dato[0]->section_id = $new_target_section_id;
			}

			// data_encoded : JSON ENCODE ALWAYS !!!
			$data_encoded = json_handler::encode($dato);
			// prevent null encoded errors
			$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

			$strQuery2	= "UPDATE matrix_time_machine SET dato = $1, section_id_key = $2 WHERE id = $3 ";
			$result2	= pg_query_params(DBi::_getConnection(), $strQuery2, [$safe_data, $section_id, $id]);
			if($result2===false) {
				$msg = "Failed Update section_data $id";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					.' strQuery: ' . $strQuery
					, logger::ERROR
				);
				continue;
			}

			$tm_ar_changed[] = $id;
		}

		return $tm_ar_changed;
	}//end fix_dataframe_tm


	/**
	* GET_TM_DATA_FROM_TIPO
	* Return all Time Machine records of the given component for specific section (section_id and section_tipo)
	* If Time Machine has not records or the process fail, return an empty array.
	* @param string|int $section_id
	* @param string $section_tipo
	* @param string $tipo (it can be a section or component)
	* @return array $component_tm_data
	*/
	public static function get_tm_data_from_tipo(string|int $section_id, string $section_tipo, string $tipo) : \PgSql\Result|false {

		// get all records of the time_machine for the given component
		$query = "
			SELECT * FROM matrix_time_machine
			WHERE section_id = $1
			AND section_tipo = $2
			AND tipo = $3
		";
		$result	= pg_query_params(DBi::_getConnection(), $query, [$section_id, $section_tipo, $tipo]);

		return $result;
	}//end get_tm_data_from_tipo



	/**
	* SET_TM_DATA
	* Set the Time Machine data of the given matrix_id
	* @param string|int $section_id
	* @param array $data
	* @return bool
	*/
	public static function set_tm_data( int $matrix_id, array $data) : bool {

		// data_encoded : JSON ENCODE ALWAYS !!!
			$data_encoded = json_handler::encode($data);
			// prevent null encoded errors
			$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

			$query	= "UPDATE matrix_time_machine SET dato = $1 WHERE id = $2 ";
			$result	= pg_query_params(DBi::_getConnection(), $query, [$safe_data, $matrix_id]);
			if($result===false) {
				$msg = "Failed Update section_data $matrix_id";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					.' strQuery: ' . $query
					, logger::ERROR
				);
			}

		return true;
	}//end set_tm_data



	/**
	* UPDATE_PAPER_LIB_DATA
	* Removes Paper libdata from component_image (rsc29)
	* @return bool
	*/
	public static function update_paper_lib_data() : bool {

		$ar_tables = [
			'matrix'
		];
		$action = 'transform_data::remove_paper_lib_data_rsc29';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_paper_lib_data



	/**
	* REMOVE_PAPER_LIB_DATA_RSC29
	* Removes Paper libdata from component_image (rsc29)
	* @param object|null $datos
	* @return object|null $datos
	*  If null is returned, no changes will made
	*/
	public static function remove_paper_lib_data_rsc29(?object $datos) : ?object {

		// fixed tipos
			$section_tipo	= 'rsc170'; // resources images
			$component_tipo	= 'rsc29'; // component_image

		// filter section_tipo
			if ($datos->section_tipo!==$section_tipo) {
				return null;
			}

		// empty relations cases
			if (empty($datos->components)) {
				return null;
			}

		// check value
			$lang = 'lg-nolan';
			if (	!isset($datos->components->{$component_tipo})
				 || !isset($datos->components->{$component_tipo}->dato)
				 || !isset($datos->components->{$component_tipo}->dato->{$lang})
				 || !is_array($datos->components->{$component_tipo}->dato->{$lang})
				 || !isset($datos->components->{$component_tipo}->dato->{$lang}[0])
				 || !isset($datos->components->{$component_tipo}->dato->{$lang}[0]->lib_data)
				) {
				return null;
			}

		// remove property if present
			unset($datos->components->{$component_tipo}->dato->{$lang}[0]->lib_data);

		// log
			debug_log(__METHOD__
				. ' Updating record ' . PHP_EOL
				. ' section_tipo: ' . $datos->section_tipo . PHP_EOL
				. ' section_id: ' . $datos->section_id . PHP_EOL
				. ' component ' . $component_tipo .' : ' . to_string($datos->components->{$component_tipo}->dato->{$lang}[0])
				, logger::WARNING
			);


		return $datos;
	}//end remove_paper_lib_data_rsc29



	/**
	* UPDATE_HIERARCHY_VIEW_IN_THESAURUS
	* @return bool
	*/
	public static function update_hierarchy_view_in_thesaurus() : bool {

		$ar_tables = [
			// 'new_matrix'
			// 'matrix',
			// 'matrix_activities',
			// 'matrix_dataframe',
			// 'matrix_dd',
			// 'matrix_hierarchy',
			'matrix_hierarchy_main',
			// 'matrix_indexations',
			// 'matrix_langs',
			// 'matrix_layout',
			// 'matrix_layout_dd',
			// 'matrix_list',
			// 'matrix_notes',
			// 'matrix_profiles',
			// 'matrix_projects',
			// 'matrix_structurations',
			// 'matrix_tools',
			// 'matrix_users',
			// 'matrix_stats'
		];
		$action = 'transform_data::add_view_in_thesaurus';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_hierarchy_view_in_thesaurus



	/**
	* ADD_VIEW_IN_THESAURUS
	* Change the matrix_hierarchy_main with new component to control hierarchy show into thesaurus tree
	* View in thesaurus need to be controlled independent of the active or not the hierarchy
	* @param object|null $datos
	* @return null // don't need to be saved by update, the new component save by itself
	* 	! Not use : null as standalone (PHP Fatal error:  Null can not be used as a standalone type)
	*/
	public static function add_view_in_thesaurus(?object $datos) {

		// empty relations cases
			if (empty($datos) || empty($datos->relations)) {
				return null;
			}

		// fixed tipos
			$active		= DEDALO_HIERARCHY_ACTIVE_TIPO;
			$view_in_ts	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;
			$model		= RecordObj_dd::get_modelo_name_by_tipo($view_in_ts,true);

		// relations container iteration
			$relations = $datos->relations ?? [];
			foreach ($relations as $locator) {

				if($locator->from_component_tipo === $active){

					// hierarchy view_in_ts
					$component_view_in_ts = component_common::get_instance(
						$model,
						$view_in_ts,
						$datos->section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$datos->section_tipo
					);

					$component_data = $component_view_in_ts->get_dato();
					if(!empty($component_data)){
						return null;
					}

					$view_in_ts_data = new locator();
						$view_in_ts_data->section_id	= $locator->section_id;
						$view_in_ts_data->section_tipo	= $locator->section_tipo;

					$component_view_in_ts->set_dato($view_in_ts_data);
					$component_view_in_ts->Save();
				}//end if(isset($locator->section_id_key))

			}//end foreach ($relations as $locator)

		return null;
	}//end add_view_in_thesaurus



	/**
	* CHANGES_IN_TIPOS
	* Map old tipos to new ones using JSON files definitions
	* @param array $ar_tables
	* @param array $json_files
	* @return bool
	*/
	public static function changes_in_tipos(array $ar_tables, array $json_files) : bool {

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_tipos - tables: " . json_encode($ar_tables) . PHP_EOL
			. " changes_in_tipos - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// get transform map from files
			$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_tld/';
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {

				$contents = file_get_contents($path.$current_json_file);
				if ($contents === false) {
					debug_log(__METHOD__ . " ERROR: Failed to read JSON file: " . $path, logger::ERROR);
					continue; // Skip to next file
				}

				$transform_map = json_decode($contents);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($transform_map) && !is_object($transform_map)) {
					debug_log(__METHOD__ . " ERROR: Failed to decode JSON from file: " . $path . ". Error: " . json_last_error_msg(), logger::ERROR);
					continue; // Skip to next file
				}

				foreach ($transform_map as $transform_object) {
					// Ensure $transform_object is an object and has 'old' property
					if (is_object($transform_object) && isset($transform_object->old)) {
						$ar_transform_map[$transform_object->old] = $transform_object;
					} else {
						debug_log(__METHOD__ . " WARNING: Ignored Invalid transform object found in " . $path . ": " . json_encode($transform_object), logger::ERROR);
					}
				}
			}

		// ar_section_elements. Select affected sections
			$ar_section_elements = array_filter($ar_transform_map, function($el){
				return $el->type==='section';
			});
			// ar_old_section_tipo without keys like ["numisdata279"]
			$ar_old_section_tipo = array_map(function($el){
				return $el->old;
			}, $ar_section_elements);

		// skip_virtuals
			$skip_virtuals = array_map(function($el){
				return $el->skip_virtuals ?? [];
			}, $ar_section_elements);
			$skip_virtuals = array_flatten($skip_virtuals);

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate tables
		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map, $ar_old_section_tipo, $skip_virtuals) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$dato			= (isset($row['dato'])) ? json_handler::decode($row['dato']) : null; // matrix_time_machine
				$tipo			= $row['tipo'] ?? null; // matrix_time_machine

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_tipos'
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

				// matrix_counter case
				if ( $table==='matrix_counter' ) {
					// delete record
					if( isset($ar_transform_map[$tipo]) ){
						$strQuery	= "DELETE FROM $table WHERE id = $1 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $id ));
						if($result===false) {
							$msg = "Failed Update section_tipo ($table) - $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}
					return;
				}

				// section_tipo. All tables has section_tipo
				if( isset($section_tipo) && isset($ar_transform_map[$section_tipo]) ){

					$new_section_tipo = $ar_transform_map[$section_tipo]->new;

					$strQuery	= "UPDATE $table SET section_tipo = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_section_tipo, $id ));
					if($result===false) {
						$msg = "Failed Update section_tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// tipo. Only matrix_time_machine has tipo, it could not be set.
				// (!) Change only if section_tipo match any of ar_old_section_tipo
				if( isset($tipo) && isset($ar_transform_map[$tipo]) && in_array($section_tipo, $ar_old_section_tipo) ){

					$new_tipo = $ar_transform_map[$tipo]->new;

					$strQuery	= "UPDATE $table SET tipo = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_tipo, $id ));
					if($result===false) {
						$msg = "Failed Update tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// datos. Common matrix tables
				if( isset($datos) ){

					// check sections to change data to prevent change virtual sections data, etc.
					if ($table==='matrix_activity') {

						// whole record column 'datos' as '{"label":"Activity","relations":[{"type":"dd151",...'
						$datos_string = json_encode($datos);

						$contains_old_section_tipo = false;
						foreach ($ar_old_section_tipo as $current_old_section_tipo) {
							if (strpos($datos_string, '"'.$current_old_section_tipo.'"')!==false) {
								$contains_old_section_tipo = true;
								break;
							}
						}
						if ($contains_old_section_tipo===false) {
							// skip non containing sections records
							return;
						}
					}
					else if ( in_array($section_tipo, $skip_virtuals) ) {
						// check column section_tipo match for tables distinct to 'matrix_activity'
						// skip non wanted sections records (column section_tipo is not included in the sections to change list)
						return;
					}

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
									foreach ($locator as $loc_key => $loc_value) {

										if (!is_string($loc_value) && !is_int($loc_value)) {
											debug_log(__METHOD__
												. " Ignored locator value ! " . PHP_EOL
												. ' loc_key: ' . to_string($loc_key) . PHP_EOL
												. ' loc_value: ' . to_string($loc_value) . PHP_EOL
												. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
												. ' table: ' . $table . PHP_EOL
												. ' id: ' . $id . PHP_EOL
												. ' locator: ' . to_string($locator)
												, logger::ERROR
											);
											continue;
										}

										if( isset($ar_transform_map[$loc_value]) ){
											// replace old tipo with the new one in any locator property
											$locator->{$loc_key} = $ar_transform_map[$loc_value]->new;
										}
									}
								}
								break;

							case 'diffusion_info':
							case 'components':
								// update components object
								$literal_components = $datos_value ?? [];

								$new_components = new stdClass();

								foreach ($literal_components as $literal_tipo => $literal_value) {
									if( isset($ar_transform_map[$literal_tipo]) ){

										// replace old tipo with the new one in any locator property
										$perform = $ar_transform_map[$literal_tipo]->perform;
										foreach ($perform as $action) {

											// check method already exists
												if(!method_exists('transform_data', $action)) {
													debug_log(__METHOD__
														. " Error. Calling undefined method transform_data::$action . Ignored action !"
														, logger::ERROR
													);
													continue;
												}

											$options = new stdClass();
												$options->transform_object	= $ar_transform_map[$literal_tipo];
												$options->new_components	= &$new_components; // pass by reference to allow add (!)
												$options->literal_tipo		= $literal_tipo;
												$options->literal_value		= $literal_value;

											transform_data::{$action}( $options );
										}
									}else{
										$new_components->{$literal_tipo} = $literal_value;
									}
								}
								// replace whole object
								$datos->$datos_key = $new_components;
								break;

							case 'inverse_locators':
								// remove old data
								unset($datos->{$datos_key});
								break;

							default:
								// update other properties like section_tipo, section_real_tipo, etc.
								$test_tipo = to_string($datos_value);
								if( isset($ar_transform_map[$test_tipo]) ){
									$datos->{$datos_key} = $ar_transform_map[$test_tipo]->new;
								}
								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded = json_encode($datos);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )

				// dato. Time machine matrix table
				if( isset($dato) && !empty($dato) && $table!=='matrix_counter'){

					$string_value = is_string($dato)
						? $dato
						: json_encode($dato);

					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->tipo				= $tipo;
						$options->value				= $string_value;

					$new_dato_encoded = transform_data::replace_tm_data( $options );

					if($string_value !== $new_dato_encoded ){
						$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato_encoded, $id ));
						if($result===false) {
							$msg = "Failed Update time machine ($table) record $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}
				}//end if( isset($dato) )
			}//end anonymous function
		);


		return true;
	}//end changes_in_tipos



	/**
	* REPLACE_TIPO
	*  Set the literal component value to a given by reference new object (new_components) key
	* @param object $options
	* @return void
	*/
	public static function replace_tipo(object $options) {

		$transform_object	= $options->transform_object;
		$new_components		= $options->new_components; // pass by reference
		$literal_value		= $options->literal_value;

		// new tipo is transform_object map 'new' property
		$new_tipo = $transform_object->new;

		// modifies passed by reference object new_components
		$new_components->{$new_tipo} = $literal_value;
	}//end replace_tipo



	/**
	* REPLACE_TM_DATA
	*  Used to replace time machine data in column 'dato'
	*  Set the literal component value to a given by reference new object (new_components) key
	* @param object $options
	* @return void
	*/
	public static function replace_tm_data(object $options) {

		$ar_transform_map	= $options->ar_transform_map;
		$value				= $options->value;

		if (empty($value)) {
			return $value;
		}

		foreach ($ar_transform_map as $current_tipo => $transform_map_object) {
			$value = str_replace(
				'"' . $current_tipo . '"',
				'"' . $transform_map_object->new . '"',
				$value
			);
		}


		return $value;
	}//end replace_tm_data



	/**
	* DELETE_TIPOS
	* Delete tipos, his time machine and his relations
	* @param array $ar_tables
	* @param array $ar_to_delete
	* [
	* 	{
	* 		"component_tipo"	: "tchi59",
	* 		"delete_tm"			: true,
	* 		"delete_relations"	: true,
	* 		"info"				: "Delete data of tchi relation index in thesaurus"
	* 	}
	* ]
	* @return bool
	*/
	public static function delete_tipos(array $ar_tables, array $ar_to_delete) : bool {

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " delete_tipos - tables: " . json_encode($ar_tables) . PHP_EOL
			. " delete_tipos - ar_to_delete: " . json_encode($ar_to_delete) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		// get transform map from files
			$ar_delete_map = [];
			foreach ($ar_to_delete as $object_to_delete) {
				$ar_delete_map[$object_to_delete->component_tipo] = $object_to_delete;
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// delete into matrix tables
			update::tables_rows_iterator(
				$ar_tables, // array of tables to iterate
				function($row, $table, $max) use($ar_delete_map) { // callback function

					$id				= $row['id'];
					$section_tipo	= $row['section_tipo'] ?? null;
					$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
					$tipo			= $row['tipo'] ?? null; // matrix_time_machine

					// CLI process data
						if ( running_in_cli()===true ) {
							common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': delete_tipos'
								. ' | table: ' 			. $table
								. ' | id: ' 			. $id .' - ' . $max
								. ' | section_tipo: ' 	. $section_tipo
								. ' | section_id: '  	. ($row['section_id'] ?? '');
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

						// check sections to change data to prevent change virtual sections data, etc.
						if ($table==='matrix_activity') {

							return;
						}

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

									foreach ($relations as $rel_key => $locator) {
										foreach ($locator as $loc_key => $loc_value) {

											if (!is_string($loc_value) && !is_int($loc_value)) {
												debug_log(__METHOD__
													. " Ignored locator value ! " . PHP_EOL
													. ' loc_key: ' . to_string($loc_key) . PHP_EOL
													. ' loc_value: ' . to_string($loc_value) . PHP_EOL
													. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
													. ' table: ' . $table . PHP_EOL
													. ' id: ' . $id . PHP_EOL
													. ' locator: ' . to_string($locator)
													, logger::ERROR
												);
												continue;
											}

											if( isset($ar_delete_map[$loc_value]) && $loc_key==='from_component_tipo' ){
												unset( $relations[$rel_key] );
											}
										}
									}

									// replace whole object
									$datos->$datos_key = array_values($relations);
									break;

								case 'diffusion_info':
								case 'components':
									// update components object
									$literal_components = $datos_value ?? [];

									$new_components = new stdClass();

									foreach ($literal_components as $literal_tipo => $literal_value) {

										// is the component is not set in the transform_map
										// assign it to the new_components.
										if( !isset($ar_delete_map[$literal_tipo]) ){
											$new_components->{$literal_tipo} = $literal_value;
										}
									}
									// replace whole object
									$datos->$datos_key = $new_components;
									break;
							}
						}//end foreach ($datos as $datos_key => $datos_value)

						$section_data_encoded = json_encode($datos);

						$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
						if($result===false) {
							$msg = "Failed Update section_data ($table) $id";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							return false;
						}
					}//end if( isset($datos) )

					// tipo. Time machine matrix table
					if( isset($tipo) && $table!=='matrix_counter'){

						// check $tipo need to be deleted already exists
						if( isset($ar_delete_map[$tipo]) && $ar_delete_map[$tipo]->delete_tm === true ){
							$strQuery	= "DELETE FROM $table WHERE id = $1 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $id ));
							if($result===false) {
								$msg = "Failed delete time machine ($table) record $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}
						}

					}//end if( isset($dato) )
				}//end anonymous function
			);

		// delete into relations table
			foreach ($ar_delete_map as $delete_item) {
				if(isset($delete_item->delete_relations) && $delete_item->delete_relations === true ){
					$strQuery	= "DELETE FROM \"relations\" WHERE \"from_component_tipo\" = $1 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $delete_item->component_tipo ));
					if($result===false) {
						$msg = "Failed delete relations table records $delete_item->component_tipo";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}
			}


		return true;
	}//end delete_tipos



	/**
	* COPY_DESCRIPTORS_TO_JER_DD
	* Called by the update to 6.3.0, copy the table descriptors as object of lang:term
	* and insert it into the term column in jer_dd
	* @return bool
	*/
	public static function copy_descriptors_to_jer_dd() : bool {

		// check 'matrix_descriptors_dd' table before
			if (!DBi::check_table_exists('matrix_descriptors_dd')) {
				debug_log(__METHOD__
					. " Error. Unable to get matrix_descriptors_dd records because the table do not exists" . PHP_EOL
					, logger::ERROR
				);
				return false;
			}

		// jer_dd. delete terms (jer_dd)
			$sql_query = '
				SELECT * FROM "jer_dd";
			';
			$jer_dd_result 	= pg_query(DBi::_getConnection(), $sql_query);

		// iterate jer_dd_result row
		while($row = pg_fetch_assoc($jer_dd_result)) {

			$terminoID	= $row['terminoID'];
			$id			= $row['id'];

			// matrix_descriptors_dd. delete descriptors (matrix_descriptors_dd)
			$sql_query = 'SELECT * FROM "matrix_descriptors_dd" WHERE "parent" = \''.$terminoID.'\' AND "tipo" = \'termino\';';
			$descriptors_result = pg_query(DBi::_getConnection(), $sql_query);

			$term_obj = new stdClass();
			while($term = pg_fetch_assoc($descriptors_result)) {

				$lang		= $term['lang'];
				$term_data	= $term['dato'];

				$term_obj->$lang = $term_data;
			}

			$string_term_object = json_encode($term_obj);

			$strQuery	= "UPDATE \"jer_dd\" SET term = $1 WHERE id = $2 ";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $string_term_object, $id ));
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
	}//end copy_descriptors_to_jer_dd



	/**
	* FILL_MODEL_COLUMN_IN_JER_DD
	* Called by the update to 6.4.0, resolve the model tipo with his name
	* insert it into the model column in jer_dd
	* @return bool
	*/
	public static function fill_model_column_in_jer_dd() : bool {

		// jer_dd. select all records in jer_dd
			$sql_query = '
				SELECT * FROM "jer_dd"
				WHERE "modelo" IS NOT NULL;
			';
			$jer_dd_result 	= pg_query(DBi::_getConnection(), $sql_query);

		// iterate jer_dd_result row
		while($row = pg_fetch_assoc($jer_dd_result)) {

			$model_tipo	= $row['modelo'];
			$id			= $row['id'];

			// ignore empty model tipo rows
			if( empty($model_tipo) || $model_tipo==='null' ){
				continue;
			}

			// matrix_descriptors_dd. delete descriptors (matrix_descriptors_dd)
			$sql_query = 'SELECT * FROM "jer_dd" WHERE "terminoID" = \''.$model_tipo.'\' LIMIT 1 ;';
			$model_result = pg_query(DBi::_getConnection(), $sql_query);

			$result_count = pg_num_rows($model_result);
			if($result_count !== 1) {
				debug_log(__METHOD__
					.' Current model has not valid definition (1)!. Review jer_dd for this model' . PHP_EOL
					.' model_tipo: ' . to_string($model_tipo) . PHP_EOL
					.' sql_query: ' . $sql_query . PHP_EOL
					.' result_count: ' . $result_count . PHP_EOL
					, logger::ERROR
				);
				return false;
			}

			$model = null;
			while( $term = pg_fetch_assoc($model_result) ) {

				$term_data = json_decode( $term['term'] );
				if( empty($term_data) ) {
					debug_log(__METHOD__
						.' Current model term has not valid definition (2)!. Review jer_dd for model' . PHP_EOL
						.' model_tipo: ' . to_string($model_tipo) . PHP_EOL
						.' term_data: ' . to_string($term_data) . PHP_EOL
						, logger::ERROR
					);
					return false;
				}

				$model = $term_data->{DEDALO_STRUCTURE_LANG};
			}

			$strQuery	= "UPDATE \"jer_dd\" SET model = $1 WHERE id = $2 ";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $model, $id ));
			if($result===false) {
				debug_log(__METHOD__
					.' Failed Update section_data (jer_dd) ' . PHP_EOL
					.' id: ' . to_string($id) . PHP_EOL
					.' model: ' . to_string($model) . PHP_EOL
					.' strQuery: ' . to_string($strQuery) . PHP_EOL
					, logger::ERROR
				);
				return false;
			}
		}//end while($row = pg_fetch_assoc($jer_dd_result))


		return true;
	}//end fill_model_column_in_jer_dd




	/**
	* GENERATE_ALL_MAIN_ONTOLOGY_SECTIONS
	* Creates the matrix ontology records (main and regular) from 'jer_dd'
	* It is such as 'jer_dd' -> 'matrix' transformation building the next
	* Ontology edit ecosystem based in regular sections and records instead a
	* monolithic jer_dd table that will be used as read only parsed ontology
	* @return bool
	*/
	public static function generate_all_main_ontology_sections() : bool {

		// disable log
		logger_backend_activity::$enable_log = false;

		//official ontologies

		$ontology_file_content = file_get_contents( dirname(dirname(__FILE__)) .'/include/6-4-0_ontology.json' );
		$ontology_info = json_decode( $ontology_file_content );

		// collect all existing tld in 'jer_dd' table
		$all_active_tld = RecordObj_dd::get_active_tlds();

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->memory = '';
				common::$pdata->action = '';
				common::$pdata->total = '';
				unset(common::$pdata->counter); // move counter property position
				common::$pdata->counter = 0;
				common::$pdata->tld = '';
				common::$pdata->active_tld = $all_active_tld;
				$base_msg = common::$pdata->msg;
			}

		// collect all children sections of 'ontology40' ('Instances')
		// like 'dd', 'ontology', 'rsc', 'nexus', etc.

		// $ontology_children = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'ontology40','section','children_recursive' );
		$ontology_tlds = array_map(function( $el ){
			return $el->tld;
		}, $ontology_info->active_ontologies);

		// add first the ontology_tlds to preserve the order
		$sorted_tlds = $ontology_tlds;
		// add all others non already included
		foreach ($all_active_tld as $current_tld) {
			if ( empty($current_tld) || !safe_tld($current_tld) ) {
				debug_log(__METHOD__
					. " Ignored empty or invalid tld " . PHP_EOL
					. ' tld: ' . to_string($current_tld) . PHP_EOL
					. ' all_active_tld: ' . to_string($all_active_tld)
					, logger::ERROR
				);
				continue;
			}
			if (!in_array($current_tld, $sorted_tlds)) {
				$sorted_tlds[] = $current_tld;
			}
		}

		// debug
		if(SHOW_DEBUG===true) {
			dump($sorted_tlds, 'generate_all_main_ontology_sections $sorted_tlds ++++++ '.to_string());
		}

		$total_tld = count($sorted_tlds);

		// firs iteration. matrix records creation
		foreach ($sorted_tlds as $tld) {

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->action = 'add_main_section ';
					common::$pdata->tld = $tld;
					common::$pdata->memory = dd_memory_usage();
					common::$pdata->counter++;
					common::$pdata->total = $total_tld;
					common::$pdata->msg = $base_msg . ' ['.common::$pdata->action .' '. $tld . ']';
					// send to output
					print_cli(common::$pdata);
				}

			$file_item = array_find($ontology_info->active_ontologies, function( $el ) use($tld) {
				return $el->tld === $tld;
			});

			$file_item = ( isset($file_item) )
				? $file_item
				: (object)[
					'tld' => $tld
				 ];

			// empty tld case
				if (empty($file_item->tld) || !safe_tld($file_item->tld)) {
					debug_log(__METHOD__
						. " Ignored empty or invalid tld " . PHP_EOL
						. ' tld: ' . to_string($tld) . PHP_EOL
						. ' file_item: ' . to_string($file_item) . PHP_EOL
						. ' ontology_info: ' . to_string($ontology_info)
						, logger::ERROR
					);
					continue;
				}

			// main_section. Add one main section for each tld if not already exists
			ontology::add_main_section( $file_item );

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->action = 'create_ontology_records';
					common::$pdata->memory = dd_memory_usage();
					common::$pdata->msg = $base_msg . ' ['.common::$pdata->action .' '. $tld . ']';
					// send to output
					print_cli(common::$pdata);
				}

			// ontology_records. Collects all jer_dd records for the current tld and
			// creates a matrix record for each one
			$jer_dd_rows = RecordObj_dd::get_all_tld_records( [$tld] );
			ontology::create_ontology_records( $jer_dd_rows );
		}

		// reset counter
		common::$pdata->counter = 0;

		// second iteration. After all records have been created
		// we can assign relationships and set the order of children
		foreach ($sorted_tlds as $tld) {

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->action = 'assign_relations_from_jer_dd';
					common::$pdata->tld = $tld;
					common::$pdata->memory = dd_memory_usage();
					common::$pdata->counter++;
					common::$pdata->msg = $base_msg . ' ['.common::$pdata->action .' '. $tld . ']';
					// send to output
					print_cli(common::$pdata);
				}

			// assign relationships between records (from jer_dd column 'relaciones')
			ontology::assign_relations_from_jer_dd( $tld );

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->action = 'reorder_nodes_from_jer_dd';
					common::$pdata->memory = dd_memory_usage();
					common::$pdata->msg = $base_msg . ' ['.common::$pdata->action .' '. $tld . ']';
					// send to output
					print_cli(common::$pdata);
				}

			// set child order (from jer_dd column 'norden')
			ontology::reorder_nodes_from_jer_dd( $tld );
		}

		// CLI process data
			if ( running_in_cli()===true ) {
				common::$pdata->action = 'generate_all_main_ontology_sections done!';
				common::$pdata->memory = dd_memory_usage();
				common::$pdata->msg = $base_msg . ' done!';
				// send to output
				print_cli(common::$pdata);
			}

		// enable log again
		logger_backend_activity::$enable_log = true;



		return true;
	}//end generate_all_main_ontology_sections



	/**
	* CHANGES_IN_LOCATORS
	* Map old locator to new one using JSON files definitions
	* the JSON file defines old section_tipo and new section_tipo
	* and it moves all locators as all tables to new locator.
	* This method take account section_id of the new section_tipo using the last counter
	* adding it to old section_id, for ex:
	* old section_id : 5
	* counter for the new section: 87
	* new section_id : 92
	* @param array $ar_tables
	* [
	* 	'matrix_users',
	*	'matrix_projects',
	*	'matrix',
	*	'matrix_list'...
	* ]
	* @param array $json_files
	* [
	*	"people_rsc194_to_rsc197.json", ..
	* ]
	* @return bool
	*/
	public static function changes_in_locators(array $ar_tables, array $json_files) : bool {

		// disable activity log
			logger_backend_activity::$enable_log = false;


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_locators - tables: " . json_encode($ar_tables) . PHP_EOL
			. " changes_in_locators - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_locator/';
		// get transform map from files
			//  value: {
			//		"rsc194": {
			//			"old": "rsc194",
			//			"new": "rsc197",
			//			"type": "section",
			//			"perform": [
			//				"move_tld"
			//			],
			//			"info": "Old People section => New People under Study section"
			//		}
			//	}
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[$transform_object->old] = $transform_object;
				}
			}

		// ar_section_elements. Select affected sections
			$ar_section_elements = array_filter($ar_transform_map, function($el){
				return $el->type==='section';
			});
			// ar_old_section_tipo without keys like ["rsc194"]
			$ar_old_section_tipo = array_map(function($el){
				return $el->old;
			}, $ar_section_elements, []);

		// counter of the new sections.
			// counter will use as base section_id to add new section_id into the old section as:
			// rsc197 counter = 8500
			// old locator = rsc194_1
			// will transform to rsc197_8501
			// so, the new section_id will be `counter` + old_section_id
			// it maintain coherence with all locators in every table and section.
			foreach ($ar_transform_map as $key => $value) {
				$counter = counter::get_counter_value( $value->new );
				$ar_transform_map[$key]->base_counter = $counter;
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map, $ar_old_section_tipo) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$section_id		= $row['section_id'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;
				$dato			= (isset($row['dato'])) ? json_handler::decode($row['dato']) : null; // matrix_time_machine
				$tipo			= $row['tipo'] ?? null; // matrix_time_machine

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_locators'
							. ' | table: ' 			. $table
							. ' | id: ' 			. $id .' - ' . $max
							. ' | section_tipo: ' 	. $section_tipo
							. ' | section_id: '  	. ($row['section_id'] ?? '');
						common::$pdata->memory = (common::$pdata->counter % 5000 === 0)
							? dd_memory_usage() // update memory information once every 5000 items
							: common::$pdata->memory;
						common::$pdata->table = $table;
						common::$pdata->section_tipo = $section_tipo;
						common::$pdata->counter++;
						// send to output
						print_cli(common::$pdata);
					}

				// section_tipo. All tables has section_tipo
				if( isset($section_tipo) && isset($ar_transform_map[$section_tipo]) ){

					// new section_id
						$base_section_id	= $ar_transform_map[$section_tipo]->base_counter;
						$new_section_id		= (int)$section_id + (int)$base_section_id;

					// new section tipo
						$new_section_tipo = $ar_transform_map[$section_tipo]->new;

					// add data to new section
					// create data to identify the moved from previous records
						if( isset($ar_transform_map[$section_tipo]->add_data_to_new_section) && isset($datos) ){

							$process = $ar_transform_map[$section_tipo]->add_data_to_new_section;
							foreach ($process as $fn_object) {
								$fn 		= $fn_object->fn;
								$fn_class 	= explode('::', $fn)[0];
								$fn_method 	= explode('::', $fn)[1];
								// check method already exists
									if(!method_exists($fn_class, $fn_method)) {
										debug_log(__METHOD__
											. " Error. Calling undefined method $fn_object->fn . Ignored process !"
											, logger::ERROR
										);
										continue;
									}
								//set current datos into the options
								$fn_object->options->datos = $datos;

								$fn( $fn_object->options );
							}
						}

					$strQuery	= "UPDATE $table SET section_tipo = $1, section_id = $2 WHERE id = $3 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_section_tipo, $new_section_id, $id ));
					if($result===false) {
						$msg = "Failed Update section_tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// tipo. Only matrix_time_machine has tipo, it could not be set.
				// (!) Change only if section_tipo match any of ar_old_section_tipo
				if( isset($tipo) && isset($ar_transform_map[$tipo]) && in_array($section_tipo, $ar_old_section_tipo) ){

					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->datos				= $dato;

					$processed_data = ( !empty($dato) )
						? transform_data::process_locators_in_section_data( $options )
						: null;

					$section_data_encoded = json_encode($processed_data);

					$new_tipo = $ar_transform_map[$tipo]->new;

					$strQuery	= "UPDATE $table SET tipo = $1, dato = $2 WHERE id = $3 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_tipo, $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update tipo ($table) - $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}

				// datos. Common matrix tables
				if( isset($datos) ){

					// matrix activity has a data has been changed by the time in the component dd551
					// in those case the change only is applied to this component
					if ($table==='matrix_activity') {

						$activity_data		= $datos;
						$old_activity_data	= json_encode($activity_data);

						//activity data is set into the dd551 component
						$dd551_value = $datos->components->dd551->dato->{DEDALO_DATA_NOLAN} ?? null;

						if( !empty($dd551_value) ){
							//store the old value to check if it change
							$old_dd51_value = json_encode($dd551_value);

							foreach ($dd551_value as $current_value) {
								// check tipo
								if(isset($current_value->tipo)
								&& isset($ar_transform_map[$current_value->tipo])
								&& $current_value->tipo === $ar_transform_map[$current_value->tipo]->old){
									// if data has tipo it will has id
									// change it with the base_counter
									if( isset($current_value->id) ){
										$current_value->id = (int)$ar_transform_map[$current_value->tipo]->base_counter + (int)$current_value->id;
									}
									$current_value->tipo = $ar_transform_map[$current_value->tipo]->new;
								}//end if

								// check section_tipo
								if(isset($current_value->section_tipo)
								&& isset($ar_transform_map[$current_value->section_tipo])
								&& $current_value->section_tipo === $ar_transform_map[$current_value->section_tipo]->old){
									// if data has section_tipo it will has section_id
									// change it with the base_counter
									if( isset($current_value->section_id) ){
										$current_value->section_id = (int)$ar_transform_map[$current_value->section_tipo]->base_counter + (int)$current_value->section_id;
									}
									$current_value->section_tipo = $ar_transform_map[$current_value->section_tipo]->new;
								}//end if

								// check top_tipo
								if(isset($current_value->top_tipo)
								&& isset($ar_transform_map[$current_value->top_tipo])
								&& $current_value->top_tipo === $ar_transform_map[$current_value->top_tipo]->old){
									// if data has top_tipo it will has top_id
									// change it with the base_counter
									if( isset($current_value->top_id) ){
										$current_value->top_id = (int)$ar_transform_map[$current_value->top_tipo]->base_counter + (int)$current_value->top_id;
									}
									$current_value->top_tipo = $ar_transform_map[$current_value->top_tipo]->new;
								}//end if

							}//end foreach

							$new_dd551_data = json_encode($dd551_value);
							// check if the dd551 data has been change, and set the new dd551 data
							if( $old_dd51_value !== $new_dd551_data ){
								$activity_data->components->dd551->dato->{DEDALO_DATA_NOLAN} = $dd551_value;
							}//end if
						}//end if

						// encode activity data
						// $new_activity_data = json_encode($activity_data);

						$new_activity_data  = json_handler::encode($activity_data);
						// prevent null encoded errors
						$new_activity_data = str_replace(['\\u0000','\u0000'], ' ', $new_activity_data);

						// change other data in activity
						// usually is data with section_tipo only as where component.
						// in those cases section_id is not assigned.
						// Only will change the component_tipo
						foreach ($ar_transform_map as $current_tipo => $transform_map_object) {
							$new_activity_data = str_replace(
								'"' . $current_tipo . '"',
								'"' . $transform_map_object->new . '"',
								$new_activity_data
							);
						}
						// if the activity was changed save it.
						if( $old_activity_data !== $new_activity_data ){

							$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_activity_data, $id ));
							if($result===false) {
								$msg = "Failed Update section_data ($table) $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}//end if
						}//end if

						// stop the process here. activity data is not compatible with other changes in standard sections.
						return true;

					}//end if ($table==='matrix_activity')

					// change the standard data in regular sections
					$options = new stdClass();
						$options->ar_transform_map	= $ar_transform_map;
						$options->datos				= $datos;

					$processed_data = ( !empty($datos) )
						? transform_data::process_locators_in_section_data( $options )
						: null;

					$section_data_encoded = json_encode($processed_data);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )

				// dato. Time machine matrix table
				// Time machine has specific columns and his data is of the component data, so it mix locators and literals.
				// excluding component security access
				if( isset($dato) && !empty($dato) && $table!=='matrix_counter' && $tipo!=='dd774'){
					// set all data as JSON
					$tm_value = is_string($dato)
						? json_decode($dato)
						: $dato;

					// save old data to be check before save
					$old_dato_encoded = json_encode( $tm_value );

					// current data is a locator
					if( is_array($tm_value) && is_object($tm_value[0]) && isset($tm_value[0]->section_tipo) && isset($tm_value[0]->type)){

						// process data as locator
						$options = new stdClass();
							$options->ar_transform_map	= $ar_transform_map;
							$options->tm_value			= $tm_value;

						$new_tm_value = transform_data::replace_locator_in_tm_data( $options );

						$new_dato_encoded = json_encode( $new_tm_value );

						//check if the data has been changed, if yes, save it.
						if($old_dato_encoded !== $new_dato_encoded){
							$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
							$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato_encoded, $id ));
							if($result===false) {
								$msg = "Failed Update time machine ($table) record $id";
								debug_log(__METHOD__
									." ERROR: $msg "
									, logger::ERROR
								);
								return false;
							}
						}
					}else{
						// if data is literal, it could be a component_text_area data and need to be processed as string
						$component_tm_model = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
						if( $component_tm_model==='component_text_area' ){

							$options = new stdClass();
								$options->string			= json_encode($tm_value);
								$options->ar_transform_map	= $ar_transform_map;

							$new_literal = transform_data::replace_locator_in_string( $options );

							//check if the data has been changed, if yes, save it.
							if($old_dato_encoded !== $new_literal ){
								$strQuery	= "UPDATE $table SET dato = $1 WHERE id = $2 ";
								$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_literal, $id ));
								if($result===false) {
									$msg = "Failed Update time machine ($table) record $id";
									debug_log(__METHOD__
										." ERROR: $msg "
										, logger::ERROR
									);
									return false;
								}
							}
						}
					}//end if ( is_array($tm_value) && is_object($tm_value[0]) && isset($tm_value[0]->section_tipo) && isset($tm_value[0]->type))
				}//end if( isset($dato) )
			}//end anonymous function
		);

		// re-enable activity log
			logger_backend_activity::$enable_log = true;


		return true;
	}//end changes_in_locators



	/**
	* PROCESS_LOCATORS_IN_SECTION_DATA
	* @param object $options
	* @return object $datos
	*/
	public static function process_locators_in_section_data( object $options ) : object {

		$ar_transform_map	= $options->ar_transform_map;
		$datos				= $options->datos;

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
						foreach ($locator as $loc_key => $loc_value) {

							if (!is_string($loc_value) && !is_int($loc_value)) {
								debug_log(__METHOD__
									. " Ignored locator value ! " . PHP_EOL
									. ' loc_key: ' . to_string($loc_key) . PHP_EOL
									. ' loc_value: ' . to_string($loc_value) . PHP_EOL
									. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
									. ' locator: ' . to_string($locator)
									, logger::ERROR
								);
								continue;
							}

							if( isset($ar_transform_map[$loc_value]) ){
								// replace old tipo with the new one in any locator property
								$locator->{$loc_key}	= $ar_transform_map[$loc_value]->new;
								$new_section_id			= (int)$ar_transform_map[$loc_value]->base_counter + (int)$locator->section_id;
								$locator->section_id	= (string)$new_section_id;
							}
						}
					}
					break;

				case 'diffusion_info':
				case 'components':
					// update components object
					$literal_components = $datos_value ?? null;

					if( empty($literal_components) ){
						break;
					}

					foreach ($literal_components as $literal_tipo => $literal_value) {
						$model = RecordObj_dd::get_modelo_name_by_tipo( $literal_tipo );
						if($model === 'component_text_area'){

							$options = new stdClass();
								$options->string			= json_encode($literal_value);
								$options->ar_transform_map	= $ar_transform_map;

							$new_literal = transform_data::replace_locator_in_string( $options );

							$literal_components->{$literal_tipo} = json_decode( $new_literal );
						}
					}

					// replace whole object
					$datos->$datos_key = $literal_components;
					break;

				case 'inverse_locators':
					// remove old data
					unset($datos->{$datos_key});
					break;

				default:
					// update other properties like section_tipo, section_real_tipo, etc.
					$test_tipo = to_string($datos_value);
					if( isset($ar_transform_map[$test_tipo]) ){
						$datos->{$datos_key} = $ar_transform_map[$test_tipo]->new;
						if( $datos_key === 'section_tipo'){
							$new_section_id		= (int)$ar_transform_map[$test_tipo]->base_counter + (int)$datos->section_id;
							$datos->section_id	= (int)$new_section_id;
						}
					}
					break;
			}
		}//end foreach ($datos as $datos_key => $datos_value)

		return $datos;
	}//end process_locators_in_section_data



	/**
	* REPLACE_LOCATOR_IN_TM_DATA
	* This function only accepts locator data in tm machine.
	* Filter previously the tm_data to send only locator data.
	* @param object $options-
	* {
	* 	ar_transform_map: {
	*		"rsc194": {
	*			"old": "rsc194",
	*			"new": "rsc197",
	*			"type": "section",
	*			"perform": [
	*				"move_tld"
	*			],
	* 			"base_counter": 76
	*			"info": "Old People section => New People under Study section"
	*	}
	* 	tm_value: array
	* }
	* @return array $tm_value
	*/
	public static function replace_locator_in_tm_data( object $options ) : array {

		$ar_transform_map	= $options->ar_transform_map;
		$tm_value			= $options->tm_value;

		foreach ( $tm_value as $current_locator ) {

			if (!is_object($current_locator)) {
				continue;
			}

			foreach ($current_locator as $loc_key => $current_value) {

				if (!is_string($current_value) && !is_int($current_value)) {
					debug_log(__METHOD__
						. " Ignored non acceptable  " . PHP_EOL
						. ' loc_key: ' . to_string($loc_key) . PHP_EOL
						. ' current_value: ' . to_string($current_value) . PHP_EOL
						. ' current_value type: ' . gettype($current_value) . PHP_EOL
						. ' current_locator: ' . to_string($current_locator)
						, logger::ERROR
					);
					continue;
				}

				if( isset($ar_transform_map[$current_value]) && $current_value === $ar_transform_map[$current_value]->old ){

					$current_locator->$loc_key	= $ar_transform_map[$current_value]->new;
					$base_section_id			= $ar_transform_map[$current_value]->base_counter;

					if($loc_key === 'section_tipo'){
						$new_section_id					= (int)$base_section_id + (int)$current_locator->section_id;
						$current_locator->section_id	= (string)$new_section_id;
					}
				}
			}//end foreach
		}//end foreach


		return $tm_value;
	}//end replace_locator_in_tm_data



	/**
	* REPLACE_LOCATOR_IN_STRING
	* Some locators are in middle of component_text_area data as string
	* string locator is used as People tag, it need changed as text using regex
	* @param object $options
	* @return string $string
	*/
	public static function replace_locator_in_string( object $options ) : string {

		$string				= $options->string;
		$ar_transform_map	= $options->ar_transform_map;
		// get all locator in the middle of the string
		// locator is identified as:
		// text	'data:{'section_tipo':'rsc194','section_id':'1'}:data' text
		$regex = '/data:({.*?}):data/m';

		preg_match_all( $regex, $string, $matches);

		$ar_locators = $matches[1] ?? [];
		// remove duplicates
		$unique_locators = array_unique($ar_locators);

		foreach ($unique_locators as $pseudo_locator) {
			// string locator use a simple quotes, it need change to double quotes
			$current_locator = str_replace('\'', '"', $pseudo_locator);
			$current_locator = json_decode($current_locator);

			foreach ($current_locator as $loc_key => $loc_value) {

				if (!is_string($loc_value) && !is_int($loc_value)) {
					debug_log(__METHOD__
						. " Ignored locator value ! " . PHP_EOL
						. ' loc_key: ' . to_string($loc_key) . PHP_EOL
						. ' loc_value: ' . to_string($loc_value) . PHP_EOL
						. ' loc_value type: ' . gettype($loc_value) . PHP_EOL
						. ' locator: ' . to_string($current_locator)
						, logger::ERROR
					);
					continue;
				}

				// check if the locator has the old section_tipo reference
				if( isset($ar_transform_map[$loc_value]) ){
					// replace old tipo with the new one in any locator property
					$current_locator->{$loc_key}	= $ar_transform_map[$loc_value]->new;
					$new_section_id					= (int)$ar_transform_map[$loc_value]->base_counter + (int)$current_locator->section_id;
					$current_locator->section_id	= (string)$new_section_id;

					//to replace, stringify the locator and change the double quotes to single
					$new_pseudo_locator	= json_encode($current_locator);
					$new_pseudo_locator	= str_replace( '"', '\'', $new_pseudo_locator);
					// replace all occurrences in the string.
					$string	= str_replace( $pseudo_locator, $new_pseudo_locator, $string);
				}
			}
		}

		return $string;
	}//end replace_locator_in_string



	/**
	* SET_MOVE_IDENTIFICATION_VALUE
	* Used to add a value to moved records
	* It helps to identify that records moved
	* ex: 	`People`(rsc194) moves to `People under study`(rsc197)
	* 		set a `Typology` that moved recods as "moved from People"
	* @param object $options
	* @return object $datos
	*/
	public static function set_move_identification_value( object $options ) : object {

		$action					= $options->action;
		$section_tipo			= $options->section_tipo ?? null;
		$from_component_tipo	= $options->from_component_tipo ?? null;
		$type					= $options->type ?? null;
		$component_tipo			= $options->component_tipo;
		$value					= $options->value;
		$datos					= $options->datos;
		$q						= $options->q;
		$model					= $options->model;
		$name					= $options->name;

		if( !empty($q) ){
			$q = addslashes($q);
		}
		// cache to be used when the data needs to apply into every new record
		static $cache_set_move_identification_value;
		$cache_key = $action.'_'.$section_tipo.'_'.$component_tipo;

		switch ($action) {
			case 'new_only_once':
				// used to create new section as 'Typology' or other portal
				// and set a component data inside new section with the specified values
				// values could be a literal with translations or a related data.

				// set a cache with the locator created
				// new only once create new section and use his locator to be assigned to all moved records
				// therefore, if the cache is set, use previous locator in the cache
				// else (the first time) create new one.
				if (isset($cache_set_move_identification_value[$cache_key])) {

					$locator = $cache_set_move_identification_value[$cache_key];

				}else{

					// search in database (this prevents duplicates when user apply this update more than once)
					$sqo = json_decode('
						{
							"section_tipo": [
								"'.$section_tipo.'"
							],
							"limit": 10,
							"offset": 0,
							"filter": {
								"$and": [
									{
										"q": [
											"'.$q.'"
										],
										"q_operator": null,
										"path": [
											{
												"section_tipo": "'.$section_tipo.'",
												"component_tipo": "'.$component_tipo.'",
												"model": "'.$model.'",
												"name": "'.$name.'"
											}
										],
										"q_split": true,
										"type": "jsonb"
									}
								]
							}
						}
					');
					$search = search::get_instance(
						$sqo // object sqo
					);
					$check_search		= $search->search();
					$check_ar_records	= $check_search->ar_records;
					if(count($check_ar_records)>0) {

						$record = $check_ar_records[0];

						$new_section_id = $record->section_id;

					}else{

						// create new section to save new data
						// new section will be the locator to add into the records
						$new_section = section::get_instance(
							null, // string|null section_id
							$section_tipo // string section_tipo
						);
						$new_section_id = $new_section->Save();

						// create new component with the specification
						$component_model		= RecordObj_dd::get_modelo_name_by_tipo( $component_tipo );
						// check if the component is a related to be save as block, else create component for every lang.
						$relation_components	= component_relation_common::get_components_with_relations();
						$is_related				= in_array( $component_model, $relation_components );
						// set the main lang of the component as translatable or not (for literals the lang will be change)
						$translatable			= RecordObj_dd::get_translatable( $component_tipo );
						$lang					= $translatable === true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$component				= component_common::get_instance(
							$component_model, // string model
							$component_tipo, // string tipo
							$new_section_id, // string section_id
							'list', // string mode
							$lang, // string lang
							$section_tipo // string section_tipo
						);
						// related component can save his data as block
						if( $is_related	=== true ){
							$component->set_dato( $value );
							$component->Save();
						}else{
							// literal components needs to save his data by language
							foreach ($value as $current_lang => $current_value) {
								$component->set_lang( $current_lang );
								$component->set_dato( $current_value );
								$component->Save();
							}
						}
					}

					// fix new locator with the new section created
					// take account that the value is not the component value because this action use a related component to set the value
					$locator = new locator();
						$locator->set_section_tipo( $section_tipo );
						$locator->set_section_id( $new_section_id );
						$locator->set_from_component_tipo( $from_component_tipo );
						$locator->set_type( $type );

					// set new locator into the cache to be used next time
					$cache_set_move_identification_value[$cache_key] = $locator;
				}

				// add new locator to datos
				$datos->relations[] = $locator;
				break;

			default:
				// doesn't used right now.
				break;
		}


		return $datos;
	}//end set_move_identification_value



	/**
	* PORTALIZE_DATA
	* Get the old components from the source section and move his data into target section
	* Save the target section and use his section_id to create a locator to inject into the portal
	* @param array $json_files
	* [
	*	"qdp_portalize_to_tch.json", ..
	* ]
	* @return bool
	*/
	public static function portalize_data( array $json_files) : bool {

		// disable activity log
			logger_backend_activity::$enable_log = false;

		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " portalize_data - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_to_portal/';
		// get transform map from files
			//  value: {
			//		"rsc194": {
			//			"old": "rsc194",
			//			"new": "rsc197",
			//			"type": "section",
			//			"perform": [
			//				"move_tld"
			//			],
			//			"info": "Old People section => New People under Study section"
			//		}
			//	}
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[] = $transform_object;
				}
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate items
		foreach ($ar_transform_map as $item) {

			$source_section	= $item->source_section;
			$target_section	= $item->target_section;
			$components		= $item->components;
			$portal_tipo	= $item->portal;

			$all_section_records = section::get_resource_all_section_records_unfiltered( $source_section );

			while ($row = pg_fetch_assoc($all_section_records)) {
				$section_id	= $row['section_id'];

				// create the source components
				$to_save = false;

				$main_relations			= [];
				$main_components_obj	= new stdClass();

				// get full data of the components
				foreach ($components as $component_item) {

					$source_tipo = $component_item->source_tipo;
					$target_tipo = $component_item->target_tipo;

					// source component
					// created to get his full data
					$model	= RecordObj_dd::get_modelo_name_by_tipo($source_tipo);
					$lang	= RecordObj_dd::get_translatable( $source_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
					$source_component = component_common::get_instance(
						$model, // string model
						$source_tipo, // string tipo
						$section_id, // string section_id
						'list', // string mode
						$lang, // string lang
						$source_section // string section_tipo
					);

					$data_full = $source_component->get_dato_full();

					if( empty($data_full) ){
						continue;
					}
					// set that any component has data and need to be moved to the portal
					$to_save = true;

					//check if the component is a related component
					$is_related = in_array( $model, component_relation_common::get_components_with_relations() );

					if( $is_related===true ){
						// related components
						foreach ($data_full as $current_locator) {
							$current_locator->from_component_tipo = $target_tipo;

							$main_relations[] = $current_locator;
						}
					}else{
						// literal components
						$main_components_obj->$target_tipo = new stdClass();
						$main_components_obj->$target_tipo->dato = $data_full;
					}
				}

				if( $to_save===false ){
					continue;
				}
				// Create new target section
				// if any component has data, create new target section and set all moved component data into.
					$new_section = section::get_instance(
						null, // string|null section_id
						$target_section // string section_tipo
					);

					// save section with the all component data
					$save_options = new stdClass();
						$save_options->main_components_obj	= $main_components_obj;
						$save_options->main_relations		= $main_relations;

					$new_section_id = $new_section->Save( $save_options );

					// check the save was ok
					if( empty($new_section_id) ){
						debug_log(__METHOD__
							. " Error saving the new section with the component_data " . PHP_EOL
							. "item: ". to_string( $item ) . PHP_EOL
							. "source_section_id: ". to_string( $section_id ) . PHP_EOL
							, logger::ERROR
						);

						return false;
					}

				// create the component_portal to give the locator created
					$portal_model = RecordObj_dd::get_modelo_name_by_tipo( $portal_tipo );

					$portal_component = component_common::get_instance(
						$portal_model, // string model
						$portal_tipo, // string tipo
						$section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$source_section // string section_tipo
					);

					$portal_locator = new locator();
						$portal_locator->set_section_id( $new_section_id );
						$portal_locator->set_section_tipo( $target_section );

					$portal_component->set_dato( $portal_locator );
					$portal_section_id = $portal_component->Save();

					// check the save was ok
					if( empty($portal_section_id) ){
						debug_log(__METHOD__
							. " Error saving the new portal with the component_data " . PHP_EOL
							. "item: ". to_string( $item ) . PHP_EOL
							. "source_section_id: ". to_string( $section_id ) . PHP_EOL
							. "target_section_id: ". to_string( $new_section_id ) . PHP_EOL
							, logger::ERROR
						);

						// remove the new section created
						$new_section->delete( 'delete_record', false );
						// set the counter to last valid section_id, to avoid empty section records
						$matrix_table	= common::get_matrix_table_from_tipo( $target_section );
						if (empty($matrix_table)) {
							debug_log(__METHOD__
								. ' Invalid matrix_table from tipo. Check your Ontology for configuration errors' . PHP_EOL
								. ' target_section: ' . to_string($target_section)
								, logger::ERROR
							);
							return false;
						}
						counter::consolidate_counter(
							$target_section,
							$matrix_table,
							'matrix_counter'
						);

						return false;
					}



				// remove the old component data and
				// change time machine data
					// disable time machine
					RecordObj_time_machine::$save_time_machine_version = false;

					foreach ($components as $component_item) {

						$source_tipo = $component_item->source_tipo;
						$target_tipo = $component_item->target_tipo;

						// remove the old component data in source section
							// source component
							// created to get his full data
							$model	= RecordObj_dd::get_modelo_name_by_tipo($source_tipo);
							$lang	= RecordObj_dd::get_translatable( $source_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
							$source_component = component_common::get_instance(
								$model, // string model
								$source_tipo, // string tipo
								$section_id, // string section_id
								'list', // string mode
								$lang, // string lang
								$source_section // string section_tipo
							);

							// remove the old data
							// the component data will be save later in the new section.
							$source_component->set_dato( null );
							$source_component->Save();

						// change the time machine data to set the new tipo, section_id and section_tipo
							$table 		= 'matrix_time_machine';
							//select the old component time machine data
							$strQuery	= "SELECT id FROM $table WHERE section_id = $1 AND section_tipo = $2 AND tipo = $3";
							$result		= pg_query_params( DBi::_getConnection(), $strQuery, array($section_id, $source_section, $source_tipo) );

							$n_rows = pg_num_rows($result);

							// if the component has not data go next component, nothing to change
							if ($n_rows<1){
								continue;
							}

							while($row = pg_fetch_assoc($result)) {

								$id		= $row['id'];
								// update his time_machine with the new section
								$strQuery	= "UPDATE $table SET tipo = $1, section_id = $2, section_tipo = $3 WHERE id = $4 ";
								$change_result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $target_tipo, $new_section_id, $target_section, $id ));
								if($change_result===false) {
									$msg = "Failed to update time machine data ($table) - $id";
									debug_log(__METHOD__
										." ERROR: $msg " . PHP_EOL
										. "source_section_id: ". to_string( $section_id ) . PHP_EOL
										. "source_section: ". to_string( $source_section ) . PHP_EOL
										. "source_tipo: ". to_string( $source_tipo ) . PHP_EOL
										. "target_tipo: ". to_string( $target_tipo ) . PHP_EOL
										. "new_section_id: ". to_string( $new_section_id ) . PHP_EOL
										. "target_section: ". to_string( $target_section ) . PHP_EOL

										, logger::ERROR
									);

									return false;
								}
							}
					}

					// active time machine
					RecordObj_time_machine::$save_time_machine_version = true;
			}
		}//end foreach ($ar_transform_map as $item)


		// re-enable activity log
			logger_backend_activity::$enable_log = true;


		return true;
	}//end portalize_data



	/**
	* MOVE_DATA_BETWEEN_MATRIX_TABLES
	* Get specific data from a table and insert in other table
	* Delete previous data.
	* @param array $json_files
	* [
	*	"utoponymy1_to_hierarchy.json", ..
	* ]
	* @return bool
	*/
	public static function move_data_between_matrix_tables( array $json_files) : bool {


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " move_data_between_matrix_tables - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_to_table/';
		// get transform map from files
			// [{
			//		"section_tipo": "utoponymy1",
			//		"source_table": "matrix_list",
			//		"target_table": "matrix_hierarchy"
			//	}]
			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {

				$contents = file_get_contents($path.$current_json_file);
				if ($contents === false) {
					debug_log(__METHOD__ . " Error reading file: " . $path.$current_json_file, logger::ERROR);
					continue;
				}

				$transform_map		= json_decode($contents);

				if (json_last_error() !== JSON_ERROR_NONE) {
					debug_log(__METHOD__ . " Error decoding JSON from file: " . $current_json_file . " - " . json_last_error_msg(), logger::ERROR);
					continue;
				}
				if (!is_array($transform_map)) {
					debug_log(__METHOD__ . " Decoded JSON is not an array from file: " . $current_json_file, logger::ERROR);
					continue;
				}

				foreach ($transform_map as $transform_object) {
					$ar_transform_map[] = $transform_object;
				}
			}

		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		// iterate items
		foreach ($ar_transform_map as $item) {

			if (!isset($item->section_tipo) || !isset($item->source_table) || !isset($item->target_table)) {
				debug_log(__METHOD__ . " Ignored Malformed transform object in JSON file. Missing required properties.", logger::ERROR);
				continue; // Skip this malformed item
			}

			$section_tipo	= $item->section_tipo;
			$source_table	= $item->source_table;
			$target_table	= $item->target_table;

			$conn = DBi::_getConnection();

			// safe section_tipo
			$section_tipo = pg_escape_string($conn, $section_tipo);

			// Start transaction
			if (!pg_query($conn, "BEGIN")) {
				debug_log(__METHOD__ . " Failed to start transaction: " . pg_last_error($conn), logger::ERROR);
				return false;
			}

			// Move rows between tables
				// select only section_id, section_tipo and datos, id columns could exist in the target_table and the constrain would fail.
				$str_query = PHP_EOL.sanitize_query("
					INSERT INTO $target_table(\"section_id\", \"section_tipo\", \"datos\")
					(
						SELECT \"section_id\", \"section_tipo\", \"datos\"
						FROM $source_table
						WHERE \"section_tipo\" = '$section_tipo'
					);
				");

				$result = pg_query($conn, $str_query);
				if($result===false) {
					pg_query($conn, "ROLLBACK"); // Rollback on error
					// error case
					debug_log(__METHOD__
						." Error Processing SQL request in move_data_between_matrix_tables ". PHP_EOL
						. pg_last_error($conn) .PHP_EOL
						. 'str_query: '.to_string($str_query)
						, logger::ERROR
					);
					return false;
				}

			// Delete the origin data
				$delete_str_query = PHP_EOL.sanitize_query("
					DELETE FROM $source_table
					WHERE \"section_tipo\" = '$section_tipo';
				");

				$result = pg_query($conn, $delete_str_query);
				if($result===false) {
					 pg_query($conn, "ROLLBACK"); // Rollback on error
					// error case
					debug_log(__METHOD__
						." Error Processing SQL request in move_data_between_matrix_tables ". PHP_EOL
						. pg_last_error($conn) .PHP_EOL
						. 'delete_str_query: '.to_string($delete_str_query)
						, logger::ERROR
					);
					return false;
				}

			// Commit transaction if both successful
			if (!pg_query($conn, "COMMIT")) {
				debug_log(__METHOD__ . " Commit failed: ".pg_last_error($conn), logger::ERROR);
				return false;
			}

		}//end foreach ($ar_transform_map as $item)


		return true;
	}//end move_data_between_matrix_tables



	/**
	* UPDATE_DATAFRAME_TM_TO_V6_4_3
	* Check all main component data to review if its own dataframe require add section_tipo_key
	* dataframe in version >=6.4.3 define the section_tipo_key to bind the dataframe data to main data
	* used in multiple target_section components as Collection (numisdata159) that call People (rsc197) and Entities (rsc106)
	* @return bool
	*/
	public static function update_dataframe_tm_to_v6_4_3() : bool {

		$tm_ar_changed = [];
		// get all component_dataframe in ontology
		$components_dataframe = RecordObj_dd::get_ar_terminoID_by_modelo_name( 'component_dataframe' );

		foreach($components_dataframe as $dataframe_tipo){
			// get its own main component
			$RecordObj_dd			= new RecordObj_dd($dataframe_tipo);
			$main_component_tipo	= $RecordObj_dd->get_parent();

			$strQuery = "
				SELECT * FROM matrix_time_machine
				WHERE tipo = '$main_component_tipo'
				ORDER BY id ASC
			";
			$result = JSON_RecordDataBoundObject::search_free($strQuery);
			// query error case
			if($result===false){
				return false;
			}

			while($row = pg_fetch_assoc($result)) {

				$id				= $row['id'];
				$section_id		= $row['section_id'];
				$section_tipo	= $row['section_tipo'];
				$dato			= !empty($row['dato']) ? json_decode($row['dato']) : null;

				$to_save = false;
				if (!empty($dato)) {

					foreach ($dato as $current_locator) {

						if( !isset($current_locator->section_id_key) || isset($current_locator->section_tipo_key) ){
							continue;
						}

						// get the target_section_tipo of the main component to be used as section_tipo_key
						$section_tipo_key = transform_data::get_section_tipo_key_from_main_component( $section_tipo, $section_id, $dataframe_tipo );
						if (empty($section_tipo_key)) {
							debug_log(__METHOD__
								. " Ignored empty section_tipo_key " . PHP_EOL
								. ' section_tipo_key: ' . to_string($section_tipo_key) . PHP_EOL
								, logger::ERROR
							);
							$info =  to_string("$section_tipo - $section_id") .' dataframe_tipo: ' .to_string($dataframe_tipo);
							throw new Exception("Error Processing Request - " .$info, 1);
							return false;
						}

						$current_locator->section_tipo_key = $section_tipo_key;
						unset( $current_locator->tipo_key );
						$to_save = true;
					}
				}

				if( $to_save===false ){
					continue;
				}

				// data_encoded : JSON ENCODE ALWAYS !!!
				$data_encoded = json_handler::encode($dato);
				// prevent null encoded errors
				$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

				// set the result into time_machine record
				$strQuery2	= "UPDATE matrix_time_machine SET dato = $1 WHERE id = $2 ";
				$result2	= pg_query_params(DBi::_getConnection(), $strQuery2, [$safe_data, $id]);
				if($result2===false) {
					$msg = "Failed Update section_data $id";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' strQuery: ' . $strQuery
						, logger::ERROR
					);
					continue;
				}

				$tm_ar_changed[] = $id;
			}
		}


		return true;
	}//end update_dataframe_tm_to_v6_4_3



	/**
	* GET_SECTION_TIPO_KEY_FROM_MAIN_COMPONENT
	* Create an main component instance of the current dataframe
	* and return his target section tipo
	* @param string $section_tipo
	* @param int|string $section_id,
	* @param string $dataframe_tipo | tipo of the component_dataframe
	* @return string $section_tipo_key
	*/
	private static function get_section_tipo_key_from_main_component( string $section_tipo, int|string $section_id, string $dataframe_tipo ) : ?string {

		$RecordObj_dd			= new RecordObj_dd($dataframe_tipo);
		$main_component_tipo	= $RecordObj_dd->get_parent();

		// create the main component to obtain his data
			$model	= RecordObj_dd::get_modelo_name_by_tipo( $main_component_tipo );
			$lang	= RecordObj_dd::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
			$main_component = component_common::get_instance(
				$model, // string model
				$main_component_tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				$lang, // string lang
				$section_tipo // string section_tipo
			);

			$ar_section_tipo_key = $main_component->get_ar_target_section_tipo();

		// check value
			if (empty($ar_section_tipo_key)) {
				debug_log(__METHOD__
					. " Empty target_section_tipo " . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id) . PHP_EOL
					. ' dataframe_tipo: ' . to_string($dataframe_tipo)
					, logger::ERROR
				);
				return null;
			}

		$section_tipo_key = $ar_section_tipo_key[0];


		return $section_tipo_key;
	}//end get_section_tipo_key_from_main_component



	/**
	* CHANGE_DATA_LANG
	* Switch language of some component form original lang to target lang
	* Used to set non translatable component to translatable component or vice versa.
	* @return
	*/
	public static function change_data_lang( array $json_files ) {


		// disable activity log
			logger_backend_activity::$enable_log = false;


		debug_log(__METHOD__ . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			. " CONVERTING ... " . PHP_EOL
			. " changes_in_component_lang - json_files: " . json_encode($json_files) . PHP_EOL
			. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
			, logger::WARNING
		);

		$path = DEDALO_CORE_PATH.'/base/transform_definition_files/move_lang/';
		// get transform map from files
			//  value: {
			// 	"tipo"		: "hierarchy89" ,
			// 	"type"		: "component"
			// 	"ar_tables" : ["matrix","matrix_hierarchy","matrix_list","matrix_activities"]
			// 	"perform"	: ["lang_to_nolan"]
			// 	"info"		: "URL translatable => URL non translatable and transliterable"
			// }

			$ar_transform_map = [];
			foreach ($json_files as $current_json_file) {
				$contents			= file_get_contents($path.$current_json_file);
				$transform_map		= json_decode($contents);
				foreach ($transform_map as $transform_object) {
					$ar_transform_map[$transform_object->tipo] = $transform_object;
				}
			}

			// ar_tables without keys like ["matrix"]
			// get the unique values specify by the definition
			$ar_tables = array_unique( array_merge( ...array_map( function($el) {
				return $el->ar_tables ?? [];
			}, $ar_transform_map, []) ) );


		// CLI process data
			if ( running_in_cli()===true ) {
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
				common::$pdata->table = '';
				common::$pdata->memory = '';
				common::$pdata->counter = 0;
			}

		update::tables_rows_iterator(
			$ar_tables, // array of tables to iterate
			function($row, $table, $max) use($ar_transform_map) { // callback function

				$id				= $row['id'];
				$section_tipo	= $row['section_tipo'] ?? null;
				$section_id		= $row['section_id'] ?? null;
				$datos			= (isset($row['datos'])) ? json_handler::decode($row['datos']) : null;

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg	= (label::get_label('processing') ?? 'Processing') . ': changes_in_locators'
							. ' | table: ' 			. $table
							. ' | id: ' 			. $id .' - ' . $max
							. ' | section_tipo: ' 	. $section_tipo
							. ' | section_id: '  	. ($row['section_id'] ?? '');
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

					// datos properties
					foreach ($datos as $datos_key => $datos_value) {

						if( empty($datos_value) ){
							continue;
						}

						switch ($datos_key) {
							// Only literal components has lang
							case 'components':
								// update components object
								$literal_components = $datos_value ?? [];

								$new_components = new stdClass();

								foreach ($literal_components as $literal_tipo => $literal_value) {
									if( isset($ar_transform_map[$literal_tipo]) ){

										// Get the perform from definition
										$perform = $ar_transform_map[$literal_tipo]->perform;
										foreach ($perform as $action) {

											// check method already exists
												if(!method_exists('transform_data', $action)) {
													debug_log(__METHOD__
														. " Error. Calling undefined method transform_data::$action . Ignored action !"
														, logger::ERROR
													);
													continue;
												}

											$options = new stdClass();
												$options->transform_object	= $ar_transform_map[$literal_tipo];
												$options->new_components	= &$new_components; // pass by reference to allow add (!)
												$options->literal_tipo		= $literal_tipo;
												$options->literal_value		= $literal_value;

											transform_data::{$action}( $options );
										}
									}else{
										$new_components->{$literal_tipo} = $literal_value;
									}
								}

								// replace whole object
								$datos->$datos_key = $new_components;
								break;

							default:

								break;
						}
					}//end foreach ($datos as $datos_key => $datos_value)

					$section_data_encoded = json_encode($datos);

					$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
					$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
					if($result===false) {
						$msg = "Failed Update section_data ($table) $id";
						debug_log(__METHOD__
							." ERROR: $msg "
							, logger::ERROR
						);
						return false;
					}
				}//end if( isset($datos) )
			}//end anonymous function
		);

		// Time machine matrix table
		// change the langs into time machine rows
		foreach ($ar_transform_map as $tipo => $item) {

			// Get the perform from definition
			$perform = $item->perform;
			foreach ($perform as $action) {
				// define the query for all actions
				$strQuery = "
					UPDATE matrix_time_machine SET lang = $1 WHERE id in(
						SELECT id
						FROM \"matrix_time_machine\"
						WHERE \"tipo\" = $2 AND \"lang\" = $3
					);
				";
				// set the query values with the correct order based in perform actions
				switch ($action) {
					case 'lang_to_nolan':
						// set the default lang as nolan
						$result	= pg_query_params(
							DBi::_getConnection(),
							$strQuery,
							[DEDALO_DATA_NOLAN, $tipo, DEDALO_DATA_LANG_DEFAULT]
						);

						break;
					case 'nolang_to_lang':
					default:
						// set the nolan as default lang
						$result	= pg_query_params(
							DBi::_getConnection(),
							$strQuery,
							[DEDALO_DATA_LANG_DEFAULT, $tipo, DEDALO_DATA_NOLAN]
						);
						break;
				}
				if($result===false) {
					$msg = "Failed Update time machine record";
					debug_log(__METHOD__
						." ERROR: $msg ".PHP_EOL
						." tipo: ".$tipo .PHP_EOL
						." querry: ".$strQuery .PHP_EOL
						, logger::ERROR
					);
					return false;
				}
			}
		}

		// re-enable activity log
			logger_backend_activity::$enable_log = true;

	}//end change_data_lang



	/**
	* LANG_TO_NOLAN
	* Set the literal component lang defined as main lang to nolan
	* @param object $options
	* @return void
	*/
	public static function lang_to_nolan(object $options) {

		$transform_object	= $options->transform_object;
		$new_components		= $options->new_components; // pass by reference
		$literal_value		= $options->literal_value;

		$lang		= DEDALO_DATA_LANG_DEFAULT;
		$nolan		= DEDALO_DATA_NOLAN;
		$all_langs	= common::get_ar_all_langs();

		// check if the default lang exist in data
		if( !empty($literal_value->dato->$lang) ){
			// set the old values into the nolan
			$literal_value->dato->$nolan = $literal_value->dato->$lang;
			// remove the default lang
			unset($literal_value->dato->$lang);
		}else{
			// set the fallback lang
			foreach ($all_langs as $current_lang) {
				// pick any of the projects langs
				if( !empty($literal_value->dato->$current_lang) ){
					// set the old values into the nolan
					$literal_value->dato->$nolan = $literal_value->dato->$current_lang;
					// remove the default lang
					unset($literal_value->dato->$current_lang);
					// stop
					break;
				}
			}
		}

		// modifies passed by reference object new_components
		$new_components->{$transform_object->tipo} = $literal_value;
	}//end lang_to_nolan




}//end class transform_data
