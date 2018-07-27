<?php

# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');


# FREE SEARCH SAMPLE
	# Current dir name
	$cwd = basename(__DIR__);
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');
	$current = new $cwd();

	# String search
	$q_raw = !empty($_REQUEST['q']) ? $_REQUEST['q'] : '';
		#dump($q_raw, ' q_raw ++ '.trim($q_raw));
	# Number of records per page (for paginate)
	$nregpp = isset($_REQUEST['nregpp']) ? $_REQUEST['nregpp'] : 10;

	if (!empty($q_raw)) {

		# Search	
		$options = new stdClass();
			$options->dedalo_get 		= 'free_search';
			$options->q 				= (string)($q_raw);
			$options->search_mode 		= 'full_text_search';
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->rows_per_page 	= (int)$nregpp;
			$options->page_number 		= isset($_GET['page']) ? (int)$_GET['page'] : 1;
			$options->offset 			= isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
			$options->count 			= true;
			$options->image_type 		= 'posterframe';
			$options->apperances_limit 	= 1;
			$options->video_fragment 	= false;
			$options->list_fragment 	= true;
			$options->fragment_terms 	= false;

		# Http request in php to the API
		$data = json_web_data::get_data($options);
		# Data info dev
		#print "<pre>";print_r($data);print "</pre>"; die();
	}

	#
	# CONTENT HTML
	ob_start();
	include( dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml');
	$content_html = ob_get_clean();
	

	#
	# PAGE HTML
		$page = new page();

		# Add css /js specific files
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/' . $cwd . '.css';
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/' . $cwd . '.js';

		# Load vista template code
		#page::$template_ar_path[] = dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml';		
	
	$options = new stdClass();
		$options->content_html 	= $content_html;
	echo $page->render_page_html( $options );
	
?>