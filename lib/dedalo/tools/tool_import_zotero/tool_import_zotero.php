<?php


	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$context_name		= safe_xss($_REQUEST['context_name']);	
	$tool_name 			= get_class($this);
	$file_name			= $modo;

	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	switch($modo) {

		case 'page': # Default called from main page. We will use upload as html file and script

				#
				# UPLOAD
					/*
					# Valid extensions (.json only at this time) 
					$valid_extensions_json = json_handler::encode($this->get_valid_extensions());
						#dump($valid_extensions_json, ' valid_extensions_json');
					# Current php max size upload (php ini)
					$upload_max_filesize 	= intval(ini_get('upload_max_filesize')) ; if($upload_max_filesize<1) $upload_max_filesize = 2000 ;
					$megas 					= $upload_max_filesize ;		
					$maxSize 				= intval($megas * 1048576);

					$url_trigger			= DEDALO_LIB_BASE_URL.'/tools/'.get_class($this).'/trigger.'.get_class($this).'.php';

					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_upload/css/tool_upload.css";				
					# JS includes
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_upload/js/tool_upload.js";

					ob_start();
					include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_upload.phtml' );
					$html_upload = ob_get_clean();	
					*/

				$button_tipo = isset($_GET['button_tipo']) ? safe_xss($_REQUEST['button_tipo']) : null;
				
				#
				# MEDIA folder
				# Target folder exists test	
				$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/temp'.'/files/';
				if( !is_dir($folder_path) ) {
					if(!mkdir($folder_path, 0777,true)) {
						throw new Exception(" Error on read or create TOOL_IMPORT_ZOTERO_UPLOAD_DIR directory. Permission denied ");
					}
				}

				#
				# CSS includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
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
				ob_start();
				include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/upload.php' );
				$html_upload = ob_get_clean();

				break;

		case 'upload':
				

				break; #end modo page / upload

		case 'preview':
			
				break; #end modo preview

		case 'process':
			
				break; #end modo process

		case 'report':
			
				break; #end modo report
		
	}#end switch modo



	#dump($target_folder_path,'$target_folder_path');
	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' .get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>