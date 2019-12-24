<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible(); 
	$label 					= $this->get_label();			
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();	
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$pdf_id 				= $this->get_pdf_id();
	$quality				= $this->get_quality();
	$pdf_url				= $this->get_pdf_url().'?t='.time();
	$aditional_path			= $this->get_aditional_path();		
	$initial_media_path		= $this->get_initial_media_path();
	

	#
	# PDF VIEVER URL
	$pdf_viewer_url 		= DEDALO_CORE_URL . '/'. get_class($this) . '/html/component_pdf_viewer.php';

	#dump($initial_media_path, " initial_media_path ".to_string($pdf_url));
	#$media_width 	= '97%';
	#$media_height 	= 400;

	
	
	switch($modo) {

		case 'edit' :
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info	= $this->get_component_info('json');
				$file_exists	= $this->get_file_exists();

				# THUMB . Change temporally modo to get html
				$this->modo 	= 'player';
				$pdf_thumb_html = $this->get_html();
				
				# restore modo
				$this->modo 	= 'edit';

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);			

				break;

		case 'player':
				$file_exists	= $this->get_file_exists();
				#$iframe_url 	= DEDALO_ROOT_WEB . '/lib/pdfjs/web/dedalo_viewer.html?pdf_url='.$pdf_url;
				$iframe_url 	= $pdf_viewer_url .'?pdf_url='. $pdf_url;				
				break;

		case 'thumb':
				$file_exists	= $this->get_file_exists();		
				# Only show pdf icon						 
				break;
		
		case 'print':
		case 'portal_list':				
		case 'list_tm':
				$file_name = 'list';									

		case 'list':

				# FILE. Test if pdf file exists
				$file_exists	= $this->get_file_exists();		

				# THUMB. Not used in list	
				# $pdf_thumb = $file_exists ? $this->get_pdf_thumb() : null;
				$pdf_thumb 		= false;
				
				break;

		case 'search':
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				return null;		
				break;											
	}

	
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>