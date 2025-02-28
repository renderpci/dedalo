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
			$node_type				= $source->node_type;
			$tipo					= $source->tipo;
			$area_model				= $source->model ?? 'area_thesaurus';
			$options				= $rqo->options;
			$pagination				= $options->pagination ?? null;
			$thesaurus_view_mode	= $options->thesaurus_view_mode ?? 'default'; // string thesaurus_view_mode. Values: model|default
			$target_section_tipo	= $source->target_section_tipo;

		// ts_object_options. thesaurus_view_mode
			$ts_object_options = new stdClass();
				$ts_object_options->model = $thesaurus_view_mode==='model'
					? true
					: false; // get from URL as thesaurus_view_mode=model

		// target_section_properties check
			$RecordObj_dd				= new RecordObj_dd($target_section_tipo);
			$target_section_properties	= $RecordObj_dd->get_properties(true);

		// limit
			$default_limit = 300;

		// children
			if($node_type==='hierarchy_node') {

				// hierarchy_node: hierarchy case

				// Children are the same current data
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);
					$dato		= [$locator];
					$children	= $dato;

				if (!empty($target_section_properties) && isset($target_section_properties->children_search)) {
					// options add to use as exception in check children
					$ts_object_options->have_children = true;
				}

			}else{

				// thesaurus_node: section case (from current term children, usually 'hierarchy45')

				if (!empty($target_section_properties) && isset($target_section_properties->children_search)) {

					// pagination. Set default if is not defined
						$current_pagination = !empty($pagination)
							? $pagination
							: (object)[
								'limit'		=> $default_limit,
								'offset'	=> 0,
								'total'		=> null
							];

					// sqo. children_search
						$sqo = $target_section_properties->children_search->sqo;
						// add pagination
						$sqo->limit		= $current_pagination->limit;
						$sqo->offset	= $current_pagination->offset;

					$section_search	= search::get_instance(
						$sqo, // object sqo
					);
					$rows_data = $section_search->search();
					$children = array_map(function($item){

						$locator = new stdClass();
							$locator->section_tipo	= $item->section_tipo;
							$locator->section_id	= $item->section_id;

						return $locator;
					}, $rows_data->ar_records);

					// count
					if (!isset($current_pagination->total)) {
						$section_search	= search::get_instance(
							$target_section_properties->children_search->sqo, // basic SQO as {section_tipo:["rsc97"]}
						);
						$result = $section_search->count();
						$current_pagination->total = $result->total;
					}

				}else{

					// Calculate children from parent
						$model							= 'component_relation_children';
						$mode							= 'list_thesaurus';
						$lang							= DEDALO_DATA_NOLAN;
						$component_relation_children	= component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							$mode,
							$lang,
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
				}
			}

		// active ontologies list. Calculate once by session (445 ms)
		// Include only ontologies that have 'active_in_thesaurus' as true
			if(isset($_SESSION['dedalo']['config']['active_elements'])) {
				$active_elements = $_SESSION['dedalo']['config']['active_elements'];
			}else{
				$active_elements = [];
				foreach (ontology::get_active_elements() as $el) {
					// if ($el->active_in_thesaurus===true) {
						$active_elements[] = (object)[
							'tld'					=> $el->tld,
							'section_tipo'			=> $el->section_tipo,
							'target_section_tipo'	=> $el->target_section_tipo
						];
					// }
				}
				$_SESSION['dedalo']['config']['active_elements'] = $active_elements;
			}

		try {

			$children_data = [];
			foreach ((array)$children as $locator) {

				$section_id		= $locator->section_id;
				$section_tipo	= $locator->section_tipo;

				// remove the inactive ontologies in main ontology
				// some children defined in ontology node could be not active and loaded
				// remove they from the children_data to prevent to show it in the tree.
				if ($area_model==='area_ontology') {

					$found = array_find($active_elements, function($el) use($section_tipo){
						return $el->target_section_tipo===$section_tipo
							|| $el->section_tipo===$section_tipo
							|| get_tld_from_tipo($section_tipo)===$el->tld;
					});
					if (empty($found)) {
						// remove from pagination total count
						if (isset($current_pagination->total)) {
							$current_pagination->total--;
						}
						// ignore this non active tld item
						continue;
					}
				}

				$ts_object		= new ts_object( $section_id, $section_tipo, $ts_object_options );
				$child_object	= $ts_object->get_child_data();

				if (empty($child_object->ar_elements)) {
					$tld = get_tld_from_tipo($locator->section_tipo);
					debug_log(__METHOD__
						. " Empty ar_elements child. Maybe this tld ($tld) is not installed " . PHP_EOL
						. ' locator: ' . to_string($locator)
						, logger::ERROR
					);
				}

				$children_data[] = $child_object;
			}

			// response
				$response->result		= $children_data;
				$response->pagination	= $current_pagination ?? null;
				$response->msg			= empty($response->errors)
					? 'OK. Request done successfully'
					: 'Warning! Request done with errors';


		}catch(Exception $e) {

			$response->result	= false;
			$response->msg		= 'Error. Caught exception: '.$e->getMessage();
			$response->errors[] = 'caught exception';
		}

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
	*		node_type: "thesaurus_node"
	*		section_id: "1"
	*		section_tipo: "ds1"
	*		target_section_tipo: "ds1"
	*		tipo: "hierarchy49"
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
			$source					= $rqo->source;
			$section_tipo			= $source->section_tipo;
			$section_id				= $source->section_id;
			// target_section_tipo. (!) Note that when child_from_hierarchy is added, this value is different
			// else is the same value as section_tipo
			$target_section_tipo	= $source->target_section_tipo;
			$tipo					= $source->tipo;

		// new section. Create a new empty section
			$new_section	= section::get_instance(null, $target_section_tipo);
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
			$section_map = section::get_section_map( $target_section_tipo );

		// set new section component 'is_descriptor' value
			if (!isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__.
					" Invalid section_map 'is_descriptor' property from section:" . PHP_EOL
					.' target_section_tipo: ' . $target_section_tipo . PHP_EOL
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
						'edit', // note mode edit autosave default value
						DEDALO_DATA_NOLAN,
						$target_section_tipo
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

		// is_indexable default value set
			if (!isset($section_map->thesaurus->is_indexable)) {
				debug_log(__METHOD__
					." Invalid section_map 'is_indexable' property from section." . PHP_EOL
					.' target_section_tipo: ' . $target_section_tipo . PHP_EOL
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
						$target_section_tipo
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

		// component_relation_children
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			if ($model_name!=='component_relation_children') {
				$response->msg = 'Error on create new section from parent. Invalid model: '.$model_name.'. Expected: "component_relation_children" ';
				debug_log(__METHOD__.
					" $response->msg "
					, logger::ERROR
				);
				$response->errors[] = 'Invalid model '.$model_name;
				return $response;
			}
			$component_relation_children = component_common::get_instance(
				$model_name,
				$tipo, // normally hierarchy45
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo, // normally hierarchy1
				false
			);

		// add
			$added = (bool)$component_relation_children->make_me_your_child( $target_section_tipo, $new_section_id );
			if ($added===true) {

				// Save relation children data
				$component_relation_children->Save();

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
	* ADD_CHILD_FROM_HIERARCHY
	* @return object $response
	*/
		// public static function add_child_from_hierarchy(object $json_data) : object {
		// 	$start_time = start_time();

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// 	// vars
		// 		$vars = array('section_tipo','section_id','target_section_tipo','tipo');
		// 			foreach($vars as $name) {
		// 				$$name = common::setVarData($name, $json_data);
		// 				# DATA VERIFY
		// 				#if ($name==='dato') continue; # Skip non mandatory
		// 				if (empty($$name)) {
		// 					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
		// 					return $response;
		// 				}
		// 			}

		// 	// new section
		// 		$new_section	= section::get_instance(null,$target_section_tipo);
		// 		$new_section_id	= $new_section->Save();
		// 						if (empty($new_section_id)) {
		// 							debug_log(__METHOD__." Error on create new section from parent. Stoped add_child process !".to_string(), logger::ERROR);
		// 							$response->msg = 'Trigger Error: ('.__FUNCTION__.') Error on create new section from parent. Stoped add_child process !';
		// 							return $response;
		// 						}
		// 	// section map
		// 		$section_map = section::get_section_map( $target_section_tipo );

		// 	// set new section component 'is_descriptor' value
		// 		if (!isset($section_map->thesaurus->is_descriptor)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
		// 		}else{
		// 			if ($section_map->thesaurus->is_descriptor!==false) {
		// 				$component_tipo	= $section_map->thesaurus->is_descriptor;
		// 				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 				$component		= component_common::get_instance($model_name,
		// 																 $component_tipo,
		// 																 $new_section_id,
		// 																 'edit', // note mode edit autosave default value
		// 																 DEDALO_DATA_NOLAN,
		// 																 $target_section_tipo);
		// 				$component->get_dato();
		// 			}
		// 		}

		// 	// set new section component 'is_indexable' value
		// 		if (!isset($section_map->thesaurus->is_indexable)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
		// 		}else{
		// 			if ($section_map->thesaurus->is_indexable!==false) {
		// 				$component_tipo	= $section_map->thesaurus->is_indexable;
		// 				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 				$component		= component_common::get_instance($model_name,
		// 																 $component_tipo,
		// 																 $new_section_id,
		// 																 'edit', // note mode edit autosave default value
		// 																 DEDALO_DATA_NOLAN,
		// 																 $target_section_tipo);
		// 				$component->get_dato();
		// 			}
		// 		}

		// 	// component_relation_children
		// 		$model_name	= 'component_relation_children';
		// 		$mode			= 'edit';
		// 		$lang			= DEDALO_DATA_NOLAN;
		// 		$component_relation_children = component_common::get_instance($model_name,
		// 																	  $tipo,
		// 																	  $section_id,
		// 																	  $mode,
		// 																	  $lang,
		// 																	  $section_tipo);

		// 	// add
		// 		$added = (bool)$component_relation_children->make_me_your_child( $target_section_tipo, $new_section_id );
		// 		if ($added===true) {
		// 			$component_relation_children->Save();

		// 			# All is ok. Result is new created section section_id
		// 			$response->result  	= (int)$new_section_id;
		// 			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		// 		}

		// 	// debug
		// 		if(SHOW_DEBUG===true) {
		// 			$debug = new stdClass();
		// 				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
		// 				foreach($vars as $name) {
		// 					$debug->{$name} = $$name;
		// 				}

		// 			$response->debug = $debug;
		// 		}

		// 	return (object)$response;
		// }//end add_child_from_hierarchy



	/**
	* UPDATE_PARENT_DATA
	* Changes element parent from actual to a new value
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
	*		parent_node_type		: parent_node_type,
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
			$parent_section_id			= $source->parent_section_id;
			$parent_section_tipo		= $source->parent_section_tipo;
			$parent_node_type			= $source->parent_node_type;
			$tipo						= $source->tipo;

		// Remove current element as children from previous parent (old parent)
			$locator = new locator();
				$locator->set_section_tipo($old_parent_section_tipo);
				$locator->set_section_id($old_parent_section_id);
			$filter = array($locator);
			$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, $filter);
			if ($relation_response->result===true) {
				debug_log(__METHOD__
					." Removed me as children from old parent " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' section_id: ' . $section_id . PHP_EOL
					.' filter: ' . to_string($filter)
					, logger::DEBUG
				);
			}

		// Add me as children of new parent
			$model_name						= 'component_relation_children';
			$mode							= 'edit';
			$lang							= DEDALO_DATA_NOLAN;
			$component_relation_children	= component_common::get_instance(
				$model_name,
				$tipo,
				$parent_section_id,
				$mode,
				$lang,
				$parent_section_tipo
			);

			$added = (bool)$component_relation_children->make_me_your_child( $section_tipo, $section_id );
			if ($added===true) {

				$component_relation_children->Save();

				debug_log(__METHOD__
					." Added dropped element as children of target wrap "
					, logger::DEBUG
				);

				// All is OK. Result is new created section section_id
				$response->result = true;

			}else{

				$response->result = false;
				$response->errors[] = 'failed adding children';

			}//end if ($added===true)

		// response
			$response->msg = empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time,'ms')." ms";
					$debug->remove_parent_references	= $relation_response;
					$debug->added						= $added;

				$response->debug = $debug;
			}


		return $response;
	}//end update_parent_data



	/**
	* SHOW_INDEXATIONS | Moved to dd_api 27-07-2021
	* @return object $response
	*/
		// function show_indexations_DES($json_data) {
		// 	$start_time = start_time();

		// 	session_write_close();

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// 	# set vars
		// 	$vars = array('section_tipo','section_id','component_tipo');
		// 		foreach($vars as $name) {
		// 			$$name = common::setVarData($name, $json_data);
		// 			# DATA VERIFY
		// 			#if ($name==='dato') continue; # Skip non mandatory
		// 			if (empty($$name)) {
		// 				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
		// 				return $response;
		// 			}
		// 		}

		// 	# DIFFUSION_INDEX_TS
		// 	$diffusion_index_ts = new diffusion_index_ts($section_tipo, $section_id, $component_tipo);
		// 	$html 				= $diffusion_index_ts->get_html();

		// 	$response->result 	= $html;
		// 	$response->msg 		= "Request done successfully";

		// 	# Debug
		// 	if(SHOW_DEBUG===true) {
		// 		$debug = new stdClass();
		// 			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
		// 			foreach($vars as $name) {
		// 				$debug->{$name} = $$name;
		// 			}

		// 		$response->debug = $debug;
		// 	}


		// 	return (object)$response;
		// }//end show_indexations



	/**
	* SAVE_ORDER
	* @param object rqo
	* Sample:
	* {
	*	dd_api			: 'dd_ts_api',
	*	prevent_lock	: true,
	*	action			: 'save_order',
	*	source			: {
	*		section_id		: section_id,
	*		section_tipo	: section_tipo,
	*		component_tipo	: component_tipo,
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
			$section_id		= $source->section_id;
			$component_tipo	= $source->component_tipo;
			$ar_locators	= $source->ar_locators;

		// dato
			$dato = [];
			foreach ((array)$ar_locators as $current_locator) {
				$locator = new locator();
					$locator->set_section_tipo($current_locator->section_tipo);
					$locator->set_section_id($current_locator->section_id);
					$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
					$locator->set_from_component_tipo($component_tipo);

				$dato[] = $locator;
			}

		// relation_children set dato
			$component_relation_children = component_common::get_instance(
				'component_relation_children',
				$component_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			// Current component dato is replaced completely with the new dato
			// This action returns the dato parsed with method component_relation_common->set_dato()
			$component_relation_children->set_dato($dato);
			$result = $component_relation_children->Save(); // return int|null
			if (empty($result)) {
				$response->errors[] = 'failed save';
			}

		// response OK
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end save_order



}//end dd_ts_api
