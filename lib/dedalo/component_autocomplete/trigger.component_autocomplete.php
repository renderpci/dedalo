<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','tipo_to_search','referenced_section_tipo','string_to_search','id_path','parent','ar_data','section_tipo','propiedades');
		foreach($vars as $name)	$$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* AUTOCOMPLETE
* Get list of mathed DB results for current string by ajax call
* @param string $tipo_to_search
* @param string $string_to_search
*/
if($mode=='autocomplete') {

	if (strlen($string_to_search)<1) {
		return null;
	}
	if (empty($tipo_to_search)) {
		return "Error: tipo_to_search is not defined!";
	}
	if (empty($referenced_section_tipo)) {
		return "Error: referenced_section_tipo is not defined!";
	}


	/* Example
	[mode] => autocomplete
    [tipo] => oh18
    [tipo_to_search] => dd900
    [string_to_search] => casa
    [top_tipo] => oh1
    [id_path] =>
	*/
		
	/*
	dump($tipo_to_search,'ar-tipo_to_search pre decode');

	# JSON DECODE tipo_to_search
	$tipo_to_search = json_handler::decode($tipo_to_search);
		dump($tipo_to_search,'ar-tipo_to_search post decode');

	if (empty($tipo_to_search)) {
		return NULL;
	}
	*/

	$result = (array)component_autocomplete::autocomplete_search($tipo, $tipo_to_search, $referenced_section_tipo, (string)$string_to_search, 30, $id_path); //$tipo, $referenced_tipo, $referenced_section_tipo, $string_to_search, $max_results=30, $id_path
		#dump($result," result");
	#error_log( json_encode($result) );
	#dump( key($result)," result");


	#$result = array("1"=>"Bombero","2"=>"Torero");


	echo json_handler::encode($result);
		#dump(json_handler::encode($result)," result");

	exit();

}#end if($mode=='autocomplete')







/**
* NEW_ELEMENT
* Render form to submit new record to source list
* @param string $tipo (component autocomplete tipo)
* @param int $parent (component autocomplete parent id matrix)
*/
if($mode=='new_element') {

	if (empty($tipo)) {
		return "Error: tipo is not defined!";
	}
	if (empty($referenced_section_tipo)) {
		return "Error: referenced_section_tipo is not defined!";
	}
	if (empty($section_tipo)) {
		return "Error: section_tipo is not defined!";
	}

	$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
	$lang = DEDALO_DATA_LANG;

	$html='';
	$html .= "<div class=\"component_autocomplete_new_element\">";
	foreach ($ar_terminos_relacionados as $current_tipo) {
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
		if ($modelo_name=='section') continue;
		if ($modelo_name!='component_input_text') {
			if(SHOW_DEBUG) {
				trigger_error("Current component is not 'component_input_text'. Ignoring component");
			}
			continue;
		}
		$title = RecordObj_dd::get_termino_by_tipo($current_tipo,$lang,true);
		$html .= $title;
		$html .= " <input class=\"\" type=\"text\" name=\"$current_tipo\" data-tipo=\"{$current_tipo}\" value=\"\" /> ";

		if ($current_tipo==end($ar_terminos_relacionados)) {
			$html .= "<input type=\"button\" class=\"css_button_generic button_submit_new_element\" data-referenced_section_tipo=\"$referenced_section_tipo\" value=\"".label::get_label('nuevo')."\" onclick=\"component_autocomplete.submit_new_element(this)\" />";
		}
	}
	$html .= "</div>";

	echo $html;
	exit();
}#end if($mode=='new_element')




if($mode=='submit_new_element') {
	
	if (empty($tipo)) {
		return "Error: tipo is not defined!";
	}
	if (empty($parent)) {
		return "Error: parent is not defined!";
	}
	if (empty($section_tipo)) {
		return "Error: section_tipo is not defined!";
	}
	if (empty($referenced_section_tipo)) {
		return "Error: referenced_section_tipo is not defined!";
	}	
	if (empty($ar_data)) {
		return "Error: ar_data is not defined!";
	}

	$ar_data = json_decode($ar_data);
		#dump($ar_data, ' ar_data');

	$referenced_tipo = key($ar_data);
	if ( !is_object($ar_data) || empty($referenced_tipo) ) {
		return "Error: ar_data is not object!";
	}


	#
	# PROJECTS HERITAGE
	if ($section_tipo!=DEDALO_SECTION_PROJECTS_TIPO) {
		# All except main section Projects
		$source_ar_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_filter', true, true); //$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
		if (!isset($source_ar_filter[0])) {
			if(SHOW_DEBUG) {
				throw new Exception("Error Processing Request. component_filter is not defined! ($section_tipo)", 1);
			}
			return "Error: component_filter is not defined!";
		}
		$source_component_filter = component_common::get_instance('component_filter', $source_ar_filter[0], $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		$source_component_filter_dato = $source_component_filter->get_dato();
			#dump($source_component_filter_dato, ' source_component_filter_dato');exit();
	}
	
	#
	# SECTION : Create a new section
	#$parent_section_tipo 		= component_common::get_section_tipo_from_component_tipo( $referenced_tipo );
	$parent_section_tipo 		= $referenced_section_tipo;
		#dump($parent_section_tipo, ' section_tipo - '.$referenced_tipo);
	$section 	= section::get_instance(null,$parent_section_tipo);
	$section_id = $section->Save();
		#dump($parent_section_tipo," parent_section_tipo saved ($section_id)");
		#die();
	
	#
	# FILTER : Set heritage of projects
	if ($section_tipo!=DEDALO_SECTION_PROJECTS_TIPO) {
		# All except main section Projects
		$target_ar_filter  = section::get_ar_children_tipo_by_modelo_name_in_section($parent_section_tipo, 'component_filter', true, true);

		if (!isset($target_ar_filter[0])) {
			if(SHOW_DEBUG) {
				throw new Exception("Error Processing Request. target component_filter is not defined! ($parent_section_tipo)", 1);
			}
			return "Error: target component_filter is not defined!";
		}
		$target_component_filter = component_common::get_instance('component_filter', $target_ar_filter[0], $section_id,'edit', DEDALO_DATA_NOLAN, $parent_section_tipo);
		$target_component_filter->set_dato($source_component_filter_dato);
		$target_component_filter->Save();
	}
	

	#
	# PROPIEDADES
	if ($propiedades) {
		$propiedades = json_decode($propiedades);
		#dump($propiedades, ' propiedades');
		if (isset($propiedades->filtered_by)) foreach($propiedades->filtered_by as $current_tipo => $current_value) {
			#dump($current_value, ' current_tipo - '.$current_tipo);
			$component = component_common::get_instance(null, $current_tipo, $section_id, 'edit', DEDALO_DATA_LANG, $parent_section_tipo);
			$component->set_dato($current_value);
			$component->Save();
		}
	}
	#dump($propiedades, ' propiedades');	die("section_id: $section_id B");

	#
	# COMPONENTS
	# Format:
	# value: stdClass Object
	# (
	#    [rsc85] => a
	#    [rsc86] => b
	# )
	#
	foreach ($ar_data as $current_tipo => $current_value) {
		
		$component = component_common::get_instance(null, $current_tipo,$section_id, 'edit', DEDALO_DATA_LANG, $parent_section_tipo);		
		$component->set_dato( trim($current_value) );
		$component->Save();
	}

	$locator = new locator();
		$locator->set_section_id($section_id);
		$locator->set_section_tipo($parent_section_tipo);
			#dump($locator,'locator');

	#echo (int)$section_id;
	echo json_encode($locator);
	exit();

}#end if($mode=='submit_new_element')






?>