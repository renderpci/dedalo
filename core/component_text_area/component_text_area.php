<?php

	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$caller_id 				= navigator::get_selected('caller_id');
	$caller_tipo 			= navigator::get_selected('caller_tipo');

	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";

	$lang					= $this->get_lang();
	#$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);


	if($permissions===0) return null;

	// Context
		$context = $this->get_context();

		$req_context_name = common::get_request_var('context_name');
		if (false!==$req_context_name) {
			$context->context_name = $req_context_name;
			$this->set_context($context);
		}
		$context_name = isset($context->context_name) ? $context->context_name : null;

	#get the change modo from portal list to edit
	/*
	$var_requested = common::get_request_var('context_name');
	if (!empty($var_requested)) {
		$from_modo = $var_requested;
	}*/

	# Propiedades puede asignar valores de configuración del editor de texto (tinyMCE)
	$propiedades 	  = $this->get_propiedades();
	$propiedades_json = json_handler::encode($propiedades);


	# CSS / JS MAIN FILES
		css::$ar_url[] = DEDALO_CORE_URL."/component_autocomplete_hi/css/component_autocomplete_hi.css";
		js::$ar_url[]  = DEDALO_CORE_URL."/component_autocomplete_hi/js/component_autocomplete_hi.js";

		js::$ar_url[]  = DEDALO_CORE_URL."/component_text_area/js/mce_editor.js";
		js::$ar_url[]  = DEDALO_CORE_URL."/component_text_area/js/text_editor.js";


	$file_name = $modo;


	switch($modo) {

		case 'load_tr':
				$dato	= $this->get_dato();
				if ($tipo===DEDALO_COMPONENT_RESOURCES_TR_TIPO) {
					# Resolve chapters for current text
					$dato = component_text_area::resolve_titles($dato, $tipo, $section_tipo, $parent, null, $lang, true); // $raw_text, $component_tipo_tipo, $section_tipo, $section_id, $decore='h2', $lang=DEDALO_DATA_LANG
				}
				$text	= TR::addTagImgOnTheFly($dato);
				break;

		case 'tool_structuration':
				css::$ar_url[] = DEDALO_CORE_URL."/component_text_area/css/text_editor_default.css";

		case 'tool_indexation':
		case 'edit_in_list':
		case 'tool_transcription':
		case 'edit'	:
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL;

				// Role .
				$source_lang = component_text_area::force_change_lang($tipo, $parent, 'edit', $lang, $section_tipo);
				if ($lang===$source_lang) {
					$role = "source_lang";
				}else{
					$role = "tranlation_lang";
				}

				$component_info = $this->get_component_info('json');

				$dato = $this->get_dato();

				#
				# FIX BROKEN TAGS
				$ar_fix_broquen_tags_tipos = unserialize(DEDALO_TEXTAREA_FIX_BROQUEN_TAGS_TIPOS);
				if (  in_array($this->tipo, $ar_fix_broquen_tags_tipos) ) {
					if (isset($context->context_name) && $context->context_name==='default') {
						$save=true;
						if(SHOW_DEBUG===true) {
							$save=false;
							debug_log(__METHOD__." Stopped save broken tags for debugger only ".to_string(), logger::DEBUG);
						}
						switch ($modo) {
							case 'indexation':
							case 'tool_indexation':
								# FIX_BROKEN_INDEX_TAGS
								$broken_index_tags = $this->fix_broken_index_tags($save);
								break;
							case 'tool_structuration':
								# FIX_BROKEN_STRUCT_TAGS
								$broken_index_tags = $this->fix_broken_struct_tags($save);
								break;
							default:
								# Nothing to do
								break;
						}

						$component_warning = '';
						if (isset($broken_index_tags) && $broken_index_tags->result) {
							$component_warning .= ' '.$broken_index_tags->msg;
							if(SHOW_DEBUG===true) {
								$component_warning .= " (Fixed in ".$broken_index_tags->total.")";
							}
							// Get updated dato again
							$dato = $this->get_dato();
						}

						/*
						# FIX_BROKEN_INDEX_TAGS
						if ($modo==='indexation' || $modo==='tool_indexation') {
							$broken_index_tags = $this->fix_broken_index_tags($save);
							if ($broken_index_tags->result) {
								$component_warning .= $broken_index_tags->msg;
								if(SHOW_DEBUG===true) {
									$component_warning .= " (Fixed in ".$broken_index_tags->total.")";
								}
								// Get updated dato again
								$dato = $this->get_dato();
							}
						}
						# FIX_BROKEN_STRUCT_TAGS
						if ($modo==='tool_structuration') {
							$broken_index_tags = $this->fix_broken_struct_tags($save);
							if ($broken_index_tags->result) {
								$component_warning .= " ".$broken_index_tags->msg;
								if(SHOW_DEBUG===true) {
									$component_warning .= " (Fixed in ".$broken_index_tags->total.")";
								}
								// Get updated dato again
								$dato = $this->get_dato();
							}
						}
						*/
					}

					# FIX_BROKEN_PERSON_TAGS
					$dato = $this->fix_broken_person_tags($dato);
				}//end if ($modo=='edit' && in_array($this->tipo, $ar_fix_broquen_tags_tipos) )


				# Tool time machine context. Add chapters headers
				#if (isset($context->context_name) && $context->context_name==='tool_time_machine') {
				if ($tipo===DEDALO_COMPONENT_RESOURCES_TR_TIPO && $modo!=='tool_structuration') {
					# Resolve chapters for current text
					$dato = component_text_area::resolve_titles($dato, $tipo, $section_tipo, $parent, null, $lang, true);
				}
				#}
				#dump($context, ' context ++ '.to_string());

				$dato 				= TR::addTagImgOnTheFly($dato);
				#$last_tag_index_id	= $this->get_last_tag_index_id();
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";
				$text_area_tm 		= NULL;


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
				$ar_related_component_name = array();
				$ar_relaciones = $this->RecordObj_dd->get_relaciones();
				if(!empty($ar_relaciones)) foreach ($ar_relaciones as $key => $ar_values) {
					foreach ($ar_values as $relaciones_modelo => $relaciones_tipo) {
						$modelo_name = RecordObj_dd::get_termino_by_tipo($relaciones_modelo,null,true);
						$ar_related_component_name[] = $modelo_name;
						#$ar_related_component_name_json	= json_encode($ar_related_component_name);
						if($modelo_name==='component_image') {
							#$component_image 	= new component_image($relaciones_tipo, $parent, $modo);
							$component_image 	= component_common::get_instance('component_image', $relaciones_tipo, $parent, $modo, DEDALO_DATA_NOLAN, $this->section_tipo);
							$canvas_id 			= $component_image->get_identificador_unico();
						}
					}
				}
				$ar_related_component_name_json = json_encode($ar_related_component_name);


				# WRAP_CSS_SELECTORS
				# Aditional wrap selectors useful in some context like tool modes
				$wrap_css_selectors = isset($propiedades->wrap_css_selectors->{$modo}) ? $propiedades->wrap_css_selectors->{$modo} : '';


				#
				# STATE PROCESS
				# When propiedades->state is set, call to component_status for render status process options
				switch (true) {
					case (isset($context->context_name) && $context->context_name==='tool_time_machine'):
						$component_state_html = '';
						break;
					default:
						$component_state_html = $this->get_state_process_html();
				}

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);

				css::$ar_url[] = DEDALO_CORE_URL."/component_publication/css/component_publication.css";
				js::$ar_url[]  = DEDALO_CORE_URL."/component_publication/js/component_publication.js";
				break;

		case 'edit_note':
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL;

				$component_info 	= $this->get_component_info('json');
				$dato 				= $this->get_dato();
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);
				break;

		case 'tool_lang':
				$dato 				= $this->get_dato();

				if ($tipo===DEDALO_COMPONENT_RESOURCES_TR_TIPO) {
					# Resolve chapters for current text
					$dato = component_text_area::resolve_titles($dato, $tipo, $section_tipo, $parent, null, $lang, true);
				}

				$component_info = $this->get_component_info('json');

				// Role .
				if (isset($this->role)) {

					$role = $this->role;

				}else{

					$role = "tranlation_lang";
					/*
					$source_lang 	= component_text_area::force_change_lang($tipo, $parent, 'edit', $lang, $section_tipo);
					if ($lang===$source_lang) {
						$role = "source_lang";
					}else{
						$role = "tranlation_lang";
					}*/
				}
				#dump($role, ' role ++ '.to_string()); tranlation_lang


				// addTagImgOnTheFly
				$img_options = new stdClass();
					#if ($role==='tranlation_lang') {
					#	$img_options->force_tr_tags_cdn = defined('TR_TAGS_CDN') ? TR_TAGS_CDN : false;
					#}
				$dato = TR::addTagImgOnTheFly($dato, $img_options);


				$id_wrapper 		= 'wrapper_'.$identificador_unico;//.'_tool_lang';
				$input_name 		= "{$tipo}_{$parent}";
				$text_area_tm 		= NULL;
				$dato_reference_lang= NULL;
				# Force file_name
				#$file_name  = 'edit';
				break;

		case 'tool_time_machine':
				#$last_tag_index_id	= $this->get_last_tag_index_id();
				$component_info 	= $this->get_component_info('json');

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

		case 'fragment_info':
				$arguments = (object)$this->arguments;
				if (!isset($arguments->tagName)) {
					trigger_error("Error: tagName not defined in arguments (fragment_info)");
					return;
				}
				#dump($arguments->tagName, ' arguments->tagName ++ '.to_string()); die("Stoped!");

				$tag 					= $arguments->tagName;
				$tag_id 				= TR::tag2value($tag);
				$tag_type 				= TR::tag2type($tag);
				$tag_state 				= TR::tag2state($tag);

				$section_top_tipo 		= TOP_TIPO;
				$section_top_id 		= TOP_ID;

				# LOCATOR
				$locator = new locator();
					$locator->set_section_top_tipo( $section_top_tipo );
					$locator->set_section_top_id( $section_top_id );
					$locator->set_section_tipo( $section_tipo );
					$locator->set_section_id( $parent );
					$locator->set_component_tipo( $tipo );
					$locator->set_tag_id( $tag_id );

				$rel_locator = json_handler::encode($locator);
					#dump($rel_locator,"rel_locator");
				#$rel_locator_js_pretty	= json_encode($rel_locator); 	dump($rel_locator_js_pretty,"rel_locator_js_pretty");
				#$rel_locator 			= json_handler::encode($rel_locator);
				#$rel_locator 			= component_common::build_locator_relation($parent, $tipo, $tag_id);

				$raw_text 				= $this->get_dato();
				$fragment_text 			= component_text_area::get_fragment_text_from_tag($tag_id, $tag_type, $raw_text)[0];
				break;

		case 'selected_fragment__DES':

				$arguments = (object)$this->arguments;
					#dump($arguments,"selected_fragment arguments");
				if (!isset($arguments->tagName)) {
					return;
				}

				$tag 					= $arguments->tagName;	#$caller_id;
				$tag_value 				= TR::tag2value($tag);
				$tag_type 				= TR::tag2type($tag);

				$tag_state_selector_html= $this->get_tag_state_selector_html($tag);
					#dump($tag_state_selector_html,'$tag_state_selector_html');
				#$rel_locator 			= component_common::build_locator($parent, $tipo, $tag_value);
				#$raw_text 				= $this->get_dato();
				#$fragment_text 		= component_text_area::get_fragment_text_from_tag($tag_id, $tag_type, $raw_text)[0];

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

				#$rel_locator= component_common::build_locator_relation($parent, $tipo, $tag_value);
				$rel_locator = json_handler::encode($locator);
				break;

		case 'search':
				# dato is injected by trigger search when is needed
				$dato = isset($this->dato) ? $this->dato : null;

				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();
				$valor 						= isset($_GET['tipo']) ? safe_tipo($_GET['tipo']) : null;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;

		case 'portal_list':

				#if(empty($dato)) return null;
				$file_name 	= 'list';

				#$obj_value = json_decode($value); # Evitamos los errores del handler accediendo directamente al json_decode de php
				$obj_value = $value;

				# value from database is always an array of strings. default we select first element (complete text)
				# other array index are fragments of complete text
				$current_tag = 0;

				#
				# Portal tables can reference fragments of text inside components (tags). In this cases
				# we verify current required text is from correct component and tag
				if ( isset($locator->component_tipo) && isset($locator->tag_id) ) {
					$locator_component_tipo = $locator->component_tipo;
					$locator_tag_id 		= $locator->tag_id;
					if ($locator_component_tipo===$tipo) {
						$current_tag = (int)$locator_tag_id;
					}
				}

				if (is_object($obj_value) && isset($obj_value->$current_tag)) {
					$list_value = $obj_value->$current_tag;
				}else{
					$list_value = $value;
				}

				if (!is_string($list_value)) {
					debug_log(__METHOD__." Error. Expected string in list_value: ".to_string($list_value), logger::DEBUG);
					trigger_error("Error. Expected string in list_value");
					die();
				}

				# TRUNCATE ALL FRAGMENTS
				TR::limpiezaFragmentoEnListados($list_value,160);

				#if($calculated_value===true) $list_value = component_common::decore_untranslated( $list_value );
				#if($lang_received!==$original_lang) $list_value = component_common::decore_untranslated( $list_value );
				$fragment_text = $list_value;

				$id_wrapper = 'wrapper_'.$identificador_unico;
				break;

		case 'list_tm':
				$file_name = 'list';

		case 'list':
				return ''; // SKIP CALCLULATE LIST VALUE

				$lang_received = $lang;

				# Always use original lang (defined by optional component_select_lang asociated)
				$original_lang 	= component_text_area::force_change_lang($tipo, $parent, $modo, $lang, $section_tipo);
				$component 		= component_common::get_instance($component_name,
																 $tipo,
															 	 $parent,
															 	 $modo,
																 $original_lang,
															 	 $section_tipo);

				// Eliminado 17-2-2018 (Imposibilita el corte de texto por tag_id en los portales)
				#if($modo === 'portal_list'){
				#	$list_value = $component->get_html();
				#	return $list_value;
				#}

				#$obj_value = json_decode($value); # Evitamos los errores del handler accediendo directamente al json_decode de php
				$obj_value = $value;

				# value from database is always an array of strings. default we select first element (complete text)
				# other array index are fragments of complete text
				$current_tag = 0;

				#
				# Portal tables can reference fragments of text inside components (tags). In this cases
				# we verify current required text is from correct component and tag
				if ( isset($locator->component_tipo) && isset($locator->tag_id) ) {
					$locator_component_tipo = $locator->component_tipo;
					$locator_tag_id 		= $locator->tag_id;
					if ($locator_component_tipo===$tipo) {
						# Override current_tag
						$current_tag = (int)$locator_tag_id;
					}
				}

				if (is_object($obj_value) && isset($obj_value->$current_tag)) {
					$list_value = $obj_value->$current_tag;
				}else{
					$list_value = $value;
				}

				if (!is_string($list_value)) {
					if(SHOW_DEBUG===true) {
						#dump($list_value, ' render_list_value : list_value expected string. But received: '.gettype($list_value) .to_string($list_value));
						#throw new Exception("Error Processing Request. list_value expected string", 1);
					}

					debug_log(__METHOD__." Invalid value! Force convert to string ".to_string($value), logger::ERROR);
					$list_value = to_string($list_value);
				}

				# TRUNCATE ALL FRAGMENTS
				//TR::limpiezaFragmentoEnListados($list_value,160);

				#if($calculated_value===true) $list_value = component_common::decore_untranslated( $list_value );
				if($lang_received!==$original_lang) $list_value = component_common::decore_untranslated( $list_value );


				echo $list_value; return;
				break;

		case 'relation':# Force modo list
				$file_name 	= 'list';
				$max_char 	= 256;
				$valor 		= $this->get_valor();
				$dato_raw 	= tools::truncate_text(htmlspecialchars($valor),300);
				if(strlen($valor)>$max_char) $valor = mb_substr($valor,0,$max_char).'..';
				break;

		case 'lang':
				break;

		case 'diffusion':
				$diffusion_obj = new diffusion_component_obj();

				$diffusion_obj->section_tipo		= $section_tipo;
				$diffusion_obj->parent 				= $parent;
				$diffusion_obj->label 				= $label;
				$diffusion_obj->lang 				= $lang;
				$diffusion_obj->columns['texto'] 	= $dato;
				break;

		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();
					#dump($render_vars, ' render_vars ++ '.to_string());
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;

		case 'print':
				$valor = $this->get_valor();
				break;

		default:
	}

	#$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


?>
