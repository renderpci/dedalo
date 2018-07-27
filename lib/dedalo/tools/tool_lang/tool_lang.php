<?php

	# CONTROLLER TOOL LANG

	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->source_component->get_section_tipo();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$lang 					= $this->source_component->get_lang();
	$label 					= $this->source_component->get_label();
	$section_label 			= RecordObj_dd::get_termino_by_tipo($section_tipo);
	$traducible 			= $this->source_component->get_traducible();	
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSLATE_ID;//
	$tool_name 				= get_class($this);
	$component_name 		= get_class($this->source_component);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	switch($modo) {
		
		case 'button_inline':
					break;

		case 'button':
					# Si el component no tiene id, y no hay registros en ningún idioma,  NO se crea el html de tool 
					$component_ar_langs = $this->source_component->get_component_ar_langs();
						#dump($component_ar_langs,"component_ar_langs");

					if(empty($component_ar_langs)) {
						echo "<div class=\"warning\">empty source</div>";
						return null;
					}
					if ($traducible==='no') {
						return null;
					}				
					break;

		case 'selector_source':
					$file_name 		 = 'selector';					
					# Get original lang to show the first time (not current data lang)
					/*
					$original_lang 	= component_text_area::force_change_lang($this->source_component->get_tipo(),
																			 $this->source_component->get_parent(),
																			 $this->source_component->get_modo(),
																			 $this->source_component->get_lang(),
																			 $this->source_component->get_section_tipo());*/
					$ar_select_langs = $this->get_source_langs();
					$desired_lang 	= $lang;

					// If desired lang datao is empty, get lang from available langs and inject in source_langs
					if (!key_exists($desired_lang,$ar_select_langs)) {
						$ar_target_langs = $this->get_target_langs();
						$ar_select_langs[$desired_lang] = $ar_target_langs[$desired_lang];
					}					
					break;

		case 'selector_target':
					$file_name 		 = 'selector';
					
					$ar_select_langs = $this->get_target_langs();	#dump($target_lang,'$target_lang');		
					$desired_lang 	 = $this->last_target_lang;
					break;
						
		case 'page':
					# SET SOURCE AND TARGET ARRRAY OF COMPONENTS
					#$this->get_ar_source_components();
					#$this->get_ar_target_components();
					
					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#
					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_state/css/component_state.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_publication/css/component_publication.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_text_area/css/component_text_area.css';
						#css::$ar_url[] = DEDALO_LIB_BASE_URL."/".$component_name."/css/".$component_name.".css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";

					#
					# JS includes
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_state/js/component_state.js";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_publication/js/component_publication.js";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL.'/component_text_area/js/component_text_area.js';
						#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/".$component_name."/js/".$component_name.".js";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";	

					#
					# JS aditional
					if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/lock_components/js/lock_components.js";
					}				


					#
					# INVERSE_LOCATORS					
						$section = section::get_instance( $parent, $section_tipo );
						$inverse_locators = $section->get_inverse_locators();						

					# Get original lang to show the first time (not current data lang)					
					$original_lang 	= component_text_area::force_change_lang($this->source_component->get_tipo(),
																			 $this->source_component->get_parent(),
																			 $this->source_component->get_modo(),
																			 $this->source_component->get_lang(),
																			 $this->source_component->get_section_tipo());
						//dump($original_lang, ' original_lang ++ '.to_string());
					$this->source_component->set_lang($original_lang);

					$this->source_component->role = "source_lang";

					# COMPONENT SOURCE

					#$this->source_component->set_permissions(1); // Set as read only !	

					$component_obj_source_html = $this->source_component->get_html();
					$inverse_code = tool_common::get_inverse_element('code', $parent, $section_tipo);
					#	dump($inverse_code, ' inverse_code ++ '.to_string());
					
					# COMPONENT TARGET					
					$target_component 			= $this->get_target_component();

					# Fix current media component
					#$this->component_obj = $this->get_target_component();
						#dump($this->component_obj,'$this->component_obj');
								
					$component_obj_target_html 	= null;
					
					#if (!empty($target_component)) {
					#	# Set variant to configure 'identificador_unico' of current component
					#	$target_component->set_variant( tool_lang::$target_variant );
					#	$component_obj_target_html = $target_component->get_html();
					#}					

					# SOURCE SELECTOR
					$this->modo = 'selector_source';
					$selector_source_lang_html = $this->get_html();

					# TARGET SELECTOR
					$this->modo = 'selector_target';
					$selector_target_lang_html = $this->get_html();

					$this->modo = 'page';

					# HEADER TOOL
					#$this->set_modo('header');
					#$header_html 	= $this->get_html();
					#$this->set_modo('page');
					$header_html 	= '';

					# AV_PLAYER_URL
					$reelID 		 = DEDALO_COMPONENT_RESOURCES_AV_TIPO .'_'. $section_tipo.'_'.$parent;
					$av_player_url   = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID='.$reelID.'&quality=' . DEDALO_AV_QUALITY_DEFAULT; // rsc35_rsc167_1
					$posterframe_url = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . '/posterframe/' . $reelID .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

					#
					# STATE
					# Note: component_state is loaded by ajax because when target lang is changed (on change target lang selector),
					# component_state options tool lang must be updated to new lang					

					break;		
	}#end switch	



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>