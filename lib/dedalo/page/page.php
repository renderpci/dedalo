<?php
	#dump($_REQUEST, ' _REQUEST ++ '.to_string());
	# PAGE CONTROLLER

	// test vars
		$page_items = [];

		// item (section, tool, etc.)
		$page_item = new StdClass();
			$page_item->model 		 = 'section';
			$page_item->section_tipo = 'test65';
			$page_item->section_id 	 = 2;
			$page_item->mode 	 	 = 'list';

		// add
		$page_items[] = $page_item;

	#$page_options = new StdClass();
	#	$page_options->model 		= 'section';
	#	$page_options->section_tipo = $_REQUEST['tipo'] ?? $_REQUEST['t'] ?? false;
	#	$page_options->section_id 	= $_REQUEST['id'] ?? false;
	#	$page_options->mode 		= $_REQUEST['mode'] ?? $_REQUEST['m'] ?? 'list';
	#	$page_options->lang 		= $_REQUEST['lang'] ?? DEDALO_DATA_LANG;
	#
	#$page_options_json = json_encode($page_options);

	$page_html	= dirname(__FILE__) . '/html/page.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid page file</div>";
	}
