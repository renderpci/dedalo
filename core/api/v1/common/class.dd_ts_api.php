<?php declare(strict_types=1);
/**
* DD_TS_API
* Manage API REST data of area_thesaurus and ts_object with Dédalo
*
*/
final class dd_ts_api {



	/**
	* GET_CHILDREN_DATA
	* Get JSON data of all children of current element
	* @param object $rqo
	* Sample:
	* {
	* 	dd_api			: 'dd_ts_api',
	* 	prevent_lock	: true,
	* 	action			: 'get_children_data',
	* 	source			: {
	* 		section_id		: parent_section_id,
	* 		section_tipo	: parent_section_tipo,
	* 		node_type		: node_type,
	* 		tipo			: tipo
	* 	},
	* 	options : {
	* 		pagination: {
	* 			limit: 100,
	* 			offset: 0,
	* 			total: 150
	* 		}
	* 	}
	* }
	* @return object $response
	*/
	public static function get_children_data(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$source					= $rqo->source;
			$section_tipo			= $source->section_tipo;
			$section_id				= $source->section_id;
			$children_tipo			= $source->children_tipo;
			$area_model				= $source->model ?? 'area_thesaurus';
			$children				= $source->children ?? null;
			$options				= $rqo->options;
			$pagination				= $options->pagination ?? null;
			$thesaurus_view_mode	= $options->thesaurus_view_mode ?? 'default'; // string thesaurus_view_mode. Values: model|default

		// ts_object_options. thesaurus_view_mode
			$ts_object_options = new stdClass();
				$ts_object_options->model = $thesaurus_view_mode==='model'
					? true
					: false; // get from URL as thesaurus_view_mode=model

		// section_properties check
			$RecordObj_dd		= new RecordObj_dd($section_tipo);
			$section_properties	= $RecordObj_dd->get_properties(true);

		// limit
			$default_limit = 300;

		// children. Calculated from given locator
			switch (true) {
				case !empty($children):
					// root nodes are passed as resolved $children array case
					break;

				case !empty($section_properties) && isset($section_properties->children_search):
					// thesaurus_node: section case (from current term children, usually 'hierarchy45')
					// pagination. Set default if is not defined
						$current_pagination = !empty($pagination)
							? $pagination
							: (object)[
								'limit'		=> $default_limit,
								'offset'	=> 0,
								'total'		=> null
							];

					// sqo. children_search
						$sqo = $section_properties->children_search->sqo;
						// add pagination
						$sqo->limit		= $current_pagination->limit;
						$sqo->offset	= $current_pagination->offset;

						$section_search	= search::get_instance(
							$sqo // object sqo
						);
						$rows_data = $section_search->search();

					// children
						$children = array_map(function($item){

							$locator = new stdClass();
								$locator->section_tipo	= $item->section_tipo;
								$locator->section_id	= $item->section_id;

							return $locator;
						}, $rows_data->ar_records);

					// count
						if (!isset($current_pagination->total)) {
							$section_search	= search::get_instance(
								$section_properties->children_search->sqo, // basic SQO as {section_tipo:["rsc97"]}
							);
							$result = $section_search->count();
							$current_pagination->total = $result->total;
						}
					break;

				default:
					// Calculate children from parent
						$model = RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true);
						if ($model!=='component_relation_children') {
							$response->errors[] = 'Wrong model';
							$response->msg .= ' Expected model (component_relation_children) but calculated: ' . $model;
							return $response;
						}

					// component_relation_children
						$component_relation_children = component_common::get_instance(
							$model,
							$children_tipo,
							$section_id,
							'list_thesaurus',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);

						$dato = $component_relation_children->get_dato();

					// pagination. Set default if is not defined
						$current_pagination = !empty($pagination)
							? $pagination
							: (object)[
								'limit'		=> $default_limit,
								'offset'	=> 0,
								'total'		=> (is_array($dato) ? count($dato) : 0)
							];
						$component_relation_children->pagination = $current_pagination;

					// dato_paginated
						$dato_paginated	= $component_relation_children->get_dato_paginated();
						$children		= $dato_paginated;
					break;
			}

		// parse_child_data
			$ar_children_data = ts_object::parse_child_data(
				$children,
				$area_model,
				$ts_object_options
			);

		// build children_data result object
			$children_data = (object)[
				'ar_children_data'	=> $ar_children_data,
				'pagination'		=> $pagination
			];

		// response
			$response->result		= $children_data;
			$response->pagination	= $current_pagination ?? null;
			$response->msg			= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$debug = new stdClass();
			// 		$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
			// 	$response->debug = $debug;

			// 	// end line info
			// 		$text			= 'TRIGGER TS_OBJECT REQUEST '.$section_tipo.'_'.$section_id.' END';
			// 		$text_length	= strlen($text) +1;
			// 		$nchars			= 200;
			// 		$line			= $text .' '. str_repeat("<", $nchars - $text_length);
			// 		debug_log(__METHOD__ . ' '.$debug->exec_time.PHP_EOL . $line, logger::DEBUG);
			// }


		return $response;
	}//end get_children_data



	/**
	* ADD_CHILD
	* @param object $rqo
	* Sample:
	* {
	* 	action: "add_child"
	*	dd_api: "dd_ts_api"
	*	prevent_lock: true
	*	source: {
	*		section_tipo: string "ds1"
	*		section_id: string|int "77"
	* 	}
	* }
	* @return object $response
	*/
	public static function add_child(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// new section. Create a new empty section
			$new_section	= section::get_instance(null, $section_tipo);
			$new_section_id	= $new_section->Save();
			if (empty($new_section_id)) {
				$response->msg = 'Error on create new section from parent. Stopped add_child process !';
				debug_log(__METHOD__
					." $response->msg "
					, logger::ERROR
				);
				$response->errors[] = 'Failed create new section from parent';
				return $response;
			}

		// section map
			$section_map = section::get_section_map( $section_tipo );

		// is_descriptor: set new section component 'is_descriptor' value
			if (!isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__.
					" Invalid section_map 'is_descriptor' property from section:" . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_map: ' . to_string($section_map)
					, logger::DEBUG
				);
				$response->errors[] = 'Invalid section_map \'is_descriptor\' property from section';
			}else{
				if ($section_map->thesaurus->is_descriptor!==false) {
					$component_tipo	= $section_map->thesaurus->is_descriptor;
					$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component		= component_common::get_instance(
						$model,
						$component_tipo,
						$new_section_id,
						'edit', // note that mode edit autosave default value
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$component->get_dato();
					debug_log(__METHOD__
						." Saved default dato to 'is_descriptor' " . PHP_EOL
						.' component_tipo: ' . $component_tipo . PHP_EOL
						.' model: ' . $model . PHP_EOL
						.' section_id: ' . to_string($new_section_id)
						, logger::DEBUG
					);
				}
			}

		// is_indexable: set is_indexable default value
			if (!isset($section_map->thesaurus->is_indexable)) {
				debug_log(__METHOD__
					." Invalid section_map 'is_indexable' property from section." . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_map: ' . to_string($section_map)
					, logger::DEBUG
				);
				$response->errors[] = 'Invalid section_map \'is_indexable\' property from section';
			}else{
				if ($section_map->thesaurus->is_indexable!==false) {
					$component_tipo	= $section_map->thesaurus->is_indexable;
					$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component		= component_common::get_instance(
						$model,
						$component_tipo,
						$new_section_id,
						'edit', // note mode edit autosave default value
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$component->get_dato();
					debug_log(__METHOD__
						." Saved default dato to 'is_indexable' " . PHP_EOL
						.' component_tipo: ' . $component_tipo . PHP_EOL
						.' model: ' . $model . PHP_EOL
						.' section_id: ' . to_string($new_section_id)
						, logger::DEBUG
					);
				}
			}

		// component_relation_parent
		// Is created in the new created record and the current section_id is added as parent
			$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section($section_tipo, ['component_relation_parent'], true, true, true, true);
			$component_relation_parent_tipo = $ar_parent_tipo[0] ?? null;
			if (empty($component_relation_parent_tipo)) {
				$response->msg = 'Error on get component_relation_parent from section. Model does not exists';
				debug_log(__METHOD__.
					" $response->msg "
					, logger::ERROR
				);
				$response->errors[] = 'Invalid component_relation_parent from section '.$section_tipo;
				return $response;
			}
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($component_relation_parent_tipo, true);
			$component_relation_parent = component_common::get_instance(
				$model_name,
				$component_relation_parent_tipo,
				$new_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo,
				false
			);

		// add
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);
				$locator->set_from_component_tipo($component_relation_parent_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

			$added = (bool)$component_relation_parent->add_locator_to_dato( $locator );
			if ($added===true) {

				// Save relation parent data
				$component_relation_parent->Save();

				// All is OK. Result is new created section section_id
				$response->result	= (int)$new_section_id;
				$response->msg		= empty($response->errors)
					? 'OK. Request done successfully'
					: 'Warning! Request done with errors';

				// debug
					if(SHOW_DEBUG===true) {
						$debug = new stdClass();
							$debug->exec_time = exec_time_unit($start_time,'ms').' ms';
						$response->debug = $debug;
					}
			}//end if ($added===true)


		return $response;
	}//end add_child



	/**
	* UPDATE_PARENT_DATA
	* Changes element parent from actual to a new value
	* Used to move thesaurus items between parents
	* @param object $rqo
	* Sample:
	* {
	*	dd_api			: 'dd_ts_api',
	*	prevent_lock	: true,
	*	action			: 'update_parent_data',
	*	source			: {
	*		section_id				: wrap_ts_object.dataset.section_id,
	*		section_tipo			: wrap_ts_object.dataset.section_tipo,
	*		old_parent_section_id	: old_parent_wrap.dataset.section_id,
	*		old_parent_section_tipo	: old_parent_wrap.dataset.section_tipo,
	*		parent_section_id		: parent_wrap.dataset.section_id,
	*		parent_section_tipo		: parent_wrap.dataset.section_tipo,
	*		tipo					: element_children.dataset.tipo
	*	}
	* }
	* @return object $response
	*/
	public static function update_parent_data(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$source						= $rqo->source;
			$section_tipo				= $source->section_tipo;
			$section_id					= $source->section_id;
			$old_parent_section_id		= $source->old_parent_section_id;
			$old_parent_section_tipo	= $source->old_parent_section_tipo;
			$new_parent_section_id		= $source->new_parent_section_id;
			$new_parent_section_tipo	= $source->new_parent_section_tipo;

		// component_relation_parent
			$parent_tipo	= section::get_ar_children_tipo_by_model_name_in_section($section_tipo, ['component_relation_parent'], true, true, true, true)[0];
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($parent_tipo,true);
			$lang			= DEDALO_DATA_NOLAN;
			$component_relation_parent = component_common::get_instance(
				$model_name,
				$parent_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

		// remove old parent
			$locator = new locator();
				$locator->set_section_tipo($old_parent_section_tipo);
				$locator->set_section_id($old_parent_section_id);
				$locator->set_from_component_tipo($parent_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);
			$result = $component_relation_parent->remove_locator_from_dato($locator);
			if (!$result) {
				$response->errors[] = 'remove old parent failed';
				$response->msg .= ' Remove old parent locator failed: ' . to_string($locator);
				return $response;
			}
			debug_log(__METHOD__
				. " Removed old locator from dato " . PHP_EOL
				. ' locator: ' . to_string($locator)
				, logger::DEBUG
			);

		// add new parent
			$locator = new locator();
				$locator->set_section_tipo($new_parent_section_tipo);
				$locator->set_section_id($new_parent_section_id);
				$locator->set_from_component_tipo($parent_tipo);
				$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);
			$result = $component_relation_parent->add_locator_to_dato($locator);
			if (!$result) {
				$response->errors[] = 'add new parent failed';
				$response->msg .= ' Add new parent locator failed: ' . to_string($locator);
				return $response;
			}
			debug_log(__METHOD__
				. " Added new locator to dato " . PHP_EOL
				. ' locator: ' . to_string($locator)
				, logger::DEBUG
			);

		// save
			$component_relation_parent->Save();

		// response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time,'ms').' ms';
					// $debug->remove_parent_references	= $relation_response;
					// $debug->added						= $added;

				$response->debug = $debug;
			}


		return $response;
	}//end update_parent_data



	/**
	* SAVE_ORDER
	* Updates order values from the locators array given.
	* @param object rqo
	* Sample:
	* {
	*	dd_api			: 'dd_ts_api',
	*	prevent_lock	: true,
	*	action			: 'save_order',
	*	source			: {
	*		section_tipo	: section_tipo,
	*		ar_locators		: ar_locators
	*	}
	* }
	* @return object $response
	*/
	public static function save_order(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$ar_locators	= $source->ar_locators;

		// sort
			$result = component_relation_children::sort_children( $section_tipo, $ar_locators );

		// response
			$response->msg = $result===false
				? 'Error. The order cannot be established. Invalid section map. Please, define a valid section list map such as {"order":"hierarchy49"}'
				: 'OK. Request done successfully. Changed values: ' . count($result);
			$response->result = $result;

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end save_order



}//end dd_ts_api
