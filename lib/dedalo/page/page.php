<?php
	#dump($_REQUEST, ' _REQUEST ++ '.to_string());
	# PAGE CONTROLLER

	$mode = 'edit';

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
			$page_items[] = $page_item;

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

	#$page_options = new StdClass();
	#	$page_options->model 		= 'section';
	#	$page_options->section_tipo = $_REQUEST['tipo'] ?? $_REQUEST['t'] ?? false;
	#	$page_options->section_id 	= $_REQUEST['id'] ?? false;
	#	$page_options->mode 		= $_REQUEST['mode'] ?? $_REQUEST['m'] ?? 'list';
	#	$page_options->lang 		= $_REQUEST['lang'] ?? DEDALO_DATA_LANG;
	#
	#$page_options_json = json_encode($page_options);



	// page header 
		#$html_header = '';
		#switch (true) {
		#
		#	case (isset($_REQUEST['menu']) && $_REQUEST['menu']==0):
		#		$menu_html = null;
		#		break;
		#
		#	case (isset($_REQUEST['menu']) && $_REQUEST['menu']==1):
		#		# MENU
		#		$menu 		= new menu($modo);
		#		$menu_html 	= $menu->get_html();			
		#		ob_start();
		#		include ( DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml' );
		#		$html_header = ob_get_clean();
		#		break;
		#
		#	case ($context_name==='list_in_portal'):
		#		$html_header .= '<div class="breadcrumb">';
		#		$html_header .= strip_tags( tools::get_bc_path() ); // Remove possible <mark> tags
		#		$html_header .= "<div class=\"icon_bs close_window\" title=\"".label::get_label('cerrar')."\" onclick=\"window.close()\"></div>";
		#		$html_header .= '</div>';
		#		$html_header .= '<div class="breadcrumb_spacer"></div>';
		#		break;
		#
		#	case (strpos($m, 'tool_')===false): //empty($context_name) && 
		#		# MENU
		#		$menu_html = null;
		#		if(empty($caller_id)) {
		#			$menu 		= new menu($modo);
		#			$menu_html 	= $menu->get_html();	
		#		}
		#		ob_start();
		#		include ( DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml' );
		#		$html_header = ob_get_clean();
		#		break;
		#	
		#	default:
		#		$html_header = '';
		#		break;
		#}


	$page_html	= dirname(__FILE__) . '/html/page.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid page file</div>";
	}
