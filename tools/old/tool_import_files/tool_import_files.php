<?php

	# CONTROLLER TOOL
	
	$component_obj 		= $this->component_obj;
	$tipo 				= $component_obj->get_tipo();
	$parent 			= $component_obj->get_parent();	
	$section_tipo 		= $component_obj->get_section_tipo();
	$propiedades 		= $component_obj->get_propiedades();
	$modo 				= $this->get_modo();
	$lang				= DEDALO_DATA_LANG;	
	$modelo_name 		= get_class($component_obj);	//RecordObj_dd::get_modelo_name_by_tipo($tipo);
	$tool_name 			= get_class($this);
	$file_name			= $modo;
	

	switch($modo) {	
		
		case 'button':												
			break;

		case 'page':					
			# CSS includes
				#css::$ar_url[] = BOOTSTRAP_CSS_URL;
				#array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
				#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/style.css';
				#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css';
				array_unshift(css::$ar_url_basic, DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css');
				css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload.css';
				css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload-ui.css';

				css::$ar_url[] = DEDALO_CORE_URL.'/tools/tool_common/css/tool_common.css';
				css::$ar_url[] = DEDALO_CORE_URL.'/tools/tool_import_files/css/tool_import_files.css';
				css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";

				# CONTEXT
				$vars = array('context_name','context'); foreach($vars as $name) $$name = common::setVar($name);
	
				switch ($context_name) {

					# FILES : Gestor de archivos (jquery upload)
					case 'files':

						# JS includes
							# The Templates plugin is included to render the upload/download listings
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript-templates/js/tmpl.min.js';
							# The Templates plugin is included to render the upload/download listings
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript_load_image/js/load-image.min.js';

							# Bootstrap JS is not required, but included for the responsive demo navigation
							#js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/js/bootstrap.min.js';
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
							js::$ar_url[] = DEDALO_CORE_URL.'/tools/tool_import_files/js/file_upload_main.js';
							
							js::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";					
						
						# FILES UPLOAD MANAGER
						$button_tipo 		= safe_tipo( get_request_var('button_tipo') ); // Core function. Needed for build var 'upload_dir_custom'
						#$upload_handler_url = DEDALO_CORE_URL . '/tools/tool_import_files/inc/upload_handler.php?t='.$tipo;
						$upload_handler_url = TOOL_IMPORT_FILES_HANDLER_URL;

						# file_processor
						$file_processor = null;
						# target_portal_map_name
						$target_portal_map_name = null;


						# Defaults
						$copy_all_filenames_to  = null;
						$optional_copy_filename = null;

						# BUTTON IMPORT (SECTION LIST) info
						if (!empty($button_tipo)) {
							
							$RecordObj_dd 		= new RecordObj_dd($button_tipo);
							$button_propiedades = json_decode($RecordObj_dd->get_propiedades());

							# file_processor
							$file_processor = isset($button_propiedades->custom_params->file_processor) ? $button_propiedades->custom_params->file_processor : null;

							# target_portal_map_name (maps avilable target portal tipo to letters like A,B,C..)
							$target_portal_map_name = isset($button_propiedades->map_name) ? $button_propiedades->map_name : null;

							# copy_filename_to 
							$copy_all_filenames_to = isset($button_propiedades->copy_all_filenames_to) ? $button_propiedades->copy_all_filenames_to : null;

							# optional_copy_filename 
							$optional_copy_filename = isset($button_propiedades->optional_copy_filename) ? $button_propiedades->optional_copy_filename : null;							
						}						
						

						$user_id = navigator::get_user_id();

						# CUSTOM_PARAMS
						# _GET custom_params overwrite normal tool propiedades defined in button import_files
						$custom_params = isset($_GET['custom_params']) ? json_decode( safe_xss($_GET['custom_params']) ) : false;
						if ($custom_params && isset($custom_params->tool_import_files)) {
							# Overwrite default propiedades
							$propiedades->ar_tools_name->tool_import_files = $custom_params->tool_import_files;
						}				

						// import mode (default is 'default')
							$import_mode = isset($propiedades->ar_tools_name->tool_import_files->import_mode) ? $propiedades->ar_tools_name->tool_import_files->import_mode : 'default';
							# parent is tmp on import_mode 'section' because is general import
							if ($import_mode==='section') {
								$parent = DEDALO_SECTION_ID_TEMP; // 'tmp';
							}

						# Target section tipo						
						$target_section_tipo = $component_obj->get_ar_target_section_tipo()[0];
						
						
						# Target component (portal)
						$target_component  = $propiedades->ar_tools_name->tool_import_files->target_component;


						# Default target component tipo
			            if (isset($button_propiedades->component_tipo)) {
			                # Case button from section list
			                $target_portal_tipo = $button_propiedades->component_tipo;
			            }else{
			                # Case button from edit
			                $target_portal_tipo = $tipo; // Actual component
			            }


						# Layout map formatted
						$custom_layout_map = array();
						if (isset($propiedades->ar_tools_name->tool_import_files->layout_map)) {
							foreach ($propiedades->ar_tools_name->tool_import_files->layout_map as $current_element) {
								$custom_layout_map[$current_element] = array();
							}
						}
						if (empty($custom_layout_map)) {
							$custom_layout_map = array( array() );
						}										
						break;					

					default:

						break;						
				}#end switch context_name					
				
			break; #end modo page		
	}#end switch modo
	
	

	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>