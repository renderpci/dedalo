<?php
// PAGE CONTROLLER

// page mode and tipo
	define('MODE', $_GET['m'] ?? $_GET['mode'] ?? (!empty($_GET['id']) ? 'edit' : 'list') );
	$tipo 		= $_GET['t'] ?? $_GET['tipo'] ?? 'test65'; //MAIN_FALLBACK_SECTION;
	$section_id = $_GET['id'] ?? $_GET['section_id'] ?? null;



// load page
	$load_page = function($context){
		global $page_globals, $html_header;

		// page_options
			$page_options = new StdClass();
				$page_options->mode		= 'default';
				$page_options->context	= $context;

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
			$rq_context = (function() {

				$login = new login('edit');
				$login_source = $login->get_source();

				// // login json
				// $get_json_options = new stdClass();
				// 	$get_json_options->get_context	= true;
				// 	$get_json_options->get_data		= true;
				// $login_json = $login->get_json($get_json_options);

				// // element
				// $page_element = new StdClass();
				// 	$page_element->model		= 'login';
				// 	$page_element->tipo			= 'dd229';
				// 	$page_element->mode			= 'edit';
				// 	$page_element->lang			= DEDALO_APPLICATION_LANG;
				// 	$page_element->rq_context	= null;
				// 	$page_element->datum		= $login_json;

				return [$login_source];
			})();

		$context = (object)[
			'model' => 'page',
			'rq_context' => $rq_context
		];

		$load_page($context);

		exit();
	}//end if (login::is_logged()!==true)



// logged
	if (login::is_logged()!==true) return null;

	$rq_context = [];

	$initiator = $_GET['initiator'] ?? false;

	// menu. Get the mandatory menu element
		if ($initiator===false) {
			// $menu_element_required = new stdClass();
			// 	$menu_element_required->options = (object)[
			// 		'model' 	=> 'menu',
			// 		'lang' 		=> DEDALO_DATA_LANG
			// 	];
			// // /$page_elements[] = dd_core_api::get_page_element($menu_eleme	nt_required)->result;

			$menu = new menu();
			$menu->set_lang(DEDALO_DATA_LANG);
			$menu_source = $menu->get_source();

			$rq_context[] = $menu_source;
		}

	// section/area/tool. Get the page element from get url vars
		$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
		// if (strpos($model,'area')===0) {

			switch (true) {
				case ($model==='section'):
					$section = section::get_instance($section_id, $tipo, MODE);
					$section->set_lang(DEDALO_DATA_LANG);
					$section_source = $section->get_source();

					$rq_context[] = $section_source;
					break;
				case (strpos($model, 'area')===0):
					$area = area::get_instance($model, $tipo, MODE);
					$area->set_lang(DEDALO_DATA_LANG);
					$area_source = $area->get_source();

					$rq_context[] = $area_source;
					break;
			
				default:
					// code...
					break;
			}
			// dump($source, ' $source ++ '.to_string());
			// $page_elements[] = $source;

		// }else{
		// 	$element_required = new stdClass();
		// 		$element_required->options = (object)[
		// 			'model' 	 => $model,
		// 			'tipo' 		 => $tipo,
		// 			'lang' 		 => DEDALO_DATA_LANG,
		// 			'mode' 		 => MODE,
		// 			'section_id' => $section_id
		// 		];
		// 	$page_elements[] = dd_core_api::get_page_element($element_required)->result;
		// }

		$context = (object)[
			'model' => 'page',
			'rq_context' => $rq_context
		];
	// page load all elements
		$load_page($context);
