<?php
	/*
	
		IMPORT AV GENERICO .PHP
	
	*/
require_once( DEDALO_LIB_BASE_PATH.'/media_engine/class.Ffmpeg.php');
require_once( DEDALO_LIB_BASE_PATH.'/media_engine/class.PosterFrameObj.php');


/*
{
"tool_name":"tool_import_av",
"context_name":"files",
"section_tipo":"mupreva1296",
"MAIN_SECTION_TIPO":"mupreva1296",
"MAIN_PORTAL_AV":"mupreva1304",
"RESOURCE_SECTION_TIPO":"mupreva472",
"RESOURCE_COMPONENT_TIPO_CODE":"mupreva1336",
"RESOURCE_COMPONENT_TIPO_CODE_OLD":"mupreva1337",
"RESOURCE_COMPONENT_TIPO_AV":"mupreva1283",
"RESOURCE_COMPONENT_TIPO_PROJECT":"mupreva1281",
"process_script":"/extras/mupreva/tool_import_av/import_av.php",
"quality":"audio",
"initial_media_path":"/audio"
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
		define('MAIN_PORTAL_AV'						, $propiedades->MAIN_PORTAL_AV);  # Imagen/es identificativas		
		
		#
		# SECCIÓN 'RECURSO' (1 POR IMAGEN)
		define('RESOURCE_SECTION_TIPO' 				, $propiedades->RESOURCE_SECTION_TIPO);	
		define('RESOURCE_COMPONENT_TIPO_CODE'		, $propiedades->RESOURCE_COMPONENT_TIPO_CODE);
		define('RESOURCE_COMPONENT_TIPO_CODE_OLD'	, $propiedades->RESOURCE_COMPONENT_TIPO_CODE_OLD);
		define('RESOURCE_COMPONENT_TIPO_AV'			, $propiedades->RESOURCE_COMPONENT_TIPO_AV);			
		define('RESOURCE_COMPONENT_TIPO_PROJECT'	, $propiedades->RESOURCE_COMPONENT_TIPO_PROJECT);	

		# Verify file name pattern like "1-2"
		define('VERIFY_FILE_NAME_PATTERN'			, '/(^[0-9]+)-([0-9]+).([a-zA-Z0-9]{3,4})\z/');
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
	- La archivos deben estar nombrados en formato secuencial de tipo 1-1,1-2,1-3,… donde el primer número será el ID de la ficha de inventario o galería que agrupa los recursos, 
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
		return null;	
			# pasada al fichero get_aditional_form_elements.php para poder acceder via ajax	
			# Preview html
			ob_start();
			include('get_aditional_form_elements.php');
			$html = ob_get_clean();
			return $html;
	}}


	#
	# VERIFY_FILE_NAME : Defined in button import propiedades
	if(!function_exists('verify_file_name')) { function verify_file_name($full_file_name) {	
		$pattern = VERIFY_FILE_NAME_PATTERN;
		preg_match($pattern, $full_file_name, $ar);
			#dump($ar, ' ar '.$full_file_name);
		if ( empty($ar[1]) || empty($ar[2]) ) {
			$pattern = '/(^[0-9]+).([a-zA-Z0-9]{3,4})\z/';
			preg_match($pattern, $full_file_name, $ar);
			if ( empty($ar[1]) ) {
				echo "<div class=\"error\">Nombre no válido ($full_file_name). Use un formato de nombre secuencial de tipo '1-2.jpg'. El fichero será ignorado.</div>";
				return false;
			}			
		}
		return true;		
	}}


	/**
	* GET_ADITIONAL_PATH
	* Usado para crear 'aditional_path' en archivos que agrupan sus archivos en subcarpetas tipo 45000/45100
	*/
	if(!function_exists('numero_to_local_path')) { function numero_to_local_path($numero) {
		return tool_import_images::numero_to_local_path( $numero, $levels=2 );		
	}}


	#
	# INITIAL_MEDIA_PATH
	#
	$initial_media_path = null;
	if (isset($propiedades->initial_media_path)) {
		$initial_media_path = $propiedades->initial_media_path;
		if (strpos($initial_media_path, '/')===false) {
			$initial_media_path = '/'.$initial_media_path;
		}
	}

	$custom_tool_label  = $button_import_obj->get_label();



/**
* USER FORM CALL
* Action called by user when submit preview form
* @see tool_import_images.php $context_name=form
*/
if ( isset($user_form_call) && $user_form_call==1 ) { //isset($_REQUEST['process']) && $_REQUEST['process']==1 && 

	$options = new stdClass();				
		#$options->folder_name 		 	= $folder_name;
		$options->all_av_files 	 		= $this->find_all_av_files(TOOL_IMPORT_AV_UPLOAD_DIR);
		$options->import_image_checkbox = safe_xss($_REQUEST['import_image_checkbox']);
		$options->quality 	 		 	= safe_xss($_REQUEST['quality']);
		$options->initial_media_path 	= $initial_media_path;
		$options->button_import_obj 	= safe_xss($button_import_obj;
		$options->delete_after 			= safe_xss($_REQUEST['delete_after']);
		$options->process 				= safe_xss($_REQUEST['process']);
		$options->section_general_id 	= safe_xss($_REQUEST['target_id']);

	process_folder( $options );

}//end if (isset($_REQUEST['process']) && $_REQUEST['process']==1 && isset($trigger_script) && $trigger_script==1 ) {





#
# PROCESS POST REQUEST
if(!function_exists('process_folder')){ function process_folder( $request_options ) {
		
		if(SHOW_DEBUG) {
			$start_time= start_time();
		}

		$options = new stdClass();
			$options->section_general_id 	= null;
			$options->folder_name 		 	= null;
			$options->all_av_files 	 		= null;
			$options->quality 	 		 	= null;
			$options->initial_media_path 	= null;
			$options->import_image_checkbox = array();
			$options->button_import_obj 	= null;			
			$options->delete_after 			= null;
			$options->process 				= null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}

		$section_general_id 	= $options->section_general_id;
		$all_av_files 			= $options->all_av_files;
		$quality 				= $options->quality;
		$initial_media_path 	= $options->initial_media_path;
		$import_image_checkbox 	= $options->import_image_checkbox;
		$button_import_obj 		= $options->button_import_obj;		
		$delete_after 			= $options->delete_after;
		$process 				= $options->process;

		#dump($section_general_id, " section_general_id ".to_string()); return;
		#dump($all_av_files, ' all_av_files');
		// Remove no selected images (checkbox preview page)
		if($process==1) foreach ((array)$all_av_files as $key => $current_value) {
			if (!in_array($key, $import_image_checkbox)) {
				unset($all_av_files[$key]);
			}
		}
		#dump($all_av_files, ' all_av_files'); die();

		$ar_verified_paths=array();
		$html='';
		

		# Set special php global options
		#ob_implicit_flush(true);
		set_time_limit ( 259200 );  // 3 dias
		
		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;
		RecordObj_time_machine::$save_time_machine_version = false;

		/*
		#dump((int)$section_general_id, '$section_general_id');die();		
		if ((int)$section_general_id<1) {
			// Crea nueva sección
			$section_general = section::get_instance(null,MAIN_SECTION_TIPO);
			$section_general->Save();
			$section_general_id = $section_general->get_section_id();
		}else{
			// Se asegura de que la sección existe. Si no, la crea			
			$section_general = section::get_instance($section_general_id,MAIN_SECTION_TIPO);
			$section_general->forced_create_record();	
		}

		
		#
		# aditional_path del fichero.			
			switch (true) {
				case (isset($button_import_obj->propiedades->aditional_path) && $button_import_obj->propiedades->aditional_path=='numero_to_local_path') :
					$aditional_path	= tool_import_images::numero_to_local_path($section_general_id,2);
					break;				
				default:
					# Por defecto (caso de digital por ejemplo)
					$aditional_path	= '/'.$section_general_id;					
			}
			#dump($button_import_obj->propiedades->aditional_path, ' button_import_obj->aditional_path');
			#dump($aditional_path, ' aditional_path - '.$section_general_id); die();
			echo "aditional_path: $aditional_path";
			

		#
		# LAST_DISPARO_NUMBER
			$matrix_table = common::get_matrix_table_from_tipo(RESOURCE_SECTION_TIPO);
			$strQuery="
			-- get_last_disparo_number
			SELECT 
			section_id, datos #>>'{components,".RESOURCE_COMPONENT_TIPO_CODE.",dato,lg-nolan}' as codigo
			FROM \"$matrix_table\"
			WHERE
			section_tipo = '".RESOURCE_SECTION_TIPO."' AND 
			datos #>>'{components,".RESOURCE_COMPONENT_TIPO_CODE.",dato,lg-nolan}' LIKE '{$section_general_id}-%'
			ORDER BY section_id DESC
			LIMIT 1
			";
			#dump($strQuery, 'strQuery'); #die();			
			$result		= JSON_RecordObj_matrix::search_free($strQuery);	
			$last_disparo_number = 0;
			while ($rows = pg_fetch_assoc($result)) {
				$codigo = $rows['codigo'];
				if (strpos($codigo, '-')) {
					$ar_parts = explode('-', $codigo);
					$last_disparo_number = intval( $ar_parts[1] ); 	# Like 4 from '45000-4'
				}
			}
			#dump($last_disparo_number, ' last_disparo_number'); 
			#die();
		*/

		$html .= "<div class=\"wrap_response_import\">";
		
		$i=0;
		if( isset($all_av_files) && is_array($all_av_files) ) foreach ($all_av_files as $ar_group_value) {		
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
				switch (true) {
					case (isset($button_import_obj->propiedades->aditional_path) && $button_import_obj->propiedades->aditional_path=='numero_to_local_path') :
						$aditional_path = numero_to_local_path($section_general_id);						
						break;				
					default:
						# Por defecto
						$aditional_path	= null;	// '/'.$section_general_id;					
				}
				#dump($button_import_obj->propiedades->aditional_path, ' button_import_obj->aditional_path');
				#dump($aditional_path, ' aditional_path - '.$section_general_id); die();
				echo "aditional_path: $aditional_path";	



				
			$html .= "<div class=\"caption cabecera_ficha\"><span>Ficha $section_general_id</span> - Imagen $image_name - Procesada: ".($i+1)." de ".count($all_av_files)."</div>";			
			
			
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
			# RECURSO SECTION : Creamos la nueva sección para obtener el parent de los componentes (section_id)
				# Section tipo (mupreva21) . Sección virtual 'Imágenes catálogo' que es filtrada por dd1116 = 233, y por "dd1131":"12" {"filtered_by":{"dd1116":"233","dd1131":"12"}}
				#				
					$current_section_tipo	 = RESOURCE_SECTION_TIPO; 
					$current_componente_tipo = RESOURCE_COMPONENT_TIPO_CODE;	
					$matrix_table			 = common::get_matrix_table_from_tipo($current_section_tipo);		
					$strQuery=" -- import_images_generic
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


				# COMPONENTES : Creamos / salvamos los compoenentes que albergan los datos necesarios
				#
					if ($is_new_resource_section) {	
						# COMPONENT : Filtro 
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_PROJECT;	//'rsc28';	//"dd364";										
						$modelo_name 			= 'component_filter';
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO); # Already saves default project when load in edit mode
						# Already saves default project when load in edit mode				

						# CÓDIGO : Tipo '73-1'
						$component_tipo 		= RESOURCE_COMPONENT_TIPO_CODE;
						$component_dato 		= (string)$codigo; // Es igual al section id
						$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
						$current_component->set_dato($component_dato);
						$current_component->Save();
					}				

					# CÓDIGO ANTERIOR : Tipo '00281_01_Empuries_Colgante_AD_ORIG.JPG'
					$component_tipo 		= RESOURCE_COMPONENT_TIPO_CODE_OLD; 	//'rsc22'; 	//"dd345";
					$component_dato 		= (string)$image_name;
					$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);				
					$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
					$current_component->set_dato($component_dato);
					$current_component->Save();
					

					/*
					# IMAGE. (Auto save when is called first time)
					$component_tipo 		= RESOURCE_COMPONENT_TIPO_AV; //'rsc29'; 	//"dd750";
					$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);				
					*/
				

			
					

			#
			#
			# AV COPY FILE
				# AV. (Auto save when is called first time) 
				$component_tipo 		= RESOURCE_COMPONENT_TIPO_AV;
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);	
				$current_component->Save();

				$av_id = $current_component->get_av_id();

				$target_dir = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .$initial_media_path. '/'.$quality ;
				if (!in_array($target_dir, $ar_verified_paths)) {
					if( !is_dir($target_dir) ) {					
						if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
					}
					$ar_verified_paths[] = $target_dir;
				}

				if ($quality=='audio') {

					if( strtolower($extension) != DEDALO_AV_EXTENSION ) {

						$path_copia = $target_dir .'/'. $av_id .'.'. strtolower($extension);
						# Copiamos el original
						if (!copy($source_full_path, $path_copia)) {
						    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>");
						}
						# MP4 : la convertimos a el formato de dédalo (mp4)
						$default_path = $target_dir .'/'. $av_id .'.'. DEDALO_AV_EXTENSION;					
						$command 	  = DEDALO_AV_FFMPEG_PATH." -i $path_copia -acodec libvo_aacenc -ar 44100 -ab 128k -ac 2 $default_path";
						$res 		  = shell_exec($command);
							#dump($command, ' command '.to_string($res ));
						if(SHOW_DEBUG) {
							$html .= "<pre> $command </pre>";
						}

						$html .= "<div class=\"info_line alert_icon\">El fichero de origen NO es mp4 ($extension). Copiado el fichero y creada versión mp4 en destino </div>";

					}else{
						# Lo copiamos asegurándonos que la extensión queda en minúsculas
						$path_copia = $target_dir .'/'. $av_id.'.'.DEDALO_AV_EXTENSION;
						if (!copy($source_full_path, $path_copia)) {
						    throw new Exception( "<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>" );
						}				
					}

				}else{

					#
					# Verify 'original' dir exists
					$target_dir = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .$initial_media_path. '/original' ;
					if (!in_array($target_dir, $ar_verified_paths)) {
						if( !is_dir($target_dir) ) {					
							if(!mkdir($target_dir, 0777,true)) throw new Exception(" Error on read or create directory. Permission denied \"$target_dir\" (2)");						
						}
						$ar_verified_paths[] = $target_dir;
					}

					#
					# Copiamos el archivo como calidad 'original' SIEMPRE independientement de la calidad seleccionada en el selector
					$path_copia = $target_dir .'/'. $av_id.'.'.strtolower($extension);;
					# Copiamos el original
					if (!copy($source_full_path, $path_copia)) {
					    throw new Exception("<div class=\"info_line\">ERROR al copiar ".$source_full_path." a ".$path_copia."</div>");
					}

					#
					# Lo convertimos al formato default de Dédalo (404)
					$source_file = $path_copia;
					$target_dir  = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .$initial_media_path. '/404' ; // estará verificado arriba					
					$target_file = $target_dir .'/'. $av_id .'.'. DEDALO_AV_EXTENSION;
					
					# SIEMPRE CONVERTIREMOS A FORMATO DEDALO EN CALIDAD DEFAULT (404) SI NO EXISTE YA !!!!!!!!!!!!
					# Nótese que con esete script, siempre se sube el fiche a calidad 'original' por lo que la primera vez, no existirá el 404
					# Si existiera el 404, lo renombramos para no reemplazarlo
					if (file_exists($target_file)) {
						$extension  = pathinfo($target_file, PATHINFO_EXTENSION);				
						$dirname    = pathinfo($target_file, PATHINFO_DIRNAME);
						$basename   = pathinfo($target_file, PATHINFO_BASENAME);
						$date 		= date("Y-m-d_Hi");
						rename ($target_file, "{$dirname}/deleted/{$basename}_deleted_{$date}.{$extension}");	// "old_".$target_file."_".date("Y-m-d His")); //_deleted_2015-07-112355
					}
					if (!file_exists($target_file)) {
						$res = Ffmpeg::convert_to_dedalo_av( $source_file, $target_file, $async=false );
					}				
					

					#
					# USING MEDIA ENGINE WITH CLASS FFMPEG
					/*
						
						# AVObj
						$AVObj			= new AVObj($av_id, 'original');
						# Ffmpeg
						$Ffmpeg			= new Ffmpeg();
						#$setting_name	= $Ffmpeg->get_setting_name_from_quality($AVObj, '404'); echo $setting_name;
						$render			= $Ffmpeg->create_av_alternate($AVObj, $setting_name='404_pal_16x9');
					*/


					#
					# POSTERFRAME. GUARDAMOS EL POSTERFRAME SI NO EXISTE YA		
					# Verificar que se puede hacer el posterframe en este punto, antes de que se acabe de procesar el video..
						$AVObj = new AVObj($av_id, '404');
						$PosterFrameObj = new PosterFrameObj($av_id);		
						if(Ffmpeg::get_ffmpeg_installed_path() && !$PosterFrameObj->get_file_exists()) {
							$timecode = '00:00:10';
							$Ffmpeg = new Ffmpeg(); 
							$Ffmpeg->create_posterframe($AVObj, $timecode);
						}

				}//end else if ($quality=='audio') {				
				#dump($source_full_path, ' source_full_path - '.$path_copia);

			
				
				#
				# AV. (Auto save when is called without id)
				# Save now image for get proper thumb image in valor_list
				$component_tipo 		= RESOURCE_COMPONENT_TIPO_AV;	//'rsc29'; 	//"dd750";
				$component_dato 		= null;
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$current_component 		= component_common::get_instance($modelo_name, $component_tipo, $recurso_section_id, 'edit', DEDALO_DATA_NOLAN, RESOURCE_SECTION_TIPO);
				$current_component->Save();
				

			
			#
			#
			# PORTAL : Si se ha creado un registro de portal porque no existía, 
			# buscamos la sección de inventario, sus portales y enlazamos el recurso al portal correspondiente
			#
				# PORTAL AV	
					# COMPONENT : portal de Documemntación asociada / imagenes 'dd1125'
					$component_tipo   = MAIN_PORTAL_AV;	//'mupreva17';	//"dd1125";			
					$modelo_name 	  = 'component_portal';
					# Locator
					$locator = new locator();
						$locator->set_section_id($recurso_section_id);
						$locator->set_section_tipo(RESOURCE_SECTION_TIPO);			
					$component_portal = component_common::get_instance($modelo_name, $component_tipo, $section_general_id, 'edit', DEDALO_DATA_NOLAN, MAIN_SECTION_TIPO);
					$component_portal->add_locator($locator);
					$component_dato = $component_portal->get_dato();		
					$component_portal->Save();
					
					$html .= "<div class=\"info_line\">Añadido recurso $recurso_section_id de galería audio </div>";		
			

			
			# DELETE AFTER
			if ($delete_after=='si') {
				unlink($source_full_path);
				$html .= "<div class=\"info_line\">Eliminada la imagen de partida ".$image_name." de la carpeta de importación</div>";
			}

			
			#
			# INFORMACIÓN DE LA IMPORTACIÓN DE ESTA IMAGEN
			if ($quality=='audio') {
				$AVObj			= new AVObj($av_id, 'audio', $aditional_path, $initial_media_path);
				$av_url			= $AVObj->get_url();				
				#$av   			= "<a href=\"$av_url\" target=\"_blank\">";
				$av   			= "<audio src=\"".$av_url."\" class=\"audio_preview\" style=\"width:100%\" controls></audio>";
				#$av   			= "</a> ";	
			}else{
				$AVObj			= new AVObj($av_id, 'video', $aditional_path, $initial_media_path);
				$av_url			= $AVObj->get_url();				
				#$av   			= "<a href=\"$av_url\" target=\"_blank\">";
				$av   			= "<video class=\"video_preview\" style=\"height:400px\" controls>
									<source src=\"".$av_url."\" type=\"video/mp4\">
								   </video>";
				#$av   			= "</a> ";	
			}
							
				$html 		   .= $av;
				$html 		   .= "<hr>";
				
			$html .= "</div>"; #end wrap_response_ficha
			
			$i++; # IMPORTANTE
		}#end foreach ($all_av_files as $ar_group_value)
		
		
		# VOLVER BUTTON
		#$html .= "\n <div class=\"css_button_generic button_back link\" onclick=\"window.history.back();\">";
		#$html .= label::get_label('volver') ;
		#$html .= "</div>";

		$html .= "</div>";#end class=\"wrap_response_import\"


		# Enable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = true;
		RecordObj_time_machine::$save_time_machine_version = true;

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
	$folder_name = safe_xss($_REQUEST['dir']);
	$folder   	 = '';
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
		
			$valid_extensions = unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED);
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
			$all_av_files 		= $ar_data;
			$import_image_checkbox  = array_keys($all_av_files);
				#dump($all_av_files, " all_av_files for $dir/$folder_name".to_string());die();
			
			# Section id
			preg_match($regex, $folder_name, $output_array);
			$section_general_id = (int)$output_array[1];
			if ($section_general_id<1) {
				#die("section_general_id is empty");
				echo "<h2 style=\"color:red\">section_general_id is empty. Ignorado el directorio ($folder_name) </h2>";
				#dump($section_general_id, "Galería section_id ".to_string()); #die();
				continue;
			}

			#dump($all_av_files, ' all_av_files '.$recurso_section_id);#die();
			#die("STOP");

			$options = new stdClass();
				$options->section_general_id 	= $section_general_id;
				$options->folder_name 		 	= $folder_name;		#dump($folder_name, " folder_name ".to_string());
				$options->all_av_files 	 	= $all_av_files;
				$options->import_image_checkbox = $import_image_checkbox;
				$options->quality 	 		 	= 'audio';
				$options->initial_media_path 	= $initial_media_path;
				$options->button_import_obj 	= null;
				$options->fotografo 			= null;
				$options->delete_after 			= 'no';

			if(SHOW_DEBUG) {
				echo " <br>Galería id $section_general_id que va... ";	;
			}
			
			if ($_REQUEST['import_folder']==='real') {
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



