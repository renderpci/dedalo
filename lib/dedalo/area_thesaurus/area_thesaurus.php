<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo,$tipo);
	$area_name				= get_class($this);
	$visible				= $this->get_visible();
	$ar_children_areas 		= $this->get_ar_ts_children_areas_recursive($tipo);
		#dump($ar_children_areas,'$ar_children_areas');
	
	$file_name 				= $modo;

	switch($modo) {
		
		case 'list':
				# List
				include(DEDALO_LIB_BASE_PATH.'/section_records/row_thesaurus/class.row_thesaurus.php');


				#
				# ACTIVE HIERARCHIES
				#$ar_active_hierarchies = $this->get_active_hierarchies();
				#	dump($ar_active_hierarchies, ' ar_active_hierarchies ++ '.to_string());
				break;

	}
	
	
	# LOAD PAGE	
	$page_html	= dirname(__FILE__) . '/html/' . $area_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>