<?php
	
	# CONTROLLER
		
	$tipo					= $this->get_tipo();
	$parent					= $this->get_parent();
	$lang					= $this->get_lang();
	$dato					= $this->dato;	

	$permissions			= common::get_permissions($tipo, $tipo);
	$this->set_permissions($permissions);	// Fix permissions for current element (important)

	$label					= $this->get_label();
	$modo					= $this->get_modo();
	$component_name			= get_class($this);
	$identificador_unico	= $this->get_identificador_unico();	
	$caller_id 				= $this->get_caller_id();
	$propiedades 			= $this->get_propiedades();	
	$file_name 				= $modo;

	#
	# CONTEXT . Override context object when is requested
	$context_name = common::get_request_var('context_name');
	if(!empty($context_name)){
		$context_obj = new stdClass();
			$context_obj->context_name = $context_name;
		$this->set_context($context_obj);
	}
	/*
	if(isset($_REQUEST['context_name']))  {
		
		$context_obj = new stdClass();
			$context_obj->context_name = $_REQUEST['context_name'];
		$this->set_context($context_obj);
	}
	*/
	$context = $this->get_context();
		#dump($context, ' context ++ '.to_string());

	# Test is a complete section or process
	$var_requested = common::get_request_var('t');
	//$is_process_section = (isset($_REQUEST['t']) && $_REQUEST['t']!= $tipo) ? true : false;
	$is_process_section = (!empty($var_requested) && $var_requested!==$tipo) ? true : false;

	#
	# GLOBAL ADMIN
	$ar_restricted_areas = array(DEDALO_SECTION_PROFILES_TIPO);
	$is_global_admin = (bool)component_security_administrator::is_global_admin( navigator::get_user_id() );
	if (!$is_global_admin && in_array($tipo, $ar_restricted_areas)) {
		echo "<div>".label::get_label('contenido_no_autorizado')."</div>";
		return null;
	}


	# COMPONENTS HTML
	$html_section_add = '';
	
	
	switch($modo) {

		case 'edit':
				
				$section_id 			= $this->get_section_id();
				$section_info 			= $this->get_section_info('json');
				$current_section_obj  	= $this;
				$ar_exclude_elements  	= array(); #array('dd1106');
				$section_real_tipo  	= $this->get_section_real_tipo();	# Important: Fija $this->section_real_tipo que es necesario luego
					#dump($section_real_tipo,"section_real_tipo ");
				$id_wrapper 			= 'wrap_section_'.$identificador_unico;

				css::$ar_url[] = DEDALO_LIB_BASE_URL . '/section_group/css/section_group.css';
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/section_group/js/section_group.js";	
				
			
				#
				# RECORDS_HTML
				# Render search form html using search.
				# We know the current record id but we search like a list filtered by id for maintain always the same criterion
					
					//if (!isset($_REQUEST['offset'])) {
					$offset 			  = common::get_request_var('offset');
					$search_options_id 	  = $this->tipo; // section tipo like oh1
					$saved_search_options = section_records::get_search_options( $search_options_id );
					if ($offset===false || $saved_search_options===false) {
					
						$self_locator = new locator();
							$self_locator->set_section_tipo($this->tipo);
							$self_locator->set_section_id($this->section_id);

						# SEARCH_QUERY_OBJECT . Add search_query_object to options
						$search_query_object_options = new stdClass();
							$search_query_object_options->limit  		= 1;
							$search_query_object_options->offset 		= 0;
							$search_query_object_options->filter_by_id 	= [$self_locator];
						$search_query_object = $this->build_search_query_object($search_query_object_options);

						# Create new options object
						$search_options = new stdClass();
							$search_options->modo				 		 = $modo;
							$search_options->context 			 		 = '';
							$search_options->search_query_object 		 = $search_query_object;
							
					}else{

						# Use saved search options (deep cloned to avoid propagation of changes !)
						$search_options = unserialize(serialize($saved_search_options));						
						
							# Configure edit specific
							$search_options->modo						 = $modo;
							$search_options->context					 = '';
							$search_options->search_query_object->limit  = 1;
							$search_options->search_query_object->offset = $offset;
							$search_options->search_query_object->select = [];				

					}//end if (empty($_REQUEST['offset'])) 			


				#
				# SAVE_HANDLER ADDS
				# Send save_handler across classes
				$search_options->save_handler = $this->save_handler;


				# Add layout_map to options
				if (isset($this->layout_map)) {
					$search_options->layout_map = $this->layout_map;
				}

				
				# SECTION_RECORDS
				$section_records 	  = new section_records($this->tipo, $search_options);				
				$section_records_html = $section_records->get_html();
				

				/*
				$search_options = new stdClass();
					$search_options->modo 	 = $modo;
					$search_options->context = $context;

				# SEARCH_QUERY_OBJECT . Add search_query_object to options
					$search_query_object = $this->build_search_query_object();					
						$search_query_object->limit  = 1;
						$search_query_object->offset = (int)$offset;
					$search_options->search_query_object = $search_query_object;

				$search_options_json = json_encode($search_options);
					#dump($search_options_json, ' search_options_json ++ '.to_string()); #die();

				$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, ['component','section_tap','section_tab'], $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false);
				#dump($ar_children, '$ar_children ++ '.to_string());
				foreach ($ar_children as $key => $children_tipo) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true);
					common::notify_load_lib_element_tipo($modelo_name, $this->modo);
				}*/
				

				#
				# INSPECTOR HTML
				# Render inspector html
					$inspector_html = '';
					$show_inspector	= $this->get_show_inspector();
					if ($show_inspector && !empty($section_records->records_data->ar_records)) {
						
						# Change modo temporally to get inspector html
						#$this->modo 	= 'edit_inspector';
						#$inspector_html = $this->get_html();
						# Restore original modo and continue
						$this->modo 	= 'edit';
						
						$inspector 		= new inspector($modo, $tipo, $this);
						$inspector_html = $inspector->get_html();
					}

				if ( strpos($context_name, 'portal')!==false ) {
					js::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_portal/js/tool_portal.js'; // Cuando añadimos un fragmento, no está disponible..	
				}

				#
				# ADITIONAL_CSS
					if (defined('DEDALO_ADITIONAL_CSS') && DEDALO_ADITIONAL_CSS===true && isset($propiedades->aditional_css)) {
						foreach ((array)$propiedades->aditional_css as $aditional_css_obj) {
							css::$ar_url[] = DEDALO_LIB_BASE_URL . $aditional_css_obj->path;
						}
					}
			
				#
				# ADITIONAL_JS
					if (isset($propiedades->aditional_js)) {
						foreach ((array)$propiedades->aditional_js as $aditional_js_obj) {
							css::$ar_url[] = DEDALO_LIB_BASE_URL . $aditional_js_obj->path;
						}
					}
					# DEDALO_LOCK_COMPONENTS JS
					if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/lock_components/js/lock_components.js";
					}
					if ($tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/hierarchy/js/hierarchy.js";
					}

					#js::$ar_url[]  = DEDALO_ROOT_WEB . "/lib/jquery/jquery.matchHeight-min.js";
				break;

		case 'list'	:

				$list_line = isset($propiedades->section_config->list_line) ? $propiedades->section_config->list_line : 'double';

				# SECTION_CONFIG
				$_SESSION['dedalo4']['section_config'][$this->tipo]['list_line'] = $list_line;

				# Additional css / js
				js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/section_records/js/section_records.js';
				css::$ar_url[] = DEDALO_LIB_BASE_URL . '/section_records/css/section_records.css';
				
				#
				# ROWS_LIST . SECTION LIST
				# Render rows html from section_rows
					$rows_list_html 	= '';
					/*
					#
					# SEARCH_OPTIONS_ID
						# SEARCH_OPTIONS_ID DEFAULT
						$search_options_id = 'section_'.$this->tipo;	
						# SEARCH_OPTIONS_ID OVERRIDES DEFAULT IN SOME CONTEXTS
						switch (true) {
							case ( common::get_request_var('m')==='tool_portal' ):
								#
								# TOOL PORTAL CASE
								# Override on tool_portal context
								$search_options_id = $context->search_options_session_key; // Get from tool portal context like 'tool_portal_oh1';
								break;
							case ( isset($this->context->context_name) && $this->context->context_name==='section_tool' && isset($this->context->tool_section_tipo) ):
								#
								# SECTION TOOL CASE
								# When current section is 'section_tool', $section_obj->context->section_tool was set with section_tool propiedades. In this case
								# section list of referenced 'tool_section_tipo' is used for create this session_key
								$search_options_id = 'section_'.$this->context->tool_section_tipo;
								break;
						}
					
					
					if (isset($pisuerga) && $search_options!==false) {
						
						# SEARCH_OPTIONS FROM SESSION
						#$options = (object)$search_options;
						#	$options->full_count = false; # Force update count records on non ajax call
						#	if(SHOW_DEBUG) {
						#		#error_log("Section: Search options precalculado en sesión key $search_options_session_key");
						#	}
						#
						#if (!empty($options->layout_map_list)) {
						#	$options->layout_map = $options->layout_map_list;
						#		#dump($options->layout_map, " options->layout_map ++".to_string());
						#}
						#if (empty($options->layout_map)) {
						#	$options->layout_map = false; // Force calculate layout map in search class
						#}
						#if (!empty($options->offset_list)) {
						#	$options->offset = $options->offset_list;
						#}
						#if (!empty($options->limit_list)) {
						#	$options->limit = $options->limit_list;
						#}
	
					}else{

						# SEARCH_OPTIONS NEW
						$search_options = new stdClass();
							$search_options->modo 					= $modo;
							$search_options->context 				= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
							###$search_options->section_tipo 		= $this->tipo;
							###$search_options->section_real_tipo 	= $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la estática;
							###$search_options->layout_map 			= component_layout::get_layout_map_from_section( $this );
							###$search_options->layout_map_list 	= $search_options->layout_map;
							###$search_options->offset_list 		= (int)0;
							###$search_options->search_options_session_key = $search_options_session_key;
							
							# OPTIONS CUSTOM
							switch (true) {
								//case (isset($_REQUEST['m']) && $_REQUEST['m']=='tool_portal'):
								case ( common::get_request_var('m')==='tool_portal' ):
									#
									# FILTER_BY_SECTION_CREATOR_PORTAL_TIPO
									# When received request 'm=tool_portal', options is set with param filter_by_section_creator_portal_tipo=$portal_tipo
									
									//$portal_tipo = $_REQUEST['t'];
									$portal_tipo = common::get_request_var('t');
									$search_options->filter_by_section_creator_portal_tipo = $portal_tipo;
									break;
								case ( isset($this->context->context_name) && $this->context->context_name==='section_tool' && isset($this->context->top_tipo) ):
									#
									# SECTION TOOL CASE
									# When current section is 'section_tool', $section_obj->context->section_tool was set with section_tool propiedades. In this case
									# section list of referenced 'tool_section_tipo' is used for create this session_key
									#$search_options->filter_by_inverse_locators = array('section_tipo' => $this->context->top_tipo);
									break;
								default:
									# code...
									break;
							}

							
							# ACTIVITY CASE
							#if ($this->tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
							#	$search_options->tipo_de_dato 			= 'dato';
							#	$search_options->tipo_de_dato_order		= 'dato';
							#	$search_options->order_by				= 'section_id DESC';	#section_id ASC
							#	$search_options->limit					= DEDALO_MAX_ROWS_PER_PAGE*3;
							#}
							#dump($search_options->layout_map_list, '$search_options->layout_map_list ++ '.to_string());
					}//end else

					$search_options = section::get_search_options( $search_options_id );
						#dump($search_options, ' search_options ++ '.to_string());

					$search_options_edited = false;
					if ($search_options===false) {
						// New search options
						$search_options = new stdClass();
							$search_options->modo 	 = $modo;
							$search_options->context = $context;

						# SEARCH_QUERY_OBJECT . Add search_query_object to options						
							$search_query_object = $this->build_search_query_object();
						
						$search_options->search_query_object = $search_query_object;

						$search_options_edited = true;
					}					
					

					$section_rows 	= new section_records($this->tipo, $search_options);
					$rows_list_html = $section_rows->get_html();
						#dump($section_rows, " section_rows ".to_string());
						#dump($this->tipo, ' this->tipo ++ '.to_string());
						#dump($_REQUEST['t'], ' tipo ++ '.to_string());

					
					if ($search_options_edited===true) {
						section::set_search_options($search_options, $search_options_id);
							dump($search_options_id, ' search_options_id Saved!! ++ '.to_string());
					}
					*/

					# SEARCH_OPTIONS
					$search_options_id 	  = $this->tipo; // section tipo like oh1
					$saved_search_options = section_records::get_search_options( $search_options_id );
						#dump($saved_search_options, ' saved_search_options ++ '.to_string());

					if ($saved_search_options===false) {
						# Is not defined
						$search_options = new stdClass();
							$search_options->modo 	 = $modo;
							$search_options->context = $context;

						# SEARCH_QUERY_OBJECT . Add search_query_object to options
							$search_query_object = $this->build_search_query_object();							
						
							$search_options->search_query_object = $search_query_object;
					}else{
						# Use saved search options
						$search_options = $saved_search_options;
						# Add current context
						$search_options->context = $context;
					}
					#$search_options_json = json_encode($search_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
					$search_options_json = json_encode($search_options, JSON_UNESCAPED_UNICODE );


				#
				# SECTION LIST PROPIEDADES
					$section_list_tipo 			= null;
					$section_list_propiedades 	= null;
					$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'section_list');
					if (!empty($ar_section_list[0])) {
						$section_list_tipo  	  = $ar_section_list[0];
						$RecordObj_dd 			  = new RecordObj_dd($section_list_tipo);
						$section_list_propiedades = json_decode($RecordObj_dd->get_propiedades());
					}
				
				#
				# NOTIFY_LOAD_LIB_ELEMENT
				# Remember that versions >= 4.8.2 loads list html by ajax. Because this we need notify the load here 
				# Section list components. notify_load_lib_element to prepare css / js to ajax load records
					$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($section_list_tipo, $cache=true, $simple=true);
					foreach ($ar_terminos_relacionados as $related_term_tipo) {
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($related_term_tipo,true);
						common::notify_load_lib_element_tipo($modelo_name, 'list');
					}
					# Temporal !
					if ($tipo==='oh1') {
						css::$ar_url[] = DEDALO_LIB_BASE_URL . '/extras/oh/widgets/media_icons/css/media_icons.css';
						css::$ar_url[] = DEDALO_LIB_BASE_URL . '/extras/oh/widgets/descriptors/css/descriptors.css';

						js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/extras/oh/widgets/descriptors/js/descriptors.js';
					}

				
				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html
					$search_form_html 	= '';
					$records_search 	= new records_search($this, 'list');
					$search_form_html 	= $records_search->get_html();	

				#
				# TOOL TIME MACHINE HTML
				# Render tool time machine content
					$time_machine_html='';
					if(isset($context->context_name)) {
						switch ($context->context_name) {
							case 'list_into_tool_portal':
								# nothing to do
								$time_machine_html='';
								break;
							default:
								$tool_time_machine	= new tool_time_machine($this,'button_section_list');
								$time_machine_html 	= $tool_time_machine->get_html();
								break;
						}
					}

				#
				# BUTTONS
				# Calculate and prepare current section buttons to use as : $this->section_obj->ar_buttons
					$ar_buttons = (array)$this->get_ar_buttons();
			
				#
				# ADITIONAL_CSS
					if (defined('DEDALO_ADITIONAL_CSS') && DEDALO_ADITIONAL_CSS===true && isset($propiedades->aditional_css)) {
						foreach ((array)$propiedades->aditional_css as $aditional_css_obj) {
							css::$ar_url[] = DEDALO_LIB_BASE_URL . $aditional_css_obj->path;
						}
					}
				
				break;

		case 'list_tm':

				#
				# ROWS_LIST_HTML
				# CALLED FROM TRIGGER (trigger.tool_time_machine)
				# var options is a object passed in get_html call as argument 
					$rows_list_html='';
					if (!is_object($options) || empty($options) || !isset($options->filter_by_id)) {
						error_log("Error: Wrong options received for tm list");
						return false;
					}					

					$search_options = new stdClass();
						$search_options->modo 	 = $modo;
						$search_options->context = $context;

						# SEARCH_QUERY_OBJECT . Add search_query_object to options
						$search_query_object_options = new stdClass();
							$search_query_object_options->filter_by_id  = $options->filter_by_id;							
						$search_query_object = $this->build_search_query_object($search_query_object_options);
						$search_options->search_query_object = $search_query_object;

					# Add to filter the received options
					$section_rows 	= new section_records($this->tipo, $search_options);
					$rows_list_html = $section_rows->get_html();	


					/* OLD WAY
					$layout_map = component_layout::get_layout_map_from_section( $this );
						#dump($layout_map,"layout_map");
					
					#$options = new stdClass(); 
						$options->section_tipo 		= $this->tipo;
						$options->section_real_tipo = $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la stática;
						$options->layout_map 		= $layout_map;
						$options->modo 				= $modo;
						$options->context 			= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
							#dump($options);die();

						$options->matrix_table  = 'matrix_time_machine';
						$options->json_field 	= 'dato';			
					
					$section_list 	= new section_records($this->tipo, $options);
					$rows_list_html = $section_list->get_html();
					*/				
				break;
	
		case 'relation':
				#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
				#	$html_section_add	.= $section_list->get_html();
				#}					
				return false;
					$html_section_add = $generated_content_html;	
				break;

		case 'relation_reverse_sections':
				$file_name = 'relation_reverse';
		case 'relation_reverse':
				#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
				#	$html_section_add	.= $section_list->get_html();
				#}
				$html_section_add = $generated_content_html;
				break;

		case 'list_thesaurus':
				$options = new stdClass();
					$options->section_tipo 		= $this->tipo;
					$options->section_real_tipo = $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la estática;
					$options->layout_map 		= component_layout::get_layout_map_from_section( $this );
					$options->layout_map_list 	= $options->layout_map;
					$options->offset_list 		= (int)0;
					#$options->modo 			= $modo;
					$options->context 			= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
					$options->search_options_session_key = $search_options_session_key;
						#dump($options, ' options ++ '.to_string());
				break;

		default:  echo "<blockquote> Error: modo '$modo' is not valid! </blockquote>"; return;
	}

		
	 
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	include($page_html);

?>