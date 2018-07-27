<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
#$session_duration_hours = 18;
#require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



	# CONTROLLER TOOL

	# Por compatibilidad temporal con tool_common, partimos de $this->component_obj, aunque estamos trabajando con una sección
	$section_obj 		= $this->component_obj;

	$tipo 				= $section_obj->get_tipo();
	$section_tipo 		= $tipo;
	$modo 				= $this->get_modo();
	$context_name		= common::setVar('context_name');
	#$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($tipo);
	$tool_name 			= get_class($this);

	$file_name	= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	

	switch($modo) {	
		
		case 'button':												
					break;

		case 'page':
					$body_html='';
					# Fix parameters
					$button_import_obj = $this->get_button_import_obj();

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
					"tool_name":"tool_import_images",
					"inventario_tipo":"mupreva1",
					"portal_destino":"mupreva17",
					"campo_destino":"rsc29",
					"campo_referencia_seccion":"mupreva13",
					"process_script":"/extras/mupreva/tool_import_images/import_imagenes_catalogo.php",
					"quality":"original"
					}
					*/
					$this->get_button_import();	// Fix propiedades from button
					#$propiedades = 
					#dump($button_import_obj, ' button_import_obj');

					
					# CSS includes
						#css::$ar_url[] = BOOTSTRAP_CSS_URL;
						array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
						#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/style.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/blueimp-gallery/css/blueimp-gallery.min.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload.css';
						css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jQuery-File-Upload/css/jquery.fileupload-ui.css';

						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/css/tool_common.css';
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_images/css/tool_import_images.css';

					# CONTEXT
					$vars = array('context');foreach($vars as $name) $$name = common::setVar($name);

					$current_url = $_SERVER['REQUEST_URI'];
					$ar = explode('&', $current_url);

					$url_manage_files 	= str_replace('=form', '=files', $current_url);
					$url_import_preview = str_replace('=files','=form',  $current_url);


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
								js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_images/js/file_upload_main.js';


							# Include specific process_script
							if (isset($this->button_import_propiedades->process_script)) {
								require_once(DEDALO_LIB_BASE_PATH . $this->button_import_propiedades->process_script);
							}							
							
							# IMAGES UPLOAD MANAGER
							$button_tipo = common::setVar('button_tipo',''); # Needed for build var 'upload_dir_custom'
							$upload_handler_url = DEDALO_LIB_BASE_URL . '/tools/tool_import_images/trigger.tool_import_images.php?button_tipo='.$button_tipo.'&top_tipo='.TOP_TIPO;
							ob_start();
							include('html/jquery_upload.phtml');
							$body_html = ob_get_clean();
							break;

						
						# FORM : Carga el script em modo preview
						case 'form':
							$body_html='';
							$context_label = label::get_label('preview_de_importacion');

							js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_import_images/js/tool_import_images.js';

							# Include specific process_script
							if (isset($this->button_import_propiedades->process_script)) {
								require_once(DEDALO_LIB_BASE_PATH . $this->button_import_propiedades->process_script);
							}	

							# formato :
							/*
							(
							    [portal_destino] => dd1125
							    [campo_destino] => dd750
							    [campo_referencia_seccion] => dd1114
							    [process_script] => /mupreva/imagenes_asociadas.php
							    [quality] => original
							)
							*/

							# PROCESS SCRIPT FORM
							# OPTIONS
							/*
							$campo_destino 					= $this->button_import_propiedades->campo_destino;
							$campo_destino_name 			= RecordObj_dd::get_termino_by_tipo($campo_destino);
							$portal_destino 				= $this->button_import_propiedades->portal_destino;
							$portal_destino_name 			= RecordObj_dd::get_termino_by_tipo($portal_destino);
							$campo_referencia_seccion 		= $this->button_import_propiedades->campo_referencia_seccion;
							if ($campo_referencia_seccion=='section_id') {
								$campo_referencia_seccion_name 	= $campo_referencia_seccion;
							}else{
								$campo_referencia_seccion_name 	=  RecordObj_dd::get_termino_by_tipo($campo_referencia_seccion);
							}
							*/
							

							$default_target_quality 		= $this->button_import_propiedades->quality;								
							$process_script 				= DEDALO_LIB_BASE_PATH . $this->button_import_propiedades->process_script;
								#dump($process_script);
							$ar_quality 					= unserialize(DEDALO_IMAGE_AR_QUALITY);
							


							# Set vars
							$vars = array('process'); foreach($vars as $name) 
								$$name = common::setVar($name);

							if($process==1) {
								$user_form_call=1;
								ob_start();
								require($process_script);
								$body_html .= ob_get_clean();

							}else{

								# FIND_ALL_IMAGE_FILES
								$all_image_files = $this->find_all_image_files(TOOL_IMPORT_IMAGES_UPLOAD_DIR);
									#dump($all_image_files,'$all_image_files');

								# Tabla informativa de las opciones (sólo administrador)
								if(SHOW_DEBUG) {
									ob_start();
									include('html/tool_import_images_options.phtml');
									$body_html .= ob_get_clean();
								}

								# Preview html
								ob_start();
								include('html/preview.phtml');
								$body_html .= ob_get_clean();							
							}							
							break;
						
						

						default:
							$url_manage_files = $url_manage_files.'&context_name=files';
							$url_import_preview = $url_import_preview.'&context_name=files';
							$body_html .= "<div class=\"info_line import_help\">Select option please</div>";
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