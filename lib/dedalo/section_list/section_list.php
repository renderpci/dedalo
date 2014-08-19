<?php
	
	# CONTROLLER
	
	
	$id						= $this->get_id();
	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo);
	$modo					= $this->get_modo();				#dump($modo,'modo en section list');
	$label					= $this->get_label();
	$ar_css					= $this->get_ar_css();	
	$section_name			= false;
	$file_name				= $modo;	
	$ar_groups_html 		= array();
	$ar_titulos 			= array();
	$caller_id				= $this->section_obj->caller_id;		#dump($caller_id);
	$section_tipo 			= $this->section_obj->get_tipo();	
	$context 				= $this->section_obj->get_context();
	
	# USADO PARA ORDENAR (JS)
	$page_query_string		= common::get_page_query_string();	# used in javascript for order function


	#$query_request			= $page_query_string;
	$n_components 			= count($this->ar_components_tipo);
		#dump($n_components);


	/**/
	$this->rows_search 		= $this->get_rows_search();	
	$this->rows_header 		= $this->get_rows_header();
	$this->rows_paginator	= $this->get_rows_paginator();
	$this->rows 			= $this->get_rows(); 
	
	
	#global $log_messages;
	#print $log_messages;

	#dump($modo);

	switch($modo) {

		case 'list'	:	/**/
						# BUTTONS
						# Calcula los bonones de esta sección y los deja disponibles como : $this->section_obj->ar_buttons
						$this->section_obj->set_ar_buttons();
						
						# BUILD ALL HTML ROWS (SEARCH, PAGINATOR, TH, TD)					
						$rows_search_html		= $this->rows_search->get_html();		#dump($rows_search_html);
						$rows_paginator_html	= $this->rows_paginator->get_html();	#dump($this->rows_paginator);
						$rows_header_html		= $this->rows_header->get_html();		#dump($rows_header_html);
						$rows_html 				= $this->rows->get_html();				#dump($rows_html);
						
						# CSS
								css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/nv.d3.css';
								css::$ar_url[] = DEDALO_LIB_BASE_URL.'/diffusion/diffusion_section_stats/css/diffusion_section_stats.css';

						# JS includes
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/lib/d3.v3.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/nv.d3.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/models/pieChart.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/models/discreteBarChart.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/models/multiBarHorizontalChart.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/utils.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/tooltip.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/models/legend.js';
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/nvd3/src/models/axis.js';
								js::$ar_url[] = DEDALO_LIB_BASE_URL.'/diffusion/diffusion_section_stats/js/diffusion_section_stats.js';

						break;

		case 'relation':
						$id_wrapper 			= 'wrap_relation_list_'.$section_tipo.'_'.$caller_id ;	#dump($id_wrapper,'$id_wrapper ');
						$caller_id 				= $this->section_obj->caller_id;		#dump($caller_id ,'$caller_id ');
						$component_name			= 'component_relation'; # needed for reload javascript in some cases	
						$current_tipo_section 	= $this->section_obj->get_tipo();				
						
						# BUILD ALL HTML ROWS (SEARCH, PAGINATOR, TH, TD)						
						$rows_header_html		= $this->rows_header->get_html();		#dump($rows_header_html);						
						$rows_html 				= $this->rows->get_html();				#dump($rows_html);
						break;

		case 'relation_reverse_sections':
						return "relation_reverse_sections desactivo";
						$file_name = 'relation_reverse';
		case 'relation_reverse':
						# BUILD ALL HTML ROWS (SEARCH, PAGINATOR, TH, TD)						
						$rows_header_html		= $this->rows_header->get_html();		#dump($rows_header_html);						
						$rows_html 				= $this->rows->get_html();				#dump($rows_html);
						break;

		case 'portal_list' :												
						# BUILD ALL HTML ROWS (SEARCH, PAGINATOR, TH, TD)
						if($context=='component_portal_inside_portal_list' || $context=='list_into_tool_relation') { 
							$rows_header_html	= '';							
						}else{
							$rows_header_html	= $this->rows_header->get_html();		#dump($rows_header_html);
						}
							
						$rows_html 				= $this->rows->get_html();				#dump($rows_html);						
						break;

		case 'list_tm': # BUILD ALL HTML ROWS (SEARCH, PAGINATOR, TH, TD)	
						$rows_header_html		= $this->rows_header->get_html();		#dump($rows_header_html);						
						$rows_html 				= $this->rows->get_html();				#dump($rows_html);					
						break;
	}
	
	
	# LOAD PAGE	
	$page_html	= 'html/' . get_class($this) . '_' . $file_name . '.phtml';		#dump($page_html);
	include($page_html);
	
?>