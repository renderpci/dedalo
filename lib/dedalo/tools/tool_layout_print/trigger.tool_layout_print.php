<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_layout_print.php'); 

if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}

# set vars
$vars = array('mode','type','html_content','layout_label','template_id','component_layout_tipo','section_target_tipo','section_layout_id','section_layout_tipo');	// ,'tipo','parent','layout_section'
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");


/**
* SAVE_LAYOUT
* Store DOM html of page in component_layout
*/
if( $mode=='save_template' ) {

	#$vars = array('section_layout_id','section_layout_tipo','layout_label','component_layout_tipo','type','html_content');
		#foreach($vars as $name) $$name = common::setVar($name);

	if(empty($component_layout_tipo)) 	exit('Error: component_layout_tipo not defined');
	#if(empty($parent)) 				exit('Error: parent not defined');
	if(empty($type)) 		 			exit('Error: type not defined'); // component layout type
	if(empty($html_content)) 			exit('Error: html_content not defined');

	if(empty($section_layout_tipo)) 	exit('Error: section_layout_tipo not defined');
	if(empty($section_target_tipo)) 	exit('Error: section_target_tipo not defined');
	if(empty($layout_label)) 			exit('Error: layout_label not defined');

	/* reference only:
		# COMPONENT SECTION
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO'	, 'dd67'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO' , 'dd61'); # Privada

		# COMPONENT LAYOUT
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO'		, 'dd39'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO'	, 'dd23'); # Privada

		# COMPONENT TEXT (LABEL / TEMPLATE NAME) Like 'Template One'
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO'		, 'dd38'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO'	, 'dd29'); # Privada
		*/

	# Verify tipo is accepted and set components to save label and section info
	switch ($component_layout_tipo) {
		case DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO : // Public
			$component_section_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO;
			$component_label_tipo 	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO;
			break;
		case DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO : // Privada
			$component_section_tipo = DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO;
			$component_label_tipo 	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO;
			break;
		default:
			throw new Exception("Error Processing Request", 1);
	}


	#
	# SECTION
		if (empty($section_layout_id)) {
			$section = section::get_instance(null, $section_layout_tipo);
			$section_layout_id = $section->Save();
		}
		if (empty($section_layout_id)) {
			throw new Exception("Error Processing Request", 1);			
		}
		if(SHOW_DEBUG) {
			error_log("Generated section_layout_id:  $section_layout_id - tipo:$section_layout_tipo");
		}

	#
	# LAYOUT DATA . COMPONENT_LAYOUT (template data)
		$component_layout = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'edit',DEDALO_DATA_NOLAN);

		$dato = (object)$component_layout->get_dato();

		if (!property_exists($dato, $type)) {
			$dato->$type = (string)'';
		}
		$dato->$type = (string)$html_content; // Direct full html

		// Convert current html to template
		$dato->$type = (string)component_layout::build_html_template($dato->$type); 
		
		$component_layout->set_dato($dato);
		$component_layout->Save();
		if(SHOW_DEBUG) {
			error_log("Generated component_layout: " .json_encode($dato) );
		}


	#
	# SECTION TARGET 
		$component_input_text = component_common::get_instance('component_input_text',$component_section_tipo,$section_layout_id,'edit',DEDALO_DATA_NOLAN);
		$component_input_text->set_dato($section_target_tipo);
		$component_input_text->Save();
		if(SHOW_DEBUG) {
			error_log("Saved SECTION TARGET:  $section_target_tipo");
		}
	

	#
	# LABEL
		$component_input_text = component_common::get_instance('component_input_text',$component_label_tipo,$section_layout_id,'edit',DEDALO_DATA_LANG);
		$component_input_text->set_dato($layout_label);
		$component_input_text->Save();
		if(SHOW_DEBUG) {
			error_log("Saved LABEL:  $layout_label");
		}


	#
	# Update session label name
	$ar_templates_mix = (array)$_SESSION['dedalo4']['config']['ar_templates_mix'];
		#dump($ar_templates_mix," ar_templates_mix");
	foreach ((array)$ar_templates_mix as $key => $obj_value) {
		if ($obj_value->id==$section_layout_id && 
			$obj_value->component_layout_tipo==$component_layout_tipo
			) {
			$_SESSION['dedalo4']['config']['ar_templates_mix'][$key]->label 			  = (string)$layout_label;	# Update session layout_label
			$_SESSION['dedalo4']['config']['ar_templates_mix'][$key]->section_layout_dato = (object)$dato;			# Update session section_layout_dato
			if(SHOW_DEBUG) {
				#error_log("Set session ar_templates_mix - $key - label : $layout_label");
			}
			break;
		}
	}

	if(SHOW_DEBUG) {
		error_log("Saved component_layout [$component_layout_tipo] id:".$section_layout_id." ");
	} 

	echo (int)$section_layout_id;
	exit();

}#end if( $mode=='save_layout' ) 




/**
* DELETE_TEMPLATE
* Delete request template record 
* @return echo 'ok'
*/
if( $mode=='delete_template' ) {

	if(empty($section_layout_tipo)) exit('Error: section_layout_tipo not defined');
	if(empty($section_layout_id)) 	exit('Error: section_layout_id not defined');

		#dump($section_layout_tipo,"section_layout_tipo ");die();

	#
	# Section
	$section = section::get_instance($section_layout_id, $section_layout_tipo);
	$result  = $section->Delete('delete_record');

	if(SHOW_DEBUG) {
		error_log($result);
	}

	echo "ok";
	exit();

}#end if( $mode=='delete_template' )


/**
* DELETE_TEMPLATE
* Delete request template record 
* @return echo 'ok'
*/

if( $mode=='print_pages' ) {

	if(empty($tipo)) exit('Error: tipo not defined');
	if(empty($section_layout_id)) exit('Error: section_layout_id not defined');
	if(empty($component_layout_tipo)) exit('Error: component_layout_tipo not defined');
	
	//echo "WORKING HERE..";return;

	$component_layout = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'edit',DEDALO_DATA_NOLAN);
	$dato = $component_layout->get_dato();
	#dump($component_layout,'component_layout');
	

	#
	# RECORDS
	$options   = $_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo];
		dump($options," options");die();
	foreach ($options->layout_map as $key => $value) {
		# code...
	}
	#$options->layout_map = array( reset($options->layout_map) => array() );
	$rows_data = section_list::get_rows_data($options);
		dump($rows_data,"rows_data ");
	/*
	$ar_id = array();
	foreach ($rows_data->result as $key => $ar_value) {
		$ar_id[ reset($ar_value) ];
	}
	*/
	
	
	die();
	$page = array();
	//$html = str_get_html($html_content);
	foreach ($html->find('div[id=page]') as $div_page) {
		$page[] = $div_page;
	}

	dump($page,'page');


	//dump($html_content,'html_content');
	}


die("Sorry. Mode ($mode) not supported")
?>