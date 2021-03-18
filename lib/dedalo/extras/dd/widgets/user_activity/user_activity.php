<?php

	# CONTROLLER
	
	$widget_name			= $this->widget_name;
	$modo					= $this->component_info->get_modo();
	$section_id				= $this->component_info->get_parent();
	$section_tipo			= $this->component_info->get_section_tipo();
	$data_source			= $this->data_source;
	$component_portal_tipo	= key($data_source);
	$media_component_tipo	= reset($data_source);

	// overwrite modo if widget_mode exists (export case)
		if (!empty($widget_mode)) {
		 	$modo  = $widget_mode;
		 }


	# CSS / JS MAIN FILES
	css::$ar_url[] = NVD3_URL_CSS;
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/diffusion/diffusion_section_stats/css/diffusion_section_stats.css";
	
	js::$ar_url[]  = D3_URL_JS;
	js::$ar_url[]  = NVD3_URL_JS;
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/diffusion/diffusion_section_stats/js/diffusion_section_stats.js";

	$widget_base_url	= $this->get_widget_base_url();
	css::$ar_url[]		= $widget_base_url .'/css/'.$widget_name.'.css';
	// js::$ar_url[]	= $widget_base_url .'/js/'.$widget_name.'.js';

	// reference data for use in diffusion_section_stats_graphics
		// {
		//		"title": "Proyect <span>(stats_pie)</span>",
		//		"tipo": "oh49",
		//		"query": "",
		//		"graph_type": "stats_pie",
		//		"data": [
		//		    {
		//               "key": "Series1",
		//               "values": [
		//                   {
		//                       "x": "Project one b",
		//                       "y": 54
		//                   },
		//                   {
		//                       "x": "Project 2",
		//                       "y": 2
		//                   },
		//                   {
		//                       "x": "Project 3",
		//                       "y": 1
		//                   },
		//                   {
		//                       "x": "Project number five",
		//                       "y": 2
		//                   }
		//               ]
		//           }
		//		]
		// }

	// data
		$date_in	= '2000-01-01';
		$today		= new DateTime();
		$date_out	= $today->format("Y-m-d");
		$user_id	= $section_id;
		$lang		= DEDALO_DATA_LANG;
		$totals		= diffusion_section_stats::cross_users_range_data($date_in, $date_out, $user_id, $lang);
	
	if (!$totals || !is_object($totals)) {
		debug_log(__METHOD__." UNABLE TO GET CROSS_USERS_RANGE_DATA FOR USER $user_id - totals: ".to_string($totals), logger::ERROR);
		echo 'No user activity data is available.';
		return null;
	}	

	// parse_totals_for_js
		$ar_js_obj = diffusion_section_stats::parse_totals_for_js($totals);

	// fix dato as object (to recover it on get value export/diffusion)
		$dato = new stdClass();
			$dato->totals = $totals;
		$this->set_dato($dato);

	// html. note that here, we use the same html script as diffusion_section_stats. No need for specific HTML
		$page_html = DEDALO_LIB_BASE_PATH . '/diffusion/diffusion_section_stats/html/diffusion_section_stats_graphics.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode 1 $modo</div>";
		}

					
