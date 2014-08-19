<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','id_matrix','parent','tagName','caller_id','rel_locator','section_top_tipo','section_top_id_matrix');		
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* load_inspector_relation_list_tag
* @param $tipo (text area tipo)
* @param $parent (section id matrix)
* @param $tagName (like '[/index-n-1]')
*/
if ($mode=='load_inspector_relation_list_tag') {
	
	if (empty($tagName)) {
		throw new Exception("load_inspector_relation_list_tag->tagName is empty", 1);		
	}
	if (empty($tipo)) {
		throw new Exception("load_inspector_relation_list_tag->tipo is empty", 1);		
	}

	$section_id 	= navigator::get_selected('id');
	$component_id 	= $parent;
	$component_tipo	= $tipo;
	$tag_id 		= TR::tag2value($tagName);


	$rel_locator 	= component_common::build_locator_relation($section_id, $component_tipo, $tag_id);
		#dump($rel_locator, "rel_locator");

	$ar_relation_reverse_records = component_relation::get_relation_reverse_records_from_id_section( $rel_locator, $tipo );	
		#dump($ar_relation_reverse_records,'$ar_relation_reverse_records');

	# Recorremos todos los tipos
	$relation_list_html = '';
	if(!empty($ar_relation_reverse_records))
	$relation_list_html .= "\n<div class=\"relaciones_list_title\">" . label::get_label('etiqueta')." $tag_id</div>";				
	foreach ($ar_relation_reverse_records as $tipo => $ar_values) {

		#$sections_text 	= implode(', ',$ar_values);
		$section_name 	= RecordObj_ts::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG);
		$relation_list_html .= "<div class=\"title_group_relation_reverse_records text_shadow_inset\">$section_name</div>";							
		
		$section_ob = new section(NULL, $tipo, 'relation_reverse');			#dump($ar_values,'$ar_values'," tipo -> $tipo");
		# le asignamos los valores al objeto
		$section_ob->ar_id_section_custom 	= $ar_values;
		$section_ob->rel_locator 			= $rel_locator;
		$section_ob->tag 					= null;
			#dump($section_ob->ar_id_section_custom,'$section_ob->ar_id_section_custom'); 
			
		$relation_list_html .= $section_ob->get_html();
			#dump($section_ob,'section_ob');							
	}
	print $relation_list_html;
	exit();




	$ar_relation_reverse_records	= component_relation::get_relation_reverse_records_from_id_section( $rel_locator, $tipo );
	# Recorremos todos los tipos					
	foreach ($ar_relation_reverse_records as $tipo => $ar_values) {

		#$sections_text 	= implode(', ',$ar_values);
		$section_name 	= RecordObj_ts::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG);
		$relation_list_html .= "<div class=\"title_group_relation_reverse_records text_shadow_inset\">$section_name</div>";							
		
		$section_ob = new section(NULL, $tipo, 'relation_reverse_sections');			#dump($ar_values,'$ar_values'," tipo -> $tipo");
		# le asignamos los valores al objeto
		$section_ob->ar_id_section_custom 	= $ar_values;
		$section_ob->rel_locator 			= $rel_locator;
		$section_ob->tag 					= null;
			#dump($section_ob->ar_id_section_custom,'$section_ob->ar_id_section_custom'); 
			
		$relation_list_html .= $section_ob->get_html();
			#dump($section_ob,'section_ob');							
	}




	# Create new component_text_area obj
	$component_text_area = new component_text_area(NULL, $tipo, 'edit', $parent, DEDALO_DATA_LANG);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		#dump($component_text_area,'$component_text_area');

	# add some vars to component
	#$component_text_area->caller_id = '';

	# Create new tool_relation
	$tool_relation = new tool_relation($component_text_area,'registros_list');
		#dump($tool_relation,'$tool_relation');

	# Add som vars to tool object
	$tool_relation->selected_tagName = $tagName;
		#dump($tool_relation,'$tool_relation en load_inspector_relation_list_tag');	

	$html = $tool_relation->get_html();
	
	print $html;
	exit();
	
}#end load_inspector_relation_list_tag



/**
* ADD RELATION
* Save on matrix current relation
* @param $caller_id (id matrix from source component_relation)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='add_relation') {

	# SOURCE
	$component_relation_id_matrix	= $caller_id;			
		if(empty($caller_id)) {
			throw new Exception("Error: caller_id is empty ! ", 1);
		 	exit();
		 }

	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) {
			throw new Exception("Error: rel_locator is empty ! ", 1);
			exit();
		}
	# TIPO
		if(empty($tipo)) {
			if(SHOW_DEBUG)
				throw new Exception("Error Processing Request. tipo is empty", 1);			
			die("<span class='error'> Trigger: Error Need tipo..</span>");
		}


	# SAVE rel_locator DATA TO COMPONENT RELATION 
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);	
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$component_relation_id_matrix);
			#dump($RecordObj_matrix->get_dato(),'before',"for id: $component_relation_id_matrix");
		
		# get current dato in db
		$dato 				= $RecordObj_matrix->get_dato();

		# mix array current dato + rel_locator relation string like (1253.0.0)
		$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);	
			#dump($RecordObj_matrix->get_dato(),'after',"for id: $component_relation_id_matrix");
		
		# set new array dato and save record in matrix
		$RecordObj_matrix->set_dato($new_ar_dato);
		$RecordObj_matrix->Save();

		#$dato_string 		= implode("\n",$dato);
		#$new_ar_dato_string = implode("\n",$new_ar_dato);
		#die( $section_id_matrix . "\n\n". $dato_string . "\n" .$new_ar_dato_string );

	print 'ok';
	exit();
}



/**
* REMOVE RELATION from tag
* @param section_id (id matrix)
* @param $rel_locator String like '1235.dd404.1'
*/
if($mode=='remove_relation_from_tag') {

	# SECTION ID
	$section_id_matrix	= $id_matrix;			
		if(empty($section_id_matrix)) {
			throw new Exception("Error: section_id_matrix is empty !", 1);			
		}	
	
	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) {
			throw new Exception("E Error: rel_locator is empty ! ", 1);			
		}

	if(empty($tipo)) {
		if(SHOW_DEBUG)
			throw new Exception("Error Processing Request. tipo is empty", 1);			
		die("<span class='error'> Trigger: Error Need tipo..</span>");
	}

	# Find matrix record where is relation data
		$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
		$current_tipo 			= common::get_tipo_by_id($section_id_matrix, $matrix_table);
		$section 				= new section($section_id_matrix, $current_tipo);
		$ar_obj_matrix_relation	= $section->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_relation');

		if ( !empty($ar_obj_matrix_relation[0]) ) {
			$id_matrix_relation = $ar_obj_matrix_relation[0]->get_id();
		}else{
			throw new Exception("Error Processing Request ".__METHOD__ . "<br> id_matrix_relation is not valid!", 1);			
		}
		#dump($id_matrix_relation,'$id_matrix_relation');



	# SAVE TARGET DATA TO COMPONENT RELATION
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);	
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id_matrix_relation);						#dump($RecordObj_matrix->get_dato(),'before');
		
		# get current dato in db
		$dato = $RecordObj_matrix->get_dato();

		# mix array current dato - target relation string like (1253.0.0)
		$new_ar_dato = component_relation::remove_relation_to_dato($rel_locator,$dato);			#dump($RecordObj_matrix->get_dato(),'after');
		
		# set new array dato and save record in matrix
		$RecordObj_matrix->set_dato($new_ar_dato);
		$RecordObj_matrix->Save();

	print 'ok';
	exit();
}







?>