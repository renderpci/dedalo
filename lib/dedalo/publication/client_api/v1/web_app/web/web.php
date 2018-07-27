<?php
#var_dump($_GET);
if (!isset($_GET['area_name'])) {
	exit("Sorry, bad url requested. Please, review your rewrite config");
}

# Lang check in url path
	#$lang_from_path = null;
	preg_match('/(\/([a-z]{2}))?$/', $_GET['area_name'], $ar_output);
	if (!empty($ar_output[2])) {
		$lang_from_path = $ar_output[2];
		if (!isset($_GET['lang'])) {
			$_GET['lang'] = $lang_from_path; // Force get
		}		
	}

# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');


# AREA_NAME . web_path
	$area_name = trim($_GET['area_name'],'/');
	if (common::validate_area_name($area_name)===false) {
		http_response_code(404);
		die("Ops.. Invalid area!");
	}
	$ar_parts 	= explode('/', $area_name);
	$ar_len 	= count($ar_parts);

	switch (true) {
		case $ar_len===3:	
			if (isset($lang_from_path)) {			
				$area_table 	 = WEB_MENU_TABLE;
				$area_name 		 = $ar_parts[0];
				$area_section_id = $ar_parts[1];
			}else{
				$area_name 		 = $ar_parts[0];
				$area_table 	 = $ar_parts[1];
				$area_section_id = $ar_parts[2];
			}
			break;
		case $ar_len===2:
			$area_name		 = $ar_parts[0];
			$area_table 	 = WEB_MENU_TABLE;
			break;
		default:
			$area_name		 = end($ar_parts);
			$area_table 	 = WEB_MENU_TABLE;
			break;
	}	
	if(SHOW_DEBUG===true) {
		# Url elements
		# dump($ar_parts, ' ar_parts ++ '.to_string());
		# are name
		# dump($area_name, ' area_name ++ '.to_string());
	}


	# Fallback to default WEB_HOME_PATH
	#if (empty($area_name)) {
		#$area_name = WEB_HOME_PATH;
	#}

	# Map area name	
	if ( defined('WEB_PATH_MAP') && isset(WEB_PATH_MAP[$area_name]) ) {
		$area_name = WEB_PATH_MAP[$area_name]; // Overwrite
	}
	

	# PAGE
	$page = new page();
		$page->area_name  = $area_name;
		$page->area_table = $area_table;


	$template_found = false;
	switch (WEB_TEMPLATE_MAP_DEFAULT_SOURCE) {
		case 'file':
			# JSON File. Try using json file template map 
			$ar_elements = array_filter(
				$page->template_map,
				function ($template_map) use($area_name) {
					return $template_map->template === $area_name;
				}
			);			
			if (!empty($ar_elements)) {

				$current_element = reset($ar_elements);

				# Ok. Term (area_name) located in file. Resolving template
				$template_found = true;
				
				$term_id 		 	= null;
				$page->menu_parent 	= null;

				$mode 		  	 	= 'detail';
				$template_map 	 	= $current_element;
			}
			$page->row = false;
			break;
		case 'db':
		default:
			# DB ROW
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
			if(SHOW_DEBUG===true) {
				#dump($term_data, ' term_data ++ '.to_string($options)); exit();
			}
			if ($term_data->result!==false && !empty($term_data->result)) {
				
				# Ok. Term (area_name) located in DDBB. Resolving template
				$template_found = true;

				# Add page row
				$page->row = reset($term_data->result);
					#dump($page->row->term_id, '$page->row ++ '.to_string());

				$term_id 		 	= $page->row->term_id;
				$page->term_id 		= $term_id;
				$page->menu_parent 	= $page->row->childrens==='[]' ? $page->row->parent : $term_id;
				$menu_data 			= $page->get_menu_data($page->menu_parent);
					#dump($menu_data, ' menu_data ++ '.to_string($page->menu_parent));
			
				#
				# SINGLE ROW FROM PORTAL
				# Resolve current detail portal record
					if (!isset($lang_from_path) && isset($area_table) && isset($area_section_id)) {

						$options = new stdClass();
							$options->dedalo_get 		= 'records';
							$options->lang 				= WEB_CURRENT_LANG_CODE;
							$options->table 			= $area_table;
							$options->ar_fields 		= array('*');
							$options->sql_filter 		= "section_id = {$area_section_id}";
							$options->limit 			= 1;

						# Http request in php to API
						$term_data_portal	= json_web_data::get_data($options);
							#dump($term_data_portal, ' term_data_portal ++ '.to_string());
						
						$page->row = $term_data_portal->result===false ? false : reset($term_data_portal->result);
						# Asign page template manually
						#$page->row->template_name = 'site_area';
						$template_name = $page->set_template_from_table($area_table, $area_name);
							#dump($page->row->template_name , ' template_name ++ '.to_string());
							#dump($page->row, ' page->row ++ '.to_string());
					}//end if (isset($area_table) && isset($area_section_id))
				
				# Fields
				$mode 			 = 'detail';	
				# Template. Filter and selects first result
				$template_name 	 = $page->row->template_name;//page::get_template_name($area_name);
					#dump($template_name, ' $template_name ++ $area_table: '.$area_table.to_string());
					#dump($page->template_map, ' $template_name ++ '.to_string());	
				$ar_template_map = array_filter(
						$page->template_map,
						function ($obj) use($template_name, $area_table ) {
							return ($obj->template === $template_name && $obj->table === $area_table);
						}
				);
				$template_map = reset($ar_template_map);
			}			
			if(SHOW_DEBUG===true) {
				# Page object
				#dump($page, ' $page ++ '.to_string()); #die();
				#dump($page->row, '$page->row ++ '.to_string());			
				#dump($page->template_map, ' this->template_map ++ '.to_string());
			}
			break;
	}//end switch (WEB_TEMPLATE_MAP_DEFAULT_SOURCE)
	

	
	# ERROR. Not valid template found case
	if ($template_found===false) {
		# Error. Term with this web_path not found in DDBB
		$term_id 		 	= null;
		$page->menu_parent 	= null;

		$mode 		  	 	= 'detail';
		$template_map 	 	= false;

		http_response_code(404);
	}	



# WEB 
	# Current dir name (web)
	$cwd = basename(__DIR__);
	# Current class add
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');

	

	#
	# CONTENT HTML
		if(SHOW_DEBUG===true) {
			#dump($template_map, ' template_map ++ '.to_string());
		}
		#ob_start();
		#include( dirname(__FILE__) . '/tpl/' . $template_name . '/html/' . $template_name . '.phtml');
		#$content_html = ob_get_clean();		
		$content_html  = $page->get_template_html( $template_map, $mode );


	#
	# MENU CUSTOM
		$page->menu_template 	= 'menu';
		#$menu_html 			= $page->get_menu_html();


	#
	# FOOTER CUSTOM
		$page->footer_template 	= 'footer';
		$footer_html 			= $page->get_footer_html();


	#
	# Render full page html	
		$options = new stdClass();
			$options->content_html 	= $content_html;
			$options->footer_html 	= $footer_html;
			#$options->menu_html 	= $menu_html;
		echo $page->render_page_html( $options );


