<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo,$tipo);
	$area_name				= get_class($this);
	$visible				= $this->get_visible();
	$ar_children_areas 		= $this->get_ar_ts_children_areas_recursive($tipo);		
	$file_name 				= $modo;

	# When request var 'model' is set, use models target section, else use regular target section
	if (isset($_GET['model'])) {

		$this->model_view 				= true;
		$this->target_section_tipo 		= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
		$this->hierarchy_childrens_tipo	= DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO;
		$_SESSION['dedalo4']['config']['thesaurus_view_mode'] = 'model';

	}else{

		$_SESSION['dedalo4']['config']['thesaurus_view_mode'] = 'thesaurus';
	}

	$model_view 				= $this->model_view;
	$target_section_tipo 		= $this->target_section_tipo;
	$hierarchy_childrens_tipo 	= $this->hierarchy_childrens_tipo;

	switch($modo) {
		
		case 'list':

				// ts_object class
					include(DEDALO_LIB_BASE_PATH."/ts_object/class.ts_object.php");
				
				// Load necessary js /css elements when we are in thesaurus
					$element_name = 'ts_object';
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

					$element_name = 'diffusion_index_ts';
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/diffusion/$element_name/css/$element_name.css";
					#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

					$element_name = 'tool_av_versions';
					#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/$element_name/css/$element_name.css";
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/$element_name/js/$element_name.js";

					$element_name = 'component_text_area';
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/mce_editor.js";

					css::$ar_url[] = DEDALO_LIB_BASE_URL."/section_records/css/section_records.css";

				# Components
					/*$ar_component_name = [
						'component_text_area',
						'component_order',
						'component_input_text',
						'component_input_text_large',
						'component_relation_children',
						'component_relation_model',
						'component_relation_related',
						'component_relation_index',
						'component_number',
						'component_radio_button',
						'component_autocomplete'
					];
					foreach ($ar_component_name as $current_modelo_name) {
						common::notify_load_lib_element_tipo($current_modelo_name, 'edit');
					}*/				

				
				# HIERARCHY_SECTIONS
				# Get all available sections except when filters are present
					$hierarchy_types_filter = false;
					if (isset($_GET['hierarchy_types'])) {
						$hierarchy_types_filter = json_decode( safe_xss($_GET['hierarchy_types']) );
					}
					$hierarchy_sections_filter = false;
					if (isset($_GET['hierarchy_sections'])) {
						$hierarchy_sections_filter = json_decode( safe_xss($_GET['hierarchy_sections']) );
					}
					$hierarchy_sections = $this->get_hierarchy_sections($hierarchy_types_filter, $hierarchy_sections_filter);
					
					# Group sections by typology
					$ar_sections_by_type = [];
					foreach ($hierarchy_sections as $key => $item) {
						$ar_sections_by_type[$item->typology][] = $item;
					}
					# Sort by typology section_id ASC
					ksort($ar_sections_by_type);
					if(SHOW_DEBUG===true) {
						#dump($ar_sections_by_type, ' ar_sections_by_type ++ '.to_string());
					}

				# Section tipos . Simple array of current sections tipo
				$ar_section_tipos	= [];
				$ar_section_names 	= [];
				#foreach ($hierarchy_sections as $key => $obj_value) {
				#	$ar_section_tipos[] = $obj_value->hierarchy_target_section_tipo;
				#	#$ar_section_names[$obj_value->hierarchy_target_section_tipo] = $obj_value->hierarchy_target_section_name;
				#}
				foreach ($ar_sections_by_type as $key => $ar_value) {
					foreach ($ar_value as $obj_value) {
						$ar_section_tipos[] = $obj_value->hierarchy_target_section_tipo;
						$ar_section_names[$obj_value->hierarchy_target_section_tipo] = $obj_value->hierarchy_target_section_name;
					}					
				}
				#dump($ar_section_tipos, ' ar_section_tipos ++ '.to_string());

				#
				# FILTER_CUSTOM. hierarchy_terms
				$filter_custom = null;				
				if (isset($_GET['hierarchy_terms'])) {
					if($hierarchy_terms = json_decode( safe_xss($_GET['hierarchy_terms']) )) {

						// Reset $ar_section_tipos to use only filter sections
						$ar_section_tipos = [];

						$filter_custom = new stdClass();

						$filter_custom->{OP_OR} = [];						

						$path = new stdClass();
							$path->component_tipo 	= 'hierarchy22';
							$path->modelo 			= 'component_section_id';
							$path->name 			= 'Id';

						$path_section = new stdClass();
							$path_section->modelo 	= 'section';
							$path_section->name 	= 'Section tipo column';

						foreach ($hierarchy_terms as $key => $current_term) {							

							// Explode pseudo locator like 'dc1_1425' to section_tipo, section_id
							$ar = explode('_', $current_term);

							$current_section_tipo 	= $ar[0];
							$current_section_id 	= (int)$ar[1];							

							# Update path section tipo
							$path->section_tipo 	= $current_section_tipo;							

							# Add to ar_section_tipos
							$ar_section_tipos[] = $current_section_tipo;

							$filter_item = new stdClass();
								$filter_item->q 			= $current_section_id;
								$filter_item->path 			= [$path];
						
							$filter_item_section = new stdClass();
								$filter_item_section->q 	= $current_section_tipo;
								$filter_item_section->path 	= [$path_section];								

							$group = new stdClass();
								$group->{OP_AND} = [$filter_item, $filter_item_section];

							$filter_custom->{OP_OR}[] = $group;
						}
						#dump($filter_custom, ' filter_custom ++ '.to_string()); die();
					}
				}//end if (isset($_GET['hierarchy_terms']))


				$ar_sections_group = [];
				foreach ($ar_section_tipos as $key => $current_tipo) {
					$ar_related_by_model = common::get_ar_related_by_model('section', $current_tipo);
					$section_obj = new stdClass();
					if (!empty($ar_related_by_model[0])) {
						$ar_sections_group[$ar_related_by_model[0]][] = $current_tipo;
					}else{
						$ar_sections_group[$current_tipo][] = $current_tipo;
					}
				}
				#dump($ar_sections_group, ' ar_sections_group ++ '.to_string());
		
				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html for DEDALO_THESAURUS_SECTION_TIPO (hierarchy20)
				$search_form_html 	= '';
					// EN PROCESO 3-3-2018
					$section = section::get_instance(null, DEDALO_THESAURUS_SECTION_TIPO, 'list');
					$context = $section->get_context();

					# SEARCH_OPTIONS
					$search_options_id 	  = 'thesaurus';
					$saved_search_options = section_records::get_search_options( $search_options_id );
					
					if ($saved_search_options===false) {
						# Is not defined case
						$search_options = new stdClass();
							$search_options->modo 	 = $modo;
							$search_options->context = $context;

						# SEARCH_QUERY_OBJECT . Add search_query_object to options
							$search_query_object = new stdClass();
								$search_query_object->id  	   		= 'thesaurus';
								$search_query_object->section_tipo  = $ar_section_tipos;
								$search_query_object->limit   		= 100;
								#$search_query_object->order   		= $options->order;
								#$search_query_object->offset  		= $options->offset;
								#$search_query_object->full_count  	= true;									
								$search_query_object->filter  		= isset($filter_custom) ? $filter_custom : null;
								$search_query_object->select  		= [];
							
							$search_options->search_query_object = $search_query_object;
								#dump(json_encode($search_options, JSON_PRETTY_PRINT), ' search_options ++ '.to_string());
					}else{
						# Use saved search options
						$search_options = $saved_search_options;
						# Add current context
						$search_options->context = $context;
					}
					#$search_options_json = json_encode($search_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
					$search_options_json = json_encode($search_options, JSON_UNESCAPED_UNICODE );

					if(SHOW_DEBUG===true) {
						#dump(json_encode($search_query_object, JSON_UNESCAPED_UNICODE ), ' search_query_object ++ '.to_string(DEDALO_THESAURUS_SECTION_TIPO));
					}
					
					$search_form_html 	= '';
					$records_search 	= new records_search($section, 'thesaurus'); // list
						$records_search->ar_sections_by_type  = $ar_sections_by_type; // Inject ar_sections_by_type
						$records_search->ar_real_section_tipo = array_keys($ar_sections_group); // Inject ar_sections_group
					$search_form_html 	= $records_search->get_html();
						#dump($records_search, ' $records_search ++ '.to_string());
					
						
				#
				# TEST
					/*
					if(SHOW_DEBUG===true) {
						
						include(DEDALO_LIB_BASE_PATH."/tools/tool_ts_print/class.tool_ts_print.php");
						
						$ts_locator = new locator();
							$ts_locator->set_section_tipo('ts1');
							$ts_locator->set_section_id('1');

						$ar_terms = tool_ts_print::get_childrens($ts_locator);
							dump( json_encode($ar_terms, JSON_PRETTY_PRINT) , ' ar_terms ++ '.to_string()); 

						#$data_node = tool_ts_print::build_data_node('ts1',1);
							#dump( json_encode($data_node, JSON_PRETTY_PRINT), ' data_node ++ '.to_string());

						
						#$data_context = tool_ts_print::build_data_context('ts1');
							#dump($data_context, ' data_context ++ '.to_string());

						#$ts_data = tool_ts_print::build_ts_data('ts1');
						#	dump(json_encode($ts_data, JSON_PRETTY_PRINT), ' ts_data ++ '.to_string());

					}*/

				break;
	}//end switch($modo)
	
	
	# LOAD PAGE	
	$page_html	= dirname(__FILE__) . '/html/' . $area_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}