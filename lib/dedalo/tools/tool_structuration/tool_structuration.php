<?php

	# CONTROLLER TOOL LANG

	#dump($this, ' this ++ '.to_string());
	$tipo 					= $this->component_obj->get_tipo();
	$component_tipo 		= $tipo;
	$parent 				= $this->component_obj->get_parent();	#dump($tipo,$parent);
	$section_id				= $parent;
	$section_tipo			= $this->component_obj->get_section_tipo();	
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this->component_obj);
	$context_name			= $this->get_context();
	$tool_name 				= get_class($this);
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_INDEXATION_ID;//


	$selected_tagName 		= $this->selected_tagName;
	$selected_tag_id		= TR::tag2value($this->selected_tagName);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	
	

	
	switch($modo) {	
		
		case 'button':
			$section = section::get_instance( $parent, $section_tipo );
			$inverse_locators = $section->get_inverse_locators();
				#dump($inverse_locators, ' inverse_locators ++ '."$parent, $section_tipo ".to_string());				
			
			$contain_references = false;
			foreach ((array)$inverse_locators as $key => $current_locator) {
				if ($current_locator->section_tipo===TOP_TIPO) {
					$contain_references = true;
					break;
				}
			}
			break;
		
		case 'page':

			# TOOL CSS / JS MAIN FILES
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/section_tab/css/section_tab.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text_large/css/component_input_text_large.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_number/css/component_number.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_text_area/css/text_editor_default.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
							
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_input_text_large/js/component_input_text_large.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_number/js/component_number.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_common/js/split.min.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/section_tab/js/section_tab.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

			if (strpos(TOP_TIPO, 'rsc')===0) {
				//trigger_error("Warning: Indexing resource");
				echo "<div class=\"warning\">".label::get_label('por_favor_indexe_desde_una_seccion_de_inventario')." [1]</div>";
				return ;
			}


			#
			# TOP_ID
			# Calculate TOP_ID from inverse data
			# dump(TOP_ID, 'TOP_ID ++ '.to_string());
			if (!TOP_ID) {
				#dump($this, ' this ++ '.to_string());
				$section = section::get_instance( $parent, $section_tipo );
				$inverse_locators = $section->get_inverse_locators();
					#dump($inverse_locators, ' inverse_locators ++ '."$parent, $section_tipo ".to_string());

				if (empty($inverse_locators)) {
					//trigger_error("Warning: Indexing resource");
					echo "<div class=\"warning\">".label::get_label('por_favor_indexe_desde_una_seccion_de_inventario')." [2]</div>";
					return ;
				}
			}//end if (!TOP_ID) {
			


			# Because components are loaded by ajax, we need prepare js/css elements from tool
			#
			# CSS
				#css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
			#
			# JS includes
				#js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

			#$tesauro_url = DEDALO_LIB_BASE_URL . "/ts/ts_list.php?modo=tesauro_rel&type=all&current_tipo=".$tipo."&caller_id=".$parent."&caller_tipo=".$tipo."";
			$tesauro_url = DEDALO_LIB_BASE_URL . "/main/?menu=no&thesaurus_mode=relation&component_name=component_text_area&t=".DEDALO_TESAURO_TIPO;				


			$this->component_obj->set_modo('structuration');
			# Force change lang  (component is inited in edit mode without $_GET['m'] var set. Because this we need trigger manually force_change_lang)		
			$original_lang 	= component_text_area::force_change_lang($this->component_obj->get_tipo(),
																	 $this->component_obj->get_parent(),
																	 $this->component_obj->get_modo(),
																	 $this->component_obj->get_lang(),
																	 $this->component_obj->get_section_tipo());
			$this->component_obj->set_lang($original_lang);

			$lang = $this->component_obj->get_lang();
			
			// Change mode
			$this->component_obj->set_modo('tool_structuration');

			// text area html
			$component_text_area_html = $this->component_obj->get_html();

			#$dato 				 = $this->component_obj->get_dato();
			#$final_editable_text = TR::addTagImgOnTheFly($dato);				

			#
			# STATE
			# Create component_state configurated
			$component_state 		= $this->component_obj->get_component_state( $tool_locator, $this->component_obj->get_lang() );
			$component_state_html 	= '';
			if ( !empty($component_state) && is_object($component_state) ) {
				$component_state_html = $component_state->get_html();
			}
			break;

	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>