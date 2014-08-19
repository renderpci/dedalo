<?php
/**
* VARIABLES ESPECÍFICAS DEL SCRIPT DE IMPORTACIÓN
*/

	#
	# REGEX : Expresión regula a usar al leer los ficheros
	#$regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";
	$regex = "/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/";


	#
	# INFO : Texto informativo relativo a la anatomía o structura del nombre de fichero
		$import_help  ='';
		$import_help .= "<div class=\"info_line import_help\">";
		$import_help .= "Seleccione en su disco duro los archivos a importar en el Inventario 'Catálogo MUPREVA'. ";
		$import_help .= "Para los nombres de los archivos, use un formato 'A-B.jpg' donde A es el código del registro de inventario y B es el identificador del recurso o disparo. 
						 Ej. '1-2.jpg' para la ficha de inventario 1 y la imagen adicional (disparo) 2. 
						 Después puse la opción 'Preview de importación' en el menu superior y acepte la importación si cree que el contenido previsualizado es correcto.";
		$import_help .= "</div>";



######################################################################################################








/**
* SCRIPT DE IMPORTACIÓN
*
*/

# IMPORT SCRIPT MUPREVA IMAGENES ASOCIADAS 
require_once( dirname(dirname(dirname(dirname(dirname(__FILE__))))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');

# Login check
	if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# Set vars
	$vars = array('process','quality','delete_after');
	foreach($vars as $name)	$$name = common::setVar($name);




# PROCESS POST REQUEST
if($process==1) {


	$start_time= start_time();
	
	$html='';

	# Set special php global options
	ob_implicit_flush(true);
	set_time_limit ( 24000 );
	# Disable log temporarily
	logger_backend_activity::$disable_log = true;

	
	$html .= "<div class=\"wrap_response_import\">";

	$i=0;
	if( isset($all_image_files) && is_array($all_image_files) ) foreach ($all_image_files as $ar_group_value) {
		
		#dump($ar_group_value);	

		# Skip wrong formated images
		if(empty($ar_group_value['nombre_fichero_completo'])) {
			$html .= $ar_group_value;
			$html .= " <div class=\"info_line alert_icon\">Atención: Esta imagen ha sido ignorada en la importación</div><br><br>";
			continue;
		}
		
		# vars
		# Fichero en la carpeta temporal uploads like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/1253-2.jpg'
		$source_full_path 	= $ar_group_value['file_path'];
		# Path del fichero like '/Users/pepe/Dedalo/media/media_mupreva/image/temp/files/user_1/'
		$source_path 		= $ar_group_value['dir_path'];
		# Extensión del fichero like 'jpg'
		$extension 			= $ar_group_value['extension'];
		# Nombre del fichero like '1253-2.jpg'. Campo 'Nombre del fichero' (dd851) de la ficha de recursos:Imágenes catálogo (dd1183)
		$image_name 		= $ar_group_value['nombre_fichero_completo'];			
		# Número de inventario campo 'Numero de Inventario' (dd1114) de sección 'Catálogo - Mupreva' (dd334) . Coincide con id_section, pero usaremos el valor del campo
		$numero_inventario 	= $ar_group_value['numero_inventario'];
		# Código. Campo codigo (dd1115) de la ficha de recursos:Imágenes catálogo (dd1183) like 45001-1
		$nombre_fichero 	= $ar_group_value['nombre_fichero'];
		#$codigo 			= ltrim($nombre_fichero ,'0'); # Elimina los posibles ceros al inicio: de 0045001-1 a 45001-1
		$codigo 			= $ar_group_value['numero_inventario'].'-'.$ar_group_value['numero_recurso'];

		# aditional_path de la imagen. Campo 'Directorio' (dd1110) de recursos:Imágenes catálogo (dd1183)
		$aditional_path		= tool_import_images::numero_to_local_path($ar_group_value['numero_inventario'],2);
		
		# disparo target en el portal. like '1' . Nos sirve para discriminar el portal al que va dirigido (1 para imagen Identificativa, >=2 para Imágenes adicionales)
		$disparo 			= $ar_group_value['numero_recurso'];
	
		#dump($aditional_path.'/'.$image_name);
		#dump($numero_inventario,'$numero_inventario');

		$html .= "<div class=\"caption cabecera_ficha\"><span>Ficha $numero_inventario</span> - Imagen $image_name - Procesada: ".($i+1)." de ".count($all_image_files)."</div>";
		$html .= "<div class=\"wrap_response_ficha\">";


		##
		# 1 Ficha de inventario 'Catálogo - Mupreva'
		# Verificamos que existe. Si no existe, ignoramos la importación de esta foto. NO crearemos nuevo registro de inventario en ningún caso.
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['tipo']				= 'dd1114';
		$arguments['dato:json_exact']	= $numero_inventario;
		$matrix_table 					= common::get_matrix_table_from_tipo($arguments['tipo']);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_result						= $RecordObj_matrix->search($arguments);
		if(empty($ar_result)) {
			$msg = " <div class=\"info_line alert_icon\"> - Warning: La ficha de inventario con número '$numero_inventario' no existe en 'Catálogo - Mupreva'. La imagen '$image_name' será ignorada</div>";
			$html .= "<div class=\"warning\">$msg</div></div>";
			# Skip
			continue;
		}else{
			$section_general_id = $ar_result[0];
		}


		##
		# 2 Ficha de portal 'recursos:Imágenes catálogo'
		# Verificamos que existe. Si no existe, creamos un nuevo registro del portal
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['tipo']				= 'dd1115';
		$arguments['dato:json_exact']	= $codigo;
		$matrix_table 					= common::get_matrix_table_from_tipo($arguments['tipo']);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_result						= $RecordObj_matrix->search($arguments);
			#dump($ar_result,'$ar_result '.print_r($arguments,true));
		if(empty($ar_result) || count($ar_result)<1) {

			$html .= " <div class=\"info_line alert_icon\">Este registro con código $codigo no existe en 'recursos:Imágenes catálogo'. Será creado ahora y vinculado al inventario </div>";
			#$html .= "<div class=\"warning\">$msg</div>";
			
			# SECTION : Creamos la nueva sección para obtener el parent de los componentes (section_id)
			#
				# Section tipo (dd1183) . Sección virtual 'Imágenes catálogo' que es filtrada por dd1116 = 233, y por "dd1131":"12" {"filtered_by":{"dd1116":"233","dd1131":"12"}}
				$section_tipo	= 'dd1183';
				$section 		= new section(NULL,$section_tipo);
				$section_id 	= $section->Save();

			# COMPONENTES : Creamos / salvamos los compoenentes que albergan los datos necesarios
			#
				# COMPONENT : Filtro 'dd496'
				$component_tipo 		= "dd364";
				$component_dato 		= array("26"=>"2");	# Id matrix del proyecto 'Catalogación' component_filter dd364
				$current_component 		= new component_filter(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato($component_dato);
				$current_component->Save();

				# CÓDIGO : Tipo '73-1'
				$component_tipo 		= "dd1115";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
				$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato($codigo);
				$current_component->Save();

				# CÓDIGO ANTERIOR : Tipo '00281_01_Empuries_Colgante_AD_ORIG.JPG'
				$component_tipo 		= "dd345";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
				$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato($image_name);
				$current_component->Save();				 

				# COLECCION : Lista de valores (component_select), valor '12'
				# Colección (dd1131) lista de valores pública. dd1131 = 12 para MUPREVA
				$coleccion_tipo 		= "dd1131";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($coleccion_tipo);
				$current_component 		= new $component_modelo_name(null, $coleccion_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato("12");
				$current_component->Save();

				# PATH . Directorio tipo '/23000/23100'
				$path_tipo 				= "dd1110";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($path_tipo);
				$current_component 		= new $component_modelo_name(null, $path_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato($aditional_path);
				$current_component->Save();

				# FILE NAME . nombre del fichero Tipo '73-1'
				$file_name_tipo 		= "dd851";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($file_name_tipo);
				$current_component 		= new $component_modelo_name(null, $file_name_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				$current_component->set_dato($codigo);
				$current_component->Save();

				# IMAGE. (Auto save when is called without id)
				$image_tipo 			= "dd750";
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($image_tipo);
				$current_component 		= new $component_modelo_name(null, $image_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {		
		}

		#
		# IMAGE COPY FILE
		$target_dir = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.$quality. $aditional_path ;
		if( !is_dir($target_dir) ) {
			$create_dir 	= mkdir($target_dir, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");
		}else{
			$wantedPerms 	= 0777;
			$actualPerms 	= fileperms($target_dir);
			if($actualPerms < $wantedPerms) {
				$ch_mod = chmod($target_dir, $wantedPerms);
				if(!$ch_mod) throw new Exception(" Error on set permissions of directory \"$target_dir\" ");
			}
		}
		if( strtolower($extension) != DEDALO_IMAGE_EXTENSION ) {

			$path_copia = $target_dir .'/'. $codigo .'.'. strtolower($extension);
			# Copiamos el original
			if (!copy($source_full_path, $path_copia)) {
			    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>");
			}
			# JPG : la convertimos a jpg
			ImageMagick::convert($path_copia, $target_dir .'/'. $codigo .'.'. DEDALO_IMAGE_EXTENSION );

			$html .= "<div class=\"info_line alert_icon\">La imagen de origen NO es jpg ($extension). Copiado el fichero y creada versión jpg en destino </div>";

		}else{
			# Lo copiamos asegurándonos que la extensión queda en minúsculas
			$path_copia = $target_dir .'/'. $codigo.'.'.DEDALO_IMAGE_EXTENSION;
			if (!copy($source_full_path, $path_copia)) {
			    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>" );
			}
			if(SHOW_DEBUG) {
				$html .= "<div class=\"info_line\">Copiado el fichero a destino. (La imagen de origen ya es jpg y no necesita conversión)</div>";
			}			
		}



		#
		# THUMB : Creamos la versión 'default'
		#
		# IDENTIFICATIVA : Si existe image identificativa, NO generaremos la versión default
		$ImageObj					= new ImageObj($codigo, 'modificada', $aditional_path);
		$image_identificativa_path 	= $ImageObj->get_local_full_path();
			#error_log("--> Imagen identiicativa path: $image_identificativa_path");

		# DEFAULT 
		$ImageObj					= new ImageObj($codigo, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path);
		$image_default_path 		= $ImageObj->get_local_full_path();

		if( 
			($quality!=DEDALO_IMAGE_QUALITY_DEFAULT && !file_exists($image_identificativa_path)) # No estamos en 1.5MB y no existe la original
			|| !file_exists($image_default_path) # Ó no existe l adefault
		) {

			#error_log("--> Creando default image ya que no existe la calidad original");
			
			$source_image 	= $target_dir .'/'. $codigo.'.'.DEDALO_IMAGE_EXTENSION ;
			$source_quality = $quality;
			$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

			# Image source
			$ImageObj				= new ImageObj($codigo, $source_quality, $aditional_path);
			$source_image 			= $ImageObj->get_local_full_path();
			$source_pixels_width	= $ImageObj->get_image_width();
			$source_pixels_height	= $ImageObj->get_image_height();
				#dump($ImageObj,'ImageObj');
				#dump($source_image,"source_image $source_pixels_width x $source_pixels_height");

			# Image target
			$ImageObj				= new ImageObj($codigo, $target_quality, $aditional_path);
			$target_image 			= $ImageObj->get_local_full_path();
			$ar_target 				= ImageObj::get_target_pixels_to_quality_conversion($source_pixels_width, $source_pixels_height, $target_quality);
			$target_pixels_width 	= $ar_target[0];
			$target_pixels_height 	= $ar_target[1];
				#dump($target_image,"target_image $target_pixels_width x $target_pixels_height");

			# TARGET FOLDER VERIFY (EXISTS AND PERMISSIONS)
			try{
				$target_folder_path = $ImageObj->get_media_path_abs() ;
					#dump($target_folder_path,'target_folder_path');die();
				# folder exists
				if( !is_dir($target_folder_path) ) {
				$create_dir 	= mkdir($target_folder_path, 0777,true);
				if(!$create_dir) throw new Exception(" Error on read or create directory \"$target_quality\". Permission denied $target_folder_path (2)");
				}

				# folder set permissions
				$wantedPerms 	= 0777;
				$actualPerms 	= fileperms($target_folder_path);
				if($actualPerms < $wantedPerms) {
					$ch_mod = chmod($target_folder_path, $wantedPerms);
					if(!$ch_mod) throw new Exception(" Error on set permissions of directory \"$target_quality\".");
				}
			} catch (Exception $e) {
				$msg = '<span class="error">'.$e->getMessage().'</span>';
				$html .= Error::wrap_error($msg);
			}

			# Thumb
			if (file_exists($target_image)) {
				$html .= "<div class=\"info_line alert_icon\">Reemplazada la miniatura existente de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") por la miniatura creada desde '$source_quality'</div>";
			}

			if($target_pixels_width<1)  $target_pixels_width  = 720;
			if($target_pixels_height<1) $target_pixels_height = 720;

			$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height ;
			ImageMagick::convert($source_image, $target_image, $flags);
				#dump($flags,"$source_image, $target_image");
			
			# Actualizamos la mniatura
			$ImageObj			= new ImageObj($codigo, DEDALO_IMAGE_THUMB_DEFAULT, $aditional_path);
			$image_thumb_path 	= $ImageObj->get_local_full_path();
			unlink($image_thumb_path);
			$ImageObj					= new ImageObj($codigo, DEDALO_IMAGE_QUALITY_DEFAULT, $aditional_path);
			$image_default_path 	= $ImageObj->get_local_full_path();
			ImageMagick::get_thumb( 'list', $image_default_path, true);

			$html .= "<div class=\"info_line \">Creada la imagen de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") desde '$source_quality'</div>";		

		}else{
			$html .= "<div class=\"info_line \">No se creó imagen de calidad por defecto (".DEDALO_IMAGE_QUALITY_DEFAULT.") puesto que ya existe</div>";	
		}#end if($quality!=DEDALO_IMAGE_QUALITY_DEFAULT)



		#
		# PORTAL : Si se ha creado un registro de portal porque no existía, 
		# buscamos la sección de inventario, sus portales y enlazamos el recurso al portal correspondiente
		if(empty($section_id) || $section_id<1) {
			$html .= "<div class=\"info_line\">Se utilizó el registro existente y se añadió la imagen de calidad '$quality' al conjunto de versiones</div>";
		}

		if($disparo == 1 && !empty($section_id) ) {

			# Si se trata del primer disparo y se ha creado una sección de imágenes nueva (porque no 
			# existía previamente -cosa improvable pero posible-), asociamos el registro creado al
			# portal correspondiente ('Identificación:Imagen identificativa')

			# IMAGEN IDENTIFICATIVA (PORTAL)
			# COMPONENT : portal de imagen identificativa 'dd1113'
			$component_tipo 		= "dd1113";
			/*
			$current_component 		= new component_portal(null, $component_tipo, 'edit', $section_general_id, DEDALO_DATA_NOLAN); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
			# get current dato in db
			$dato 				= $current_component->get_dato();
			# mix array current dato + rel_locator resource string like (1253.0.0)
			$rel_locator		= $section_id .".0.0";
			$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
			# set new array dato and save record in matrix
			$current_component->set_dato($new_ar_dato);
			$current_component->Save();
			*/

			# Para evitar problemas con la caché accedemos directamente a RecordObj_matrix
			$RecordObj_matrix 	= new RecordObj_matrix('matrix',NULL,$section_general_id,$component_tipo,DEDALO_DATA_NOLAN); # matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL) {
			$RecordObj_matrix->use_cache = false;
			$RecordObj_matrix->get_ID(); # Before get_dato, force load DB
			$dato 				= $RecordObj_matrix->get_dato();
			$rel_locator 		= $section_id .".0.0";
			$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
			$RecordObj_matrix->set_dato($new_ar_dato);
			$RecordObj_matrix->Save();

			$html .= "<div class=\"info_line\">Añadido recurso $section_id de Imagen identificativa (disparo: $disparo)</div>";
			if(SHOW_DEBUG) {
				$html .= "<div class=\"info_line\">Añadido locator $rel_locator a portal tipo $component_tipo para Imagen identificativa (disparo: $disparo)</div>";
			}				

		}else if(!empty($section_id) ) {

			# Si NO se trata del primer disparo, pero SI se ha creado una nueva sección 'IMÁGENES',
			# procedemos a asociar el registro creado al portal correspondiente ('Documentación asociada:Imágenes')

			# DOCUMENTACIÓN ASOCIADA -> IMÁGENES  (PORTAL)
			# COMPONENT : portal de Documemntación asociada / imagenes 'dd1125'
			$component_tipo 		= "dd1125";
			/*
			$current_component 		= new component_portal(null, $component_tipo, 'edit', $section_general_id, DEDALO_DATA_NOLAN); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
				#dump($current_component,'current_component');
			#$current_component->skip_cache = true;
			#$current_component->calculate_ID();
			# get current dato in db
			$dato 				= $current_component->get_dato();
				#dump($dato,'dato');
			# mix array current dato + rel_locator resource string like (1253.0.0)
			$rel_locator 		= $section_id .".0.0";
			$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
				#dump($new_ar_dato,'new_ar_dato');
			# set new array dato and save record in matrix
			$current_component->set_dato($new_ar_dato);
			$current_component->Save();
			*/

			# Para evitar problemas con la caché accedemos directamente a RecordObj_matrix
			$RecordObj_matrix 	= new RecordObj_matrix('matrix',NULL,$section_general_id,$component_tipo,DEDALO_DATA_NOLAN); # matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL) {
			$RecordObj_matrix->use_cache = false;
			$RecordObj_matrix->get_ID(); # Before get_dato, force load DB
			$dato 				= $RecordObj_matrix->get_dato();
			$rel_locator 		= $section_id .".0.0";
			$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
			$RecordObj_matrix->set_dato($new_ar_dato);
			$RecordObj_matrix->Save();
			
			$html .= "<div class=\"info_line\">Añadido recurso $section_id de Imagen identificativa (disparo: $disparo)</div>";
			if(SHOW_DEBUG) {
				$html .= "<div class=\"info_line\">Añadido locator $rel_locator a portal tipo $component_tipo para Imagen asociada (disparo: $disparo)</div>";
			}			
		}#end if($disparo == 1 && !empty($section_id) ) {
		


		# DELETE AFTER
		if ($delete_after=='si') {
			unlink($source_full_path);
			$html .= "<div class=\"info_line\">Eliminada la imagen de partida ".$ar_group_value['nombre_fichero_completo']." de la carpeta de importación</div>";
		}


		#
		# INFORMACIÓN DE LA IMPORTACIÓN DE ESTA IMAGEN		
		#$img_url 		= DEDALO_ROOT_WEB . "/inc/img.php?s=".$path_copia ; #$ar_group_value['imagen']['image_preview_url'];
		#$img_url 		= $ar_group_value['imagen']['image_preview_url'];

		$ImageObj		= new ImageObj($codigo, 'original', $aditional_path);
		$img_url		= $ImageObj->get_url();

		
		$img = "<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" class=\"image_preview\" /></a> ";
		if(SHOW_DEBUG) {
			$exec_time 		= exec_time_unit($start_time, $unit='sec');
			$memory_usage 	= tools::get_memory_usage(false);
			if(!isset($section_id)) $section_id=NULL;
			if(!isset($new_ar_dato)) $new_ar_dato=NULL;
			$html .= "$img <div class=\"info_line\">$image_name executing i:$i - disparo:$disparo [section_general_id:$section_general_id - section_id:$section_id - portal_dato:".to_string($new_ar_dato)."] ... $exec_time secs - memory_usage:$memory_usage</div>";
		}else{
			$html .= $img;
		}
		#$html .= "<hr>";
			
		$html .= "</div>"; #end wrap_response_ficha
		$i++;

	}#end foreach ($ar_image_group as  $ar_group_value)
	
	
	# VOLVER BUTTON
	$html .= "\n <div class=\"css_button_generic button_back link\" onclick=\"window.history.back();\">";
	$html .= label::get_label('volver') ;
	$html .= "</div>";

	$html .= "</div>";	#end  class=\"wrap_response_import\"
	#$html .= html_page::get_html($html);

	
	# REDIS DELETE FILTER CACHE
	#exec('redis-cli --raw keys *_filter_key_name_* | xargs redis-cli del');

	#exit();

	print $html;

}#end if($process=='1') {




