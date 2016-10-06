<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');
include(DEDALO_LIB_BASE_PATH.'/ts_object/class.ts_object.php');
#include(DEDALO_LIB_BASE_PATH.'/common/class.relation.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# Set JSON headers for all responses
header('Content-Type: application/json');

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* GET_CHILDRENS_DATA
* Get json data of all childrens of current element
*/
function get_childrens_data() {
	
	# set vars
	$vars = array('section_tipo','section_id','node_type');
		foreach($vars as $name) $$name = common::setVar($name);
		if(!$section_tipo) exit("Error. section_tipo not found");
		if(!$section_id) exit("Error. section_id not found");

	#$ar='[{"type":"dd47","section_id":"47","section_tipo":"cu1"},{"type":"dd47","section_id":"50","section_tipo":"cu1"},{"type":"dd47","section_id":"42","section_tipo":"cu1"},{"type":"dd47","section_id":"43","section_tipo":"cu1"},{"type":"dd47","section_id":"44","section_tipo":"cu1"},{"type":"dd47","section_id":"45","section_tipo":"cu1"},{"type":"dd47","section_id":"46","section_tipo":"cu1"},{"type":"dd47","section_id":"48","section_tipo":"cu1"},{"type":"dd47","section_id":"49","section_tipo":"cu1"},{"type":"dd47","section_id":"51","section_tipo":"cu1"},{"type":"dd47","section_id":"52","section_tipo":"cu1"},{"type":"dd47","section_id":"53","section_tipo":"cu1"},{"type":"dd47","section_id":"54","section_tipo":"cu1"},{"type":"dd47","section_id":"55","section_tipo":"cu1"},{"type":"dd47","section_id":"56","section_tipo":"cu1"},{"type":"dd47","section_id":"57","section_tipo":"cu1"},{"type":"dd47","section_id":"58","section_tipo":"cu1"},{"type":"dd47","section_id":"59","section_tipo":"cu1"},{"type":"dd47","section_id":"60","section_tipo":"cu1"},{"type":"dd47","section_id":"61","section_tipo":"cu1"},{"type":"dd47","section_id":"62","section_tipo":"cu1"},{"type":"dd47","section_id":"63","section_tipo":"cu1"},{"type":"dd47","section_id":"64","section_tipo":"cu1"},{"type":"dd47","section_id":"65","section_tipo":"cu1"},{"type":"dd47","section_id":"66","section_tipo":"cu1"},{"type":"dd47","section_id":"67","section_tipo":"cu1"},{"type":"dd47","section_id":"68","section_tipo":"cu1"},{"type":"dd47","section_id":"69","section_tipo":"cu1"},{"type":"dd47","section_id":"70","section_tipo":"cu1"},{"type":"dd47","section_id":"71","section_tipo":"cu1"},{"type":"dd47","section_id":"72","section_tipo":"cu1"},{"type":"dd47","section_id":"73","section_tipo":"cu1"},{"type":"dd47","section_id":"74","section_tipo":"cu1"},{"type":"dd47","section_id":"75","section_tipo":"cu1"},{"type":"dd47","section_id":"76","section_tipo":"cu1"},{"type":"dd47","section_id":"77","section_tipo":"cu1"},{"type":"dd47","section_id":"78","section_tipo":"cu1"},{"type":"dd47","section_id":"79","section_tipo":"cu1"},{"type":"dd47","section_id":"80","section_tipo":"cu1"},{"type":"dd47","section_id":"81","section_tipo":"cu1"},{"type":"dd47","section_id":"82","section_tipo":"cu1"},{"type":"dd47","section_id":"83","section_tipo":"cu1"},{"type":"dd47","section_id":"84","section_tipo":"cu1"},{"type":"dd47","section_id":"85","section_tipo":"cu1"},{"type":"dd47","section_id":"86","section_tipo":"cu1"},{"type":"dd47","section_id":"87","section_tipo":"cu1"},{"type":"dd47","section_id":"88","section_tipo":"cu1"},{"type":"dd47","section_id":"89","section_tipo":"cu1"},{"type":"dd47","section_id":"90","section_tipo":"cu1"},{"type":"dd47","section_id":"91","section_tipo":"cu1"},{"type":"dd47","section_id":"92","section_tipo":"cu1"},{"type":"dd47","section_id":"93","section_tipo":"cu1"},{"type":"dd47","section_id":"94","section_tipo":"cu1"},{"type":"dd47","section_id":"95","section_tipo":"cu1"},{"type":"dd47","section_id":"96","section_tipo":"cu1"},{"type":"dd47","section_id":"97","section_tipo":"cu1"},{"type":"dd47","section_id":"98","section_tipo":"cu1"},{"type":"dd47","section_id":"99","section_tipo":"cu1"},{"type":"dd47","section_id":"100","section_tipo":"cu1"},{"type":"dd47","section_id":"101","section_tipo":"cu1"},{"type":"dd47","section_id":"102","section_tipo":"cu1"},{"type":"dd47","section_id":"103","section_tipo":"cu1"},{"type":"dd47","section_id":"104","section_tipo":"cu1"},{"type":"dd47","section_id":"105","section_tipo":"cu1"},{"type":"dd47","section_id":"106","section_tipo":"cu1"},{"type":"dd47","section_id":"107","section_tipo":"cu1"},{"type":"dd47","section_id":"108","section_tipo":"cu1"},{"type":"dd47","section_id":"109","section_tipo":"cu1"},{"type":"dd47","section_id":"110","section_tipo":"cu1"},{"type":"dd47","section_id":"111","section_tipo":"cu1"},{"type":"dd47","section_id":"112","section_tipo":"cu1"},{"type":"dd47","section_id":"113","section_tipo":"cu1"},{"type":"dd47","section_id":"114","section_tipo":"cu1"},{"type":"dd47","section_id":"115","section_tipo":"cu1"},{"type":"dd47","section_id":"116","section_tipo":"cu1"},{"type":"dd47","section_id":"117","section_tipo":"cu1"},{"type":"dd47","section_id":"118","section_tipo":"cu1"},{"type":"dd47","section_id":"119","section_tipo":"cu1"},{"type":"dd47","section_id":"120","section_tipo":"cu1"},{"type":"dd47","section_id":"121","section_tipo":"cu1"},{"type":"dd47","section_id":"122","section_tipo":"cu1"},{"type":"dd47","section_id":"123","section_tipo":"cu1"},{"type":"dd47","section_id":"124","section_tipo":"cu1"},{"type":"dd47","section_id":"125","section_tipo":"cu1"},{"type":"dd47","section_id":"126","section_tipo":"cu1"},{"type":"dd47","section_id":"127","section_tipo":"cu1"},{"type":"dd47","section_id":"128","section_tipo":"cu1"},{"type":"dd47","section_id":"129","section_tipo":"cu1"},{"type":"dd47","section_id":"130","section_tipo":"cu1"},{"type":"dd47","section_id":"131","section_tipo":"cu1"},{"type":"dd47","section_id":"132","section_tipo":"cu1"},{"type":"dd47","section_id":"133","section_tipo":"cu1"},{"type":"dd47","section_id":"134","section_tipo":"cu1"},{"type":"dd47","section_id":"135","section_tipo":"cu1"},{"type":"dd47","section_id":"136","section_tipo":"cu1"},{"type":"dd47","section_id":"137","section_tipo":"cu1"},{"type":"dd47","section_id":"138","section_tipo":"cu1"},{"type":"dd47","section_id":"139","section_tipo":"cu1"},{"type":"dd47","section_id":"140","section_tipo":"cu1"},{"type":"dd47","section_id":"141","section_tipo":"cu1"}]';
	#$ar=json_decode($ar);

	if ($node_type=='root') {
		# From hierarchy1 section
		$tipo=DEDALO_HIERARCHY_CHIDRENS_TIPO;	// hierarchy45
	}else{
		# Form each section
		$tipo=DEDALO_THESAURUS_CHIDRENS_TIPO;	// hierarchy49
	}

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
	$dato = $component_relation_children->get_dato();

	$childrens 		= $dato;
	$childrens_data = array();
	foreach ((array)$childrens as $locator) {
		
		$section_id 		= $locator->section_id;
		$section_tipo 		= $locator->section_tipo;

		$ts_object  		= new ts_object( $section_id, $section_tipo );
		$childrens_object 	= $ts_object->get_childrens_data();

		$childrens_data[] 	= $childrens_object;
	}	

	
	if (isset($_GET['debug'])) {
		dump($childrens_data); #return;
	}
	
	return (array)$childrens_data;
}//end get_ar_childrens_data_real



/**
* ADD_CHILDREN
* @return json encoded bool
*/
function add_children() {

	$result = 0;

	# set vars
	$vars = array('section_tipo','section_id','node_type');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	# NEW SECTION
	$new_section 	= section::get_instance(null,$section_tipo);
	$new_section_id	= $new_section->Save();
					if (empty($new_section_id)) {
						debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
						return 0;
					}


	# COMPONENT_RELATION_CHILDREN
	$modelo_name 	= 'component_relation_children';
	$tipo 			= ($node_type=='root') ? DEDALO_HIERARCHY_CHIDRENS_TIPO : DEDALO_THESAURUS_CHIDRENS_TIPO;
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
		$component_relation_children->Save();

		# All is ok. Result is new created section section_id
		$result = $new_section_id;	
	}
			
	
	return (int)$result;
}//end add_children



/**
* ADD_CHILDREN_FROM_HIERARCHY
* @return 
*/
function add_children_from_hierarchy() {
	
	$result = 0;

	# set vars
	$vars = array('section_tipo','section_id','target_section_tipo');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}

	# Remember: target_section_tipo is always prefix + 1, like 'es1'

	# NEW SECTION
	$new_section 	= section::get_instance(null,$target_section_tipo);
	$new_section_id	= $new_section->Save();
					if (empty($new_section_id)) {
						debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
						return 0;
					}


	# COMPONENT_RELATION_CHILDREN
	$modelo_name 	= 'component_relation_children';
	$tipo 			= DEDALO_HIERARCHY_CHIDRENS_TIPO;
	$modo 			= 'edit';
	$lang			= DEDALO_DATA_NOLAN;
	$component_relation_children = component_common::get_instance($modelo_name,
																  $tipo,
																  $section_id,
																  $modo,
																  $lang,
																  $section_tipo);

	$added = (bool)$component_relation_children->make_me_your_children( $target_section_tipo, $new_section_id );
	if ($added===true) {
		$component_relation_children->Save();

		# All is ok. Result is new created section section_id
		$result = $new_section_id;	
	}			
	
	return (int)$result;
}//end add_children_from_hierarchy



/**
* DELETE
* Removes current thesaurus element an all references in parents
* @return bool
*/
function delete() {
	
	$result = false;

	# set vars
	$vars = array('section_tipo','section_id','node_type');
		foreach($vars as $name) {
			$$name = common::setVar($name);
			if (empty($$name)) {
				echo "Error. ".$$name." is mandatory";
				return false;
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
	 		return $result = false;
	 	}
	}
	
	# REFERENCES . Calculate parents and removes references to current section
	$section_table 	= common::get_matrix_table_from_tipo($section_tipo); // Normally 'matrix_hierarchy'
	$hierarchy_table= hierarchy::$table;	// Normally 'hierarchy'. Look too in 'matrix_hierarchy_main' table for references
	$ar_tables 		= array( $section_table, $hierarchy_table);
	$parents 		= component_relation_parent::get_parents($section_id, $section_tipo, $from_component_tipo=null, $ar_tables);
	# dump($parents, ' $parents ++ '.to_string("$section_id, $section_tipo")); die();
	foreach ((array)$parents as $current_parent) {
	
		# Target section data
		$modelo_name 	= 'component_relation_children';
		$modo 			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;
		$component_relation_children = component_common::get_instance($modelo_name,
																	  $current_parent->component_tipo,
																	  $current_parent->section_id,
																	  $modo,
																	  $lang,
																	  $current_parent->section_tipo);
		
		# NOTE: remove_children_and_save deletes current section references from component_relation_children and section->relations container
		# $removed = (bool)$component_relation_children->remove_children_and_save($children_locator);
		$removed = (bool)$component_relation_children->remove_me_as_your_children( $section_tipo, $section_id );
		if ($removed) {
			debug_log(__METHOD__." Removed references in component_relation_children ($current_parent->section_id, $current_parent->section_tipo) to $section_id, $section_tipo ".to_string(), logger::DEBUG);
		}
	}

	# RECORD . Finally, delete target section
	$section_to_remove = section::get_instance($section_id, $section_tipo);
	$result  		   = (bool)$section_to_remove->Delete('delete_record');
	debug_log(__METHOD__." Removed section $section_id, $section_tipo ".to_string(), logger::DEBUG);

	return (bool)$result;
}//end delete



?>