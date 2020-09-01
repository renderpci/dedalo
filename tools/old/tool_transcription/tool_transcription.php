<?php

	# CONTROLLER TOOL TRANSCRIPTION

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$section_label 			= RecordObj_dd::get_termino_by_tipo($section_tipo);
	$component_name			= get_class($this->component_obj);
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSCRIPTION_ID;//
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	switch($modo) {	
		
		case 'button':
			$contain_references = search::have_inverse_relations($section_tipo, $section_id);	
			break;

		case 'page':				

			# Fix related component (component_text_area)
			$this->component_related_obj = $this->get_component_related_obj();
				#dump($this->component_related_obj, ' this->component_related_obj');

			if (!is_object($this->component_related_obj)) {
				return null; 	# media sin transcripción asociada
			}

			$properties = $this->component_related_obj->get_properties();
				#dump($properties, ' $properties ++ '.to_string());


			# SVG case check if related to text area
			$text_area_tipo = $this->component_related_obj->get_tipo();
			$ar_svg_related = common::get_ar_related_by_model('component_svg', $text_area_tipo); // $text_area_tipo
			if (!empty($ar_svg_related)) {
				$svg_tipo = reset($ar_svg_related);
				# Search autocomplete
				$ar_autocomplete_hi_related = common::get_ar_related_by_model('component_autocomplete_hi', $text_area_tipo);
				if (empty($ar_autocomplete_hi_related)) {
					debug_log(__METHOD__." Empty related component_autocomplete_hi. Please add related component_autocomplete_hi to text_area ($text_area_tipo)".to_string(), logger::ERROR);
				}else{						
					$autocomplete_hi_tipo 	   = reset($ar_autocomplete_hi_related);
					$component_autocomplete_hi = component_common::get_instance('component_autocomplete_hi',
																				 $autocomplete_hi_tipo,
																				 $parent,
																				 'edit',
																				 DEDALO_DATA_NOLAN,
																				 $section_tipo);
					$editing_svg = true;

					$component_autocomplete_hi_html = $component_autocomplete_hi->get_html();
				}
			}


			#
			# JS aditional
				if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
					js::$ar_url[]  = DEDALO_CORE_URL."/lock_components/js/lock_components.js";
				}
				
			#
			# TEXT (EDITOR) LEFT SIDE #######################################################################################################
			# Related object is always a coomponent_text_area. Other components are wellcome but the first is reserved for text_area					
				$this->component_related_obj->set_modo('tool_transcription');
				$original_lang 	= component_text_area::force_change_lang($this->component_related_obj->get_tipo(),
																		 $this->component_related_obj->get_parent(),
																		 $this->component_related_obj->get_modo(),
																		 $this->component_related_obj->get_lang(),
																		 $this->component_related_obj->get_section_tipo());
				$this->component_related_obj->set_lang($original_lang);				
				$component_related_obj_tipo = $this->component_related_obj->get_tipo();
				$id_wrapper 				= 'wrapper_'.$this->component_related_obj->get_identificador_unico();
				$html_component_text_area 	= $this->component_related_obj->get_html();					

				# TEXTAREA_LANG
				# Note that component_textarea can change his lang ('force_change_lang') in some contexts
				$textarea_lang = $this->component_related_obj->get_lang();

				# CSS / JS
				$component_related_name = get_class($this->component_related_obj);
				css::$ar_url[] = DEDALO_CORE_URL.'/'.$component_related_name.'/css/'.$component_related_name.'.css';
				js::$ar_url[]  = DEDALO_CORE_URL.'/'.$component_related_name.'/js/' .$component_related_name.'.js';

				# OTHER OPTIONAL COMPONENTS
				$html_other_components = '';
				$ar_related = $this->component_obj->RecordObj_dd->get_relaciones();					
				foreach ($ar_related as $modelo => $related_tipo) {
					$related_tipo = reset($related_tipo);
					if($related_tipo===$this->component_related_obj->get_tipo()) continue; // Skip already used first component
					
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($related_tipo,true);
					$component 		= component_common::get_instance($modelo_name,
																	 $related_tipo,
																	 $parent,
																	 $tool_name, // Modo : tool_transcription
																	 $lang,
																	 $section_tipo);
					$html_other_components .= $component->get_html();
				}

			
			#
			# MEDIA (PLAYER) RIGHT SIDE #######################################################################################################
				$this->component_obj->set_modo('player');
				$html_media = $this->component_obj->get_html();
				# Player on iframe
				#$reelID 	= $this->component_obj->get_video_id();		#dump($reelID);
				#$iframe_url = DEDALO_CORE_URL . '/media_engine/av_media_player.php?reelID=' . $reelID .'&quality=' .DEDALO_AV_QUALITY_DEFAULT ;
				
				$target_tipo = $this->component_related_obj->get_tipo();
				$source_tipo = $this->component_obj->get_tipo();
				$parent   	 = $this->component_obj->get_parent();

				# CSS / JS
				css::$ar_url[] = DEDALO_CORE_URL."/$component_name/css/$component_name.css";
				js::$ar_url[]  = DEDALO_CORE_URL."/$component_name/js/$component_name.js";



			#
			# HEADER ##########################################################################################################################
			$component_related_tipo = $this->component_related_obj->get_tipo();	# Tipo del text_area
				# DATA LANGS OF CURRENT SECTION
				/*
				$section_id 			= $parent;
				$section_tipo 			= $this->component_obj->get_section_tipo();
				$section 				= section::get_instance($section_id ,$section_tipo);
				$ar_all_project_langs 	= $section->get_ar_all_project_langs($resolve_termino=true);
				*/
				$ar_all_project_langs 	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);


				# INVERSE_CODE
				$inverse_code = tool_common::get_inverse_element('code', $parent, $section_tipo);
					#dump($inverse_code, ' $inverse_code ++ '.to_string());

				#
				# TOP_ID
				# Calculate TOP_ID from inverse data
				# dump(TOP_ID, 'TOP_ID ++ '.to_string());
				#if (!TOP_ID) {
					#dump($this, ' this ++ '.to_string());
					$section = section::get_instance( $parent, $section_tipo );
					$inverse_locators = $section->get_inverse_locators();
						#dump($inverse_locators, ' inverse_locators ++ '."$parent, $section_tipo ".to_string());
					/*
					if (empty($inverse_locators)) {
						//trigger_error("Warning: Indexing resource");
						echo "<div class=\"warning\">".label::get_label('por_favor_indexe_desde_una_seccion_de_inventario')." [2]</div>";
						return ;
					}*/
				#}//end if (!TOP_ID) {					

				#
				# STATE
				# Create component_state configurated
				$component_state 		= $this->component_obj->get_component_state( $tool_locator, $this->component_obj->get_lang() );
					#dump($component_state, ' component_state ++ '.to_string());
				$component_state_html 	= '';	
				if ( !empty($component_state) && is_object($component_state) ) {
					$component_state_html 	= $component_state->get_html();	
				}

				# Because components are loaded by ajax, we need prepare js/css elements from tool									
				# CSS / JS includes
				css::$ar_url[] = DEDALO_CORE_URL."/component_publication/css/component_publication.css";
				js::$ar_url[] = DEDALO_CORE_URL."/component_publication/js/component_publication.js";


			# BUTTON TOOL SUBTITLES
			if (defined('TEXT_SUBTITLES_ENGINE')) {
				$tool_subtitles 		= new tool_subtitles($this->component_related_obj,'button');
				$button_subtitles_html 	= $tool_subtitles->get_html();
			}

			# BUTTON TOOL TR_PRINT
				$tool_tr_print 				= new tool_tr_print($this->component_related_obj,'button');
				$button_tool_tr_print_html 	= $tool_tr_print->get_html();
			
			# BUTTON TOOL TIME_MACHINE
				$tool_time_machine 				= new tool_time_machine($this->component_related_obj,'button');
				$button_tool_time_machine_html 	= $tool_time_machine->get_html();
			


			# TOOL CSS / JS MAIN FILES
			# CSS
			css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
			# JS
			js::$ar_url[]  = DEDALO_CORE_URL."/tools/tool_lang/js/tool_lang.js";
			js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
			
			break;		
	}//end switch		


	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>