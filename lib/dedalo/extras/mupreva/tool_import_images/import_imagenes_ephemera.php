<?php
	/*
	
		IMPORT IMÁGENES EPHEMERA (ÚNICO) 
	
		NOTA: NO UTILIZAR CON OTROS RECURSOS. SOLO EPHEMERA
	*/



	/*
	{
	"tool_name":"tool_import_images",
	"context_name":"files",
	"section_tipo":"mupreva667",
	"MAIN_SECTION_TIPO":"mupreva667",
	"MAIN_PORTAL_IDENTIFY_IMAGE":"mupreva748",
	"MAIN_PORTAL_ADITIONAL_IMAGES":"mupreva749",
	"RESOURCE_SECTION_TIPO":"mupreva159",
	"RESOURCE_COMPONENT_TIPO_CODE":"mupreva1324",
	"RESOURCE_COMPONENT_TIPO_IMAGE":"mupreva660",
	"RESOURCE_COMPONENT_TIPO_PDF":"mupreva661",
	"RESOURCE_COMPONENT_TIPO_TRANSCRIPTION":"mupreva662",
	"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva663",
	"process_script":"/extras/mupreva/tool_import_images/import_imagenes_ephemera.php",
	"quality":"original",
	"initial_media_path":"/ephemera",
	"enable_selector":false
	}
	*/	
	#dump($button_import_obj,'$button_import_obj'); die();


	$propiedades = $button_import_obj->propiedades;
	#
	# VARIABLES ESPECÍFICAS DEL SCRIPT DE IMPORTACIÓN
	#
	if (!defined('MAIN_SECTION_TIPO')) {
		
		#
		# SECCIÓN 'NODRIZA' (1 POR GRUPO)
		define('MAIN_SECTION_TIPO' 					, $propiedades->MAIN_SECTION_TIPO);  # Ficha (Agrupador)
		define('MAIN_PORTAL_IDENTIFY_IMAGE'			, $propiedades->MAIN_PORTAL_IDENTIFY_IMAGE);  # Imagen/es identificativas
		define('MAIN_PORTAL_ADITIONAL_IMAGES'		, $propiedades->MAIN_PORTAL_ADITIONAL_IMAGES);  # Imágenes adicionales	
		
		#
		# SECCIÓN 'RECURSO' (1 POR IMAGEN)
		define('RESOURCE_SECTION_TIPO' 					, $propiedades->RESOURCE_SECTION_TIPO);	
		define('RESOURCE_COMPONENT_TIPO_CODE' 			, $propiedades->RESOURCE_COMPONENT_TIPO_CODE);	
		define('RESOURCE_COMPONENT_TIPO_IMAGE'			, $propiedades->RESOURCE_COMPONENT_TIPO_IMAGE);
		define('RESOURCE_COMPONENT_TIPO_PDF'			, $propiedades->RESOURCE_COMPONENT_TIPO_PDF);
		define('RESOURCE_COMPONENT_TIPO_TRANSCRIPTION' 	, $propiedades->RESOURCE_COMPONENT_TIPO_TRANSCRIPTION);		
		define('RESOURCE_COMPONENT_TIPO_PROJECT'		, $propiedades->RESOURCE_COMPONENT_TIPO_PROJECT);

		# Verify file name pattern like "1-2"
		define('VERIFY_FILE_NAME_PATTERN'				, '/(^[0-9]+)-([0-9]+).([a-zA-Z]{3,4})\z/');		
	}	

	#dump(RESOURCE_COMPONENT_TIPO_CODE_OLD, ' var'); die();

	######################################################################################################


	#
	# COMMONS IMPORT
	require(dirname(__FILE__).'/import_common.php');

	# Help
	$import_help='';
	$import_help .= "<div class=\"info_line import_help\">";	
	$import_help .= "Seleccione en su disco duro los archivos a importar";
	$import_help .= "
	- La imágenes deben estar nombradas en formato secuencial de tipo 1-1,1-2,1-3,… donde el primer número será el ID de la ficha de inventario o galería que agrupa los recursos, 
	y el segundo número será la secuencia de recursos asociados al la ficha “nodriza”. Ficheros que no sigan este formato generarán un error en la importación.
	";
	$import_help .= "</div>"; //
	$import_help = nl2br($import_help);

	#
	# GET_ADITIONAL_FORM_ELEMENTS
	# Inject specific custom elements in tool_import_images form
	# @param int current_id
	# @return string html
	#
	if(!function_exists('get_aditional_form_elements')) { function get_aditional_form_elements() {	
		return;
	}}


	#
	# VERIFY_FILE_NAME : Defined in button import propiedades
	if(!function_exists('verify_file_name')) { function verify_file_name($full_file_name) {	
		$pattern = VERIFY_FILE_NAME_PATTERN;
		preg_match($pattern, $full_file_name, $ar);
			#dump($ar, ' ar '.$full_file_name);
		if ( empty($ar[1]) || empty($ar[2]) ) {
			$pattern = '/(^[0-9]+).([a-zA-Z]{3,4})\z/';
			preg_match($pattern, $full_file_name, $ar);
			if ( empty($ar[1]) ) {
				echo "<div class=\"error\">Nombre no válido ($full_file_name). Use un formato de nombre secuencial de tipo '1-2.jpg'. El fichero será ignorado.</div>";
				return false;
			}			
		}
		return true;		
	}}


	#
	# INITIAL_MEDIA_PATH
	#
	$initial_media_path = $propiedades->initial_media_path;
	$custom_tool_label  = $button_import_obj->get_label();





/**
* USER FORM CALL
* Action called by user when submit preview form
* @see tool_import_images.php $context_name=form
*/
if ( isset($user_form_call) && $user_form_call==1 ) { //isset($_REQUEST['process']) && $_REQUEST['process']==1 && 

	#dump($_REQUEST, ' _REQUEST');#die();
	$options = new stdClass();
		$options->all_image_files 	 	= $this->find_all_image_files(TOOL_IMPORT_IMAGES_UPLOAD_DIR);	
		$options->quality 	 		 	= $_REQUEST['quality'];
		$options->initial_media_path 	= $initial_media_path;
		$options->button_import_obj 	= $button_import_obj;		
		$options->delete_after 			= $_REQUEST['delete_after'];
		$options->process 				= $_REQUEST['process'];
		$options->section_general_id 	= $_REQUEST['target_id'];	

	#dump($options, ' options'); die();
	process_folder( $options );

}//END if (isset($_REQUEST['process']) && $_REQUEST['process']==1 && isset($trigger_script) && $trigger_script==1 ) {





#
# PROCESS POST REQUEST
if(!function_exists('process_folder')){ function process_folder( $request_options ) {
		
		if(SHOW_DEBUG) {
			$start_time= start_time();
		}

		$options = new stdClass();
			$options->section_general_id 	= null;
			$options->folder_name 		 	= null;
			$options->all_image_files 	 	= null;
			$options->quality 	 		 	= null;
			$options->initial_media_path 	= null;
			$options->import_image_checkbox = array();
			$options->button_import_obj 	= null;
			$options->fotografo 			= null;
			$options->delete_after 			= null;
			$options->process 				= null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}

		$section_general_id 	= $options->section_general_id;
		$all_image_files 		= $options->all_image_files;
		$quality 				= $options->quality;
		$initial_media_path 	= $options->initial_media_path;
		$import_image_checkbox 	= $options->import_image_checkbox;
		$button_import_obj 		= $options->button_import_obj;
		$fotografo 				= $options->fotografo;
		$delete_after 			= $options->delete_after;
		$process 				= $options->process;


		$ar_verified_paths=array();
		$html='';

		$max_indentify_items_number = 1; // Número de item que se añaden al portal de identificativas
		if (isset($button_import_obj->propiedades->max_indentify_items_number)) {
			$max_indentify_items_number = $button_import_obj->propiedades->max_indentify_items_number;
		}
		#dump($max_indentify_items_number, ' max_indentify_items_number - '.to_string($button_import_obj->propiedades));die();


		# Set special php global options
		#ob_implicit_flush(true);
		set_time_limit ( 259200 );  // 3 dias
		
		# Disable logging activity and time machine # !IMPORTANT
		#logger_backend_activity::$enable_log = false;
		#RecordObj_time_machine::$save_time_machine_version = false;
		

		#
		# Processed items
			$ar_processed_items = array();
			
		/*
		#
		# VERIY IF ALREADY EXISTS ITEM IDENTIFY
		$component_portal = component_common::get_instance('component_portal',MAIN_PORTAL_IDENTIFY_IMAGE,$section_general_id,'edit',DEDALO_DATA_NOLAN,MAIN_SECTION_TIPO);
		$portal_dato = $component_portal->get_dato();
		if (empty($portal_dato)) {
			$identify_item_exists = false;
		}else{
			$identify_item_exists = true;
		}
		#dump($identify_item_exists, ' identify_item_exists - '.to_string($portal_dato));
		*/
		
		$html .= "<div class=\"wrap_response_import\">";
		
		$i=0;
		if( isset($all_image_files) && is_array($all_image_files) ) foreach ($all_image_files as $ar_group_value) {		
			#dump($ar_group_value);			
			
			# vars
			# Fichero en la carpeta temporal uploads like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/1253-2.jpg'
			$source_full_path 	= $ar_group_value['file_path'];
			# Path del fichero like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/'
			$source_path 		= $ar_group_value['dir_path'];
			# Extensión del fichero like 'jpg'
			$extension 			= $ar_group_value['extension'];
			# Nombre del fichero completo (con la extensión) like '1253-2.jpg'. Campo 'Nombre del fichero' (dd851) de la ficha de recursos:Imágenes catálogo (dd1183)
			$image_name 		= $ar_group_value['nombre_fichero_completo'];
			# Nombre del fichero sin extensión
			$nombre_fichero 	= $ar_group_value['nombre_fichero'];
				#dump($nombre_fichero, ' nombre_fichero '.$source_full_path); continue;


			# VERIFY FILE NAME ALWAYS
			if( !verify_file_name($image_name) ) {
				echo "Fichero ignorado ".$image_name." (nombre no válido)";
				continue;
			}
			if (strpos($nombre_fichero, '-')) {		// Caso normal
				$ar = explode('-', $nombre_fichero);
				if ( empty($ar[0]) || empty($ar[1]) ) {
					echo "Fichero ignorado $image_name (nombre no válido) v2";
					continue;
				}
			}else{
				$ar = array( (int)$nombre_fichero, 1);	// En casos como '1' se formatea a '1-1'
			}	
			
			$section_general_id = (int)$ar[0];
			$disparo_number 	= (int)$ar[1];
			$codigo 			= (int)$ar[0].'-'.(int)$ar[1];			
			#dump((int)$section_general_id, '$section_general_id');die();		
			
			// Se asegura de que la sección existe. Si no, la crea			
			$section_general = section::get_instance($section_general_id,MAIN_SECTION_TIPO);
			$section_general->forced_create_record();


			# 
			# ADITIONAL_PATH : aditional_path de la imagen.						
				$aditional_path	= null;	// '/'.$section_general_id;
				echo "aditional_path: $aditional_path";	
			
				

			$html .= "<div class=\"caption cabecera_ficha\"><span>Ficha $section_general_id</span> - Imagen $image_name - Procesada: ".($i+1)." de ".count($all_image_files)."</div>";			
			
			
			# Link to inventory file				
				if (!empty($section_general_id)) {
					$url='?t='.MAIN_SECTION_TIPO.'&id='.$section_general_id;
					$html .="<div class=\"btn_inside_section_buttons_container div_caption\" >";
					$html .= " <a href=\"$url\" target=\"_blank\">".label::get_label('informacion').' '.label::get_label('ficha').' '.$section_general_id;
					if(SHOW_DEBUG) {
						$html .= " [$section_general_id]";
					}
					$html .="</a>";
					$html .="</div>";
				}
			

			$html .= "<div class=\"wrap_response_ficha\">";			
			
			#dump($ar_processed_items, ' $ar_processed_items - '.$nombre_fichero);
			
			#
			# RECURSO SECTION : Creamos la nueva sección para obtener el parent de los componentes (section_id)				
				if ( array_key_exists($nombre_fichero, $ar_processed_items) ) {
					$recurso_section_id = $ar_processed_items[$nombre_fichero]['recurso_section_id'];
				}else{

					$current_section_tipo	 = RESOURCE_SECTION_TIPO; 
					$current_componente_tipo = RESOURCE_COMPONENT_TIPO_CODE;	
					$matrix_table			 = common::get_matrix_table_from_tipo($current_section_tipo);		
					$strQuery=" -- import_imagenes_catalogo : get section in imágenes asociadas
					SELECT section_id FROM \"$matrix_table\"
					WHERE
					section_tipo = '$current_section_tipo' AND 
					datos #> '{components,$current_componente_tipo,dato,lg-nolan}' @> '\"$codigo\"'::jsonb
					LIMIT 1
					";
					#dump($strQuery, 'strQuery'); die();
					$result		= JSON_RecordObj_matrix::search_free($strQuery);
					#$n_results = pg_num_rows($result);
					$section_id = (int)pg_fetch_assoc($result)['section_id'];
						#dump($section_id," section_id"); die();

					if ($section_id <1) {
						$section = section::get_instance(null,RESOURCE_SECTION_TIPO);
						$section->Save();
						$recurso_section_id = $section->get_section_id();
						$is_new_resource_section = true;
					}else{
						// Se asegura de que la sección existe. Si no, la crea			
						$section = section::get_instance($section_id,RESOURCE_SECTION_TIPO);
						//$section->forced_create_record();
						$recurso_section_id = $section->get_section_id();
						$is_new_resource_section = false;
					}					
				}
				#dump($recurso_section_id, ' recurso_section_id'); die();


				# COMPONENTES : Creamos / salvamos los compoenentes que albergan los datos necesarios
				#
					if ( !array_key_exists($nombre_fichero, $ar_processed_items) ) {
						# COMPONENT : Filtro 
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_PROJECT;	//'rsc28';	//"dd364";										
						$modelo_name 			= 'component_filter';
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO); # Already saves default project when load in edit mode
						# Already saves default project when load in edit mode

						# COMPONENT : codigo 
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_CODE;	//'rsc28';	//"dd364";
						$component_dato 		= $codigo;	# section_id del proyecto 'Catalogación' component_filter 				
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
						$current_component->set_dato($component_dato);
						$current_component->Save();
					}
					

					# PDF
					if($extension=='pdf') {
						
						# PDF. (Auto save when is called first time) . Nótese que este PDF NO es traducible
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_PDF;
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);	
						$current_component->Save();

						$pdf_id = $current_component->get_pdf_id();						

							$target_dir = DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER .$initial_media_path. '/'.DEDALO_PDF_QUALITY_DEFAULT ;
							if (!in_array($target_dir, $ar_verified_paths)) {
								if( !is_dir($target_dir) ) {									
									if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
								}
								$ar_verified_paths[] = $target_dir;								
								try {
									@chmod($target_dir, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
							}							
							# Lo copiamos asegurándonos que la extensión queda en minúsculas
							$path_copia = $target_dir .'/'. $pdf_id.'.'.DEDALO_PDF_EXTENSION;
							if (!copy($source_full_path, $path_copia)) {
							    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>" );
							}
						
						#
						# INDEX/TRANSCRIBE PDF FILE CONTENT TO TEXT AREA (ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION rsc210)
						# $value contain page number like 20-43. Using first value like '20' to start page number counter	
							$target_pdf_path = $path_copia;	
							$pagina_inicial  = 1;
							$options = new stdClass();
								$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
								$options->first_page = (int)$pagina_inicial;	# number of first page. default is 1
							$pdf_file_text = (object)tool_transcription::get_text_from_pdf( $options );
								#dump($pdf_file_text, ' pdf_file_text');
							$pdf_html = '';
							if (empty($pdf_file_text) || !isset($pdf_file_text->result) || $pdf_file_text->result=='error') {
								
								$pdf_file_url = '';	//$component_pdf->get_pdf_url();
								$pdf_html .= "<span class=\"error\">";
								$pdf_html .= "- Error in pdf to text transcription. ".$pdf_file_text->msg ;
								$pdf_html .= " (There are probably a permissions/security restriction problem like with the pdf file).";
								$pdf_html .= " Please review Document Security Content Copying options in file: <a href=\"$pdf_file_url\" target=\"_blank\" >".pathinfo($target_pdf_path)['basename']."</a>";
								$pdf_html .= "</span><br>";
							
							}else{						
							
								$component_tipo = RESOURCE_COMPONENT_TIPO_TRANSCRIPTION;
								$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
								$component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_LANG, RESOURCE_SECTION_TIPO);
								$component->set_dato( $pdf_file_text->result );
								$component->Save();								
								$pdf_html .="+ Saved pdf text ".mb_substr($pdf_file_text->result,0,160).".. as pdf transcription.<br>";
							}
							#dump($pdf_html, " pdf_html ".to_string());




					}else{
						
						# IMAGE. (Auto save when is called first time)
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_IMAGE;
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
						$current_component->Save();

						$image_id = $current_component->get_image_id();	

						#
						#
						# IMAGE COPY FILE
							$target_dir = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .$initial_media_path. '/'.$quality. $aditional_path ;
							if (!in_array($target_dir, $ar_verified_paths)) {
								if( !is_dir($target_dir) ) {									
									if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
								}
								$ar_verified_paths[] = $target_dir;								
								try {
									@chmod($target_dir, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
							}
							if( strtolower($extension) != DEDALO_IMAGE_EXTENSION ) {

								$path_copia = $target_dir .'/'. $image_id .'.'. strtolower($extension);
								# Copiamos el original
								if (!copy($source_full_path, $path_copia)) {
								    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>");
								}
								# JPG : la convertimos a jpg
								$orginal_jpg_path = $target_dir .'/'. $image_id .'.'. DEDALO_IMAGE_EXTENSION;
								ImageMagick::convert($path_copia, $orginal_jpg_path );								
								try {
									@chmod($path_copia, 0777);
									@chmod($orginal_jpg_path, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
								$html .= "<div class=\"info_line alert_icon\">La imagen de origen NO es jpg ($extension). Copiado el fichero y creada versión jpg en destino </div>";

							}else{
								# Lo copiamos asegurándonos que la extensión queda en minúsculas
								$path_copia = $target_dir .'/'. $image_id.'.'.DEDALO_IMAGE_EXTENSION;
								if (!copy($source_full_path, $path_copia)) {
								    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>" );
								}
								$orginal_jpg_path = $path_copia;
								try {
								    @chmod($path_copia, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
												
							}
							
							#dump($source_full_path, ' source_full_path - '.$path_copia);
					


						#
						#
						# COPIA ADEMÁS, LA IMAGEN ORIGINAL (JPG) A MODIFICADA. Esto sirve de punto de partida para editarla
							$target_dir = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . $initial_media_path . '/modificada'. $aditional_path ;
							if (!in_array($target_dir, $ar_verified_paths)) {
								if( !is_dir($target_dir) ) {						
									if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
								}
								$ar_verified_paths[] = $target_dir;								
								try {
								   @chmod($target_dir, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
							}
							$path_copia = $target_dir .'/'. $image_id.'.'.DEDALO_IMAGE_EXTENSION;
							if (!copy($orginal_jpg_path, $path_copia)) {
							    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$orginal_jpg_path." a ".$path_copia."</div>" );
							}
							try {
								@chmod($path_copia, 0777);
							} catch (Exception $e) {
								debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
							}


						#
						#
						# DEFAULT : Creamos la versión 'default'				

							# DEFAULT 
							$ImageObj				= new ImageObj($image_id, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
							$image_default_path 	= $ImageObj->get_local_full_path();
								#dump($image_default_path, ' image_default_path');
							
							# MODIFICADA : Si ya existe image modificada, NO generaremos la versión default
							#$ImageObj				= new ImageObj($image_id, 'modificada', $aditional_path, $initial_media_path);
							#$image_modificada_path 	= $ImageObj->get_local_full_path();

							if( 
								($quality!=DEDALO_IMAGE_QUALITY_DEFAULT ) # No estamos en 1.5MB y no existe la original //&& !file_exists($image_modificada_path)
								|| !file_exists($image_default_path) # Ó no existe la default
							) {
								
								$source_image 	= $target_dir .'/'. $image_id.'.'.DEDALO_IMAGE_EXTENSION ;		#dump($source_image, ' source_image');
								$source_quality = $quality;
								$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

								# Image source
								$ImageObj				= new ImageObj($image_id, $source_quality, $aditional_path, $initial_media_path);
								$source_image 			= $ImageObj->get_local_full_path();		#dump($source_image, ' source_image');
								$source_pixels_width	= $ImageObj->get_image_width();
								$source_pixels_height	= $ImageObj->get_image_height();
									#dump($ImageObj,'ImageObj');
									#dump($source_image,"source_image $source_pixels_width x $source_pixels_height");

								# Image target
								$ImageObj				= new ImageObj($image_id, $target_quality, $aditional_path, $initial_media_path);
								$target_image 			= $ImageObj->get_local_full_path();
								$ar_target 				= ImageObj::get_target_pixels_to_quality_conversion($source_pixels_width, $source_pixels_height, $target_quality);
								$target_pixels_width 	= $ar_target[0];
								$target_pixels_height 	= $ar_target[1];
									#dump($target_image,"target_image $target_pixels_width x $target_pixels_height");

								# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)				
								$target_dir = $ImageObj->get_media_path_abs() ;
								if (!in_array($target_dir, $ar_verified_paths)) {
									if( !is_dir($target_dir) ) {
										if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory \"$target_quality\". Permission denied $target_dir (2)");							
									}
									$ar_verified_paths[] = $target_dir;									
									try {
										@chmod($target_dir, 0777);
									} catch (Exception $e) {
										debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
									}
								}
								
								#
								# Thumb
								#if (file_exists($target_image)) {
								#	$html .= "<div class=\"info_line alert_icon\">Reemplazada la miniatura existente de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") por la miniatura creada desde '$source_quality'</div>";
								#}

								if($target_pixels_width<1)  $target_pixels_width  = 720;
								if($target_pixels_height<1) $target_pixels_height = 720;

								$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height ;
								ImageMagick::convert($source_image, $target_image, $flags);
									#dump($flags,"$source_image, $target_image");
								#shell_exec( MAGICK_PATH . "convert \"$source_image\" $flags \"$target_image\" ");								
								try {
									@chmod($target_image, 0777);
								} catch (Exception $e) {
									debug_log(__METHOD__." Error on ".$e->getMessage(), logger::ERROR);
								}
								if(SHOW_DEBUG) {
									#$partial_time 	= exec_time_unit($continue_time, $unit='sec');
									#echo "Partial time 4.5 $partial_time <br>";
								}

								# Actualizamos la mniatura
								//sleep(1);
								usleep(120000);

								# THUMB RECREATE
								if (file_exists($target_image)) {		

									$ImageObj			= new ImageObj($image_id, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);
									$image_thumb_path 	= $ImageObj->get_local_full_path();
									try {
										if(file_exists($image_thumb_path)) {
											unlink($image_thumb_path);
										}
									} catch (Exception $e) {
										if(SHOW_DEBUG) {
											error_log($e);
										}
									}
									ImageMagick::dd_thumb( 'list', $target_image, $image_thumb_path, false, $initial_media_path); 	// dd_thumb( $mode, $source_file, $target_file, $dimensions="102x57", $initial_media_path)
								}else{
									$html .= "ERROR: La imagen default no existe. NO puedo hacer la miniatura...";
								}#end if (file_exists($target_image))
								

							
							#
							# IMAGE. (Auto save when is called without id)
							# Save now image for get proper thumb image in valor_list
							$component_tipo 		= RESOURCE_COMPONENT_TIPO_IMAGE;	//'rsc29'; 	//"dd750";
							$component_dato 		= null;
							$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
							$current_component->Save();
							

							$html .= "<div class=\"info_line \">Creada la imagen de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") desde '$source_quality'</div>";		

						}else{
							#$html .= "<div class=\"info_line \">No se creó imagen de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") puesto que ya existe</div>";	
						}#end if($quality!=DEDALO_IMAGE_QUALITY_DEFAULT)

					}//end extension==pdf								
					

			

			
			#
			#
			# PORTAL : Si se ha creado un registro de portal porque no existía, 
			# buscamos la sección de inventario, sus portales y enlazamos el recurso al portal correspondiente
			#
				$add_element_to_portal=true;

				# Vemos si ya está incluida de una importación anterior	
				$component_tipo   = MAIN_PORTAL_IDENTIFY_IMAGE;	
				$modelo_name 	  = 'component_portal';							
				$component_portal = component_common::get_instance($modelo_name, $component_tipo, $section_general_id, 'edit', DEDALO_DATA_NOLAN, MAIN_SECTION_TIPO);					
				$component_dato1  = $component_portal->get_dato();

				$component_tipo   = MAIN_PORTAL_ADITIONAL_IMAGES;	
				$modelo_name 	  = 'component_portal';							
				$component_portal = component_common::get_instance($modelo_name, $component_tipo, $section_general_id, 'edit', DEDALO_DATA_NOLAN, MAIN_SECTION_TIPO);					
				$component_dato2  = $component_portal->get_dato();
				
				$ar_locators = array_merge( (array)$component_dato1, (array)$component_dato2 );
				foreach ($ar_locators as $key => $current_locator) {
					if (isset($current_locator->section_id) && $current_locator->section_id==$recurso_section_id) {
						$add_element_to_portal=false;
						break;
					}
				}

			if ( !array_key_exists($nombre_fichero, $ar_processed_items) ) {
				# IMAGEN IDENTIFICATIVA
				if ( $disparo_number<=$max_indentify_items_number && $add_element_to_portal) {
					# DOCUMENTACIÓN ASOCIADA -> IMAGEN IDENTIFICATIVA  (PORTAL)
					$component_tipo   = MAIN_PORTAL_IDENTIFY_IMAGE;	//'mupreva17';	//"dd1125";			
					$modelo_name 	  = 'component_portal';
					# Locator
					$locator = new locator();
						$locator->set_section_id($recurso_section_id);
						$locator->set_section_tipo(RESOURCE_SECTION_TIPO);			
					$component_portal = component_common::get_instance($modelo_name, $component_tipo, $section_general_id, 'edit', DEDALO_DATA_NOLAN, MAIN_SECTION_TIPO);
					$component_portal->add_locator($locator);
					$component_dato = $component_portal->get_dato();		
					$component_portal->Save();
					if(SHOW_DEBUG) {
						#$debug_msg[] = "Saved $modelo_name $component_tipo (section ".MAIN_SECTION_TIPO." : $recurso_section_id) ".json_encode($component_dato); 
					}
					
					$html .= "<div class=\"info_line\">Añadido recurso $recurso_section_id de item identificativo </div>";
					
					$identify_item_exists = true;					

				# OTRAS IMÁGENES		
				}else if ($add_element_to_portal) {
					# DOCUMENTACIÓN ASOCIADA -> IMÁGENES  (PORTAL)
					# COMPONENT : portal de Documemntación asociada / imagenes 'dd1125'
					$component_tipo   = MAIN_PORTAL_ADITIONAL_IMAGES;	//'mupreva17';	//"dd1125";			
					$modelo_name 	  = 'component_portal';
					# Locator
					$locator = new locator();
						$locator->set_section_id($recurso_section_id);
						$locator->set_section_tipo(RESOURCE_SECTION_TIPO);			
					$component_portal = component_common::get_instance($modelo_name, $component_tipo, $section_general_id, 'edit', DEDALO_DATA_NOLAN, MAIN_SECTION_TIPO);
					$component_portal->add_locator($locator);
					$component_dato = $component_portal->get_dato();		
					$component_portal->Save();
					
					$html .= "<div class=\"info_line\">Añadido recurso $recurso_section_id de item adicional </div>";					
				}		
			}//end if ( !array_key_exists($nombre_fichero, $ar_processed_items) ) {
			

			
			# DELETE AFTER
			if ($delete_after=='si') {
				unlink($source_full_path);
				$html .= "<div class=\"info_line\">Eliminada la imagen de partida ".$image_name." de la carpeta de importación</div>";
			}

			
			#
			# INFORMACIÓN DE LA IMPORTACIÓN DE ESTA IMAGEN
				if ($extension=='pdf') {
					$PdfObj			= new PdfObj($pdf_id, 'standar', $aditional_path, $initial_media_path);
					$img_url		= $PdfObj->get_url();				
					$pdf   			= "<a href=\"$img_url\" target=\"_blank\">PDF</a> ";				
					$html 		   .= $pdf;
				}else{
					$ImageObj		= new ImageObj($image_id, 'original', $aditional_path, $initial_media_path);
					$img_url		= $ImageObj->get_url();				
					$img   			= "<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" class=\"image_preview\" /></a> ";				
					$html 		   .= $img;
				}
				
				$html 		   .= "<hr>";
				
			$html .= "</div>"; #end wrap_response_ficha
			
			$ar_processed_items[$nombre_fichero] = array('recurso_section_id'=>$recurso_section_id); # IMPORTANTE
			$i++; # IMPORTANTE
		}#end foreach ($all_image_files as $ar_group_value)
		
		
		# VOLVER BUTTON
		#$html .= "\n <div class=\"css_button_generic button_back link\" onclick=\"window.history.back();\">";
		#$html .= label::get_label('volver') ;
		#$html .= "</div>";

		$html .= "</div>";#end class=\"wrap_response_import\"


		# Enable logging activity and time machine # !IMPORTANT
		#logger_backend_activity::$enable_log = true;
		#RecordObj_time_machine::$save_time_machine_version = true;

		if ($process==1) {
			echo $html;
		}

}}// end function process



$loaded_import_custom = true;






/**
* IMPORT FOLDER (ADMIN ONLY)
*/
if(!empty($_REQUEST['import_folder'])) {
	die("stop: desactivo");
	$exclude_folders = array('nombre_a_excluir');

	$base_dir 	 = strpos(DEDALO_HOST, '8888')!==false ? '/Users/paco/TEST' : '/prehistoria/sisisn11/Fotografia/Digital';
	$folder_name = $_REQUEST['dir'];
	$folder   	 = '';// isset($_REQUEST['folder']) ? '/'.trim($_REQUEST['folder']) : '';
	$dir 	  	 = $base_dir . $folder .'/'. $folder_name.''; # Like '718_2009_04_28_Inaguracion_Sala_Numismatica_AD'
	
	$root = scandir($dir);
		#dump($root, ' root '.$dir);
		if (!$root) {
			die("Acceso de negado al directorio $dir");
		}
	natsort($root);	
	$new_root = $root;	
	/**/
	$n=1;
	foreach ($root as $key => $value) {
		$ar_data=array();
		if(is_dir("$dir/$value") && $value!='.' && $value!='..') {

			echo "<hr><h1>$n - $value </h1><br>";
			
			$folder_name = $value;
			
			$new_root = scandir("$dir/$value");
			if (!$new_root) {
				echo "Acceso denegado al directorio $dir . Ignorado el directorio ($folder_name)";
				continue;
			}
			natsort($new_root);

			if (in_array($folder_name, $exclude_folders)) {
				echo "Excluido el directorio $folder_name . Ignorado el directorio ($folder_name) ".to_string($exclude_folders);
				continue;
			}
		
			$valid_extensions = array('jpg','jpeg','tif','tiff','psd','bmp','png','psd');
			$a=1;
			foreach($new_root as $current_value) {
				# Skip non valid extensions
				$file_parts = pathinfo($current_value);					
				if(empty($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $valid_extensions)) continue;		
				# Case file
					#scandir(directory)dump(is_file("$dir/$folder_name/$current_value"), " $dir/$folder_name/$current_value ".to_string());
				if(is_file("$dir/$folder_name/$current_value")) {
					$ar_data[] = tool_import_images::get_file_data_static("$dir/$folder_name/", $current_value);
					echo "$a - $current_value <br>";
				}
				$a++;
			}
			$all_image_files 		= $ar_data;
			$import_image_checkbox  = array_keys($all_image_files);
				#dump($all_image_files, " all_image_files for $dir/$folder_name".to_string());die();
			
			# Section id
			#preg_match($regex, $_REQUEST['dir'], $output_array); 	#dump($output_array, " output_array ".to_string());
			preg_match($regex, $folder_name, $output_array);
			$section_general_id = (int)$output_array[1];
			if ($section_general_id<1) {
				#die("section_general_id is empty");
				echo "<h2 style=\"color:red\">section_general_id is empty. Ignorado el directorio ($folder_name) </h2>";
				#dump($section_general_id, "Galería section_id ".to_string()); #die();
				continue;
			}

			#dump($all_image_files, ' all_image_files '.$recurso_section_id);#die();
			#die("STOP");

			$options = new stdClass();
				$options->section_general_id 	= $section_general_id;
				$options->folder_name 		 	= $folder_name;		#dump($folder_name, " folder_name ".to_string());
				$options->all_image_files 	 	= $all_image_files;
				$options->import_image_checkbox = $import_image_checkbox;
				$options->quality 	 		 	= 'original';
				$options->initial_media_path 	= $initial_media_path;
				$options->button_import_obj 	= null;
				$options->fotografo 			= null;
				$options->delete_after 			= 'no';

			if(SHOW_DEBUG) {
				echo " <br>Galería id $section_general_id que va... ";	;
			}
			
			if ($_REQUEST['import_folder']=='real') {
				echo "process_folder working.. <hr>";
				process_folder( $options );		
			}else{
				echo "Preview only (set import_folder=real to exec)<hr>";
			}						

		$n++;
		}//end if(is_dir("$dir/$value") && $value!='.' && $value!='..') {
		
	}//end foreach ($root as $key => $value) {
	echo "<br><br><h1 style=\"color:green\">THE END</h1><br><br>";

}//if(!empty($_REQUEST['import']) && $_REQUEST['import']==1)



