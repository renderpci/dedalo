<?php
	
	# CONTROLLER	
	
	#$id						= $this->get_id();
	$tipo					= $this->get_tipo();
	$label					= $this->get_label();
	$modo					= $this->get_modo();	
	$component_name			= get_class($this);	
	$section_tipo			= $this->get_section_tipo();
	$identificador_unico 	= 'div_'.common::get_identificador_unico();
	$file_name				= $modo ;
	

	# LOAD PAGE	
	switch($modo) {
		
		case 'edit' :
				$section_group_id = $tipo;

				$components_html = $this->get_components_html();
				break;
	}
	
	
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>