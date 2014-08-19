<?php
/**
* EXTRAS MUPREVA
* Scripts específicos para el proyecto referido
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');

# Login check
	if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# Show errors
	if(navigator::get_userID_matrix()===1) {
	    ini_set( 'display_errors', 1 );     // Default 1
	    error_reporting(E_ALL);             // Default -1 or E_ALL (Report all PHP errors)
	}

# Set vars
	$vars = array('mode','process','variante','images_directory','type','inicio','fin');
	foreach($vars as $name)	$$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

	
/**
* CREATE_RECORDS
*/
if ($mode=='create_records') {

	die("Stoped");

	$start_time= start_time();

	set_time_limit ( 24000 );

	# Disable log temporarily
	logger_backend_activity::$disable_log = true;

	ob_implicit_flush(true);


	$total = 45000;
	#$total = 100;
	for ($i=1; $i <= $total; $i++) {
		# code...

		# SECTION : Creamos la nueva sección para obtener el parent de los componentes (section_id)
		$section_tipo	= 'dd334';
		$section 		= new section(NULL,$section_tipo); #($id=NULL, $tipo=false, $modo='edit') {
		$section_general_id 	= $section->Save();

		# COMPONENT : Filtro 'dd496'
		$component_tipo 		= "dd496";
		$component_dato 		= array("26"=>"2");	# Id matrix del proyecto
		#$component_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$current_component 		= new component_filter(null, $component_tipo, 'edit', $section_general_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
		$current_component->set_dato($component_dato);
		$current_component->Save();

		# COMPONENT : Número de inventario 'dd1114'
		$component_tipo 		= "dd1114";
		$component_dato 		= $section->get_section_id();
		$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_general_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
		$current_component->set_dato($component_dato);
		$current_component->Save();

		$exec_time 		= exec_time_unit($start_time, $unit='sec');
		$memory_usage 	= tools::get_memory_usage(false);

		echo("<pre> executing $i [$section_general_id] ... $exec_time secs - memory_usage:$memory_usage</pre>");
	}

	# Restore log
	logger_backend_activity::$disable_log = false;

	exit("ok (i:$i)");
}


/**
* MONEDA_DOBLE
*/
if ($mode=='moneda_doble') {

	set_time_limit ( 24000 );
	# Disable log temporarily
	logger_backend_activity::$disable_log = true;
	ob_implicit_flush(true);


	if (empty($images_directory)) {
		exit( "Error: images_directory is not defined!" );
	}

	$pat_original 	= "/prehistoria/dedalo/media/image/original";
	$pat_thumb 		= "/prehistoria/dedalo/media/image/1.5MB";

	$pat_original 	= $pat_original . $images_directory;
	$pat_thumb 		= $pat_thumb . $images_directory;

	/*
	dump($pat_original,'$pat_original');
	dump($pat_thumb,'$pat_thumb');
	dump($pat_original.'/'.$inicio.'-1.jpg');
	dump($pat_thumb.'/'.$inicio.'-1.jpg');
	die("stoped");
	*/
	if (empty($fin)){

		$primera = $pat_original.'/'.$inicio.'-1.jpg';
		$segunda = $pat_original.'/'.$inicio.'-2.jpg';
		exec("cp -p $primera $segunda", $output);
			print_r($output);echo "<hr>";
		exec("convert $primera -gravity West -crop 50%x0+0+0 $primera", $output);
			print_r($output);echo "<hr>";
		exec("convert $segunda -gravity East -crop 50%x0+0+0 $segunda", $output);
			print_r($output);echo "<hr>";
		
		# Thumb
		$target_thumb = $pat_thumb.'/'.$inicio.'-1.jpg';
		$convert = ImageMagick::convert($primera, $target_thumb, '-thumbnail 720x720');
			print_r($convert);echo "<hr>";

	}else{
		for ($i=$inicio; $i <= $fin; $i++) { 
			$primera = $pat_original.'/'.$i.'-1.jpg';
			$segunda = $pat_original.'/'.$i.'-2.jpg';
			exec("cp -p $primera $segunda", $output);
				print_r($output);echo "<hr>";
			exec("convert $primera -gravity West -crop 50%x0+0+0 $primera", $output);
				print_r($output);echo "<hr>";
			exec("convert $segunda -gravity East -crop 50%x0+0+0 $segunda", $output);
				print_r($output);echo "<hr>";

			# Thumb
			$target_thumb = $pat_thumb.'/'.$i.'-1.jpg';
			$convert = ImageMagick::convert($primera, $target_thumb, '-thumbnail 720x720');
				print_r($convert);echo "<hr>";

		}//for
	}//if else
		#
}# end moneda_doble


/**
* PROCESS_FOLDER
* Procesa una carpeta de imágenes generando los registros correspondientes
*/
if ($mode=='process_folder') {

	# set vars
	$vars = array('images_directory','type');
	foreach($vars as $name) $$name = common::setVar($name);

	if (empty($images_directory)) {
		exit( "Error: images_directory is not defined!" );
	}
	if (empty($type)) {
		exit( "Error: type is not defined!" );
	}



	# READ DIR (MUST BE ACCESSIBLE)
	function find_all_files($dir, $recursive=true, $type) {
		global $inicio,$fin;

		$ar_data=array();

	  	$root = scandir($dir);
	    foreach($root as $value) {
	    	# Skip
	        if($value === '.' || $value === '..' || $value === 'Thumbs.db' || $value == '.DS_Store' || strpos($value,'.tmp')!==false || strpos($value,'.txt')!==false) {continue;}

	        # Case file
	        if(is_file("$dir/$value")) {

	        	if(!empty($inicio) && !empty($fin)) {
	        		for ($i=$inicio; $i <= $fin; $i++) {
	        			if($value == $i.'-2.jpg') {
	        				$ar_data[] = get_file_data($dir, $value, $type);
	        					#dump($value,"añadido $value");
	        			}
	        		}
	        	}else{
	        		$ar_data[] = get_file_data($dir, $value, $type);
	        	}	        	
	        	continue;
	        }
	        
	        # Case dir ($recursive==true)
	        if($recursive) foreach(find_all_files("$dir/$value", $recursive, $type) as $value) {
	            $ar_data[] = $value;
	        }
	    }
	    return $ar_data;
	}
	$scanned_directory = find_all_files($images_directory,false,$type);
		#dump($scanned_directory,'$scanned_directory for '.$images_directory);

	
	# ITERATE IMAGES ARRAY
	# Las agrupamos por número
	$ar_image_group=array();
	$html  = '';
	$ar_used_names = array();
	foreach ($scanned_directory as $key => $ar_value) {
		$number_int 			 = $ar_value['number_int'];
		if($number_int<1) {

			dump("ERROR: number_int is wrong!!! No será incluido para importar");
			dump($ar_value,'$ar_value');

		}else{

			$file_name_dd = $ar_value['number_int'] .'-'. $ar_value['disparo_int'];
			if(in_array($file_name_dd, $ar_used_names)) {
				$msg = "<span class=\"error\">ERROR: file_name_dd: $file_name_dd already exists!!! ".$ar_value['file_name'].". <BR>REMOVE ONE BEFORE CONTINUE </span> ";
				dump($file_name_dd, $msg,true,true);	#No será incluido para importar
				$html .= $msg;
				#dump($file_name_dd,'$file_name_dd');
			}
			$ar_used_names[] = $file_name_dd;

			$ar_image_group[$number_int][] = $ar_value;
		}
	}


	# PROCESS / PREVIEW
	# Modo preview
	if ($process!=1) {

		# PREVIEW
		$html .= "<h2 class=\"h2_title\"> PREVIEW (MUPREVA IMAGEN ORIGINAL) </h2><div class=\"process_right_info\">[type:$type - variante:$variante]</div><HR>";
		#$html .= dump($ar_image_group,'ar_image_group',null,false);	#$val, $var_name=NULL, $expected=NULL, $print=false)

		$html .= css::build_tag(DEDALO_LIB_BASE_URL.'/common/css/common.css');
		$html .= css::build_tag(DEDALO_LIB_BASE_URL.'/html_page/css/html_page.css');		
		$html .= css::build_tag(DEDALO_LIB_BASE_URL.'/extras/mupreva/css/mupreva.css');

		foreach ($ar_image_group as $number => $ar_group_value) {
			#$html .= "<div style=\"width:100%;padding:10px;margin:20px;\">";
				foreach ($ar_group_value as $key => $ar_data) {
					$rowspan = count($ar_data)+0;
					$html .= "<table class=\"table_preview\">";

					if( isset($ar_data['file_name_dd']) ) {
						$html .= "<caption>".$ar_data['file_name_dd']."</caption>";
					}
					foreach ($ar_data as $key3 => $value3) {

						$html .= "<tr>";

						$html .= "<td class=\"td_title\">";
						$html .= $key3;
						$html .= "</td>";

						$html .= "<td class=\"td_content\">";
						if($key3=='file_name_dd') $html .= "<h1>";
						$html .= $value3;						
						if($key3=='file_name_dd') $html .= "</h1>";
						$html .= "</td>";

						$html .= "</tr>";

					}
					$html .= "</table>";
				}
			#$html .= "</div>";
		}

		$html .= "<form action=\"\" method=\"post\">";
		$html .= "<input type=\"hidden\" name=\"process\" value=\"1\">";
		$html .= "<span>Procesar:</span> <input type=\"submit\" class=\"css_button_generic submit_import\" value=\"OK\">";
		$html .= "</fom>";
		if($_POST)
		$html .= dump($_POST);

		echo html_page::get_html($html);
		exit();

	}else{

		ob_implicit_flush(true);
		
		# PROCESS
		$html='';
		echo "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />";

		# CSS
		echo css::build_tag(DEDALO_LIB_BASE_URL.'/common/css/common.css');
		echo css::build_tag(DEDALO_LIB_BASE_URL.'/html_page/css/html_page.css');		
		echo css::build_tag(DEDALO_LIB_BASE_URL.'/extras/mupreva/css/mupreva.css');

		# JS
		#echo js::build_tag(DEDALO_LIB_BASE_URL.'/common/js/common.js');

		echo "<div class=\"wrap_response_import\">";
		echo "<h2 class=\"h2_title\"> PROCESS (MUPREVA ORIGINAL) </h2><HR>";
		#echo "PROCESS <HR>";

		$start_time= start_time();

		set_time_limit ( 24000 );

		# Disable log temporarily
		logger_backend_activity::$disable_log = true;


		$i=0;
		#
		foreach ($ar_image_group as $number => $ar_group_value) {

			#<a href=\"". DEDALO_ROOT_WEB."/main/?m=list" ."\" target=\"_blank\">
			#echo "<div><h1>$number</h1> Total:".count($ar_group_value)."</div>";
			echo "<div class=\"cabecera_ficha\"><span>Ficha $number</span> - Total imágenes:".count($ar_group_value)."</div>";
			echo "<div class=\"wrap_response_ficha\">";

			foreach ($ar_group_value as $key => $ar_data) {

				#dump($ar_data,'$ar_data');
				$quality 			= $ar_data['quality'];
				$number_int 		= $ar_data['number_int'];
				$disparo_int 		= $ar_data['disparo_int'];
				$file_name_dd 		= $ar_data['file_name_dd'];
				$extension 			= $ar_data['extension'];
				$target_dir 		= $ar_data['target_dir'];
				$target_dir_name 	= $ar_data['target_dir_name'];

				# Creamos un registro de imagen con cada foto

				/**/
				# VERIFICAMOS SI EXISTE PARA EVITAR DUPLICIDADES
				$arguments=array();
				$arguments['strPrimaryKeyName']	= 'parent';
				$arguments['tipo']				= 'dd1115';	# Código
				$arguments['dato:json_exact']	= $file_name_dd;  # tipo "dd750-1"
				$matrix_table 					= common::get_matrix_table_from_tipo('dd1115');
				$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
				$ar_result						= $RecordObj_matrix->search($arguments);
				if(!empty($ar_result)) {
					$msg = " <pre> - Warning: Este registro (number:$number) (tipo:dd1115) (file_name_dd:$file_name_dd) ya existe en matrix: ID $ar_result[0]. Será ignorado</pre>";
					#throw new Exception("Error Processing Request. $msg", 1);
					echo "<div class=\"error\">$msg</div>";
					# Cerramos el div wrap_response_ficha !IMPORTANT 
					echo "</div>"; #end wrap_response_ficha
					continue;
				}


				#
				# SECTION : Creamos la nueva sección para obtener el parent de los componentes (section_id)
				#
					# Section tipo (dd1183) . Sección virtual 'Imágenes catálogo' que es filtrada por dd1116 = 233, y por "dd1131":"12" {"filtered_by":{"dd1116":"233","dd1131":"12"}}
					$section_tipo	= 'dd1183';
					$section 		= new section(NULL,$section_tipo); #($id=NULL, $tipo=false, $modo='edit') {
					#$section->set_tipo($section_tipo);
					$section_id 	= $section->Save();
						#dump($section_id,'section_id . creado registro de imágenes '.$section_tipo." - counter:". counter::get_counter_value($section_tipo). " - section_id:".$section->get_section_id() );
						#dump($section,'section');
				#
				# COMPONENTES : Creamos / salvamos los compoenentes que albergan los datos necesarios
				#

					# COMPONENT : Filtro 'dd496'
					$component_tipo 		= "dd364";
					$component_dato 		= array("26"=>"2");	# Id matrix del proyecto
					#$component_modelo_name = RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
					$current_component 		= new component_filter(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					$current_component->set_dato($component_dato);
					$current_component->Save();

					# CÓDIGO
					$component_tipo 		= "dd1115";
					$component_dato 		= $file_name_dd;
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
					$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					$current_component->set_dato($component_dato);
					$current_component->Save();

					# CÓDIGO ANTERIOR
					if($variante=='dedalo') {
						# Buscar el dato de código de la 1-1
						$arguments=array();
						$arguments['strPrimaryKeyName']	= 'parent';
						$arguments['tipo']				= 'dd1115';	# Código
						$arguments['dato:json']			= $number_int.'-1';  # tipo "dd750-1"
						$matrix_table 					= common::get_matrix_table_from_tipo('dd1115');
						$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
						$ar_result						= $RecordObj_matrix->search($arguments);
						if(empty($ar_result[0])) {
							echo "<div class=\"error\">No se ha encontrado el dato de '{$number_int}-1' (1)</div>";
						}
						$current_parent = $ar_result[0];
						$arguments=array();
						$arguments['strPrimaryKeyName']	= 'dato';
						$arguments['tipo']				= 'dd345';	# Código anterior
						$arguments['parent']			= $current_parent;  
						$matrix_table 					= common::get_matrix_table_from_tipo('dd1115');
						$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
						$ar_result						= $RecordObj_matrix->search($arguments);
						if(empty($ar_result[0])) {
							echo "<div class=\"error\">No se ha encontrado el dato de '{$number_int}-1' (2)</div>";
						}
						$component_tipo 		= "dd345";
						$component_dato 		= $ar_data['file_name'];
						$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
						$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
						
						$dato = json_handler::decode($ar_result[0]);
						# Replace '_01_' x '_02_'
						if(strpos($dato, '_01_'))
						$dato = str_replace('_01_', '_02_', $dato);

						$current_component->set_dato( $dato );
						$current_component->Save();

					}else{
						$component_tipo 		= "dd345";
						$component_dato 		= $ar_data['file_name'];
						$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
						$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
						$current_component->set_dato($component_dato);
						$current_component->Save();
					}
					

					# COLECCION
					# Colección (dd1131) lista de valores pública. dd1131 = 12 para MUPREVA
					$coleccion_tipo 		= "dd1131";
					$coleccion_dato 		= "12";
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($coleccion_tipo);
					$current_component 		= new $component_modelo_name(null, $coleccion_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					$current_component->set_dato($coleccion_dato);
					$current_component->Save();
						#dump($current_component->get_id(),'component_id . creado registro de componente coleccion '.$coleccion_tipo.' - '.$component_modelo_name. " - dato: $coleccion_dato");

					# PATH . Directorio
					$path_tipo 				= "dd1110";
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($path_tipo);
					$current_component 		= new $component_modelo_name(null, $path_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					$current_component->set_dato($ar_data['target_dir_name']);
					$current_component->Save();
						#dump($current_component->get_id(),'component_id . creado registro de componente path '.$path_tipo.' - '.$component_modelo_name. " - dato: ".$ar_data['target_dir_name']);

					# FILE NAME . nombre del fichero
					$file_name_tipo 		= "dd851";
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($file_name_tipo);
					$current_component 		= new $component_modelo_name(null, $file_name_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					$current_component->set_dato($ar_data['file_name_dd']);
					$current_component->Save();
						#dump($current_component->get_id(),'component_id . creado registro de componente file_name '.$file_name_tipo.' - '.$component_modelo_name. " - dato: ".$ar_data['file_name_dd']);

					# OBSERVACIONES . Info adicional
					#$obs_tipo 				= "dd847";
					#$obs_dato 				= "Importado desde: ".$ar_data['full_path'];
					#$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($obs_tipo);
					#$current_component 		= new $component_modelo_name(null, $obs_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					#$current_component->set_dato($obs_dato);
					#$current_component->Save();
						#dump($current_component->get_id(),'component_id . creado registro de componente file_name '.$obs_tipo.' - '.$component_modelo_name. " - dato: $obs_dato");

					# IMAGE. (Auto save when is called without id)
					$image_tipo 			= "dd750";
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($image_tipo);
					$current_component 		= new $component_modelo_name(null, $image_tipo, 'edit', $section_id); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
						#dump($current_component->get_id(),'component_id . creado registro de componente file_name '.$image_tipo.' - '.$component_modelo_name. " - dato: ");



					# IMAGE COPY FILE
					$path_test = realpath($target_dir);
					if(!$path_test) throw new Exception("Error Processing Request. Path not exists: ".$target_dir, 1);

					if( strtolower($extension) != DEDALO_IMAGE_EXTENSION ) {

						$path_copia = $target_dir .'/'. $file_name_dd .'.'. strtolower($extension);
						# Copiamos el original
						copy($ar_data['full_path'], $path_copia);
						# JPG : la convertimos a jpg
						ImageMagick::convert($path_copia, $target_dir .'/'. $file_name_dd .'.'. DEDALO_IMAGE_EXTENSION );

					}else{
						# Lo copiamos asegurándonos que la extensión queda en minúsculas
						copy($ar_data['full_path'], $target_dir .'/'. $file_name_dd.'.'.DEDALO_IMAGE_EXTENSION);	#$file_name_dato.'.'.DEDALO_IMAGE_EXTENSION
					}



					#
					# THUMB : Creamos la versión 'default'
					#
					$make_thumb = true; # Sólo activar cuando la fuente es la imagen identificativa, es decir, la images modificada (lo haremos también para la original y luego las sobreescribimos)
					if($make_thumb===true) {

						$source_image 	= $target_dir .'/'. $file_name_dd.'.'.DEDALO_IMAGE_EXTENSION ;
						#$source_quality = $quality;	# 'original','identificativa','25MB','6MB','1.5MB','<1MB'
						$source_quality = $quality ; if($quality!='original') throw new Exception("Error. Source quality debe ser 'original' ", 1);
						$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;
						$aditional_path = $ar_data['target_dir_name'];


						# Image source
						$ImageObj				= new ImageObj($file_name_dd, $source_quality, $aditional_path);
						$source_image 			= $ImageObj->get_local_full_path();
						$source_pixels_width	= $ImageObj->get_image_width();
						$source_pixels_height	= $ImageObj->get_image_height();
							#dump($source_image,"$source_pixels_width x $source_pixels_height");

						# Image target
						$ImageObj				= new ImageObj($file_name_dd, $target_quality, $aditional_path);
						$target_image 			= $ImageObj->get_local_full_path();
						$ar_target 				= ImageObj::get_target_pixels_to_quality_conversion($source_pixels_width, $source_pixels_height, $target_quality);
						$target_pixels_width 	= $ar_target[0];
						$target_pixels_height 	= $ar_target[1];



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
							echo Error::wrap_error($msg);
						}

						# Thumb
						#$Thumb = new Thumb($source_image);
						#$Thumb->resize_basic($target_pixels_width,$target_pixels_height);
						#$response = $Thumb->save($target_image, $quality = 100);

						if($target_pixels_width<1)  $target_pixels_width  = 720;
						if($target_pixels_height<1) $target_pixels_height = 720;

						$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height ;
						ImageMagick::convert($source_image, $target_image, $flags);
							#dump($flags,"$source_image, $target_image");
   					}#if($make_thumb===true) {


			#break;

				#
				# PORTAL : Buscamos la sección de inventario, sus portales y enlazamos el recurso al portal correspondiente
				#
					/**/
					$arguments=array();
					$arguments['strPrimaryKeyName']	= 'parent';
					$arguments['tipo']			= 'dd1114';
					#$arguments['dato']			= $number;
					$arguments['dato:json_exact']= $number; # tipo "1"
					$matrix_table 				= common::get_matrix_table_from_tipo('dd1114');
					$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
					$ar_result					= $RecordObj_matrix->search($arguments);
						#dump($ar_result,'$ar_result ');

					$section_general_id 	= $ar_result[0];

					if(empty($section_general_id)) {
						dump($arguments,'arguments');
						throw new Exception("Error Processing Request. Registro no encontrado", 1);
					}



				if($disparo_int == 1) {

					# IMAGEN IDENTIFICATIVA (PORTAL)
					# COMPONENT : portal de imagen identificativa 'dd1113'
					$component_tipo 		= "dd1113";
					$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
					$current_component 		= new $component_modelo_name(null, $component_tipo, 'edit', $section_general_id, DEDALO_DATA_NOLAN); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					# get current dato in db
					$dato 				= $current_component->get_dato();
					# mix array current dato + rel_locator resource string like (1253.0.0)
					$rel_locator		= $section_id .".0.0";
					$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
					# set new array dato and save record in matrix
					$current_component->set_dato($new_ar_dato);
					$current_component->Save();

				}else{

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
				}

				$exec_time 		= exec_time_unit($start_time, $unit='sec');
				$memory_usage 	= tools::get_memory_usage(false);
				$img_url 		= $ImageObj->get_url();

				$img = "<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" valign=\"middle\" style=\"height:120px;max-width:200px;margin-right:5px;\" /></a> ";
				echo("$img <pre>$file_name_dd executing i:$i number:$number - disparo_int:$disparo_int [section_general_id:$section_general_id - section_id:$section_id - portal_dato:".to_string($new_ar_dato)."] ... $exec_time secs - memory_usage:$memory_usage</pre>");
				echo "<br>";

				echo "</div>"; #end wrap_response_ficha

			}#foreach ($ar_group_value as $key => $ar_data) {
			#break;


			$i++;
			#if($i>=1) break;

		}#foreach ($ar_image_group as $number => $ar_group_value) {


		# VOLVER BUTTON
		print "\n <div class=\"css_button_generic button_back link\" onclick=\"window.history.back();\">";
		print label::get_label('volver') ;
		print "</div>";

		echo "</div>";	#end  class=\"wrap_response_import\"
		#echo html_page::get_html($html);


		# DELETE FILTER CACHE
		exec('redis-cli --raw keys *_filter_key_name_* | xargs redis-cli del');

		exit();

	}#END PROCESS
}#end if ($mode=='process_folder') {



# GET_FILE_DATA
function get_file_data($dir, $value, $type) {
	global $variante;

	$ar_data 	= array();

	$full_path	= "$dir/$value";

	$img_url 	= DEDALO_ROOT_WEB . "/inc/img.php?s=$full_path";

	# Convertimos los nombres de carpetas tipo '00100' a enteros, tipo '100'
	$ar_dir = explode('/', $dir);
	foreach ($ar_dir as $dir_value) {
		if (strpos($dir_value, '0')===0) {
			$dir_value = intval($dir_value);
		}
		$ar_final_dir[] = $dir_value;
	}

	$dir_final = implode('/', $ar_final_dir);

	$dir = $dir_final;


	# Localizamos la posición de la primera secuencia de números en el path. Por ejemplo, el primer '/0' en /Users/paco/prehistoria/originales/00000/00000/00001.tif
	# Con ello podremos restar el directorio local al path definitivo
	preg_match("/\/\d/", $dir, $first_digit );
		#dump($first_digit,'$first_digit');
	if (!isset($first_digit[0])) {
		throw new Exception("Error Processing Request. first_digit in " .$dir, 1);
	}
	$first_digit_pos = strpos($dir, $first_digit[0]);
		#dump($first_digit_pos,'$first_digit_pos');


	$path_dato 						= substr($dir, $first_digit_pos );



	#dump($variante,"variante");

	# preg_match file
	switch ($type) {		

		case 'catalogo':
			if($variante=='dedalo') {
				preg_match("/(\d*)-?(\d*)()\.([a-zA-Z]{3,4})/", $value, $ar_value); #dump($variante,"variante ".print_r($ar_value,true));

			}else{
				preg_match("/(\d*)_?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/", $value, $ar_value);
			}			

			$file_name 	= $ar_value[0];
			$number 	= $ar_value[1];
			$disparo 	= $ar_value[2];
			$info_text 	= $ar_value[3];
			$extension 	= $ar_value[4];
			$quality 	= 'original';	# QUALITY 	 original | identificativa
			break;

		case 'negativos':
			preg_match("/(\d*)-{0,1}(\w{1,}\b.*)\.([a-zA-Z]{3,4})\z/", $value, $ar_value);

			$file_name 	= $ar_value[0];
			$number 	= $ar_value[1];
			$disparo 	= $ar_value[2];
			$info_text 	= $ar_value[3];
			$extension 	= $ar_value[4];
			$quality 	= 'original';	# QUALITY

			throw new Exception("Type $type en proceso...", 1);

			break;

		default:
			throw new Exception("Type $type no supported!", 1);
	}
	#dump($ar_value,'value '.$value);

	/*
	# CHECK QUALITY
	switch (true) {
		case (stripos($file_name, '_ORIG.') || stripos($full_path, 'originales') ):
			$quality = 'original';
			break;
		case (stripos($file_name, '_BR.')):
			$quality = 'BR';
			break;
		case (stripos($file_name, '_MD.')):
			$quality = 'identificativa';
			break;
		default:
			$quality = 'identificativa';
			break;
	}
	*/


	# DISPARO : Fix no info
	$disparo_int = intval($disparo);
	if($disparo_int<1) $disparo_int = 1;

	# VERIFICACIÓN DE VALORES :
	# number_int . Si no se detecta number_int , notificamos el error para el preview
	if(intval($number)<1)
		$ar_data['INFO'] 	= "<span style=\"color:red;font-size:2em\"> Wrong Format !!! (number_int) not found in ".intval($number)."</span>";
	# disparo_int . Si no se detecta disparo_int , le asignamos '1' y lo notificamos al preview
	if(intval($disparo)<1 ) {
		$ar_data['INFO'] 	= "<span style=\"color:orange;font-size:1.5em;\"> Ops !!! (disparo_int) not found in ".$file_name." Asignado 1 como disparo_int </span>";
		$disparo 			= '01';
	}

	# AR_DATA
	$ar_data['full_path'] 		= $full_path;
	$ar_data['path'] 			= $dir;
	$ar_data['file_name'] 		= $file_name;
	$ar_data['number'] 			= $number;
	$ar_data['number_int']		= intval($number);
	$ar_data['disparo']			= $disparo;
	$ar_data['disparo_int']		= intval($disparo);
	$ar_data['info_text'] 		= $info_text;
	$ar_data['info_text_sure'] 	= urlencode($info_text);
	$ar_data['extension'] 		= $extension;
	$ar_data['quality']			= $quality;
	$ar_data['target_dir'] 		= DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER .'/'.$quality . $path_dato;
	$ar_data['target_dir_name'] = $path_dato;
	$ar_data['file_name_dd'] 	= intval($number) .'-'. intval($disparo_int);
	$ar_data['filesize'] 		= number_format(filesize($full_path)/1024/1024,3) . " MB";
	#$ar_data['image'] 			= "Preview from $extension ";#<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" valign=\"middle\" style=\"height:260px;max-width:400px;margin-right:10px\" /></a>";	#float: right;position: relative;top: -260px;right: 50px;
	$ar_data['image'] 			= "<a href=\"$img_url\" target=\"_blank\"><img src=\"".$img_url."\" valign=\"middle\" style=\"max-height:260px;max-width:400px;margin-right:10px;\" /></a> ";
	if (strtolower($extension)!='jpg') {
		#$ar_data['image'] 		.= " from $extension ";
	}
	if( intval(filesize($full_path)/1024/1024,3) >4 ) {
		$ar_data['image'] 		= "<a href=\"$img_url\" target=\"_blank\"><div style=\"max-height:260px;max-width:400px;margin-right:10px;float:left;background-color:#FFDDDD\"> Original is too big image to show (>2 MB) </div></a> ";
	}
	$img_url_preview = 'foto_preview.php?f='.$full_path ;
	$ar_data['image'] .= "<a href=\"$img_url_preview\" target=\"_blank\"><img src=\"".$img_url_preview."\" valign=\"middle\" style=\"max-height:260px;max-width:400px;margin-left:10px;\" /></a>";

	#$ar_data['image'] .= system(MAGICK_PATH . " identify $full_path");

	# DIRECTORIO : PREPARA (CREA) EL DIRECTORIO DE DESTINO EN DEDALO (recursivo)
	if (!file_exists($ar_data['target_dir'])) {
	    mkdir($ar_data['target_dir'], 0777, true);
	    $msg = "The directory ".$ar_data['target_dir']." was successfully created." ;
	    array_unshift($ar_data, "<span style=\"color:green;font-size:1.2em\"> $msg </span>");
	}


	return $ar_data;
}

?>
