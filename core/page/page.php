<?php
// PAGE CONTROLLER

// page mode and tipo
	$default_section_tipo = 'test65';
	if (isset($_GET['locator'])) {
		$locator	= json_decode($_GET['locator']);
		$tipo		= $locator->section_tipo ?? $default_section_tipo;
		$section_id	= $locator->section_id ?? null;
		$mode		= !empty($section_id) ? 'edit' : 'list';
	}else{
		$tipo		= $_GET['t'] 	?? $_GET['tipo']		?? $default_section_tipo; //MAIN_FALLBACK_SECTION;
		$section_id	= $_GET['id']	?? $_GET['section_id']	?? null;
		$mode		= $_GET['m'] 	?? $_GET['mode']		?? (!empty($section_id) ? 'edit' : 'list');	
	}
	define('MODE', $mode);



// load page
	$load_page = function($context) use($tipo, $section_id, $mode){
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

		$page_elements = [];

		// page elements [login]
			$login_element = (function() {

				$login = new login('edit');
				$login_source = $login->get_source();

				return [$login_source];
			})();

		$page_elements[] = $login_element;

		$context = (object)[
			'model'			=> 'page',
			'page_elements'	=> $page_elements
		];

		$load_page($context);

		exit();
	}//end if (login::is_logged()!==true)



// logged
	if (login::is_logged()!==true) return null;

	$page_elements = [];

	$initiator = $_GET['initiator'] ?? false;

	// menu. Get the mandatory menu element
		if ($initiator===false) {

			$menu = new menu();
			$menu->set_lang(DEDALO_DATA_LANG);

			$page_elements[] = [$menu->get_source()];
		}

	// section/area/tool. Get the page element from get url vars
		$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
		// if (strpos($model,'area')===0) {

			switch (true) {
				case ($model==='section'):

					$section = section::get_instance($section_id, $tipo, MODE);
					$section->set_lang(DEDALO_DATA_LANG);
					$page_elements[] = [$section->get_source()];
					break;

				case (strpos($model, 'area')===0):

					$area = area::get_instance($model, $tipo, MODE);
					$area->set_lang(DEDALO_DATA_LANG);
					$page_elements[] = [$area->get_source()];
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
			'model'			=> 'page',
			'page_elements'	=> $page_elements
		];
		// dump($context, ' $context ++ '.to_string());

	// page load all elements
		$load_page($context);
