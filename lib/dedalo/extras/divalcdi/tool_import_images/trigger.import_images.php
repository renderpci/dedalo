<?php
/*
	
	TRIGGER IMPORT IMAGENES GALERIA DIGITAL
	SCRIPT PARA LANZAR A MANO LA IMPORTACIÓN DE CARPETAS

*/
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');


# login test
	if(login::is_logged()!==true) {
		$string_error = "Auth error: please login";
		print Error::wrap_error($string_error);
		die();
	}

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");


# Set special php global options
	ob_implicit_flush(true);
	set_time_limit ( 920000 );
	
	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;






/**
* GENERATE RECORDS
*/
if ($mode=='generate_records_diapositivas') {

	#define('MUPREVA_COMPONENT_TIPO_PROYECTO'		, 'mupreva210');
	#define('SECTION_TIPO_IMAGENES' 					, 'mupreva20'); 

	$section_tipo 			= 'mupreva22';
	$component_filter_tipo  = 'mupreva210';
	$component_codigo_tipo  = 'mupreva203';
	$component_archivo_coleccion  = 'mupreva208';
	$component_tipologia 	= 'mupreva206';
	
	$from = 18979;
	$to   = 20000;

	die("stop $section_tipo from:$from to $to");

	for ($i=$from; $i <= $to; $i++) { 
		
		echo "<hr>[$i]"; #continue;

		# SECTION
		$section    		= section::get_instance(null,$section_tipo);
		$section_id 		= $section->Save();
		$current_section_id = $section->get_section_id();
		/**/
		#echo "<br> [$i] Saved section ($section_tipo - $current_section_id)";		

		# COMPONENT : Filtro 
		$component_tipo 		= $component_filter_tipo;	#'rsc28';	//"dd364";		
		$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo); # Already saves default project when load in edit mode
		if(SHOW_DEBUG===true) {
			#dump($component_dato, " component_dato $component_tipo ".to_string($modelo_name));
			#echo "Saved $modelo_name $component_tipo $section_id (section ".$section_tipo." : $section_id) ".json_encode($component_dato);
		}

		# COMPONENT : codigo 
		$component_tipo 		= $component_codigo_tipo;	#'rsc28';	//"dd364";
		$component_dato 		= $current_section_id;
		$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$current_component 	= component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		$current_component->set_dato($component_dato);
		$current_component->Save();
		if(SHOW_DEBUG===true) {
			#dump($component_dato, " component_dato $component_tipo ".to_string($modelo_name));
			#echo "Saved $modelo_name $component_tipo $section_id (section ".$section_tipo." : $section_id) ".json_encode($component_dato);
		}


		# COMPONENT : archivo coleccion 
		$component_tipo 		= $component_archivo_coleccion;	#'rsc28';	//"dd364";
		$locator = new locator();
			$locator->set_section_tipo('mupreva261');
			$locator->set_section_id(5);		
		$component_dato 		= $locator;
		$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		#$current_component 		= new component_filter($component_tipo, $current_section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		$current_component->set_dato($component_dato);
		$current_component->Save();
		if(SHOW_DEBUG===true) {
			#dump($component_dato, " component_dato $component_tipo ".to_string($modelo_name));
			#echo "Saved $modelo_name $component_tipo $section_id (section ".$section_tipo." : $section_id) ".json_encode($component_dato);
		}


		# COMPONENT : tipologia 
		$component_tipo 		= $component_tipologia;	#'rsc28';	//"dd364";
		$locator = new locator();
			$locator->set_section_tipo('mupreva221');
			$locator->set_section_id(1);		
		$component_dato 		= $locator;
		$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		#$current_component 	= new component_filter($component_tipo, $current_section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		$current_component->set_dato($component_dato);
		$current_component->Save();
		if(SHOW_DEBUG===true) {
			#dump($component_dato, " component_dato $component_tipo ".to_string($modelo_name));
			#echo "Saved $modelo_name $component_tipo $section_id (section ".$section_tipo." : $section_id) ".json_encode($component_dato);
		}		
		
		
	}

}#end if ($mode=='generate_records') 








/**
* GENERATE RECORDS
*/
if ($mode=='generate_records_restauracion') {

	#define('MUPREVA_COMPONENT_TIPO_PROYECTO'		, 'mupreva210');
	#define('SECTION_TIPO_IMAGENES' 					, 'mupreva20'); 

	$section_tipo 			= 'mupreva770';
	$component_filter_tipo  = 'mupreva792';	
	
	$from = 464;
	$to   = 1488;

	#$from = 3;
	#$to   = 3;

	die("stop $section_tipo from:$from to $to");

	for ($i=$from; $i <= $to; $i++) { 
		
		echo "<hr>[$i]"; #continue;

		# SECTION
		#$section    		= section::get_instance(null,$section_tipo);
		#$section_id 		= $section->Save();
		#$current_section_id = $section->get_section_id();

		$section = section::get_instance( (int)$i, $section_tipo);
		$section->forced_create_record();
		$current_section_id = $section->get_section_id();

	}

	echo "<br><br><br><h1 style=\"color:green\"> THE END </h1><br><br><br>";	

}#end if ($mode=='generate_records') 






/**
* RENUM_DIGITAL
*/
if ($mode=='renum_digital') {
	die("stop");
	$from = 1;
	$to   = 1;

	# SECCIÓN 'NODRIZA' (1 POR GRUPO)
	# Sección galería que agrupa las imágenes en su portal
	define('MUPREVA_SECTION_TIPO_GALERIA' 					, 'mupreva473');  # section
	define('MUPREVA_COMPONENT_PORTAL_IMAGEN_IDENTIFICATIVA'	, 'mupreva481');  # Imagen/es identificativas
	define('MUPREVA_COMPONENT_PORTAL_IMAGENES_ADICIONALES'	, 'mupreva483');  # Imágenes adicionales	

	# SECCIÓN RECURSO (1 POR IMAGEN)
	define('MUPREVA_SECTION_TIPO_IMAGENES' 					, 'mupreva268');	 # Imágenes virtual section (real is mupreva200)
	define('MUPREVA_COMPONENT_TIPO_CODIGO'					, 'mupreva203');	// EX rsc21
	define('MUPREVA_COMPONENT_TIPO_IMAGEN'					, 'mupreva212'); 	// EX rsc29
	define('MUPREVA_COMPONENT_TIPO_DIRECTORIO'				, 'mupreva214');	// EX rsc33
	define('MUPREVA_COMPONENT_TIPO_NOMBRE_FICHERO'			, 'mupreva215');	// EX rsc34
	
	$initial_media_path = '/digital';
	$ar_verified_paths 	= array();

	$matrix_table = 'matrix';
	$strQuery=" -- $mode
	SELECT section_id FROM \"$matrix_table\"
	WHERE
	section_tipo = '".MUPREVA_SECTION_TIPO_GALERIA."' 
	ORDER BY section_id ASC
	";
	#dump($strQuery, 'strQuery'); #die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);
	while ($rows = pg_fetch_assoc($result)) {
		$ar_records[] = $rows['section_id'];
	}
	foreach ($ar_records as $key => $current_section_id) {
		if ($current_section_id<$from || $current_section_id>$to) continue;

		#echo " <br> $key - $current_section_id ";

		
		#
		# IMAGEN IDENTIFICATIVA			
			$component_tipo   	= MUPREVA_COMPONENT_PORTAL_IMAGEN_IDENTIFICATIVA;
			$modelo_name 	  	= 'component_portal';			
			$component_portal 	= component_common::get_instance($modelo_name, $component_tipo, $current_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_GALERIA);
			$imagen_identificativa_dato = $component_portal->get_dato();
			
			
		#
		# IMAGENES ADICIONALES		
			$component_tipo   	= MUPREVA_COMPONENT_PORTAL_IMAGENES_ADICIONALES;
			$modelo_name 	  	= 'component_portal';			
			$component_portal 	= component_common::get_instance($modelo_name, $component_tipo, $current_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_GALERIA);
			$imagenes_adicionales_dato 	= $component_portal->get_dato();


			$ar_locators = array_merge( (array)$imagen_identificativa_dato, (array)$imagenes_adicionales_dato );
				#dump($ar_locators, " ar_locators ".to_string()); continue;

			#$aditional_path 	= tool_import_images::numero_to_local_path($current_section_id,2);			

			$i=1;
			foreach ((array)$ar_locators as $current_locator) {
				#dump($current_locator, " current_locator ".to_string());

				$resource_section_id = $current_locator->section_id;

				# CÓDIGO : Ejemplo: de '73' a '73-1'
				# Modifica el código alçctual del recurso a la nueva numeración
				$component_tipo 	= MUPREVA_COMPONENT_TIPO_CODIGO;				
				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$current_component 	= component_common::get_instance($modelo_name, $component_tipo, $resource_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_IMAGENES);
				$component_dato 	= $current_component->get_dato();
				if( strpos($component_dato, '-')===false ) { // evita volver a renombrar código
					$component_dato 	= (string)$current_section_id .'-'.$i ; // Es igual al section id-$i
					$current_component->set_dato($component_dato);
					$current_component->Save();
				}		

				

				# FICHERO RENAME				
				$codigo 		 = $component_dato;
				$aditional_path  = '/'.$current_section_id;	
				
				# IMAGEN
				# Calcula todos los posibles ficheros de a mover/renombrar (en todas las calidades)
				$component_tipo 	= MUPREVA_COMPONENT_TIPO_IMAGEN;				
				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component_image 	= component_common::get_instance($modelo_name, $component_tipo, $resource_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_IMAGENES);
				$ar_quality 		= unserialize(DEDALO_IMAGE_AR_QUALITY);
				foreach ($ar_quality as $quality) {
					$file_path = $component_image->get_image_path($quality);
					$ar_source[$quality] = $file_path;
				}//end foreach ($ar_quality as $quality)
				#dump($ar_source, " ar_source ".to_string()); continue;
				
				# PATH . Directorio tipo '/23000/23100'
				# Modifica el dato del directorio de la imagen actual a la nueva nomenclatura
				/* INNECESARIO YA QUE NO CAMBIA
				$path_tipo 				= MUPREVA_COMPONENT_TIPO_DIRECTORIO;	// 'rsc33';	//"dd1110";
				$component_dato 		= (string)$aditional_path;
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($path_tipo,true);
				$current_component 		= component_common::get_instance($modelo_name, $path_tipo, $resource_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_IMAGENES);
				$current_component->set_dato($component_dato);
				$current_component->Save();
				*/
				

				# FILE NAME . nombre del fichero Tipo '73-1'
				# Modifica el nombre del fichero usando el nuevo valor de 'código' de esta ficha 
				$file_name_tipo 		= MUPREVA_COMPONENT_TIPO_NOMBRE_FICHERO;	//'rsc34';	//"dd851";
				$component_dato 		= (string)$codigo;
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($file_name_tipo,true);
				$current_component 		= component_common::get_instance($modelo_name, $file_name_tipo, $resource_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_IMAGENES);
				$current_component->set_dato($component_dato);
				$current_component->Save();
				
				


				# UPDATED IMAGE COMPONENT
				# Calcula los nuevos nombres de los ficheros (en todas las calidades) después de actualizar el campo MUPREVA_COMPONENT_TIPO_NOMBRE_FICHERO
				$component_tipo 	= MUPREVA_COMPONENT_TIPO_IMAGEN;				
				$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component_image 	= new $modelo_name($component_tipo, $resource_section_id, 'edit', DEDALO_DATA_NOLAN, MUPREVA_SECTION_TIPO_IMAGENES);

				foreach ($ar_source as $quality => $file_path) {
					if (!file_exists($file_path)) continue;	

					$target_file_path = $component_image->get_image_path($quality);				
						#dump($file_path, " source file_path ".to_string($aditional_path));
						#dump($target_file_path, " target_file_path ".to_string($aditional_path));

					# IMAGE COPY FOLDER VERIFY
					/* INNECESARIO YA QUE NO CAMBIA
					$target_dir = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER .$initial_media_path. '/'.$quality. $aditional_path ;
					if (!in_array($target_dir, $ar_verified_paths)) {
						if( !is_dir($target_dir) ) {							
							if( !mkdir($target_dir, 0777,true) ) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");							
						}
						$ar_verified_paths[] = $target_dir;
					}
					*/

					# MOVE FILE
					if ( !rename($file_path, $target_file_path) ) {
						trigger_error("Error. File $file_path not moved to $target_file_path");
					}
				}//end foreach ($ar_source as $quality => $file_path)

				$component_image->Save(); // Save to update valor_list


			$i++;
			}//end foreach ((array)$ar_locators as $current_locator) {



	}//end foreach ($ar_records as $key => $current_section_id) 

}//end renum_digital






if ($mode=='rename_digital_others') {

	$from = 1;
	$to   = 2000;

	# SECCIÓN RECURSO (1 POR IMAGEN)
	define('MUPREVA_SECTION_TIPO_IMAGENES' 					, 'mupreva268');	 # Imágenes virtual section (real is mupreva200)
	define('MUPREVA_COMPONENT_TIPO_CODIGO'					, 'mupreva203');

	$base_dir 	 = strpos(DEDALO_HOST, '8888')!==false ? '/Users/paco/TEST/digital' : '/prehistoria/httpdocs/dedalo/media/image/digital/original';
	$dir 	  	 = $base_dir ; # Like '718_2009_04_28_Inaguracion_Sala_Numismatica_AD'

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
		if(is_dir("$dir/$value") && $value!='.' && $value!='..' && $value!='acc' && $value!='deleted' ) {

					
			$folder_name = $value;
			
			echo "<hr><h1>$n - $value </h1><br>";	
			
			$new_root = scandir("$dir/$value");
			if (!$new_root) {
				echo "Acceso denegado al directorio $dir . Ignorado el directorio ($folder_name)";
				continue;
			}
			natsort($new_root);

			
			$valid_extensions = array('tif','tiff','psd','bmp','png','psd');
			$a=1;
			foreach($new_root as $current_file_name) {

				$ext  = pathinfo($current_file_name, PATHINFO_EXTENSION);
				$name = pathinfo($current_file_name, PATHINFO_FILENAME);
				
				if (!in_array($ext, $valid_extensions) ) continue;

				if ( strpos($name, '-')!==false ) {
					continue;
				}

				echo "<br> $current_file_name - $ext - $name ";

				$matrix_table = 'matrix';
				$strQuery=" -- $mode
				SELECT datos#>>'{components, mupreva203, dato, lg-nolan}' AS codigo
				FROM \"$matrix_table\"
				WHERE
				section_tipo = '".MUPREVA_SECTION_TIPO_IMAGENES."' AND
				section_id = $name
				LIMIT 1
				";
				#dump($strQuery, 'strQuery'); #die();
				$result		= JSON_RecordObj_matrix::search_free($strQuery);
				while ($rows = pg_fetch_assoc($result)) {
					$codigo = trim($rows['codigo']);
				}
				
				echo "<br> $current_file_name - $ext - $name - codigo: $codigo";

				$source_file_path = $dir.'/'.$folder_name.'/'.$current_file_name;
				$target_file_path = $dir.'/'.$folder_name.'/'.trim($codigo) .'.'.$ext;
				echo " <br> $source_file_path - $target_file_path ";
				
				if( !rename($source_file_path, $target_file_path) ) {
					trigger_error("Error. Imposible renombrar $source_file_path => $target_file_path");
				}

				
			$a++;
			}//end 	foreach($new_root as $current_file_name) {
								

		$n++;
		}//end if(is_dir("$dir/$value") && $value!='.' && $value!='..') {
		
	}//end foreach ($root as $key => $value) {
	echo "<br><br><h1 style=\"color:green\">THE END</h1><br><br>";	
		
}//end if ($mode=='list_digital') {





# Enable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = true;
RecordObj_time_machine::$save_time_machine_version = true;

# Load real tool trigger after 
#require_once( DEDALO_LIB_BASE_PATH .'/tools/calendar/trigger.tool_calendar.php');
?>