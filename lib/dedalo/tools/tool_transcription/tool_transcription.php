<?php

	# CONTROLLER TOOL TRANSCRIPTION

	#$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;

	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {	
		
		case 'button':
					switch ($component_name) {

						case 'component_av':
							if ( !file_exists($this->component_obj->get_video_path()) ) {
								return null;
							}
							break;

						case 'component_image':
							if ( !file_exists($this->component_obj->get_image_path()) ) {
								return null;
							}

						case 'component_pdf':
							if ( !file_exists($this->component_obj->get_pdf_path()) ) {
								return null;
							}
						
						case 'component_geolocation':
							# nothing to do
							break;
					}


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
						

					# TEXT (EDITOR) LEFT SIDE
					$this->component_related_obj->set_modo('tool_transcription');
					$component_related_obj_tipo = $this->component_related_obj->get_tipo();
					$html_text 					= $this->component_related_obj->get_html();
					

					# MEDIA (PLAYER) RIGHT SIDE
					$this->component_obj->set_modo('player');
					$html_media = $this->component_obj->get_html();
					# Player on iframe
					#$reelID 	= $this->component_obj->get_video_id();		#dump($reelID);
					#$iframe_url = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID=' . $reelID .'&quality=' .DEDALO_AV_QUALITY_DEFAULT ;
					
					$target_tipo = $this->component_related_obj->get_tipo();
					$source_tipo = $this->component_obj->get_tipo();
					$parent   	 = $this->component_obj->get_parent();


					# HEADER TOOL
					$this->set_modo('header');

					$header_html 	= $this->get_html();
					$this->set_modo('page');


					# BUTTON TOOL SUBTITLES
					if (defined('TEXT_SUBTITLES_ENGINE')) {
						$tool_subtitles 		= new tool_subtitles($this->component_related_obj,'button');
						$button_subtitles_html 	=  $tool_subtitles->get_html();
					}

					break;

		case 'header':
					$component_related_tipo = $this->component_related_obj->get_tipo();	# Tipo del text_area
					# DATA LANGS OF CURRENT SECTION
					$section_id 			= $parent;
					$section_tipo 			= component_common::get_section_tipo_from_component_tipo($tipo);
					$section 				= section::get_instance($section_id ,$section_tipo);
					$ar_all_project_langs 	= $section->get_ar_all_project_langs();
						#dump($ar_all_project_langs,'$ar_all_project_langs');

					# Creamos un componente state
					$component_state 		= $this->get_component_state_obj($parent);

					# Si no está definido en estructura
					if(!is_object($component_state)) return null;

					# Devolvemos el html del componente				
					$component_state_html 	= $component_state->get_html();
					break;				
		
	}#end switch		


		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>