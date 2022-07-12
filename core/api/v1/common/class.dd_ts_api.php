<?php
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
	* {}
	* 	dd_api			: 'dd_ts_api',
	* 	prevent_lock	: true,
	* 	action			: 'get_children_data',
	* 	source			: {
	* 		section_id		: parent_section_id,
	* 		section_tipo	: parent_section_tipo,
	* 		node_type		: node_type,
	* 		tipo			: tipo
	* 	}
	* }
	* @return object $response
	*/
	public static function get_children_data(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->error	= null;

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$node_type		= $source->node_type;
			$tipo			= $source->tipo;

		// children
			if($node_type==='hierarchy_node') {

				// Children are the same current data
				$locator = new locator();
					$locator->set_section_tipo($section_tipo);
					$locator->set_section_id($section_id);
				$children = array($locator);

			}else{

				// Calculate children from parent
				$modelo_name					= 'component_relation_children';
				$modo							= 'list_thesaurus';
				$lang							= DEDALO_DATA_NOLAN;
				$component_relation_children	= component_common::get_instance(
					$modelo_name,
					$tipo,
					$section_id,
					$modo,
					$lang,
					$section_tipo
				);
				$dato		= $component_relation_children->get_dato();
				$children	= $dato;
			}

		// model
			$options = new stdClass();
			if (isset($_SESSION['dedalo']['config']['thesaurus_view_mode']) && $_SESSION['dedalo']['config']['thesaurus_view_mode']==='model') {
				$options->model = true;
			}

		try {

			$children_data = array();
			foreach ((array)$children as $locator) {

				$section_id		= $locator->section_id;
				$section_tipo	= $locator->section_tipo;

				$ts_object			= new ts_object( $section_id, $section_tipo, $options );
				$children_object	= $ts_object->get_children_data();

				# Add only descriptors
				#if ($children_object->is_descriptor===true) {
					$children_data[] = $children_object;
				#}
			}

			$response->result	= (array)$children_data;
			$response->msg		= 'OK. Request done [get_children_data]';

		}catch(Exception $e) {

			$response->result	= false;
			$response->msg		= 'Error. Caught exception: '.$e->getMessage();
		}


		// debug
			// if(SHOW_DEBUG===true) {
			// 	$debug = new stdClass();
			// 		$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
			// 	$response->debug = $debug;

			// 	// end line info
			// 		$text			= 'TRIGGER TS_OBJECT REQUEST '.$section_tipo.'_'.$section_id.' END';
			// 		$text_lenght	= strlen($text) +1;
			// 		$nchars			= 200;
			// 		$line			= $text .' '. str_repeat("<", $nchars - $text_lenght);
			// 		debug_log(__METHOD__ . ' '.$debug->exec_time.PHP_EOL . $line, logger::DEBUG);
			// }


		return $response;
	}//end get_ar_children_data



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

		// short vars
			$source					= $rqo->source;
			$section_tipo			= $source->section_tipo;
			$section_id				= $source->section_id;
			// target_section_tipo. (!) Note that when hild_from_hierarchy is added, this value is different
			// else is the same value as section_tipo
			$target_section_tipo	= $source->target_section_tipo;
			$tipo					= $source->tipo;

		// new section. Create a new empty section
			$new_section	= section::get_instance(null, $target_section_tipo);
			$new_section_id	= $new_section->Save();
			if (empty($new_section_id)) {
				#debug_log(__METHOD__." Error on create new section from parent. Stoped add_child process !".to_string(), logger::ERROR);
				$response->msg = 'Error on create new section from parent. Stoped add_child process !';
				debug_log(__METHOD__." $response->msg ", logger::ERROR);
				return $response;
			}

		// section map
			$section_map = section::get_section_map( $target_section_tipo );

		// set new section component 'is_descriptor' value
			if (!isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map->thesaurus->is_descriptor!==false) {
					$component_tipo	= $section_map->thesaurus->is_descriptor;
					$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component		= component_common::get_instance(
						$modelo_name,
						$component_tipo,
						$new_section_id,
						'edit', // note mode edit autosave default value
						DEDALO_DATA_NOLAN,
						$target_section_tipo
					);
					$component->get_dato();
					debug_log(__METHOD__." Saved default dato to 'is_descriptor' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
				}
			}

		// is_indexable default value set
			if (!isset($section_map->thesaurus->is_indexable)) {
				debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map->thesaurus->is_indexable!==false) {
					$component_tipo	= $section_map->thesaurus->is_indexable;
					$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component		= component_common::get_instance(
						$modelo_name,
						$component_tipo,
						$new_section_id,
						'edit', // note mode edit autosave default value
						DEDALO_DATA_NOLAN,
						$target_section_tipo
					);
					$component->get_dato();
					debug_log(__METHOD__." Saved default dato to 'is_indexable' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
				}
			}

		// component_relation_children
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if ($modelo_name!=='component_relation_children') {
				$response->msg = 'Error on create new section from parent. Invalid model: '.$modelo_name.'. Expected: "component_relation_children" ';
				debug_log(__METHOD__." $response->msg ", logger::ERROR);
				return $response;
			}
			$modo							= 'edit';
			$lang							= DEDALO_DATA_NOLAN;
			$component_relation_children	= component_common::get_instance(
				$modelo_name,
				$tipo,
				$section_id,
				$modo,
				$lang,
				$section_tipo
			);

		// add
			$added = (bool)$component_relation_children->make_me_your_child( $target_section_tipo, $new_section_id );
			if ($added===true) {

				# Save relation children data
				$component_relation_children->Save();

				# All is ok. Result is new created section section_id
				$response->result	= (int)$new_section_id;
				$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';

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
		// 				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 				$component		= component_common::get_instance($modelo_name,
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
		// 				$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 				$component		= component_common::get_instance($modelo_name,
		// 																 $component_tipo,
		// 																 $new_section_id,
		// 																 'edit', // note mode edit autosave default value
		// 																 DEDALO_DATA_NOLAN,
		// 																 $target_section_tipo);
		// 				$component->get_dato();
		// 			}
		// 		}

		// 	// component_relation_children
		// 		$modelo_name	= 'component_relation_children';
		// 		$modo			= 'edit';
		// 		$lang			= DEDALO_DATA_NOLAN;
		// 		$component_relation_children = component_common::get_instance($modelo_name,
		// 																	  $tipo,
		// 																	  $section_id,
		// 																	  $modo,
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
	* DELETE
	* Removes current thesaurus element an all references in parents
	* @param object $rqo
	* Sample:
	* {
	*	"dd_api": "dd_ts_api",
	*	"prevent_lock": true,
	*	"action": "delete",
	*	"source": {
	*		"section_id": "5",
	*		"section_tipo": "ds1",
	*		"node_type": "thesaurus_node"
	*	}
	* }
	* @return object $response
	*/
	public static function delete(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;
			$node_type		= $source->node_type;

		// children . Verify that current term don't have children. If yes, stop process.
			$modelo_name		= 'component_relation_children';
			$modo				= 'edit';
			$lang				= DEDALO_DATA_NOLAN;
			$ar_children_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
			foreach ($ar_children_tipo as $current_tipo) {

				$component_relation_children = component_common::get_instance(
					$modelo_name,
					$current_tipo,
					$section_id,
					$modo,
					$lang,
					$section_tipo
				);
				$dato = $component_relation_children->get_dato();

				if (!empty($dato)) {
					debug_log(__METHOD__." Stopped delete term from thesaurus. Current term have children".to_string($dato), logger::DEBUG);
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') ' . "Stopped delete term from thesaurus. Current term have children ".to_string($dato);
					debug_log(__METHOD__." $response->msg ".to_string(), logger::WARNING);
					return (object)$response;
				}
			}

		// references . Calculate parents and removes references to current section
			$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, null);

		// record . Finally, delete target section
			$section_to_remove	= section::get_instance($section_id, $section_tipo);
			$result				= (bool)$section_to_remove->Delete('delete_record');

		// response OK
			$response->result	= $result;
			$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Removed section from thesaurus: section_id:$section_id, section_tipo:$section_tipo ".to_string(), logger::DEBUG);
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$debug->relation_response = $relation_response;

				$response->debug = $debug;
			}


		return $response;
	}//end delete



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
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

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

		// Remove current element as children from previous parent (old parentt)
			$locator = new locator();
				$locator->set_section_tipo($old_parent_section_tipo);
				$locator->set_section_id($old_parent_section_id);
			$filter = array($locator);
			$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, $filter);
			if ($relation_response->result===true) {
				debug_log(__METHOD__." Removed me as children from old parent  ".to_string(), logger::DEBUG);
			}

		// Add me as children of new parent
			$modelo_name					= 'component_relation_children';
			$modo							= 'edit';
			$lang							= DEDALO_DATA_NOLAN;
			$component_relation_children	= component_common::get_instance(
				$modelo_name,
				$tipo,
				$parent_section_id,
				$modo,
				$lang,
				$parent_section_tipo
			);

			$added = (bool)$component_relation_children->make_me_your_child( $section_tipo, $section_id );
			if ($added===true) {

				$component_relation_children->Save();

				debug_log(__METHOD__." Added dropped element as children of target wrap ".to_string(), logger::DEBUG);

				# All is ok. Result is new created section section_id
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
			}//end if ($added===true)

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
		// 	$response->msg 		= "Request done successufully";

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
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

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
			$result = $component_relation_children->Save();

		// response OK
			$response->result	= $result;
			$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end save_order



	/**
	* LINK_TERM
	* @return object $response
	*//*
	public function link_term($json_data) {

		# set vars
		$vars = array('section_tipo','section_id');
			foreach($vars as $name) {
				$$name = common::setVar($name);
				if (empty($$name)) {
					echo "Error. ".$$name." is mandatory";
					return false;
				}
			}

		$result = false;

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
	}//end link_term
	*/



}//end dd_ts_api
