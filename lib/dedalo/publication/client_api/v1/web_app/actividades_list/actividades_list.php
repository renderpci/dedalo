<?php

# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');


# FREE SEARCH SAMPLE
	# Current dir name
	$cwd = basename(__DIR__);
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');
	$current = new $cwd();



	# Fecha hoy
	date_default_timezone_set('Europe/Madrid');	
	$today = date('Y-m-d', time());
	define('TODAY_DATE', $today);	

	# Fecha máxima (limita hasta cuando queremos registros)
	$max_days = 8;
	$last_day = date('Y-m-d', strtotime($today. ' + '.$max_days.' days'));
	

	#$filter = "(`fecha` >= '$today' AND `fecha` <= '$last_day') OR (`fecha_fin` >= '$today' AND `fecha_fin` <= '$last_day')"; // `fecha_fin` IS NOT NULL AND 
	$filter = "(`fecha` >= '$today' AND `fecha` <= '$last_day') OR (`fecha` <= '$today' AND `fecha_fin` >= '$today')"; // `fecha_fin` IS NOT NULL AND 
		#dump($filter, ' filter ++ '.to_string());

	#$filter = '';
	$rows_per_page = 5;

	# ROW
	# Search in thesaurus the id of current name (inverse mapping)
		$options = new stdClass();
			$options->dedalo_get 		= 'records';
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->table 			= 'actividades';
			$options->ar_fields 		= array('*');		
			$options->sql_filter 		= $filter;
			#$options->order 			= '`id` ASC, hora ASC';
			$options->order 			= '`fecha` ASC, `hora` ASC';
			$options->limit 			= $rows_per_page;			
			$options->offset 			= isset($_GET['offset']) ? (int)safe_xss($_GET['offset']) : 0;
			$options->count 			= true;
			
			#$options->resolve_portals_custom = json_decode('{"bucle_prehistoria_1":"image","bucle_prehistoria_2":"image","bucle_etnologia_1":"image","bucle_etnologia_2":"image"}');

		# Http request in php to API
		$rows_data	= json_web_data::get_data($options);
			#dump($rows_data, ' rows_data ++ '.to_string()); exit();

		$rows_total  = !empty($rows_data->total) ? (int)$rows_data->total : 0;
		$rows_offset = !empty($options->offset) ? (int)$options->offset : 0;
		$rows_limit  = (int)$options->limit;

	
		# Pages
		# total_pages
			$total_pages  = ceil($rows_total / $rows_limit);
			$total_pages  = (int)$total_pages ? : 1;	# adjust on empty
		# page number
			$page_number  = 1;
			if ($rows_offset>0) {
				$page_number = (int)ceil($rows_offset/$rows_limit)+1 ;
			}
			#dump($total_pages, ' total_pages ++ '.to_string()); dump($page_number, ' page_number ++ '.to_string());


	// Map rows
	$ar_rows = array_map(function($row) {

		# Date	
		$date_options = new stdClass();
			$date_options->date = $row->fecha; 
			$date_options->lang = WEB_CURRENT_LANG_CODE;
		// Add processed date_obj
		$row->date_obj = common::date_to_object($date_options);

		# Date showed
		$today = TODAY_DATE;
		if ( strtotime($row->fecha) < strtotime($today) ) {
			# Process date		
			$date_options = new stdClass();
				$date_options->date 	= $today; 
				$date_options->lang 	= WEB_CURRENT_LANG_CODE;				
			// Add processed date_obj
			$row->date_showed_obj = common::date_to_object($date_options);
		}else{
			// Add cloned date
			$row->date_showed_obj = $row->date_obj;
		}
		// Add is_today detection
		$row->date_showed_obj->is_today = (strtotime($row->date_showed_obj->source) == strtotime($today)) ? true : false;

		# Date end	
		$date_options = new stdClass();
			$date_options->date = $row->fecha_fin; 
			$date_options->lang = WEB_CURRENT_LANG_CODE;
		// Add processed date_obj
		$row->date_end_obj = common::date_to_object($date_options);


		return $row;
	}, $rows_data->result);
	#dump($ar_rows, ' ar_rows ++ '.to_string()); die();

	

	



	#
	# CONTENT HTML
	ob_start();
	include( dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml');
	$content_html = ob_get_clean();
	

	#
	# PAGE HTML
		$page = new page();

		# Page title
		$page->page_title = "Actividades list";

		# Page areas set
		$page->header_html = ' ';
		$page->footer_html = ' ';

		// JQuery
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/lib/jquery/jquery.min.js';
		// flexslider
		#page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/jquery.flexslider.js';
		#page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/flexslider.css';

		# Add css /js specific files
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/' . $cwd . '.css';
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/' . $cwd . '.js';

		# Load vista template code
		#page::$template_ar_path[] = dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml';		
	
	$options = new stdClass();
		$options->content_html 	= $content_html;
	echo $page->render_page_html( $options );
	
?>