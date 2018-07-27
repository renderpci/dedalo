<?php

# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');


# FREE SEARCH SAMPLE
	# Current dir name
	$cwd = basename(__DIR__);
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');
	$current = new $cwd();

	$slider_type = isset($_GET['slider_type']) ? $_GET['slider_type'] : null;
	switch ($slider_type) {
		case 'alfons':
			$slider_table 	= 'bucle_alfons';
			$portals_custom = json_decode('{"bucle_alfons_1":"image"}');
			$ar_containers 	= ['bucle_alfons_1'];
			break;
		case 'cultura':
			$slider_table 	= 'bucle_cultura';
			$portals_custom = json_decode('{"bucle_cultura_1":"image"}');
			$ar_containers 	= ['bucle_cultura_1'];
			break;
			break;
		default:
			$slider_table 	= 'bucle';
			$portals_custom = json_decode('{"bucle_prehistoria_1":"image","bucle_prehistoria_2":"image","bucle_etnologia_1":"image","bucle_etnologia_2":"image"}');
			$ar_containers 	= ['bucle_prehistoria_1','bucle_prehistoria_2','bucle_etnologia_1','bucle_etnologia_2'];
			break;
	}

	# ROW
	# Search in thesaurus the id of current name (inverse mapping)
		$options = new stdClass();
			$options->dedalo_get 		= 'records';
			$options->lang 				= WEB_CURRENT_LANG_CODE;
			$options->table 			= $slider_table;
			$options->ar_fields 		= array('*');
			$options->limit 			= 1;
			#$options->sql_filter 		= "web_path = '{$area_name}'";			
			$options->resolve_portals_custom = $portals_custom;

		# Http request in php to API
		$rows_data	= json_web_data::get_data($options);
			#dump($rows_data, ' rows_data ++ '.to_string($options)); #exit();


	# Images
	$ar_images = [];	
	foreach ($rows_data->result[0] as $key => $ar_value) {
		if (true===in_array($key, $ar_containers)) {
			foreach ($ar_value as $value_obj) {
				$ar_images[] = (object)[
					"image" => $value_obj->image
				];
			}
		}
	}
	# Randomize images order
	#shuffle($ar_images);
	#dump($ar_images, ' ar_images ++ '.to_string());



	#
	# CONTENT HTML
	ob_start();
	include( dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml');
	$content_html = ob_get_clean();
	

	#
	# PAGE HTML
		$page = new page();

		# Page title
		$page->page_title = "Slider";

		# Page areas set
		$page->header_html = ' ';
		$page->footer_html = ' ';

		// JQuery
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/lib/jquery/jquery.min.js';
		// flexslider
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/jquery.flexslider.js';
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/flexslider.css';

		# Add css /js specific files
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/' . $cwd . '.css';
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/'  . $cwd . '.js' ;

		# Load vista template code
		#page::$template_ar_path[] = dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml';		
	
	$options = new stdClass();
		$options->content_html 	= $content_html;
	echo $page->render_page_html( $options );
	
?>