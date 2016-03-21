<?php

	# CONTROLLER TOOL
	
	$component_obj 		= $this->component_obj;
	$tipo 				= $component_obj->get_tipo();
	$parent 			= $component_obj->get_parent();	
	$section_tipo 		= $component_obj->get_section_tipo();
	$propiedades 		= $component_obj->get_propiedades();
	$modo 				= $this->get_modo();
	$lang				= DEDALO_DATA_LANG;
	$context_name		= $_REQUEST['context_name'];
	$modelo_name 		= get_class($component_obj);	//RecordObj_dd::get_modelo_name_by_tipo($tipo);
	$tool_name 			= get_class($this);
	$file_name			= $modo;
	

	# TOOL CSS / JS MAIN FILES
		
		
	

	switch($modo) {	
		
		case 'button':												
					break;

		case 'page':					
					# CSS includes
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/css/bootstrap.min.css';
						#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/style.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload-ui.css';

						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/css/tool_common.css';
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_files/css/tool_import_files.css';
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";

					# CONTEXT
					$vars = array('context');foreach($vars as $name) $$name = common::setVar($name);
					/*
					$current_url = $_SERVER['REQUEST_URI'];
					$ar = explode('&', $current_url);

					$url_manage_files 	= str_replace('=form', '=files', $current_url);
					$url_import_preview = str_replace('=files','=form',  $current_url);
					*/

					switch ($context_name) {

						# FILES : Gestor de archivos (jquery upload)
						case 'files':

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
								js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_files/js/file_upload_main.js';
								
								js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";					
							
							# FILES UPLOAD MANAGER
							#$button_tipo = isset($_REQUEST['button_tipo']) ? $_REQUEST['button_tipo'] : '';	# Needed for build var 'upload_dir_custom'
							#$upload_handler_url = DEDALO_LIB_BASE_URL . '/tools/tool_import_files/inc/upload_handler.php?t='.$tipo;
							$upload_handler_url = TOOL_IMPORT_FILES_HANDLER_URL;

							#$ar_components = $propiedades->ar_tools_name->tool_import_files->ar_components;
								#dump($ar_components, ' ar_components ++ '.to_string());

							$user_id 			 = navigator::get_user_id();
							$target_section_tipo = $component_obj->get_ar_target_section_tipo()[0];	
							$target_component 	 = $propiedades->ar_tools_name->tool_import_files->target_component;

							# Layout map formatted
							$custom_layout_map = array();
							if (isset($propiedades->ar_tools_name->tool_import_files->layout_map)) {						
								foreach ($propiedades->ar_tools_name->tool_import_files->layout_map as $current_element) {
									$custom_layout_map[$current_element] = array();
								}
							}
							#dump($layout_map, ' layout_map ++ '.to_string());

							break;
						

						default:
							
					}

					
				
					break; #end page
		
	}#end switch modo



	#dump($target_folder_path,'$target_folder_path');
	
	

	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>