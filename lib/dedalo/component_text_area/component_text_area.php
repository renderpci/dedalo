<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();		#dump($parent,"parent");
	$section_tipo 			= $this->get_section_tipo();	
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$caller_id 				= navigator::get_selected('caller_id');		
	$caller_tipo 			= navigator::get_selected('caller_tipo');	

	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	#dump( round(microtime(1),1),"microtime");	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_raw 				= tools::truncate_text(htmlspecialchars($valor),300);	#tools::truncate_text($string, $limit, $break=" ", $pad="...")
	#$context_name 			= $this->get_context();
		#dump($context_name,'context_name');
		#echo "context_name:$context_name - $modo";
	$context_name = null;
	if (isset($_REQUEST['context_name'])) {
		$context_name = $_REQUEST['context_name'];
	}


	# Propiedades puede asignar valores de configuración del editor de texto (tinyMCE)
	$propiedades = $this->get_propiedades();
	$propiedades_json = json_handler::encode($propiedades);
		#dump($propiedades,'propiedades');


	
	

	$file_name = $modo;
		#dump($file_name,"");

	
	switch($modo) {
		
		#case 'portal_list'	:
						#$file_name = 'edit';
		case 'tool_transcription':
		case 'indexation':
		case 'edit'	:	
					# Verify component content record is inside section record filter
					if ($this->get_filter_authorized_record()===false) return NULL ;

					$dato 				= TR::addTagImgOnTheFly($dato);
					$ar_css				= $this->get_ar_css();
					$last_tag_index_id	= $this->get_last_tag_index_id();		#dump($last_tag_index_id,'last_tag_index_id');
					$id_wrapper 		= 'wrapper_'.$identificador_unico;
					$input_name 		= "{$tipo}_{$parent}";
					$text_area_tm 		= NULL;

					$component_info 	= $this->get_component_info('json');
						
					
					# DATO_REFERENCE_LANG
					$dato_reference_lang= NULL;
					/* DESACTIVO DE MOMENTO. VOLVER A ACTIVAR CUANDO LA B4 ESTÉ ESTABLE 
					if (empty($dato) && $this->get_traducible()=='si') { # && $traducible=='si'
						#$dato_reference_lang = $this->get_dato_default_lang();
						#dump($this,"this");
						$default_component = $this->get_default_component();
							#dump($default_component,'$default_component');
					}
					*/										

					
					# CANVAS ID : Resolve canvas_id for paper get tags
					$canvas_id = null;
					$ar_relaciones = $this->RecordObj_dd->get_relaciones();
					if(!empty($ar_relaciones)) foreach ($ar_relaciones as $key => $ar_values) {
					
						foreach ($ar_values as $relaciones_modelo => $relaciones_tipo) {
							$modelo_name = RecordObj_dd::get_termino_by_tipo($relaciones_modelo,null,true);
							if($modelo_name=='component_image') {
								#$component_image 	= new component_image($relaciones_tipo, $parent, $modo);
								$component_image 	= component_common::get_instance('component_image', $relaciones_tipo, $parent, $modo, DEDALO_DATA_NOLAN, $this->section_tipo);
								$canvas_id 			= $component_image->get_identificador_unico();
							}
						}	
					}
					#dump($canvas_id,'canvas_id');
					break;

		
		case 'tool_lang' :
					$dato 				= TR::addTagImgOnTheFly($dato);
					$ar_css				= $this->get_ar_css();
					$last_tag_index_id	= $this->get_last_tag_index_id();		#dump($last_tag_index_id,'last_tag_index_id');

					$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tool_lang';
					$input_name 		= "{$tipo}_{$parent}";
					$text_area_tm 		= NULL;
					$dato_reference_lang= NULL;
					# Force file_name
					#$file_name  = 'edit';
					break;
	
		case 'tool_time_machine' :	
					$ar_css				= $this->get_ar_css();
					$last_tag_index_id	= $this->get_last_tag_index_id();

					$component_info 	= $this->get_component_info('json');
						#dump($component_info, ' component_info - '.$modo);

					$canvas_id = null;
					
					# Asignado al componente en trigger time machine
					#$version_date 		= $this->get_version_date();	#dump($version_date,'version_date');

					$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tm';
					$input_name 		= "{$tipo}_{$parent}_tm";
					$text_area_tm 		= 'text_area_tm';
					$dato_reference_lang= NULL;												
					if (empty($dato)) { # && $traducible=='si'
						$dato_reference_lang = $this->get_dato_default_lang();		
					}
					# Force file_name
					$file_name  = 'edit';
					break;
						
		case 'fragment_info' :
					$arguments = (object)$this->arguments;
					#dump($arguments,"fragment_info arguments");
					if (!isset($arguments->tagName)) {
						//echo "Error: tagName not defined in arguments (fragment_info)";
						trigger_error("Error: tagName not defined in arguments (fragment_info)");
						return;
					}

					$tag 					= $arguments->tagName;
					$tag_value 				= TR::tag2value($tag);
					$tag_type 				= TR::tag2type($tag);
					$tag_state 				= TR::tag2state($tag);

					$section_top_tipo 		= TOP_TIPO;	#dump($section_top_tipo,'$section_top_tipo');
					$section_top_id 		= TOP_ID;	#navigator::get_selected('id');
					
					# LOCATOR
					$locator = new locator();
						$locator->set_section_top_tipo( $section_top_tipo );
						$locator->set_section_top_id( $section_top_id );
						$locator->set_section_tipo( $section_tipo );
						$locator->set_section_id( $parent );
						$locator->set_component_tipo( $tipo );
						$locator->set_tag_id( $tag_value );

					$rel_locator = json_handler::encode($locator);
						#dump($rel_locator,"rel_locator");
					#$rel_locator_js_pretty	= json_encode($rel_locator); 	dump($rel_locator_js_pretty,"rel_locator_js_pretty");
					#$rel_locator 			= json_handler::encode($rel_locator);
					
						#dump($rel_locator,"rel_locator en fragment info");
					#$rel_locator 			= component_common::build_locator_relation($parent, $tipo, $tag_value);
						#dump($rel_locator,'$rel_locator');

					$raw_text 				= $this->get_dato_real();
					$fragment_text 			= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];
					#error_log('fragment_info fragment_text: '.$fragment_text);
					break;

		case 'selected_fragment' :						
					$arguments = (object)$this->arguments;
						#dump($arguments,"selected_fragment arguments");
					if (!isset($arguments->tagName)) {
						//echo "Error: tagName not defined in arguments (selected_fragment)";
						//trigger_error("Error: tagName not defined in arguments (selected_fragment)");
						return;
					}

					$tag 					= $arguments->tagName;	#$caller_id;
					$tag_value 				= TR::tag2value($tag);
					$tag_type 				= TR::tag2type($tag);
									
					$tag_state_selector_html= $this->get_tag_state_selector_html($tag); 
						#dump($tag_state_selector_html,'$tag_state_selector_html');
					#$rel_locator 			= component_common::build_locator($parent, $tipo, $tag_value);
					#$raw_text 				= $this->get_dato_real();
					#$fragment_text 			= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];
		
					
					/**
					* FRAGMENT INFO HTML
					*/
					# Change modo temporarily for retrieve fragment_info html
					$this->set_modo('fragment_info');
					$fragment_info_html = $this->get_html();						
					# Restore modo
					$this->set_modo('selected_fragment');						

					/**
					* AJAX LIST OF RELATED AREAS GROUPED BY TIPO
					* Compone el html del listado de secciones (agrupadas por tipo) relacionadas con esta etiqueta
					*/
					# Buscamos en matrix coincidencias con esta sección , componente, etiqueta
					#dump($tag,'tag',"modo:$modo, parent:$parent, tipo:$tipo, tag_value:$tag_value",true);
					$relation_list_html 	= '';
				

					$section_top_tipo 		= TOP_TIPO;
					$section_top_id 		= TOP_ID;
					# LOCATOR
					$locator = new stdClass();
						$locator->section_top_tipo 		= (string)$section_top_tipo;
						$locator->section_top_id		= (string)$section_top_id;
						$locator->section_tipo			= (string)$section_tipo;
						$locator->section_id 			= (string)$parent;
						$locator->component_tipo		= (string)$tipo;
						$locator->tag_id				= (string)$tag_value;

					#$rel_locator 			= component_common::build_locator_relation($parent, $tipo, $tag_value);
					$rel_locator = json_handler::encode($locator);
						//dump($rel_locator,'$rel_locator ');
					#error_log('selected_fragment rel_locator: '.$rel_locator);					
					break;
		
		case 'search' :	$ar_css		= false; 							
					break;
		
		case 'portal_list'	:
					if(empty($dato)) return null;
					$file_name = 'list';
		case 'list_tm' :
					$file_name = 'list';
						
		case 'list'	:	
					/*
						//if(strlen($valor)>$max_char) $valor = substr($valor,0,$max_char).'..';
						$max_char 		 = 256;
						$obj_fragmentos	 = new stdClass();

						# 
						# First fragment (key 'full') always is a substring of whole text
						$fragmento_text = substr($valor,0,$max_char);
						if (strlen($valor)>$max_char) {
							$fragmento_text .= '..';
						}
						$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
						ob_start();
						include ( $page_html);
						$html =  ob_get_clean();
						$key=0;
						$obj_fragmentos->full = trim($html);
						
						#
						# Next fragments keys(1,2,..) (if tags exists)
						$tags_en_texto	= (array)$this->get_ar_relation_tags();
							#dump($tags_en_texto,"tags_en_texto");
						if (count($tags_en_texto[0])>0) {

							foreach ($tags_en_texto[0] as $key => $tag) {

								$ar_fragmento = (array)$this->get_fragment_text_from_tag($tag, $this->dato);
										#dump($ar_fragmento,"ar_fragmento");
								
								if(strlen($ar_fragmento[0])>$max_char) {
									$fragmento_text = substr($ar_fragmento[0],0,$max_char);
									if (strlen($ar_fragmento[0])>$max_char) {
										$fragmento_text .= '..';
									}
								} else{
									$fragmento_text = $ar_fragmento[0];
								}
								#dump ($fragmento_text); die();
								$tag_id = $tags_en_texto[3][$key];
									#dump ($tag_id); #die();
								
								$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
								ob_start();
								include ( $page_html);
								$html =  ob_get_clean();
								#$html = trim($html);

								$obj_fragmentos->$tag_id = trim($html);
							}
							#dump ($obj_fragmentos);
						}
						#dump(json_handler::encode($obj_fragmentos),"obj_fragmentos");
						$html_final = json_handler::encode($obj_fragmentos);		#dump(json_decode($html_final),"deciode");
						print $html_final; #error_log($html_final);
						return;
					*/
					break;

		case 'relation':# Force modo list
					$file_name 	= 'list';
					$ar_css		= false;
					$max_char 	= 256;
					if(strlen($valor)>$max_char) $valor = mb_substr($valor,0,$max_char).'..';
					break;						
		
		case 'lang'	:
					$ar_css		= $this->get_ar_css();
					$ar_tools_obj			= $this->get_ar_tools_obj();	
					$html_tools				= '';
					# load only time machime tool
					foreach($ar_tools_obj as $tool_obj) {
						if( get_class($tool_obj) == 'tool_time_machine') {																		
							$html_tools .= $tool_obj->get_html();								
						}
					}
		case 'diffusion':
					$diffusion_obj = new diffusion_component_obj();

					$diffusion_obj->section_tipo		= $section_tipo;
					$diffusion_obj->parent 				= $parent;
					$diffusion_obj->label 				= $label;
					$diffusion_obj->lang 				= $lang;
					$diffusion_obj->columns['texto'] 	= $dato;
					break;	
	}


	
		
		
	#$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


?>