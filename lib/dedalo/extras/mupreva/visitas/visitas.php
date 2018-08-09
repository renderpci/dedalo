<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.visitas.php');  # Read constants from here
/*
	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$context_name		= $_REQUEST['context_name'];	

	$file_name	= $modo;

	switch($modo) {

		case 'page': # Default called from main page. 
				
				#
				# CSS includes
					css::$ar_url[] = BOOTSTRAP_CSS_URL;
					css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css';
					css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload.css';
					css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload-ui.css';

					css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/css/tool_common.css';
					css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_zotero/css/tool_import_zotero.css';

				#
				# JS includes
					# The Templates plugin is included to render the upload/download listings
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript-templates/js/tmpl.min.js';
					# The Templates plugin is included to render the upload/download listings
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript_load_image/js/load-image.min.js';

					# Bootstrap JS is not required, but included for the responsive demo navigation
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/js/bootstrap.min.js';
					# blueimp Gallery script
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/js/jquery.blueimp-gallery.min.js';

					# The Iframe Transport is required for browsers without support for XHR file uploads
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.iframe-transport.js';
					# The basic File Upload plugin
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.fileupload.js';
					# The File Upload processing plugin
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.fileupload-process.js';
					# The File Upload image preview & resize plugin
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.fileupload-image.js';
					# The File Upload validation plugin
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.fileupload-validate.js';
					# The File Upload user interface plugin
					js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/js/jquery.fileupload-ui.js';
					# The main application script
					js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_zotero/js/file_upload_main.js';

				#
				# IMAGES UPLOAD MANAGER
				#ob_start();
				#include ( dirname(__FILE__) .'/html/turnos.php' );
				#$html_upload = ob_get_clean();

				break;		
		
	}#end switch modo
	


	# INCLUDE FILE HTML
	$page_html	= dirname(__FILE__) . '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	*/
?>