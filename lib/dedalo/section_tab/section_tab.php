<?php
	
	# CONTROLLER	
	
	$id						= $this->get_id();
	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo);		
	$label					= $this->get_label();
	$modo					= $this->get_modo();
	$label_name				= $this->get_label();
	$ar_css					= $this->get_ar_css();
	$component_name			= get_class($this);
	$ar_tab_html			= $this->ar_tab_html;					#dump($id);

	$identificador_unico 	= 'tap_' .$id. '_' .common::get_identificador_unico();		#dump($identificador_unico,'identificador_unico');
	
	$file_name				= $modo ;
	
	# LOAD PAGE
	
	switch($modo) {
		
		case 'edit' :		# Nothing to do

							break;

		case 'search' :		# Nothing to do
							break;

		case 'list' :		# Nothing to do
							break;

		case 'relation' :	
							break;

	}
	
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>