<?php
	#dump($_REQUEST, ' _REQUEST ++ '.to_string());
	# PAGE CONTROLLER

	$mode = 'edit';


	// test vars (!)
		$page_items = [];

		// item (section, tool, etc.)
		#$page_item = new StdClass();
		#	$page_item->model 		 = 'section';
		#	$page_item->section_tipo = 'rsc170';
		#	$page_item->section_id 	 = '';
		#	$page_item->mode 	 	 = $mode;
		#	$page_item->lang 	 	 = DEDALO_DATA_LANG;
		#
		#	// add
		#	#$page_items[] = $page_item;
		

		$section_tipo 	= 'test65';
		$section_id		= '';
		$mode 	 	 	= $mode;
		$lang 	 	 	= DEDALO_DATA_LANG;

		// sqo_context
			$sqo_context = (function($section_id, $section_tipo, $mode, $lang) {

				$section = section::get_instance($section_id, $section_tipo, $mode); 
				$section->set_lang($lang);
				$sqo_context = $section->get_sqo_context();
		
				return $sqo_context;
			})($section_id, $section_tipo, $mode, $lang);


		// item (section, tool, etc.)
			$page_item = new StdClass();
				$page_item->model 		 = 'section';
				$page_item->section_tipo = 'test65';
				$page_item->section_id 	 = $section_id;
				$page_item->mode 	 	 = $mode;
				$page_item->lang 	 	 = DEDALO_DATA_LANG;
				$page_item->sqo_context  = $sqo_context;
		//	dump($page_item, ' page_item ++ '.to_string());
		// add
			$page_items[] = $page_item;
		
		
		$page_options = new StdClass();
			$page_options->page_items = $page_items;

	#$page_options = new StdClass();
	#	$page_options->model 		= 'section';
	#	$page_options->section_tipo = $_REQUEST['tipo'] ?? $_REQUEST['t'] ?? false;
	#	$page_options->section_id 	= $_REQUEST['id'] ?? false;
	#	$page_options->mode 		= $_REQUEST['mode'] ?? $_REQUEST['m'] ?? 'list';
	#	$page_options->lang 		= $_REQUEST['lang'] ?? DEDALO_DATA_LANG;
	#
	#$page_options_json = json_encode($page_options);



	// page globals
		$page_globals = (function($mode) {

			$obj = new stdClass();
				# version
				$obj->dedalo_version 			= DEDALO_VERSION;
				# lang
				$obj->dedalo_application_lang 	= DEDALO_APPLICATION_LANG;
				$obj->dedalo_data_lang 			= DEDALO_DATA_LANG;
				$obj->dedalo_data_nolan 		= DEDALO_DATA_NOLAN;
				# parent
				#$obj->_parent 	= isset($parent) ? (int)$parent : '';
				# tipos
				#$obj->tipo 			= $tipo;
				#$obj->section_tipo 	= defined('SECTION_TIPO') ? SECTION_TIPO : null;
				#$obj->section_name 	= defined('SECTION_TIPO') ? RecordObj_dd::get_termino_by_tipo(SECTION_TIPO,DEDALO_APPLICATION_LANG) : null;
				# top
				#$obj->top_tipo 		= TOP_TIPO;
				#$obj->top_id 		= TOP_ID;
				# modo
				$obj->mode 			= isset($mode) ? $mode : null;
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
		})($mode);


	if (login::is_logged()!==true) {
			
		# CONTENT HTML IS LOGIN FORM

		$username	= NULL;
		$user_id	= NULL;	
		
		# BUILD LOGIN HTML
		$login		= new login('edit');
		$html_header= $login->get_html();

		die("Not logged!");
	
	}else{
		

		// page_options
			$page_options = (function($mode) {

				#$page_options = new StdClass();
				#	$page_options->model 		= 'section';
				#	$page_options->section_tipo = $_REQUEST['tipo'] ?? $_REQUEST['t'] ?? false;
				#	$page_options->section_id 	= $_REQUEST['id'] ?? false;
				#	$page_options->mode 		= $_REQUEST['mode'] ?? $_REQUEST['m'] ?? 'list';
				#	$page_options->lang 		= $_REQUEST['lang'] ?? DEDALO_DATA_LANG;
				#
				#$page_options_json = json_encode($page_options);

				// test vars (!)
				$page_items = [];

				// item (section, tool, etc.)
				$page_item = new StdClass();
					$page_item->model 		 = 'section';
					$page_item->section_tipo = 'rsc170';
					$page_item->section_id 	 = '';
					$page_item->mode 	 	 = $mode;
					$page_item->lang 	 	 = DEDALO_DATA_LANG;

					// add
				#	$page_items[] = $page_item;

				// item (section, tool, etc.)
				$page_item = new StdClass();
					$page_item->model 		 = 'section';
					$page_item->section_tipo = 'test65';
					$page_item->section_id 	 = '';
					$page_item->mode 	 	 = $mode;
					$page_item->lang 	 	 = DEDALO_DATA_LANG;

				// add
				$page_items[] = $page_item;		

				$page_options = new StdClass();
					$page_options->page_items = $page_items;

				return $page_options;
			})($mode);


		// page header
			$html_header = (function($mode) {
				
			    switch (true) {
				
					case (isset($_REQUEST['menu']) && $_REQUEST['menu']==0):
						$html = '';
						break;
				
					case (isset($_REQUEST['menu']) && $_REQUEST['menu']==1):
					default:
						# MENU
						$menu 		= new menu($mode);
						$menu_html 	= $menu->get_html();			
						ob_start();
						include ( DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml' );
						$html = ob_get_clean();
						break;
				
					#case ($context_name==='list_in_portal'):
					#	$html_header .= '<div class="breadcrumb">';
					#	$html_header .= strip_tags( tools::get_bc_path() ); // Remove possible <mark> tags
					#	$html_header .= "<div class=\"icon_bs close_window\" title=\"".label::get_label('cerrar')."\" onclick=\"window.close()\"></div>";
					#	$html_header .= '</div>';
					#	$html_header .= '<div class="breadcrumb_spacer"></div>';
					#	break;
				
					#case (strpos($m, 'tool_')===false): //empty($context_name) && 
					#	# MENU
					#	$menu_html = null;
					#	if(empty($caller_id)) {
					#		$menu 		= new menu($mode);
					#		$menu_html 	= $menu->get_html();	
					#	}
					#	ob_start();
					#	include ( DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml' );
					#	$html_header = ob_get_clean();
					#	break;
					
					#default:
					#	$html_header = '';
					#	break;
				}
				
				return $html;
			})($mode);
		
	}


	$page_html	= dirname(__FILE__) . '/html/page.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid page file</div>";
	}