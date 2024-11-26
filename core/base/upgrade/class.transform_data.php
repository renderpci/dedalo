<?php
declare(strict_types=1);
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

					// time machine data update
						// $old_locator = clone $locator;
						// self::fix_dataframe_tm(
						// 	$datos->section_id,
						// 	$datos->section_tipo,
						// 	$old_locator,
						// 	$locator
						// );

					// ratting component update
						// 	$component_rating = component_common::get_instance(
						// 		'component_radio_button', // string model
						// 		$ratting_tipo, // string tipo
						// 		$new_target_section_id, // string section_id
						// 		'list', // string mode
						// 		DEDALO_DATA_NOLAN, // string lang
						// 		$target_section_tipo // string section_tipo
						// 	);

						// 	$dato = new locator();
						// 		$dato->set_section_tipo('dd500');
						// 		$dato->set_section_id('1');

						// 	$component_rating->set_dato([$dato]);
						// 	$component_rating->Save();
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

					$compnent_data = $component_view_in_ts->get_dato();

					if(!empty($compnent_data)){
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
			$path = DEDALO_CORE_PATH.'/base/transform_definition_files/';
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
			// ar_old_section_tipo without keys like ["numisdata279"]
			$ar_old_section_tipo = array_map(function($el){
				return $el->old;
			}, $ar_section_elements, []);

		// skip_virtuals
			$skip_virtuals = array_map(function($el){
				return $el->skip_virtuals ?? [];
			}, $ar_section_elements, []);
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
														. " Error. Calling undefined method transform_data::$action . Ignored action !" . PHP_EOL
														. to_string()
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
			$matrix_descriptors_dd_exists = DBi::check_table_exists('matrix_descriptors_dd');
			if (!$matrix_descriptors_dd_exists) {
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

		// collect all children sections of 'ontology38' ('Instances')
		// like 'dd', 'ontology', 'rsc', 'nexus', etc.
		$ontology_tlds = [];
		$ontology_children = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'ontology38','section','children_recursive' );
		foreach ($ontology_children as $current_tipo) {

			$term			= RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_STRUCTURE_LANG, false) ?? '';
			$ar_tem			= explode(' | ', $term );
			$RecordObj_dd	= new RecordObj_dd($current_tipo);
			$properties		= $RecordObj_dd->get_properties();
			$tld			= $properties->main_tld ?? null;

			if( empty($tld) ){
				debug_log(__METHOD__
					. "Ignored tld, empty main_tld" . PHP_EOL
					. "tipo: " . to_string( $current_tipo )
					, logger::ERROR
				);
				continue;
			}

			if( isset($ar_tem[1]) && $tld === $ar_tem[1] ){

				$ontology_tlds[] = $tld;

			}else{

				debug_log(__METHOD__
					. "Invalid tld, do not match with name" . PHP_EOL
					. "tld: " . to_string( $tld ). " - name: " . to_string( $ar_tem )
					, logger::ERROR
				);
				continue;
			}
		}

		// add first the ontology_tlds to preserve the order
		$sorted_tlds = $ontology_tlds;
		// add all others non already included
		foreach ($all_active_tld as $current_tld) {
			if (!in_array($current_tld, $sorted_tlds)) {
				$sorted_tlds[] = $current_tld;
			}
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

			// main_section. Add one main section for each tld if not already exists
			ontology::add_main_section( $tld );

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->action = 'ceate_ontology_records';
					common::$pdata->memory = dd_memory_usage();
					common::$pdata->msg = $base_msg . ' ['.common::$pdata->action .' '. $tld . ']';
					// send to output
					print_cli(common::$pdata);
				}

			// ontology_records. Collects all jer_dd records for the current tld and
			// creates a matrix record for each one
			$jer_dd_rows = RecordObj_dd::get_all_tld_records( [$tld] );
			ontology::ceate_ontology_records( $jer_dd_rows );
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

		die();


		return true;
	}//end generate_all_main_ontology_sections



}//end class transform_data
