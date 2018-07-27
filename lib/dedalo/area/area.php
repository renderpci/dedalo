<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo, $tipo);
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$ar_children_areas 		= (array)$this->get_ar_ts_children_areas_recursive($tipo);
	$ar_ts_children 		= (array)$this->get_ar_ts_children();
		#dump($ar_children_areas ,'$ar_children_areas ');

	/*
	# Redirections when area is a special thesaurus class
	if ($tipo===DEDALO_THESAURUS_VIRTUALS_AREA_TIPO) { // hierarchy56
		header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".DEDALO_TESAURO_TIPO); exit();
	}elseif ($tipo===DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO) {
		header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".DEDALO_TESAURO_TIPO.'&model'); exit();
	}
	*/

	
	$file_name 				= $modo;

	switch($modo) {
		
		case 'list':	
				# List
				break;

	}
	
	
	# LOAD PAGE	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>