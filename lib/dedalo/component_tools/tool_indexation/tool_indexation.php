<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();		#dump($id,'id');
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();	#dump($tipo,$parent);
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);
	$context				= $this->get_context();

	$selected_tagName 		= $this->selected_tagName;
	$selected_tag_id		= TR::tag2value($this->selected_tagName);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump( $this->component_obj );

	switch($modo) {	
		
		case 'button':
					# Nothing to do
					break;

		
		case 'page':
					$tesauro_url = DEDALO_LIB_BASE_URL . "/ts/ts_list.php?modo=tesauro_rel&type=all&current_tipo=".$tipo."&caller_id=".$id."&caller_tipo=".$tipo;

					$this->component_obj->set_modo('indexation');
					$component_text_area_html = $this->component_obj->get_html();

					# HEADER TOOL
					$this->set_modo('header');
					$header_html 	= $this->get_html();
					$this->set_modo('page');
					
					break;

		case 'header':
					# Creamos un componente state
					$component_state 		= $this->get_component_state_obj($parent);

					# Si no está definido en estructura
					if(!is_object($component_state)) return null;
					
					# Configuramos
					$component_state_html 	= $component_state->get_html();
					break;	


		case 'fragment_info':
					#$file_name = 'inspector_list';

					$tag 					= $this->selected_tagName;	
					$tag_value 				= TR::tag2value($tag);
					$tag_type 				= TR::tag2type($tag);
					$tag_state 				= TR::tag2state($tag);
					$caller_id 				= $tag;

					$section_top_tipo 		= $_SESSION['config4']['top_tipo'];
					$section_top_id_matrix 	= $_SESSION['config4']['top_id'];						
					$rel_locator 			= component_common::build_locator($section_top_tipo, $section_top_id_matrix, $parent, $tipo, $tag_value);
						#dump($rel_locator ,'$rel_locator ');

					$raw_text 				= $this->component_obj->get_dato_real();
					$fragment_text 			= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];

					$this->set_modo('terminos_list');
					$this->context = 'tool_window';
					$component_text_area_terminos_list_html = $this->get_html();

					break;
					


		case 'terminos_list':					
		
					$index_list_html = null;

					$tag 					= $this->selected_tagName;	
					$tag_value 				= TR::tag2value($tag);

					$section_top_tipo 		= $_SESSION['config4']['top_tipo'];
					$section_top_id_matrix 	= $_SESSION['config4']['top_id'];					
					$rel_locator 			= component_common::build_locator($section_top_tipo, $section_top_id_matrix, $parent, $tipo, $tag_value);


					$arguments=array();
					$arguments['strPrimaryKeyName']	= 'id';
					$arguments['tipo']				= 'index';
					$arguments['dato:json']			= $rel_locator;
					$matrix_table					= 'matrix_descriptors';#RecordObj_descriptors::get_matrix_table_from_tipo($tipo);
					$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);	#($id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false)
					$ar_records						= $RecordObj_descriptors->search($arguments);
						#dump($ar_records,'ar_records',"for matrix_descriptors rel_locator: $rel_locator - $id - $matrix_table - $tipo");

					$n_index 			= count($ar_records);
					$ar_row_index_html 	= array();
					foreach ($ar_records as $current_matrix_id) {
						
						$matrix_table			= 'matrix_descriptors';#RecordObj_descriptors::get_matrix_table_from_tipo($tipo);
						$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $current_matrix_id);
						$terminoID 				= $RecordObj_descriptors->get_parent();
						$termino 				= RecordObj_ts::get_termino_by_tipo($terminoID,DEDALO_DATA_LANG);
						
						ob_start();
						include ( 'html/tool_indexation_index_list_row.phtml');
						$ar_row_index_html[$termino] = ob_get_contents();
						ob_get_clean();
					}

					# Sort array terms
					ksort($ar_row_index_html);	#, SORT_NATURAL | SORT_FLAG_CASE
					foreach ($ar_row_index_html as $row_index_html) {
						$index_list_html .= $row_index_html;
					}
					/**/
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>