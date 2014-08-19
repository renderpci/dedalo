<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
#$session_duration_hours = 18;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



	# CONTROLLER TOOL

	# Por compatibilidad temporal con component_tools, partimos de $this->component_obj, aunque estamos trabajando con una sección
	$section_obj 		= $this->component_obj;

	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	#$modelo_name 		= RecordObj_ts::get_modelo_name_by_tipo($tipo);
	

	$file_name	= $modo;

	switch($modo) {	
		
		case 'button':												
					break;

		case 'page':

					# MEDIA folder
					# Target folder exists test	
					$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/temp'.'/files/';
					if( !is_dir($folder_path) ) {
						if(!mkdir($folder_path, 0777,true)) {
							throw new Exception(" Error on read or create TOOL_IMPORT_IMAGES_UPLOAD_DIR directory. Permission denied ");
						}
					}

					/* FORMATO DE PROPIEDADES DEL BOTON
					{
					"portal_destino":"dd1125",
					"campo_destino":"dd750",
					"campo_referencia_seccion":"dd1114"
					"script_proceso":"/mupreva/imagenes_asociadas.php"
					"quality":"original"
					}
					*/
					$this->get_button_import();
					#$propiedades = 

					
					# CSS includes
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/3.1.1/css/bootstrap.min.css';
						#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/style.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload-ui.css';

						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_tools/tool_common/css/tool_common.css';
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_tools/tool_import_images/css/tool_import_images.css';

					# CONTEXT
					$vars = array('context');foreach($vars as $name) $$name = common::setVar($name);

					$current_url = $_SERVER['REQUEST_URI'];
					$ar = explode('&', $current_url);

					$url_manage_files 	= str_replace('=form', '=files', $current_url);
					$url_import_preview = str_replace('=files','=form',  $current_url);


					switch ($context) {

						# FILES : Gestor de archivos (jquery upload)
						case 'files':

							# JS includes
								# The Templates plugin is included to render the upload/download listings
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript-templates/js/tmpl.min.js';
								# The Templates plugin is included to render the upload/download listings
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/javascript_load_image/js/load-image.min.js';

								# Bootstrap JS is not required, but included for the responsive demo navigation
								js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/3.1.1/js/bootstrap.min.js';
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
								js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_tools/tool_import_images/js/file_upload_main.js';


							# Include specific process_script
							require_once(DEDALO_LIB_BASE_PATH.'/component_tools/tool_import_images/process_script'.$this->button_import_propiedades->script_proceso);

							# IMAGES UPLOAD MANAGER
							$upload_handler_url = DEDALO_LIB_BASE_URL . '/component_tools/tool_import_images/trigger.tool_import_images.php';
							ob_start();
							include('html/jquery_upload.phtml');
							$body_html = ob_get_clean();
							break;

						
						# FORM : Carga el script em modo preview
						case 'form':
							$body_html='';
							$context_label = label::get_label('preview_de_importacion');

							# formato :
							/*
							(
							    [portal_destino] => dd1125
							    [campo_destino] => dd750
							    [campo_referencia_seccion] => dd1114
							    [script_proceso] => /mupreva/imagenes_asociadas.php
							    [quality] => original
							)
							*/

							# PROCESS SCRIPT FORM
							# OPTIONS
							$campo_destino 					= $this->button_import_propiedades->campo_destino;
							$campo_destino_name 			= RecordObj_ts::get_termino_by_tipo($campo_destino);
							$portal_destino 				= $this->button_import_propiedades->portal_destino;
							$portal_destino_name 			= RecordObj_ts::get_termino_by_tipo($portal_destino);
							$campo_referencia_seccion 		= $this->button_import_propiedades->campo_referencia_seccion;
							$campo_referencia_seccion_name 	= RecordObj_ts::get_termino_by_tipo($campo_referencia_seccion);
							$default_target_quality 		= $this->button_import_propiedades->quality;								
							$script_proceso 				= $this->process_script_folder . $this->button_import_propiedades->script_proceso;
								#dump($script_proceso);
							$ar_quality 					= unserialize(DEDALO_IMAGE_AR_QUALITY);

							# FIND_ALL_IMAGE_FILES
							$all_image_files = $this->find_all_image_files(TOOL_IMPORT_IMAGES_UPLOAD_DIR);
								#dump($all_image_files,'$all_image_files');

							# Set vars
							$vars = array('process'); foreach($vars as $name)	$$name = common::setVar($name);

							if($process==1) {

								ob_start();
								require($script_proceso);
								$body_html .= ob_get_clean();

							}else{
								# Tabla informativa de las opciones (sólo administrador)
								if(SHOW_DEBUG) {
									ob_start();
									include('html/tool_import_images_options.phtml');
									$body_html .= ob_get_clean();
								}

								ob_start();
								include('html/preview.phtml');
								$body_html .= ob_get_clean();								
							}							
							break;
						
						

						default:
							$url_manage_files = $url_manage_files.'&context=files';
							$url_import_preview = $url_import_preview.'&context=files';
							$body_html .= "<div class=\"info_line import_help\">Select option please</div>";
					}


					

					
					
				
					break; #end page
		
	}#end switch modo



	#dump($target_folder_path,'$target_folder_path');
	
	

# INCLUDE FILE HTML
$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
include($page_html);
?>