<?php

	# CONTROLLER TOOL LANG

	#dump($this, ' this ++ '.to_string());
	$tipo 					= $this->component_obj->get_tipo();
	$component_tipo 		= $tipo;
	$parent 				= $this->component_obj->get_parent();	#dump($tipo,$parent);
	$section_id				= $parent;
	$section_tipo			= $this->component_obj->get_section_tipo();	
	$label 					= $this->component_obj->get_label();
	$section_label 			= RecordObj_dd::get_termino_by_tipo($section_tipo);
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this->component_obj);
	$context_name			= $this->get_context();
	$tool_name 				= get_class($this);
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_INDEXATION_ID;

	$selected_tagName 		= $this->selected_tagName;
	$selected_tag_id		= TR::tag2value($this->selected_tagName);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;
	
	
	switch($modo) {	
		
		case 'button':			
			$contain_references = search::have_inverse_relations($section_tipo, $section_id);
			break;
		
		case 'page':

			# TOOL CSS / JS MAIN FILES
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/section_tab/css/section_tab.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text_large/css/component_input_text_large.css";
			#css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_number/css/component_number.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_publication/css/component_publication.css";
			#css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_text_area/css/text_editor_default.css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
							
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_input_text_large/js/component_input_text_large.js";
			#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_number/js/component_number.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_publication/js/component_publication.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_common/js/split.min.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/section_tab/js/section_tab.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

			#
			# JS aditional
				if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/lock_components/js/lock_components.js";
				}

			if (strpos(TOP_TIPO, 'rsc')===0) {
				//trigger_error("Warning: Indexing resource");
				echo "<div class=\"warning\">".label::get_label('por_favor_indexe_desde_una_seccion_de_inventario')." [1]</div>";
				return ;
			}


			#
			# TOP_ID
			# Calculate TOP_ID from inverse data when TOP_ID is empty
			# dump(TOP_ID, 'TOP_ID ++ '.to_string());
			if (empty(TOP_ID) || !is_numeric(TOP_ID)) {
				# Reference locator (where component data locators point)
				$target_reference_locator = new locator();
					$target_reference_locator->set_section_tipo($section_tipo);
					$target_reference_locator->set_section_id($section_id);

				$inverse_locators = search::calculate_inverse_locators( $target_reference_locator );

				$ar_oh1 = array_filter($inverse_locators, function($current_locator) {
					return $current_locator->from_section_tipo === TOP_TIPO;
				});
				#dump($ar_oh1, ' $ar_oh1 ++ '.to_string());

				if (empty($ar_oh1)) {
					echo "<div class=\"warning\">".label::get_label('por_favor_indexe_desde_una_seccion_de_inventario')." [2]</div>";
					return ;
				}
			}//end if (!TOP_ID)
			

			# INVERSE_CODE
			$inverse_code = tool_common::get_inverse_element('code', $parent, $section_tipo);
				#dump($inverse_code, ' $inverse_code ++ '.to_string());


			# Because components are loaded by ajax, we need prepare js/css elements from tool
			#
			# CSS
				#css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
			#
			# JS includes
				#js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

			# TESAURO_URL
			$tesaurus_url = DEDALO_LIB_BASE_URL . "/main/?menu=no&thesaurus_mode=relation&component_name=component_text_area&t=".DEDALO_TESAURO_TIPO;				

			# AV_PLAYER_URL
			$reelID = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. $section_tipo.'_'.$parent;
			$av_player_url   = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID='.$reelID.'&quality=' . DEDALO_AV_QUALITY_DEFAULT; // rsc35_rsc167_1
			$posterframe_url = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . '/posterframe/' . $reelID .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;
			

			$this->component_obj->set_modo('structuration');
			# Force change lang  (component is inited in edit mode without $_GET['m'] var set. Because this we need trigger manually force_change_lang)		
			$original_lang 	= component_text_area::force_change_lang($this->component_obj->get_tipo(),
																	 $this->component_obj->get_parent(),
																	 $this->component_obj->get_modo(),
																	 $this->component_obj->get_lang(),
																	 $this->component_obj->get_section_tipo());
			$original_lang_label = lang::get_name_from_code($original_lang, DEDALO_APPLICATION_LANG);

			$this->component_obj->set_lang($original_lang);

			$lang = $this->component_obj->get_lang();
			
			// Change mode
			$this->component_obj->set_modo('tool_structuration');

			// text area html
			$component_text_area_html 		= $this->component_obj->get_html();
			$component_text_area_wrapper 	= 'wrapper_'.$this->component_obj->get_identificador_unico(); 

			#$dato 				 = $this->component_obj->get_dato();
			#$final_editable_text = TR::addTagImgOnTheFly($dato);

			# BUTTON TOOL TR_PRINT
				$tool_tr_print 				= new tool_tr_print($this->component_obj,'button');
				$button_tool_tr_print_html 	= $tool_tr_print->get_html();
			
			# BUTTON TOOL TIME_MACHINE
				$tool_time_machine 			= new tool_time_machine($this->component_obj,'button');
				$button_tool_time_machine_html = $tool_time_machine->get_html();		

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