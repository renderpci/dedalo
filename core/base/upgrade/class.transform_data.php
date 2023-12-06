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
			$original			= $options->original;
			$new				= $options->new;
			$delete_old_data	= $options->delete_old_data; // bool true by default

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



}//end class transform_data
