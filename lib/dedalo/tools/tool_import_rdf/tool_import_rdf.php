<?php

	# CONTROLLER TOOL_QR

	$tool_name		= get_class($this);
	$section_tipo	= $this->section_tipo;
	$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true);
	$modo			= $this->get_modo();
	$file_name		= $modo;


	# TOOL CSS / JS MAIN FILES

	// qr lib <script src="dist/awesome-qr.js"></script>
	// js::$ar_url[]  = DEDALO_ROOT_WEB .'/lib/qrcode/easy.qrcode.min.js';

	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {		
	
		case 'button':
					
			$line_lenght = 90;	// Default value is 90
			break;
		
		case 'page':

			$section_id		= $_REQUEST['section_id'];
			$component_tipo	= $_REQUEST['component_tipo'];
			$ontology_tipo	= $this->get_ontology_tipo($component_tipo);
			$id_wrapper 	= 'wrapper_'.$component_tipo.'_'.$section_id.'_'.$ontology_tipo	;
			$component_dato	= $this->get_component_dato($section_id, $component_tipo);


			# LANG
			# Note that component_textarea can change his lang ('force_change_lang') in some contexts
				$lang = DEDALO_DATA_LANG;


			break;		
	}//end switch


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}