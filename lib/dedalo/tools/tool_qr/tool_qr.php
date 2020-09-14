<?php

	# CONTROLLER TOOL_QR
	
	$tool_name		= get_class($this);
	$section_tipo	= $this->section_tipo;
	$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true);
	$modo			= $this->get_modo();
	$file_name		= $modo;


	# TOOL CSS / JS MAIN FILES

	// qr lib <script src="dist/awesome-qr.js"></script>
	js::$ar_url[]  = DEDALO_ROOT_WEB .'/lib/qrcode/easy.qrcode.min.js';

	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {		
	
		case 'button':
					
			$line_lenght = 90;	// Default value is 90
			break;
		
		case 'page':

			// info from button trigger (received in request)
				$button_tipo		= $_REQUEST['button_tipo'];
				$RecordObj_dd		= new RecordObj_dd($button_tipo);
				$button_properties	= $RecordObj_dd->get_propiedades(true);
				$source_list		= $button_properties->source_list;

			// records data (from search options)
				$data	= $this->get_data($source_list);
				$total	= count($data);
			break;		
	}//end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}