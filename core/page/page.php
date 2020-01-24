<?php
// PAGE CONTROLLER

// page mode and tipo
	define('MODE', $_GET['m'] ?? $_GET['mode'] ?? (!empty($_GET['id']) ? 'edit' : 'list') );
	$tipo 		= $_GET['t'] ?? $_GET['tipo'] ?? 'test65'; //MAIN_FALLBACK_SECTION;
	$section_id = $_GET['id'] ?? $_GET['section_id'] ?? null;



// load page
	$load_page = function($page_elements){
		global $page_globals, $html_header;

		// page_options
			$page_options = new StdClass();
				$page_options->mode  			= 'default';
				$page_options->page_elements 	= $page_elements;

		// load base html
			$page_html = dirname(__FILE__) . '/html/page.phtml';
			if( !include($page_html) ) echo "<div class=\"error\">Invalid page file</div>";

		return true;
	};



// not logged
	if (login::is_logged()!==true) {

		// check_basic_system (lang and structure files)
			check_basic_system();

		// page elements [login]
			$page_elements = (function() {

				$login = new login('edit');

				// login json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= true;
					$get_json_options->get_data 	= true;
				$login_json = $login->get_json($get_json_options);

				// element
				$page_element = new StdClass();
					$page_element->model 		= 'login';
					$page_element->tipo 		= 'dd229';
					$page_element->mode 		= 'edit';
					$page_element->lang 		= DEDALO_APPLICATION_LANG;
					$page_element->sqo_context  = null;
					$page_element->datum 		= $login_json;

				return [$page_element];
			})();

		$load_page($page_elements);

		exit();
	}//end if (login::is_logged()!==true)


// logged
	if (login::is_logged()!==true) return null;

	$page_elements = [];

	// menu get the menu element
		$menu_element_required = new stdClass();
			$menu_element_required->options = (object)[
				'model' => 'menu'
			];
		$page_elements[] = dd_core_api::get_element($menu_element_required)->result;

	// section/area . get the section/area/tool element
		$element_required = new stdClass();
			$element_required->options = (object)[
				'model' 	 => null,
				'tipo' 		 => $tipo,
				'lang' 		 => DEDALO_DATA_LANG,
				'mode' 		 => MODE,
				'section_id' => $section_id
			];
		$page_elements[] = dd_core_api::get_element($element_required)->result;

	// page load all elements
		$load_page($page_elements);


