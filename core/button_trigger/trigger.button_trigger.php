<?php
require_once( dirname(dirname(__FILE__)) .'/config/config.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','component_tipo','component_parent','target_url','lang_filter','ar_prefix_filter','component_pdf_tipo','section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# FIX SECTION TIPO
	define('SECTION_TIPO', $section_tipo);


# NEW	
if ($mode==='trigger') {
	
	
	die();
}


# TESAURO PRESENTACION
# TESAURO_ALFABETICO_GENERATE_HTML_FILE	
if ($mode==='tesauro_presentacion_generate_pdf_file') {	
	
	require_once(DEDALO_LIB_BASE_PATH.'/common/class.exec_.php');

	if (empty($target_url)) {
		die("Error. Empty target_url");
	}
	if (empty($component_tipo)) {
		die("Error. Empty component_tipo");
	}
	if (empty($component_pdf_tipo)) {
		die("Error. Empty component_pdf_tipo");
	}
	# pasados automáticamente por el botón
	if (empty($component_parent)) {
		die("Error. Empty component_parent");
	}
	if (empty($lang_filter)) {
		die("Error. Empty lang_filter");
	}
	if (empty($section_tipo)) {
		die("Error. Empty section_tipo");
	}


	if (!isset($title_pagina)) {
		$title_pagina='Page';
	}

	#
	# PDF
	$component_pdf 	 	= component_common::get_instance('component_pdf',
														$component_pdf_tipo,
														$component_parent,
														'edit',
														$lang_filter,
														$section_tipo);
	
	$pdf_target_path = $component_pdf->get_pdf_path();
	

	if( strpos($_SERVER['HTTP_HOST'], '8888')!==false ) {
		$ar_pages[] = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?lang='.$lang_filter;
	}else{
		# REALM APACHE AUTH WEB EN PRUEBAS . Pasamos al 8080 para evitar el bloqueo de la autorización de momento
		$ar_pages[] = 'http://'.$_SERVER['HTTP_HOST'].':8080' . $target_url .'?lang='.$lang_filter;
	}

	
	
	if(!empty($pdf_target_path)) {

		#
		# PDF generation		
		$command  = "/usr/local/bin/wkhtmltopdf --no-stop-slow-scripts --debug-javascript ";
	
		# Footer page
		$command .= "--print-media-type ";
		$command .= "--page-offset -2 ";
		$command .= "--footer-font-name 'Times' ";
		$command .= "--footer-font-size 20 ";		
		$command .= "--footer-left '".$title_pagina.": [page]' ";
		
		$i=0;
		foreach ($ar_pages as $current_page) {			
			if($i<1){
				$command  .="cover";
			}
			$command .= " $current_page";			
			$i++;
		}
		
			#dump($command ,'$command ');
		$command .= " $pdf_target_path";
		if(SHOW_DEBUG) {
			$msg = "Generating pdf file from to $pdf_target_path with command: $command";
			error_log($msg);
		}
		$command_exc = exec_::exec_command($command);
			#print "command: $command";


		$pdf_url = $component_pdf->get_pdf_url();
		print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";

		if(SHOW_DEBUG) {
			$url = $ar_pages[0];
			echo "<br>DEBUG: pdf generated from <a href=\"$url\" target=\"_blank\" >$url</a>";
		}
	}	

	exit();
}#end if ($mode=='tesauro_presentacion_generate_pdf_file') 





# TESAURO_ALFABETICO_GENERATE_HTML_FILE	
if ($mode==='tesauro_alfabetico_generate_html_file') {
	
	if (empty($target_url)) {
		die("Error. Empty target_url");
	}
	if (empty($component_tipo)) {
		die("Error. Empty component_tipo");
	}
	if (empty($component_parent)) {
		die("Error. Empty component_parent");
	}
	if (empty($lang_filter)) {
		die("Error. Empty lang_filter");
	}
	if (empty($component_pdf_tipo)) {
		die("Error. Empty component_pdf_tipo");
	}
	if (empty($section_tipo)) {
		die("Error. Empty section_tipo");
	}


	#
	# HTML FILE
	# Llama a '/dedalo/ts/lib/trigger.ts_works.php' que rendea el html correspondiente
	$target_url_full = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?mode=tesauro_alfabetico_html&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter);
	# Leemos el fichero desde la url (se genera en dedalo3)
	$html	= file_get_contents($target_url_full);	
	if(!empty($html)) {

		#$component_html_file 	= new component_html_file(NULL,$component_tipo,'edit',$component_parent,DEDALO_DATA_LANG); #$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
		$component_html_file 	= component_common::get_instance('component_html_file',$component_tipo,$component_parent,'edit',DEDALO_DATA_LANG, $section_tipo);
		$valor 					= $component_html_file->get_valor();

		$target_file_path 		= DEDALO_MEDIA_BASE_PATH . DEDALO_HTML_FILES_FOLDER .'/'.$valor .'.'.DEDALO_HTML_FILES_EXTENSION;	
		$file_put_contents_res	= file_put_contents($target_file_path, $html);
		$html_file_url 			= DEDALO_MEDIA_BASE_URL . DEDALO_HTML_FILES_FOLDER .'/'.$valor.'.'.DEDALO_HTML_FILES_EXTENSION;

		if(SHOW_DEBUG) {
			$msg = "Generating html_file from $target_url_full to $html_file_url";
			error_log($msg);
		}
		print "<a href=\"$html_file_url\" target=\"_blank\"> HTML file </a>";
	}
	

	#
	# PDF
	$component_pdf 	 	= component_common::get_instance('component_pdf',
														 $component_pdf_tipo,
														 $component_parent,
														 'edit',
														 $lang_filter,
														 $section_tipo);
	$pdf_target_path = $component_pdf->get_pdf_path();
	
	if(!empty($pdf_target_path)) {

		$target_url_full = 'http://'.$_SERVER['HTTP_HOST'].$target_url.'?mode=tesauro_alfabetico_pdf&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter).'&pdf_target_path='.$pdf_target_path;
		#$target_url_full = urlencode($target_url_full);

		# leemos el fichero url	.
		# Realmente no esperamos respuesta, pues el trigger requerido ya guarda el resultado en su sitio. 
		# Por ello dará error, ero lo ignoraremos, sólo nos interesa la llamada	
		try {
			$ctx = stream_context_create(array( 
			    'http' => array( 
			        'timeout' => 30
			        )
			    )
			);
			file_get_contents($target_url_full, 0, $ctx);		    
		} catch (Exception $e) {
		   # echo 'Caught exception: ',  $e->getMessage(), "\n";
		}

		/*
		$command = DEDALO_PDF_RENDERER." --no-stop-slow-scripts --load-error-handling ignore '$target_url_full' '$pdf_target_path' ";
		if(SHOW_DEBUG) {
			$msg = "Generating pdf file from $target_url_full to $pdf_target_path with command: $command";
			error_log($msg);
		}
		require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');
		$command_exc = exec_::exec_command($command);

		$pdf_url = $component_pdf->get_pdf_url();
		*/
		$pdf_url = $component_pdf->get_pdf_url();
		print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";
	}	

	exit();
}




# TESAURO_JERARQUICO_GENERATE_HTML_FILE	
if ($mode==='tesauro_jerarquico_generate_html_file') {

	if (empty($target_url)) {
		die("Error. Empty target_url");
	}
	if (empty($component_tipo)) {
		die("Error. Empty component_tipo");
	}
	if (empty($component_parent)) {
		die("Error. Empty component_parent");
	}
	if (empty($lang_filter)) {
		die("Error. Empty lang_filter");
	}
	if (empty($component_pdf_tipo)) {
		die("Error. Empty component_pdf_tipo");
	}
	if (empty($section_tipo)) {
		die("Error. Empty section_tipo");
	}

	#
	# HTML FILE
	# Llama a '/dedalo/ts/lib/trigger.ts_works.php' que rendea el html correspondiente
	$target_url_full = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?mode=tesauro_jerarquico_html&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter);

	$html	= file_get_contents($target_url_full);
	
	if(!empty($html)) {

		$component_html_file 	= component_common::get_instance('component_html_file',
																 $component_tipo,
																 $component_parent,
																 'edit',
																 DEDALO_DATA_LANG,
																 $section_tipo);
		$valor 					= $component_html_file->get_valor();

		$target_file_path 		= DEDALO_MEDIA_BASE_PATH . DEDALO_HTML_FILES_FOLDER .'/'.$valor .'.'.DEDALO_HTML_FILES_EXTENSION;	
		$file_put_contents_res	= file_put_contents($target_file_path, $html);
		$html_file_url 			= DEDALO_MEDIA_BASE_URL . DEDALO_HTML_FILES_FOLDER .'/'.$valor.'.'.DEDALO_HTML_FILES_EXTENSION;

		if(SHOW_DEBUG) {
			$msg = "Generating html_file from $target_url_full to $html_file_url";
			error_log($msg);
		}
		print "<a href=\"$html_file_url\" target=\"_blank\"> HTML file </a>";
	}

	# unlock session allows continue brosing
	#session_write_close();

	#
	# PDF
	$component_pdf 	 = component_common::get_instance('component_pdf',$component_pdf_tipo,$component_parent,'edit',$lang_filter,$section_tipo);
	$pdf_target_path = $component_pdf->get_pdf_path();
	
	if(!empty($pdf_target_path)) {

		$target_url_full = 'http://'.$_SERVER['HTTP_HOST'].$target_url.'?mode=tesauro_jerarquico_pdf&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter).'&pdf_target_path='.$pdf_target_path;

		# leemos el fichero url	.
		# Realmente no esperamos respuesta, pues el trigger requerido ya guarda el resultado en su sitio. 
		# Por ello dará error, pero lo ignoraremos, sólo nos interesa la llamada	
		try {
			$ctx = stream_context_create(array( 
			    'http' => array( 
			        'timeout' => 30
			        )
			    )
			);
			file_get_contents($target_url_full, 0, $ctx);		    
		} catch (Exception $e) {
		   # echo 'Caught exception: ',  $e->getMessage(), "\n";
		}


		/*
		$command = DEDALO_PDF_RENDERER." --no-stop-slow-scripts '$html_file_full_url' '$pdf_target_path' ";
		if(SHOW_DEBUG) {
			$msg = "Generating pdf file from $html_file_full_url to $pdf_target_path with command: $command";
			error_log($msg);
		}
		require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');
		$command_exc = exec_::exec_command($command);
		*/
		$pdf_url = $component_pdf->get_pdf_url();		
		print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";
	}

	exit();
}




if (SHOW_DEBUG) {
	throw new Exception("Error Processing Request. Wrong trigger mode", 1);	
}			
?>