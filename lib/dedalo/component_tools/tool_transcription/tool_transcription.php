<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$component_name			= get_class($this->component_obj);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump($this->component_obj);
	
	#dump($file_name ,'$file_name ');


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

						case 'component_geolocation':
							# nothing to do
							break;
					}

		case 'page':
					# Fix related component (text)
					$this->component_related_obj = $this->get_component_related_obj();


					if (!is_object($this->component_related_obj)) {
						return null; 	# media sin transcripción asociada
					}

					# TEXT (EDITOR) LEFT SIDE
					$this->component_related_obj->set_modo('tool_transcription');
					$component_related_obj_id = $this->component_related_obj->get_id();
					$html_text = $this->component_related_obj->get_html();
					

					# MEDIA (PLAYER) RIGHT SIDE
					$this->component_obj->set_modo('player');
					$html_media = $this->component_obj->get_html();
					# Player on iframe
					#$reelID 	= $this->component_obj->get_video_id();		#dump($reelID);
					#$iframe_url = DEDALO_LIB_BASE_URL . '/media_engine/av_media_player.php?reelID=' . $reelID .'&quality=' .DEDALO_AV_QUALITY_DEFAULT ;
					


					# HEADER TOOL
					$this->set_modo('header');
					$header_html 	= $this->get_html();
					$this->set_modo('page');
					
					break;

		case 'header':

					# DATA LANGS OF CURRENT SECTION
					$section_id 			= $parent;
					$section_tipo 			= common::get_tipo_by_id($section_id, $table='matrix');
					$section 				= new section($section_id ,$section_tipo);
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
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);
	
?>