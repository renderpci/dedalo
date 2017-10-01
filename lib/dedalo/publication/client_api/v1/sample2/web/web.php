<?php
#var_dump($_GET);
if (!isset($_GET['area_name'])) {
	exit("Sorry, bad url requested. Please, review your rewrite config");
}
# CONFIG
	include_once(dirname(dirname(__FILE__)) . '/config/config.php');



# AREA_NAME . web_path
	$area_name	= trim($_GET['area_name'],'/');
	$ar_parts 	= explode('/', $area_name);
	$area_name	= end($ar_parts);
		#dump($area_name, ' area_name ++ '.to_string());



# ROW
# Search in thesaurus the id of current name (inverse mapping)
	$options = new stdClass();
		$options->dedalo_get 		= 'records';
		$options->lang 				= WEB_CURRENT_LANG_CODE;
		$options->table 			= WEB_MENU_TABLE;
		$options->ar_fields 		= array('*');
		$options->sql_filter 		= "web_path = '{$area_name}'";
		$options->limit 			= 1;

	# Http request in php to API
	$term_data	= json_web_data::get_data($options);

	# PAGE
	$page 		= new page();
	$page->row	= $term_data->result===false ? false : reset($term_data->result);
		#dump($page->row, ' $page->row ++ '.to_string());
		#dump($page->template_map, ' this->template_map ++ '.to_string());

	if (empty($page->row)) {
		# Error. Term with this web_path not found in DDBB
		$template_name 	 = 'error';
		$term_id 		 = null;
		$WEB_MENU_PARENT = null;
		
	}else{
		# Ok. Term located
		$template_name 	 = $page->row->template_name;//page::get_template_name($area_name);
		$term_id 		 = $page->row->term_id;
		$WEB_MENU_PARENT = $page->row->childrens==='[]' ? $page->row->parent : $term_id;
		
		# Fields
		$mode = 'detail';		
		$template_map = $page->template_map->{$options->table};			
	}



# WEB 
	# Current dir name
	$cwd = basename(__DIR__);
	# Current class add
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');	
	

	#
	# PAGE HTML

		# Add css /js specific files
		#page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/' . $cwd . '.css';
		#page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/' . $cwd . '.js';
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/tpl/' . $template_name . '/css/' . $template_name . '.css';
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/tpl/' . $template_name . '/js/'  . $template_name . '.js';


	#
	# CONTENT HTML
		ob_start();
		include( dirname(__FILE__) . '/tpl/' . $template_name . '/html/' . $template_name . '.phtml');
		$content_html = ob_get_clean();


	#
	# Render full page html	
	echo $page->render_page_html( $content_html );



?>