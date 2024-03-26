<?php
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
	public static function add_portal_level(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// options
			$tld				= $options->tld; // string like 'numisdata'
			$original			= $options->original; // array of object
			$new				= $options->new; // array of objects
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
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1447';
								break;

							case 'numisdata1017':
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1448';
								break;

							case 'numisdata865':
								$locator->section_id			= $create_new_rating_section();
								$locator->section_tipo			= $target_section_tipo;
								$locator->from_component_tipo	= 'numisdata1449';
								break;

							case 'oh126':
								$locator->from_component_tipo	= 'oh115';
								break;

							case 'rsc1057':
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
	* UPDATE_hierarchy_view_in_thesaurus
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
	* @return null $datos // don't need to be saved by update, the new component save by itself
	*/
	public static function add_view_in_thesaurus(?object $datos) : null {

		// empty relations cases
			if (empty($datos->relations)) {
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




}//end class transform_data
