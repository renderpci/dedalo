<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','tipo_to_search','ar_target_section_tipo','target_section_tipo','string_to_search','id_path','parent','ar_data','section_tipo','propiedades','locator');
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

	session_write_close();

	if (strlen($string_to_search)<1) {
		return null;
	}	
	if (empty($ar_target_section_tipo)) {
		return "Error: ar_target_section_tipo is not defined!";
	}
	$ar_target_section_tipo = json_decode($ar_target_section_tipo);
		#dump($ar_target_section_tipo, ' ar_target_section_tipo ++ '.to_string());
	if (!$ar_target_section_tipo) {
		return "Error: ar_target_section_tipo is wrong!";
	}

	/* Example
	[mode] => autocomplete
    [tipo] => oh18
    [string_to_search] => casa
    [top_tipo] => oh1
    [id_path] =>
	*/	

	$result = (array)component_autocomplete::autocomplete_search($tipo, (array)$ar_target_section_tipo, (string)$string_to_search, 30, $id_path); //$tipo, $referenced_tipo, $ar_target_section_tipo, $string_to_search, $max_results=30, $id_path
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
		exit("Error: tipo is not defined!");
	}
	if (empty($section_tipo)) {
		exit("Error: section_tipo is not defined!");
	}
	if (empty($target_section_tipo)) {
		exit("Error: target_section_tipo is empty!");
	}	
	
	$lang = DEDALO_DATA_LANG;
	
	$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
		#dump($ar_terminos_relacionados, ' ar_terminos_relacionados ++ '.to_string());
	
	if(SHOW_DEBUG) {
		if (empty($ar_terminos_relacionados)) {
			throw new Exception("Error Processing Request. Missing required 'ar_terminos_relacionados' for current component", 1);
		}
		# First array element must be a secion
		foreach ((array)$ar_terminos_relacionados as $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name!=='section') {
				throw new Exception("Error Processing Request [$modelo_name]. Missing required 'ar_terminos_relacionados'->section for current component. First related element must be a section element. Please review elements order", 1);
			}
			break;
		}
	}

	$page_html	= DEDALO_LIB_BASE_PATH .'/component_autocomplete/html/component_autocomplete_new.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Error on include row</div>";
	}

	echo $html;
	exit();
}#end if($mode=='new_element')





/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
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
	if (empty($ar_data)) {
		return "Error: ar_data is not defined!";
	}
	$ar_data = json_decode($ar_data);
		#dump($ar_data, ' ar_data');

	if (empty($target_section_tipo)) {
		return "Error: target_section_tipo is not defined!";
	}
	

	$referenced_tipo = key($ar_data);
	if ( !is_object($ar_data) || empty($referenced_tipo) ) {
		return "Error: ar_data is not object!";
	}

	$new_autocomplete_record = component_autocomplete::create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data);

	#echo (int)$section_id;
	echo json_encode($new_autocomplete_record);
	exit();


}#end if($mode=='submit_new_element')



/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
if($mode=='add_locator') {
	
	if (empty($tipo)) {
		exit( "Error: tipo is not defined!");
	}
	if (empty($parent)) {
		exit( "Error: parent is not defined!");
	}
	if (empty($section_tipo)) {
		exit( "Error: section_tipo is not defined!");
	}
	if (empty($locator)) {
		exit( "Error: locator is not defined!");
	}

	$locator = json_decode($locator);
		#dump($ar_data, ' ar_data');

	$component_autocomplete = component_autocomplete::get_instance('component_autocomplete', $tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);

	$final = $component_autocomplete->add_locator($locator);

	#echo (int)$section_id;
	echo json_encode($final);
	exit();
}

/**
* SUBMIT_NEW_ELEMENT
* Fire submit form of new element
*/
if($mode=='remove_locator') {
	
	if (empty($tipo)) {
		exit( "Error: tipo is not defined!");
	}
	if (empty($parent)) {
		exit( "Error: parent is not defined!");
	}
	if (empty($section_tipo)) {
		exit( "Error: section_tipo is not defined!");
	}
	if (empty($locator)) {
		exit( "Error: locator is not defined!");
	}

	$locator = json_decode($locator);
		#dump($ar_data, ' ar_data');

	$component_autocomplete = component_autocomplete::get_instance('component_autocomplete', $tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);

	$final = $component_autocomplete->remove_locator($locator);

	#echo (int)$section_id;
	echo json_encode($final);
	exit();
}




?>