<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$caller_id 				= navigator::get_selected('caller_id');		
	$caller_tipo 			= navigator::get_selected('caller_tipo');	

	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $id";
	
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_raw 				= tools::truncate_text(htmlspecialchars($valor),300);	#tools::truncate_text($string, $limit, $break=" ", $pad="...")
	$context 				= $this->get_context();
		#dump($context,'context');
		#echo "context:$context - $modo";

	# Propiedades puede asignar valores de configuración del editor de texto (tinyMCE)
	$propiedades = $this->get_propiedades();
	$propiedades_json = json_handler::encode($propiedades);
		#dump($propiedades,'propiedades');


	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	

	$file_name				= $modo;


	
	switch($modo) {
		
		#case 'portal_list'	:
						#$file_name = 'edit';
		case 'tool_transcription':
		case 'indexation'	:
		case 'edit'	:	$ar_css				= $this->get_ar_css();
						$last_tag_index_id	= $this->get_last_tag_index_id();		#dump($last_tag_index_id,'last_tag_index_id');
						$id_wrapper 		= 'wrapper_'.$identificador_unico;
						$input_name 		= "{$tipo}_{$id}";
						$text_area_tm 		= NULL;
						
						# DATO_REFERENCE_LANG
						$dato_reference_lang= NULL;
						if (empty($dato) && $this->get_traducible()=='si') { # && $traducible=='si'
							#$dato_reference_lang = $this->get_dato_default_lang();
							$default_component = $this->get_default_component();
								#dump($default_component,'$default_component');
						}

						
						# CANVAS ID : Resolve canvas_id for paper get tags
						$canvas_id = null;
						$ar_relaciones = $this->RecordObj_ts->get_relaciones();
						if(!empty($ar_relaciones)) foreach ($ar_relaciones as $key => $ar_values) {
						
							foreach ($ar_values as $relaciones_modelo => $relaciones_tipo) {
								$modelo_name = RecordObj_ts::get_termino_by_tipo($relaciones_modelo);
								if($modelo_name=='component_image') {
									$component_image 	= new component_image(NULL,$relaciones_tipo, $modo, $parent);
									$canvas_id 			= $component_image->get_identificador_unico();
								}
							}	
						}
						#dump($canvas_id,'canvas_id');
						
						break;

		
		case 'tool_lang' :	
						$ar_css				= $this->get_ar_css();
						$last_tag_index_id	= $this->get_last_tag_index_id();		#dump($last_tag_index_id,'last_tag_index_id');

						$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tool_lang';
						$input_name 		= "{$tipo}_{$id}";
						$text_area_tm 		= NULL;
						$dato_reference_lang= NULL;
						# Force file_name
						#$file_name  = 'edit';
						break;

		
		case 'tool_time_machine' :	
						$ar_css				= $this->get_ar_css();
						$last_tag_index_id	= $this->get_last_tag_index_id();
						
						# Asignado al componente en trigger time machine
						#$version_date 		= $this->get_version_date();	#dump($version_date,'version_date');

						$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tm';
						$input_name 		= "{$tipo}_{$id}_tm";
						$text_area_tm 		= 'text_area_tm';
						$dato_reference_lang= NULL;												
						if (empty($dato)) { # && $traducible=='si'
							$dato_reference_lang = $this->get_dato_default_lang();		
						}
						# Force file_name
						$file_name  = 'edit';	
						break;
						
		case 'fragment_info' :
			
						$tag 					= $caller_id;
						$tag_value 				= TR::tag2value($tag);
						$tag_type 				= TR::tag2type($tag);
						$tag_state 				= TR::tag2state($tag);

						$section_top_tipo 		= $_SESSION['config4']['top_tipo'];	#dump($section_top_tipo,'$section_top_tipo');
						$section_top_id_matrix 	= $_SESSION['config4']['top_id'];	#navigator::get_selected('id');
						$rel_locator 			= component_common::build_locator($section_top_tipo, $section_top_id_matrix, $parent, $tipo, $tag_value);
						#$rel_locator 			= component_common::build_locator_relation($parent, $tipo, $tag_value);
							#dump($rel_locator,'$rel_locator');

						$raw_text 				= $this->get_dato_real();
						$fragment_text 			= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];
						break;

		case 'selected_fragment' :						

						$tag 					= $caller_id;	
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
					

						#$section_top_tipo 		= $_SESSION['config4']['top_tipo'];
						#$section_top_id_matrix 	= $_SESSION['config4']['top_id'];// navigator::get_selected('id');						
						#$rel_locator 			= component_common::build_locator($section_top_tipo, $section_top_id_matrix, $parent, $tipo, $tag_value);

						$rel_locator 			= component_common::build_locator_relation($parent, $tipo, $tag_value);
							//dump($rel_locator,'$rel_locator ');
					
						break;
		
		case 'search' :	$ar_css		= false; 							
						break;					
		
		case 'portal_list'	:
						if(empty($dato)) return null;
						$file_name = 'list';			
		case 'list_tm' :
						$file_name = 'list';
						
		case 'list'	:	$ar_css		= false;
						$max_char = 256;
						if(strlen($valor)>$max_char) $valor = substr($valor,0,$max_char).'..';
						break;

		case 'relation':# Force modo list
						$file_name 	= 'list';
						$ar_css		= false;
						$max_char 	= 256;
						if(strlen($valor)>$max_char) $valor = substr($valor,0,$max_char).'..';
						break;						
		
		case 'lang'	:	$ar_css		= $this->get_ar_css();
						$ar_tools_obj			= $this->get_ar_tools_obj();	
						$html_tools				= '';
						# load only time machime tool
						foreach($ar_tools_obj as $tool_obj) {
							if( get_class($tool_obj) == 'tool_time_machine') {																		
								$html_tools .= $tool_obj->get_html();								
							}
						}
		case 'diffusion' :

						

						break;	
	}


	
		$diffusion_obj = new diffusion_component_obj();
		
		$diffusion_obj->parent 				= $parent;
		$diffusion_obj->label 				= $label;
		$diffusion_obj->lang 				= $lang;
		$diffusion_obj->columns['texto'] 	= $dato;
		/*
		switch ($related_modelo) {
			case 'component_av':
				$component_av = new component_av(NULL,$component_av_tipo,'diffusion',$parent);
				$diffusion_obj->columns['video_url']		=  $component_av->get_url();
				$diffusion_obj->columns['posterframe_url']	=  $component_av->get_posterframe();
				break;
			
			case 'component_image':
				$component_image = new component_image(NULL,$component_av_tipo,'diffusion',$parent);
				foreach($ar_calidades as $calidad) {
					$diffusion_obj->columns['image_url_'.$calidad]	=  $component_av->get_url();
				}
				break;
		}	
		
		dump($diffusion_obj,'$diffusion_obj');
		*/
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);


?>