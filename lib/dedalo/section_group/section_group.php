<?php
	
	# CONTROLLER	
	
	$id						= $this->get_id();
	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo);
	if ($permissions<1) {
		return '';
	}

	$label					= $this->get_label();
	$modo					= $this->get_modo();
	$label_name				= $this->get_label();
	$ar_css					= $this->get_ar_css();
	$component_name			= get_class($this);
	$components_html		= $this->get_components_html();					#dump($id);

	$identificador_unico 	= 'tab_' .$id. '_' .common::get_identificador_unico();		#dump($identificador_unico,'identificador_unico');
	
	$file_name				= $modo ;
	
	# LOAD PAGE
	
	switch($modo) {
		
		case 'edit' :		# Nothing to do
							$section_group_id = $tipo.'_'.$id;
							break;

		case 'search' :		# Nothing to do
							break;

		case 'list' :		# Nothing to do
							break;

		case 'relation' :	
							break;				

	}
	
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>