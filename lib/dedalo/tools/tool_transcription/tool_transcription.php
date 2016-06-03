<?php

	# CONTROLLER TOOL TRANSCRIPTION

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$component_name			= get_class($this->component_obj);
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSCRIPTION_ID;//
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	switch($modo) {	
		
		case 'button':
				
				break;

		case 'page':				

				# Fix related component (text)
				$this->component_related_obj = $this->get_component_related_obj();
					#dump($this->component_related_obj, ' this->component_related_obj');


				if (!is_object($this->component_related_obj)) {
					return null; 	# media sin transcripción asociada
				}

				# Because components are loaded by ajax, we need prepare js/css elements from tool
				#					
				# CSS
					css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_text_area/css/component_text_area.css';
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
					
				#
				# JS includes
					js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_text_area/js/component_text_area.js';
					js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

				#
				# JS aditional
					if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/lock_components/js/lock_components.js";
					}
					

				# TEXT (EDITOR) LEFT SIDE
				$this->component_related_obj->set_modo('tool_transcription');
				$component_related_obj_tipo = $this->component_related_obj->get_tipo();
				$html_text 					= $this->component_related_obj->get_html();

				# TEXTAREA_LANG
				# Note that component_textarea can change his lang ('force_change_lang') in some contexts
				$textarea_lang = $this->component_related_obj->get_lang();					
				

				# MEDIA (PLAYER) RIGHT SIDE
				$this->component_obj->set_modo('player');
				$html_media = $this->component_obj->get_html();
				# Player on iframe
				#$reelID 	= $this->component_obj->get_video_id();		#dump($reelID);
				#$iframe_url = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID=' . $reelID .'&quality=' .DEDALO_AV_QUALITY_DEFAULT ;
				
				$target_tipo = $this->component_related_obj->get_tipo();
				$source_tipo = $this->component_obj->get_tipo();
				$parent   	 = $this->component_obj->get_parent();

				#
				# HEADER
				$component_related_tipo = $this->component_related_obj->get_tipo();	# Tipo del text_area
				# DATA LANGS OF CURRENT SECTION
				$section_id 			= $parent;
				$section_tipo 			= $this->component_obj->get_section_tipo();
				$section 				= section::get_instance($section_id ,$section_tipo);
				$ar_all_project_langs 	= $section->get_ar_all_project_langs();
					#dump($ar_all_project_langs,'$ar_all_project_langs');
						
				
				#
				# STATE
				# Create component_state configurated
				$component_state 		= $this->component_obj->get_component_state( $tool_locator, $this->component_obj->get_lang() );
					#dump($component_state, ' component_state ++ '.to_string());
				$component_state_html 	= '';	
				if ( !empty($component_state) && is_object($component_state) ) {
					$component_state_html 	= $component_state->get_html();	
				}


				# BUTTON TOOL SUBTITLES
				if (defined('TEXT_SUBTITLES_ENGINE')) {
					$tool_subtitles 		= new tool_subtitles($this->component_related_obj,'button');
					$button_subtitles_html 	= $tool_subtitles->get_html();
				}

				# TOOL CSS / JS MAIN FILES
				# CSS
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				# JS
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_lang/js/tool_lang.js";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
				
				break;				
		
	}#end switch		


		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>