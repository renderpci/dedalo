<?php
	/*
	
		IMPORT IMÁGENES GENERICO .PHP
	
	*/


	/* reference button
		{
			"tool_name":"tool_import_images",
			"context_name":"files",
			"inventario_tipo":"mupreva473",
			"portal_destino":"mupreva483",
			"campo_destino":"mupreva212",
			"campo_referencia_seccion":"section_id",
			"process_script":"/extras/mupreva/tool_import_images/import_imagenes_galeria_digital.php",
			"quality":"original",
			"section_tipo":"mupreva473"
		}
	*/

/*
{
"tool_name":"tool_import_images",
"context_name":"files",
"section_tipo":"mupreva1",
"MAIN_SECTION_TIPO":"mupreva1",
"MAIN_PORTAL_IDENTIFY_IMAGE":"mupreva14",
"MAIN_PORTAL_ADITIONAL_IMAGES":"mupreva17",
"RESOURCE_SECTION_TIPO":"mupreva21",
"RESOURCE_COMPONENT_TIPO_IMAGE":"mupreva212",
"RESOURCE_COMPONENT_TIPO_DIRECTORY":"mupreva214",
"RESOURCE_COMPONENT_TIPO_FILENAME":"mupreva215",
"RESOURCE_COMPONENT_TIPO_CODE":"mupreva203",
"RESOURCE_COMPONENT_TIPO_CODE_OLD":"mupreva204",
"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva210",
"RESOURCE_COMPONENT_TIPO_AUTHOR":"mupreva220",
"RESOURCE_COMPONENT_DATE_CAPTURE":"mupreva219",
"process_script":"/extras/mupreva/tool_import_images/import_imagenes_generico.php",
"quality":"original",
"initial_media_path","catalogo"
}

{
"tool_name":"tool_import_images",
"context_name":"files",
"inventario_tipo":"mupreva1",
"portal_destino":"mupreva17",
"campo_destino":"mupreva212",
"campo_referencia_seccion":"mupreva13",
"process_script":"/extras/mupreva/tool_import_images/import_imagenes_catalogo.php",
"quality":"original",
"section_tipo":"mupreva1"
}

{
"tool_name":"tool_import_images",
"context_name":"files",
"section_tipo":"mupreva1",
"MAIN_SECTION_TIPO":"mupreva1",
"MAIN_PORTAL_IDENTIFY_IMAGE":"mupreva151",
"MAIN_PORTAL_ADITIONAL_IMAGES":"mupreva152",
"RESOURCE_SECTION_TIPO":"mupreva120",
"RESOURCE_COMPONENT_TIPO_IMAGE":"mupreva212",
"RESOURCE_COMPONENT_TIPO_DIRECTORY":"mupreva214",
"RESOURCE_COMPONENT_TIPO_FILENAME":"mupreva215",
"RESOURCE_COMPONENT_TIPO_CODE":"mupreva203",
"RESOURCE_COMPONENT_TIPO_CODE_OLD":"mupreva204",
"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva210",
"RESOURCE_COMPONENT_TIPO_AUTHOR":"mupreva753",
"RESOURCE_COMPONENT_DATE_CAPTURE":"mupreva207",
"process_script":"/extras/mupreva/tool_import_images/import_imagenes_generico.php",
"quality":"original",
"initial_media_path":"/dibujos_catalogo",
"aditional_path":"numero_to_local_path"
}

{
"tool_name":"tool_import_images",
"context_name":"files",
"section_tipo":"mupreva710",
"MAIN_SECTION_TIPO":"mupreva710",
"MAIN_PORTAL_IDENTIFY_IMAGE":"mupreva728",
"MAIN_PORTAL_ADITIONAL_IMAGES":"mupreva729",
"RESOURCE_SECTION_TIPO":"mupreva22",
"RESOURCE_COMPONENT_TIPO_IMAGE":"mupreva212",
"RESOURCE_COMPONENT_TIPO_DIRECTORY":"mupreva214",
"RESOURCE_COMPONENT_TIPO_FILENAME":"mupreva215",
"RESOURCE_COMPONENT_TIPO_CODE":"mupreva203",
"RESOURCE_COMPONENT_TIPO_CODE_OLD":"mupreva204",
"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva210",
"RESOURCE_COMPONENT_TIPO_AUTHOR":"mupreva220",
"RESOURCE_COMPONENT_DATE_CAPTURE":"mupreva219",
"process_script":"/extras/mupreva/tool_import_images/import_imagenes_generico.php",
"quality":"original",
"initial_media_path":"/diapositivas",
"aditional_path":"numero_to_local_path"
}


{
"tool_name":"tool_import_images",
"context_name":"files",
"section_tipo":"mupreva770",
"MAIN_SECTION_TIPO":"mupreva770",
"MAIN_PORTAL_IDENTIFY_IMAGE":"mupreva790",
"MAIN_PORTAL_ADITIONAL_IMAGES":"mupreva791",
"RESOURCE_SECTION_TIPO":"mupreva123",
"RESOURCE_COMPONENT_TIPO_IMAGE":"mupreva212",
"RESOURCE_COMPONENT_TIPO_DIRECTORY":"mupreva214",
"RESOURCE_COMPONENT_TIPO_FILENAME":"mupreva215",
"RESOURCE_COMPONENT_TIPO_CODE":"mupreva203",
"RESOURCE_COMPONENT_TIPO_CODE_OLD":"mupreva204",
"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva210",
"RESOURCE_COMPONENT_TIPO_AUTHOR":"mupreva220",
"RESOURCE_COMPONENT_DATE_CAPTURE":"mupreva219",
"process_script":"/extras/mupreva/tool_import_images/import_imagenes_generico.php",
"quality":"original",
"initial_media_path":"/restauracion",
"aditional_path":"numero_to_local_path"
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
		define('RESOURCE_SECTION_TIPO' 				, $propiedades->RESOURCE_SECTION_TIPO);	
		define('RESOURCE_COMPONENT_TIPO_IMAGE'		, $propiedades->RESOURCE_COMPONENT_TIPO_IMAGE);	
		define('RESOURCE_COMPONENT_TIPO_DIRECTORY'	, $propiedades->RESOURCE_COMPONENT_TIPO_DIRECTORY);	
		define('RESOURCE_COMPONENT_TIPO_FILENAME'	, $propiedades->RESOURCE_COMPONENT_TIPO_FILENAME);
		define('RESOURCE_COMPONENT_TIPO_CODE'		, $propiedades->RESOURCE_COMPONENT_TIPO_CODE);
		define('RESOURCE_COMPONENT_TIPO_CODE_OLD'	, $propiedades->RESOURCE_COMPONENT_TIPO_CODE_OLD);
		define('RESOURCE_COMPONENT_TIPO_PROJECT'	, $propiedades->RESOURCE_COMPONENT_TIPO_PROJECT);	
		define('RESOURCE_COMPONENT_DATE_CAPTURE'	, $propiedades->RESOURCE_COMPONENT_DATE_CAPTURE);
		define('RESOURCE_COMPONENT_TIPO_AUTHOR'		, $propiedades->RESOURCE_COMPONENT_TIPO_AUTHOR);		
		define('RESOURCE_COMPONENT_ACTIVE_WEB'		, $propiedades->RESOURCE_COMPONENT_ACTIVE_WEB);	

		define('TARGET_QUALITY'						, 'modificada');
		define('VERIFY_FILE_NAME_PATTERN'			, "/(^[0-9]+)-([0-9]+).([a-zA-Z]{3,4})\z/");
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
	- Sólo se modificará la imagen de calidad 'modificada' sobrescribiendo la actual y actualizando la versión '1.5MB' y la miniatura (thumb). 
	El nombre debe ser de tipo '1-11.jpg', la extensión puede ser de cualquier tipo .jpg, .png, .psd, etc...
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


	if (strpos($initial_media_path, '/')===false) {
		$initial_media_path = '/'.$initial_media_path;
	}


/**
* USER FORM CALL
* Action called by user when submit preview form
* @see tool_import_images.php $context_name=form
*/
if ( isset($user_form_call) && $user_form_call==1 ) { //isset($_REQUEST['process']) && $_REQUEST['process']==1 && 

	#dump($_REQUEST, ' _REQUEST');#die();
	$options = new stdClass();				
		#$options->folder_name 		 	= $folder_name;
		$options->all_image_files 	 	= $this->find_all_image_files(TOOL_IMPORT_IMAGES_UPLOAD_DIR);
		$options->import_image_checkbox = $_REQUEST['import_image_checkbox'];
		$options->quality 	 		 	= TARGET_QUALITY;
		$options->initial_media_path 	= $initial_media_path;
		$options->button_import_obj 	= $button_import_obj;
		#$options->author 				= $_REQUEST['author'];
		$options->delete_after 			= $_REQUEST['delete_after'];
		$options->process 				= $_REQUEST['process'];
		$options->section_general_id 	= $_REQUEST['target_id'];

	#dump($options, ' options');
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
			#$options->author 				= null;
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
		#$author 				= $options->author;
		$delete_after 			= $options->delete_after;
		$process 				= $options->process;

		#dump($section_general_id, " section_general_id ".to_string()); return;
		#dump($all_image_files, ' all_image_files');
		// Remove no selected images (checkbox preview page)
		if($process==1) foreach ((array)$all_image_files as $key => $current_value) {
			if (!in_array($key, $import_image_checkbox)) {
				unset($all_image_files[$key]);
			}
		}
		#dump($all_image_files, ' all_image_files'); die();

		$ar_verified_paths=array();
		$html='';

		

		# Set special php global options
		#ob_implicit_flush(true);
		set_time_limit ( 259200 );  // 3 dias
		
		# Disable logging activity and time machine # !IMPORTANT
		#logger_backend_activity::$enable_log = false;
		#RecordObj_time_machine::$save_time_machine_version = false;

		

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
			# Nombre del fichero like '1253-2.jpg'. Campo 'Nombre del fichero' (dd851) de la ficha de recursos:Imágenes catálogo (dd1183)
			$image_name 		= $ar_group_value['nombre_fichero_completo'];
			# Nombre del fichero sin extensión
			$nombre_fichero 	= $ar_group_value['nombre_fichero'];
				#dump($nombre_fichero, ' nombre_fichero '.$source_full_path); continue;
			
			# VERIFY FILE NAME ALWAYS
			if( !verify_file_name($image_name) ) {
				echo "Fichero ignorado ".$image_name." (nombre no válido)";
				continue;
			}
			if (strpos($nombre_fichero, '-')!==false) {		// Caso normal
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


			$aditional_path	= '/'.$section_general_id;

				
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
			
			
			
					

			#
			#
			# IMAGE COPY FILE
				$target_dir = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .$initial_media_path. '/'.$quality. $aditional_path ;
				if (!in_array($target_dir, $ar_verified_paths)) {
					if( !is_dir($target_dir) ) {
						$create_dir 	= mkdir($target_dir, 0777,true);
						if(!$create_dir) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
					}
					$ar_verified_paths[] = $target_dir;
					chmod($target_dir, 0777);
				}
				if( strtolower($extension) != DEDALO_IMAGE_EXTENSION ) {

					//$html .= "<div class=\"info_line alert_icon\">Error. La imagen de origen NO es jpg ($extension). Sólo puede cargar imágenes en formato jpg como 'modificadas'</div>";

					$path_copia = $target_dir .'/'. $codigo .'.'. strtolower($extension);
					# Copiamos el original
					if (!copy($source_full_path, $path_copia)) {
					    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>");
					}
					# JPG : la convertimos a jpg
					$orginal_jpg_path = $target_dir .'/'. $codigo .'.'. DEDALO_IMAGE_EXTENSION;
					ImageMagick::convert($path_copia, $orginal_jpg_path );
					chmod($path_copia, 0777);
					chmod($orginal_jpg_path, 0777);
					$html .= "<div class=\"info_line alert_icon\">La imagen de origen NO es jpg ($extension). Copiado el fichero y creada versión jpg en destino </div>";

				}else{
					# Lo copiamos asegurándonos que la extensión queda en minúsculas
					$path_copia = $target_dir .'/'. $codigo.'.'.DEDALO_IMAGE_EXTENSION;
					if (!copy($source_full_path, $path_copia)) {
					    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>" );
					}
					$orginal_jpg_path = $path_copia;
					chmod($orginal_jpg_path, 0777);					
				}
				#dump($source_full_path, ' source_full_path - '.$path_copia);
		
				


			#
			#
			# DEFAULT : Creamos la versión 'default'				

				# DEFAULT 
				$ImageObj				= new ImageObj($codigo, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path, $initial_media_path);
				$image_default_path 	= $ImageObj->get_local_full_path();
					#dump($image_default_path, ' image_default_path');

				
					
					$source_image 	= $target_dir .'/'. $codigo.'.'.DEDALO_IMAGE_EXTENSION ;		#dump($source_image, ' source_image');
					$source_quality = $quality;
					$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

					# Image source
					$ImageObj				= new ImageObj($codigo, $source_quality, $aditional_path, $initial_media_path);
					$source_image 			= $ImageObj->get_local_full_path();		#dump($source_image, ' source_image');
					$source_pixels_width	= $ImageObj->get_image_width();
					$source_pixels_height	= $ImageObj->get_image_height();
						#dump($ImageObj,'ImageObj');
						#dump($source_image,"source_image $source_pixels_width x $source_pixels_height");

					# Image target
					$ImageObj				= new ImageObj($codigo, $target_quality, $aditional_path, $initial_media_path);
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
						chmod($target_dir, 0777);
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
					
					chmod($target_image, 0777);
					if(SHOW_DEBUG) {
						#$partial_time 	= exec_time_unit($continue_time, $unit='sec');
						#echo "Partial time 4.5 $partial_time <br>";
					}

					# Actualizamos la mniatura
					//sleep(1);
					usleep(120000);

					# THUMB RECREATE
					if (file_exists($target_image)) {		

						$ImageObj			= new ImageObj($codigo, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path, $initial_media_path);
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
			# UPDATE VALOR_LIST
				#
				# RECURSO ID
					$matrix_table = common::get_matrix_table_from_tipo(RESOURCE_SECTION_TIPO);
					$strQuery="
					SELECT 
					section_id, datos #>>'{components,".RESOURCE_COMPONENT_TIPO_CODE.",dato,lg-nolan}' as codigo
					FROM \"$matrix_table\"
					WHERE
					section_tipo = '".RESOURCE_SECTION_TIPO."' AND 
					-- datos #>>'{components,".RESOURCE_COMPONENT_TIPO_CODE.",dato,lg-nolan}' = '{$codigo}'
					datos #>'{components,".RESOURCE_COMPONENT_TIPO_CODE.",dato}' @> '{\"lg-nolan\":\"$codigo\"}'::jsonb
					ORDER BY section_id DESC
					LIMIT 1
					";
					#dump($strQuery, 'strQuery'); #die();			
					$result		= JSON_RecordObj_matrix::search_free($strQuery);	
					$recurso_section_id = null;
					while ($rows = pg_fetch_assoc($result)) {
						$codigo = $rows['codigo'];
						if (strpos($codigo, '-')) {
							$ar_parts = explode('-', $codigo);
							$recurso_section_id = intval( $ar_parts[1] ); 	# Like 4 from '45000-4'
						}
					}
					#dump($recurso_section_id, ' recurso_section_id '.$strQuery);
					#die();
					#
					# IMAGE. (Auto save when is called without id)
					# Save now image for get proper thumb image in valor_list
					if (!empty($recurso_section_id)) {
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_IMAGE;	//'rsc29'; 	//"dd750";
						$component_dato 		= null;
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
						$current_component->Save();
					}
					

			
			# DELETE AFTER
			if ($delete_after=='si') {
				unlink($source_full_path);
				$html .= "<div class=\"info_line\">Eliminada la imagen de partida ".$image_name." de la carpeta de importación</div>";
			}

			
			#
			# INFORMACIÓN DE LA IMPORTACIÓN DE ESTA IMAGEN
				$ImageObj		= new ImageObj($codigo, TARGET_QUALITY, $aditional_path, $initial_media_path);
				$img_url		= $ImageObj->get_url();				
				$img   			= "<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" class=\"image_preview\" /></a> ";				
				$html 		   .= $img;
				$html 		   .= "<hr>";
				
			$html .= "</div>"; #end wrap_response_ficha




			
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






