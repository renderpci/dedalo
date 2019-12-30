<?php
// PAGE CONTROLLER

// page mode and tipo
	define('MODE', $_GET['m'] ?? $_GET['mode'] ?? (!empty($_GET['id']) ? 'edit' : 'list') );
	$tipo 		= $_GET['t'] ?? $_GET['tipo'] ?? 'test65'; //MAIN_FALLBACK_SECTION;
	$section_id = $_GET['id'] ?? null;


// page globals
	$page_globals = (function($mode) {

		$obj = new stdClass();
			# version
			$obj->dedalo_version = DEDALO_VERSION;
			# lang
			$obj->dedalo_application_lang 		= DEDALO_APPLICATION_LANG;
			$obj->dedalo_data_lang 				= DEDALO_DATA_LANG;
			$obj->dedalo_data_nolan 			= DEDALO_DATA_NOLAN;
			$obj->dedalo_projects_default_langs = array_map(function($current_lang){
				$lang_obj = new stdClass();
					$lang_obj->label = lang::get_name_from_code($current_lang);
					$lang_obj->value = $current_lang;
				return $lang_obj;
			}, unserialize(DEDALO_PROJECTS_DEFAULT_LANGS));

			# parent
			#$obj->_parent 	= isset($parent) ? (int)$parent : '';
			# tipos
			#$obj->tipo 			= $tipo;
			#$obj->section_tipo 	= defined('SECTION_TIPO') ? SECTION_TIPO : null;
			#$obj->section_name 	= defined('SECTION_TIPO') ? RecordObj_dd::get_termino_by_tipo(SECTION_TIPO,DEDALO_APPLICATION_LANG) : null;
			# top
			#$obj->top_tipo 		= TOP_TIPO;
			#$obj->top_id 			= TOP_ID;
			# modo
			$obj->mode 				= isset($mode) ? $mode : null;
			# caller_tipo
			#$obj->caller_tipo 	= $caller_tipo;
			# context_name
			#$obj->context_name = $context_name;
			# tag_id
			$obj->tag_id 			= isset($_REQUEST["tag_id"]) ? safe_xss($_REQUEST["tag_id"]) : "";
			# user_id
			$obj->user_id 			= isset($user_id) ? $user_id : null;
			# username
			$obj->username 			= isset($username) ? $username : null;
			# full_username
			$obj->full_username 	= isset($full_username) ? $full_username : null;
			# is_global_admin
			#$obj->is_global_admin 	= (bool)$is_global_admin;
			# components_to_refresh
			$obj->components_to_refresh 		= [];
			# portal
			$obj->portal_tipo 					= isset($_REQUEST["portal_tipo"]) ? safe_xss($_REQUEST["portal_tipo"]) : null;
			$obj->portal_parent 				= isset($_REQUEST["portal_parent"]) ? safe_xss($_REQUEST["portal_parent"]) : null;
			$obj->portal_section_tipo 			= isset($_REQUEST["portal_section_tipo"]) ? safe_xss($_REQUEST["portal_section_tipo"]) : null;
			# id_path
			$obj->id_path 						= isset($_REQUEST["id_path"]) ? safe_xss($_REQUEST["id_path"]) : null;
			# dedalo_protect_media_files
			$obj->dedalo_protect_media_files 	= (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) ? 1 : 0;
			# notifications
			$obj->DEDALO_NOTIFICATIONS 	  		= defined("DEDALO_NOTIFICATIONS") ? (int)DEDALO_NOTIFICATIONS : 0;
			$obj->DEDALO_PUBLICATION_ALERT 		= defined("DEDALO_PUBLICATION_ALERT") ? (int)DEDALO_PUBLICATION_ALERT : 0;
			# float_window_features
			$obj->float_window_features 		= json_decode('{"small":"menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=600,height=540"}');

		return $obj;
	})(MODE);



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
	if (login::is_logged()===true) {

		$page_elements = [];

		//menu_element
			$page_elements[] = (function(){

				$menu = new menu();

				// login json
					$get_json_options = new stdClass();
						$get_json_options->get_context 	= true;
						$get_json_options->get_data 	= true;
					$menu_json = $menu->get_json($get_json_options);

				// element
					$page_element = new StdClass();
						$page_element->model 		= 'menu';
						$page_element->tipo 		= 'dd85';
						$page_element->mode 		= 'edit';
						$page_element->lang 		= DEDALO_APPLICATION_LANG;
						$page_element->sqo_context  = null;
						$page_element->datum 		= $menu_json;

				return $page_element;
			})();


		// page elements
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			switch ($model) {
				case 'area':
				case 'area_development':
					$page_elements[] = (function() use ($model, $tipo){

						$page_element = new StdClass();
							$page_element->model 		= $model;
							$page_element->tipo  		= $tipo;
							$page_element->mode 	 	= MODE;
							$page_element->lang 	 	= DEDALO_DATA_LANG;
							#$page_element->sqo_context  = $sqo_context;

						return $page_element;
					})();
					break;

				case 'section_tool':
					$page_elements[] = (function() use ($model, $tipo){

						# Configure section from section_tool data
						$RecordObj_dd = new RecordObj_dd($tipo);
						$propiedades  = json_decode($RecordObj_dd->get_propiedades());

						#$section_tipo = isset($propiedades->config->target_section_tipo) ? $propiedades->config->target_section_tipo :
						#debug_log(__METHOD__." Error Processing Request. property target_section_tipo don't exist) ".to_string(), logger::ERROR);

						$section_tipo 	= $tipo;
						$section_id		= null;
						$lang 	 	 	= DEDALO_DATA_LANG;

						// sqo_context
							$section = section::get_instance($section_id, $section_tipo, MODE);
							$section->set_lang($lang);
							$section->config = $propiedades->config;
							$sqo_context = $section->get_sqo_context();

						$page_element = new StdClass();
							$page_element->model 		 = 'section';
							$page_element->section_tipo  = $section_tipo;
							$page_element->section_id 	 = $section_id;
							$page_element->mode 	 	 = MODE;
							$page_element->lang 	 	 = $lang;
							$page_element->sqo_context   = $sqo_context;

						return $page_element;
					})();
					break;

				case 'section':
				default:
					$page_elements[] = (function() use ($model, $tipo, $section_id){

						$section_tipo 	= $tipo ?? 'test65';
						$section_id		= $section_id ?? null;
						$lang 	 	 	= DEDALO_DATA_LANG;

						// sqo_context
							$section = section::get_instance($section_id, $section_tipo, MODE);
							$section->set_lang($lang);
							$sqo_context = $section->get_sqo_context();

						$page_element = new StdClass();
							$page_element->model 		 = $model;
							$page_element->section_tipo  = $section_tipo;
							$page_element->section_id 	 = $section_id;
							$page_element->mode 	 	 = MODE;
							$page_element->lang 	 	 = $lang;
							$page_element->sqo_context   = $sqo_context;

						return $page_element;
					})();
					break;
			}//end switch ($model)

		$load_page($page_elements);
	}//end if (login::is_logged()===true)


