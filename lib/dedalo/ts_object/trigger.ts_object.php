<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
include(DEDALO_LIB_BASE_PATH.'/ts_object/class.ts_object.php');

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
$options = new stdClass();
if (isset($_GET['mode']) && $_GET['mode']==='get_childrens_data') {
	$options->source = 'GET';
}else{
	$options->source = 'php://input';
}
common::trigger_manager($options);

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* GET_CHILDRENS_DATA
* Get json data of all childrens of current element
* @return object $response
*/
function get_childrens_data($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','section_id','node_type','tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	
	if($node_type==='hierarchy_node') {

		// Childrens are the same current data
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
		$childrens = array($locator);
			#dump($childrens, ' childrens ++ '.to_string());

	}else{

		// Calculate childrens from parent
		$modelo_name='component_relation_children';
		$modo 		='list_thesaurus';
		$lang		=DEDALO_DATA_NOLAN;
		$component_relation_children = component_common::get_instance($modelo_name,
																	  $tipo,
																	  $section_id,
																	  $modo,
																	  $lang,
																	  $section_tipo);
		$dato 	   = $component_relation_children->get_dato();
		$childrens = $dato;

		# sort_elements
		#if(SHOW_DEBUG===true) $start_time = start_time();
		#$childrens = ts_object::sort_elements($childrens, 'asc');
		#if(SHOW_DEBUG===true) debug_log(__METHOD__." Titme to sort childrens ".count($childrens)." - ".exec_time($start_time,""), logger::DEBUG);
	}


	$options = new stdClass();
	if (isset($_SESSION['dedalo4']['config']['thesaurus_view_mode']) && $_SESSION['dedalo4']['config']['thesaurus_view_mode']==='model') {
		$options->model = true;
	}
	
	try{		

		$childrens_data = array();
		foreach ((array)$childrens as $locator) {
			
			$section_id 		= $locator->section_id;
			$section_tipo 		= $locator->section_tipo;				

			$ts_object  		= new ts_object( $section_id, $section_tipo, $options );
			$childrens_object 	= $ts_object->get_childrens_data();
			#debug_log(__METHOD__." childrens_object ".to_string($childrens_object), logger::DEBUG);

			# Add only descriptors
			#if ($childrens_object->is_descriptor===true) {
				$childrens_data[] 	= $childrens_object;
			#}		
		}

		$response->result 	= (array)$childrens_data;
		$response->msg 		= 'Ok. Request done [get_childrens_data]';
	
	}catch(Exception $e) {

		$response->result 	= false;
		$response->msg 		= 'Error. Caught exception: '.$e->getMessage();		
	}

	

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end get_ar_childrens_data_real



/**
* ADD_CHILDREN
* @return object $response
*/
function add_children($json_data) {
	global $start_time;

	$response = new stdClass();
	$response->result 	= false;
	$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// set vars
		$vars = array('section_tipo','section_id','node_type','tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

	// new section. Create a new empty section
		$new_section 	= section::get_instance(null,$section_tipo);
		$new_section_id	= $new_section->Save();
						if (empty($new_section_id)) {
							#debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
							$response->msg 		= 'Error on create new section from parent. Stoped add_children process !';
							return $response;
						}

	// section map
		$section_map = hierarchy::get_section_map_elemets( $section_tipo );

	// set new section component 'is_descriptor' value		
		if (!isset($section_map['thesaurus']->is_descriptor)) {
			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
		}else{

			$component_tipo = $section_map['thesaurus']->is_descriptor;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 	 	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $new_section_id,
															 'edit', // note mode edit autosave default value
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->get_dato();
			debug_log(__METHOD__." Saved default dato to 'is_descriptor' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
		}

	// is_indexable default value set
		if (!isset($section_map['thesaurus']->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
		}else{

			$component_tipo = $section_map['thesaurus']->is_indexable;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 	 	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $new_section_id,
															 'edit', // note mode edit autosave default value
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->get_dato();
			debug_log(__METHOD__." Saved default dato to 'is_indexable' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
		}


	# COMPONENT_RELATION_CHILDREN
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	if ($modelo_name!=='component_relation_children') {
		$response->msg = 'Error on create new section from parent. Invalid model: '.$modelo_name.'. Expected: "component_relation_children" ';
		return $response;
	}	
	$modo 			= 'edit';
	$lang			= DEDALO_DATA_NOLAN;
	$component_relation_children = component_common::get_instance($modelo_name,
																  $tipo,
																  $section_id,
																  $modo,
																  $lang,
																  $section_tipo);

	$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $new_section_id );
	if ($added===true) {

		# Save relation children data
		$component_relation_children->Save();

		# All is ok. Result is new created section section_id
		$response->result  	= (int)$new_section_id;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";			
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}
			$response->debug = $debug;
		}
	}
	

	return (object)$response;
}//end add_children



/**
* ADD_CHILDREN_FROM_HIERARCHY
* @return object $response
*/
function add_children_from_hierarchy($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// vars
		$vars = array('section_tipo','section_id','target_section_tipo','tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

	// new section
		$new_section 	= section::get_instance(null,$target_section_tipo);
		$new_section_id	= $new_section->Save();
						if (empty($new_section_id)) {
							debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
							$response->msg = 'Trigger Error: ('.__FUNCTION__.') Error on create new section from parent. Stoped add_children process !';
							return $response;
						}
	// section map
		$section_map = hierarchy::get_section_map_elemets( $section_tipo );

	// set new section component 'is_descriptor' value
		if (!isset($section_map['thesaurus']->is_descriptor)) {
			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
		}else{

			$component_tipo = $section_map['thesaurus']->is_descriptor;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 	 	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $new_section_id,
															 'edit', // note mode edit autosave default value
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->get_dato();
		}

	// set new section component 'is_indexable' value
		if (!isset($section_map['thesaurus']->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
		}else{

			$component_tipo = $section_map['thesaurus']->is_indexable;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 	 	= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $new_section_id,
															 'edit', // note mode edit autosave default value
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->get_dato();
		}

	// component_relation_children
		$modelo_name 	= 'component_relation_children';
		$modo 			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;
		$component_relation_children = component_common::get_instance($modelo_name,
																	  $tipo,
																	  $section_id,
																	  $modo,
																	  $lang,
																	  $section_tipo);

	// add
		$added = (bool)$component_relation_children->make_me_your_children( $target_section_tipo, $new_section_id );
		if ($added===true) {
			$component_relation_children->Save();

			# All is ok. Result is new created section section_id
			$response->result  	= (int)$new_section_id;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}

	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

	return (object)$response;
}//end add_children_from_hierarchy



/**
* DELETE
* Removes current thesaurus element an all references in parents
* @return object $response
*/
function delete($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','section_id','node_type');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	

	# CHILDRENS . Verify that current term don't have childrens. If yes, stop process.
	$modelo_name 		= 'component_relation_children';
	$modo 				= 'edit';
	$lang				= DEDALO_DATA_NOLAN;
	$ar_children_tipo 	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
	foreach ($ar_children_tipo as $current_tipo) {

	 	$component_relation_children = component_common::get_instance($modelo_name,
																	  $current_tipo,
																	  $section_id,
																	  $modo,
																	  $lang,
																	  $section_tipo);
	 	$dato = $component_relation_children->get_dato();

	 	if (!empty($dato)) {
	 		debug_log(__METHOD__." Stopped delete term from thesaurus. Current term have childrens".to_string($dato), logger::DEBUG);
	 		$response->msg = 'Trigger Error: ('.__FUNCTION__.') ' . "Stopped delete term from thesaurus. Current term have childrens ".to_string($dato);
	 		return (object)$response;
	 	}
	}
	

	# REFERENCES . Calculate parents and removes references to current section	
	$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, false);


	# RECORD . Finally, delete target section
	$section_to_remove	= section::get_instance($section_id, $section_tipo);
	$result 			= (bool)$section_to_remove->Delete('delete_record');

	debug_log(__METHOD__." Removed section $section_id, $section_tipo ".to_string(), logger::DEBUG);

	$response->result	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';	
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
		$debug->relation_response = $relation_response;

		$response->debug = $debug;

	}

	return (object)$response;
}//end delete



/**
* UPDATE_PARENT_DATA
* Updates element 
* @return object $response
*/
function update_parent_data($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','section_id','old_parent_section_id','old_parent_section_tipo','parent_section_id','parent_section_tipo','parent_node_type','tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				echo "Error. ".$$name." is mandatory";
				return false;
			}
		}
	
	# Remove current element as children from previous parent (old parentt)
		$locator = new locator();
			$locator->set_section_tipo($old_parent_section_tipo);
			$locator->set_section_id($old_parent_section_id);
		$filter   = array($locator);		
		$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, $filter);
		if ($relation_response->result===true) {
			debug_log(__METHOD__." Removed me as children from old parent  ".to_string(), logger::DEBUG);
		}

	# Add me as children of new parent
		$modelo_name 	= 'component_relation_children';
		#$tipo 			= ($parent_node_type=='root') ? DEDALO_HIERARCHY_CHIDRENS_TIPO : DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
		$modo 			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;
		$component_relation_children = component_common::get_instance($modelo_name,
																	  $tipo,
																	  $parent_section_id,
																	  $modo,
																	  $lang,
																	  $parent_section_tipo);

		$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $section_id );
		if ($added===true) {

			$component_relation_children->Save();

			debug_log(__METHOD__." Added dropped element as children of target wrap ".to_string(), logger::DEBUG);

			# All is ok. Result is new created section section_id
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
			
			# Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					foreach($vars as $name) {
						$debug->{$name} = $$name;
					}
					$debug->remove_parent_references= $relation_response;
					$debug->added					= $added;

				$response->debug = $debug;
			}
		}

	return (object)$response;
}//end update_parent_data



/**
* SHOW_INDEXATIONS
* @return object $response
*/
function show_indexations($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('section_tipo','section_id','component_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# DIFFUSION_INDEX_TS
	$diffusion_index_ts = new diffusion_index_ts($section_tipo, $section_id, $component_tipo);
	$html 				= $diffusion_index_ts->get_html();


	$response->result 	= $html;
	$response->msg 		= "Request done successufully";

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}
	

	return (object)$response;
}//end show_indexations



/**
* SAVE_ORDER
* @return object $response
*/
function save_order($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	# set vars
	$vars = array('section_tipo','section_id','component_tipo','ar_locators');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = $name." is mandatory";
				return $response;
			}
		}
	
	#$ar_locators = json_decode($ar_locators);
	$dato = array();
	foreach ((array)$ar_locators as $current_locator) {
		$locator = new locator();
			$locator->set_section_tipo($current_locator->section_tipo);
			$locator->set_section_id($current_locator->section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
			$locator->set_from_component_tipo($component_tipo);

		$dato[] = $locator;
	}

	$component_relation_children = component_common::get_instance('component_relation_children',
																  $component_tipo,
																  $section_id,
																  'edit',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
	// Current component dato is replaced completly with the new dato
	// This action returns the dato parsed with method component_relation_common->set_dato()
	$component_relation_children->set_dato($dato);
	$result = $component_relation_children->Save();
	

	$response->result 	= $result;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
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


