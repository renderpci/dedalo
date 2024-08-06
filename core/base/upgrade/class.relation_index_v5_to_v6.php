<?php
require_once dirname(__FILE__) .'/class.v5_to_v6.php';
/**
* CLASS RELATION_INDEX_V5_TO_V6
*
*/
class relation_index_v5_to_v6 extends v5_to_v6 {



	/**
	* CHANGE_COMPONENT_DATO
	* @return array $ar_tables
	*/
	public static function change_component_dato() : array {

		$ar_tables = [
			// 'new_matrix'
			'matrix_test',
			'matrix_hierarchy'
		];

		$action = 'relation_index_v5_to_v6::change_index';

		self::convert_table_data($ar_tables, $action);

		return $ar_tables;
	}//end change_component_dato



	/**
	* CHANGE_INDEX_DATA_TO_PORTAL
	* Create inverted locators for each indexation and save in rsc167 (Audiovisuals)
	* the locator to current section record
	* Like
	* {
    *    "type": "dd96",
    *    "tag_id": "1",
    *    "section_id": "11",
    *    "section_tipo": "rsc167",
    *    "component_tipo": "rsc36",
    *    "section_top_id": "1",
    *    "section_top_tipo": "oh1",
    *    "from_component_tipo": "hierarchy40"
    * }
    * to:
   	* {
    *    "type": "dd96",
    *    "tag_id": "1",
    * 	 "tag_component_tipo" : "rsc36"
    *    "section_id": "11",
    *    "section_tipo": "rsc167",
    *    "section_top_id": "1",
    *    "section_top_tipo": "oh1",
    *    "from_component_tipo": "rsc860"
    * }
	* @return object $datos_column
	*/
	public static function change_index( stdClass $datos_column ) : object {

		$component_tipo = [
			'rsc36'	=> 'rsc860',
			'rsc30'	=> 'rsc860',
			'rsc38'	=> 'rsc860'
		];
		$dato = clone $datos_column;

		if (!empty($dato->relations)) {

			$new_relations = [];

			foreach ($dato->relations as $locator) {
				if($locator->type==='dd96' && isset($locator->tag_id)){

					$new_locator = new locator();
						$new_locator->set_type($locator->type);
						$new_locator->set_tag_id($locator->tag_id);
						$new_locator->set_tag_component_tipo($locator->component_tipo);
						$new_locator->set_section_tipo($dato->section_tipo);
						$new_locator->set_section_id($dato->section_id);

						if (!empty($locator->section_top_id)) {
							$new_locator->set_section_top_id($locator->section_top_id);
						}

						if (!empty($locator->section_top_tipo)) {
							$new_locator->set_section_top_tipo($locator->section_top_tipo);
						}

					$target_component_tipo = $component_tipo[$locator->component_tipo] ?? null;
					if (empty($target_component_tipo)) {
						debug_log(__METHOD__
							." Warning: Issue getting target_component_tipo from locator (ignored) : ".to_string($locator)
							, logger::ERROR
						);
						continue;
					}

					$model				= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true);
					$target_component	= component_common::get_instance(
						$model,
						$target_component_tipo,
						$locator->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$locator->section_tipo
					);

					$target_component->add_locator_to_dato($new_locator);
					$saved = $target_component->Save();

					// failed to save (when is ok, return a int section_id value)
						if (empty($saved)) {
							debug_log(__METHOD__
								." Error on save component data **--** $model - $target_component_tipo - $locator->section_tipo - $locator->section_id "
								, logger::ERROR
							);
							$new_relations[] = $locator; // preserve non saved locator
						}else{
							debug_log(__METHOD__
								." Saved relation_index! $model - $target_component_tipo - $locator->section_tipo - $locator->section_id " . PHP_EOL
								.' new_locator: ' . to_string($new_locator)
								, logger::DEBUG
							);
						}
				}else{
					$new_relations[] = $locator;
				}
			}//end foreach ($dato->relations as $key => $locator)

			$dato->relations = $new_relations;
		}


		return $dato;
	}//end change_index_data_to_portal



}//end class relation_index_v5_to_v6
