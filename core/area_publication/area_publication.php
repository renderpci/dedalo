<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo,$tipo);
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	#$ar_children_areas 		= $this->get_ar_children_areas();
	$ar_children_areas 		= (array)$this->get_ar_ts_children_areas_recursive($tipo);
		
	$file_name 				= $modo;

	switch($modo) {
		
		case 'list':	
				# List
				break;

	}
	
	
	# LOAD PAGE	
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>