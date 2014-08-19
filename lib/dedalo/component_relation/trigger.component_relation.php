<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','section_tipo','id_matrix','parent','caller_id','rel_locator','terminoID','tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");






/**
* REMOVE RELATION
* @param caller_id (id matrix from source component)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='remove_relation_from_section') {

	if(empty($tipo)) {
		if(SHOW_DEBUG)
			throw new Exception("Error Processing Request. tipo is empty", 1);			
		die("<span class='error'> Trigger: Error. Need tipo..</span>");
	}

	# CALLER ID
	$component_relation_id_matrix	= $caller_id;			
		if(empty($caller_id)) 	exit(" Error: caller_id is empty ! ");		
	
	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) exit(" Error: rel_locator is empty ! ");

	# SAVE TARGET DATA TO COMPONENT RELATION
		
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);	
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$component_relation_id_matrix);					#dump($RecordObj_matrix->get_dato(),'before');
		
		# get current dato in db
		$dato 				= $RecordObj_matrix->get_dato();

		# mix array current dato - target relation string like (1253.0.0)
		$new_ar_dato 		= component_relation::remove_relation_to_dato($rel_locator,$dato);		#dump($RecordObj_matrix->get_dato(),'after');
		
		# set new array dato and save record in matrix
		$RecordObj_matrix->set_dato($new_ar_dato);
		$RecordObj_matrix->Save();

	print 'ok';
	exit();
}





/**
* ADD INDEX
* Save on matrix descripors current index
* @param $teminoID (teminoID from tesauro)
* @param $rel_locator String like '1235.dd12.3'
*/
if($mode=='add_index') {

	# TERMINO ID 			
		if(empty($terminoID)) 	exit(" Error: terminoID is empty ! ");	

	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) exit(" Error: rel_locator is empty ! ");

	# SAVE rel_locator DATA TO tesauro index (in table matrix descriptors)
		$matrix_table			= 'matrix_descriptors';#RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, DEDALO_DATA_NOLAN, 'index');		#dump($RecordObj_descriptors->get_dato(),'before'); __construct($id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false)

		
		# get current dato in db
		$dato 					= $RecordObj_descriptors->get_dato();

		# Decode json stringdato to array
		$dato  					= json_handler::decode($dato);

		# mix array current dato + rel_locator relation string like (1253.0.0)
		$new_ar_dato 			= component_common::add_locator_to_dato($rel_locator, $dato);	
		
		# set new array dato and save record in matrix
		$RecordObj_descriptors->set_dato($new_ar_dato);												#dump($RecordObj_descriptors->get_dato(),'after');
		

		#dump($RecordObj_descriptors,'$RecordObj_descriptors'); die();

		$RecordObj_descriptors->Save();

		#$dato_string 		= implode("\n",$dato);
		#$new_ar_dato_string = implode("\n",$new_ar_dato);
		#die( $terminoID . "\n\n". $dato_string . "\n" .$new_ar_dato_string );

	print 'ok';
	exit();
}

/**
* REMOVE INDEX
* @param id_matrix (id matrix from source component)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='remove_index') {

	# INDEX MATRIX DESCRIPTORS ID 			
		if(empty($id_matrix)) 	exit(" Error: id_matrix is empty ! ");		
	
	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) exit(" Error: rel_locator is empty ! ");

	# TERMINO ID : Necesario para despejar la tabla			
		if(empty($terminoID)) 	exit(" Error: terminoID is empty ! ");

	# SAVE rel_locator DATA TO tesauro index
		$matrix_table			= 'matrix_descriptors';#RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);	
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $id_matrix);
		$RecordObj_descriptors->remove_index($rel_locator);
		$RecordObj_descriptors->Save();

	print 'ok';
	exit();
}






















/**
* NEW RELATIONS SELECTOR HTML
* @param id_matrix (id matrix from source component)
*//*
if($mode=='load_selector_html') {

	die("USED ??");
	
	$component_relation = new component_relation($id_matrix);	#dump($component_relation,'componen_relation');
	$tipo				= $component_relation->get_tipo();		
	$ar_sections 		= $component_relation->get_all_content_sections();		
		#dump($ar_sections ,'$ar_sections', "BEFORE");

		# Remove sections that already haven box
		
		#foreach ($ar_sections as $tipo => $name) {								
		#	if (in_array($tipo, $ar_fixed_relations) || in_array($tipo, $ar_dinamic_relations)) unset($ar_sections[$tipo]);								
		#}
		
		#dump($ar_sections,'$ar_sections');

		# Add fixed relations too
		$ar_fixed_relations 			= $component_relation->get_ar_fixed_relations();	#dump($ar_fixed_relations ,'$ar_fixed_relations', "ar_fixed_relations");
		foreach ($ar_fixed_relations as $fixed_tipo) {
			$section_name				= RecordObj_ts::get_termino_by_tipo($fixed_tipo);
			$ar_sections[$fixed_tipo]	= $section_name;
		}
		#dump($ar_sections ,'$ar_sections', "AFTER");

		# Order sections
		# POR HACER: ORDENAR ARRAY MULTIDIMENSIONAL MULTIBYTE...
		##sort($ar_sections);
		#echo setlocale(LC_ALL, "es_ES.UTF-8");							 
		array_multisort($ar_sections, SORT_ASC, SORT_LOCALE_STRING);


		if (!empty($ar_sections)) {

			$called_class 	= 'component_relation';
			$permissions	= common::get_permissions($tipo);
			$section_tipo 	= $tipo;
			$id 			= $id_matrix;

			$file_include	= DEDALO_LIB_BASE_PATH .'/'. $called_class . '/html/' . $called_class . '_selector.phtml' ;

			ob_start();
			include ( $file_include );
			$html =  ob_get_contents();
			ob_get_clean();
			$relations_selector_html = $html;		
		}else{
			$relations_selector_html = NULL;
		}

		print $relations_selector_html ;
		exit();
}
*/


# RELATION CANDIDATE LIST
# DEVUELVE UNA LISTA NO FILTRADA DE LOS REGISTROS DE LA SECCION DADA
# EJEMPLO: Listado de los informantes disponibles para asociar a una entrevista
/*
if($mode=='relation_candidates_list') {
	
	die("USED ??");


	if(empty($section_tipo)) exit(" Error: tipo is empty ! ");

	$modo = 'relation';
	
	
	#$termino = RecordObj_ts::get_termino_by_tipo($section_tipo);

	# CREAMOS EL SECTION LIST
	#$component_section_list	= new component_section_list($id=NULL, $tipo=$section_tipo, $modo='list', $parent=NULL, $lang=NULL);
	
	# Creamos una seccion (__construct($tipo, $modo=NULL, $id=NULL) )
	#

	# Creamos un listado de la sección (__construct($tipo, $section_obj) )
	#$list_obj 	= new section_list($section_tipo, $section_obj);

	# Section list of values (__construct($tipo, $modo)
	$list_obj	= new section_list_of_values($section_tipo,$modo);		#dump($list_obj);

	# Extraemos su html
	$html = $list_obj->get_html();

	#dump($component_section_list);
	echo $html;

	exit();
}
*/




?>