<?php
// PAGE CONTROLLER

// page mode and tipo
	$default_section_tipo = 'test38';
	if (isset($_GET['locator'])) {
		$locator	= json_decode($_GET['locator']);
		$tipo		= $locator->section_tipo ?? $default_section_tipo;
		$section_id	= $locator->section_id ?? null;
		// $mode		= !empty($section_id) ? 'edit' : 'list';
		$mode		= $locator->mode ?? 'list';
	}else{
		$tipo		= $_GET['t'] 	?? $_GET['tipo']		?? $default_section_tipo; //MAIN_FALLBACK_SECTION;
		$section_id	= $_GET['id']	?? $_GET['section_id']	?? null;
		// $mode		= $_GET['m'] 	?? $_GET['mode']		?? (!empty($section_id) ? 'edit' : 'list');
		$mode		= $_GET['m'] 	?? $_GET['mode']		?? 'list';	
	}
	define('MODE', $mode);



// context
	$context = [];
	if (login::is_logged()!==true) {
		
		// not logged case

		// check_basic_system (lang and structure files)
			$system_is_ready = check_basic_system();
			if ($system_is_ready->result===false) {
				exit($system_is_ready->msg);
			}

		// page context elements [login]
			$login = new login('edit');
	
		// add to page context
			$context[] = $login->get_structure_context();

	}else{

		// logged case

		$initiator = $_GET['initiator'] ?? false;

		// menu. Get the mandatory menu element
			if ($initiator===false) {

				$menu = new menu();
				$menu->set_lang(DEDALO_DATA_LANG);

				// add to page context
					$context[] = $menu->get_structure_context();
			}

		// section/area/tool. Get the page element from get url vars
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			switch (true) {
				case ($model==='section'):

					$section = section::get_instance($section_id, $tipo, MODE);
					$section->set_lang(DEDALO_DATA_LANG);

					$current_context = $section->get_structure_context(1, true);
						// dump($current_context, ' current_context ++ '.to_string());

					// section_id given case. If is received section_id, we build a custom sqo with the proper filter
					// and override default request_config sqo into the section context
					if (!empty($section_id)) {

						$current_context->mode			= 'edit'; // force edit mode
						$current_context->section_id	= $section_id; // set section_id in context

						// request_config
							$request_config = array_find($current_context->request_config, function($el){
								return $el->api_engine==='dedalo';
							});
							if ($request_config) {
								// sqo
									$filter_by_locators = [(object)[
										'section_tipo'	=> $tipo,
										'section_id'	=> $section_id
									]];
									$sqo = new search_query_object();
										$sqo->set_section_tipo([(object)[
											'tipo' => $tipo,
											'label' => ''
											]
										]);
										// $sqo->set_limit(1);
										// $sqo->set_offset(0);
										$sqo->set_filter_by_locators($filter_by_locators);
								// overwrite default sqo
								$request_config->sqo = $sqo;
							}
					}//end if (!empty($section_id))

					// add to page context
						$context[] = $current_context;
					break;

				case (strpos($model, 'area')===0):

					$area = area::get_instance($model, $tipo, MODE);
					$area->set_lang(DEDALO_DATA_LANG);
					
					// add to page context
						$context[] = $area->get_structure_context(1, true);
					break;

				default:
					// ..
					break;
			}

		// component TEST
			// $tipo				= 'test202'; // portal 'test202'; // input text 'test164'
			// $section_tipo		= 'test38';
			// $section_id			= 1;
			// $add_request_config	= true;
			// $modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			// $component		= component_common::get_instance($modelo_name,
			// 												 $tipo,
			// 												 $section_id,
			// 												 'edit',
			// 												 DEDALO_DATA_LANG,
			// 												 $section_tipo);
			// $current_context = $component->get_structure_context(2, $add_request_config);
			// $current_context->section_id = $section_id;
			// $context[] = $current_context;

	}//end if (login::is_logged()!==true)
		// dump($context, ' context ++ '.to_string());


// load page
	
	// load base html
		$page_html = dirname(__FILE__) . '/html/page.phtml';
		if( !include($page_html) ) echo '<div class="error">Invalid page file</div>';


