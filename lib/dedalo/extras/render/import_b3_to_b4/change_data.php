<?php 
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

#require_once('tipo_map.php');
#dump($_SESSION['dedalo4']['auth']['user_id']," ");
/**/
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

if ( $_SESSION['dedalo4']['auth']['user_id']!=='-1' || strpos(DEDALO_HOST, '8888')===false) {
	die("<span class='error'> Auth error: please login as admin in development host </span>");
}



$seconds = 60 * 60 * 8;
set_time_limit ( $seconds );

# set vars
	$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);



# Set special php global options
	ob_implicit_flush(true);
	set_time_limit ( 99999999932000 );
	
	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;




/*
	PROTOCOLO

	1 - Adminier: Script SQL (Alex) para crear las nuevas columnas etc.
	2 - Terminal : Actualizar matrix_dd porqwue hay errores :
		sudo -u tesisciro pg_restore --host localhost --port 5432 --username "tesisciro" --dbname "dedalo4_tesisciro" --role "tesisciro" --no-owner --no-privileges --clean --verbose "/home/www/vhosts/tesisciro.antropolis.net/matrix_dd_9-4-2015.backup"
	3 - PHP : Script change_data->set_matrix_section_tipo_column
	4 - RSYNC : Udate dedalo code version to D4 RC 42
	*5 - PHP : update_components_section_id_references
	*6 - PHP: archivo config, actualizar (cambiar session de usuario, etc,,)
	*7 - Dedalo : Actualizar la structura
	8 - FTP : Renombrar todos los archivos media a la nueva nomenclatura tipo 'rsc35_rsc167_1.mp4' (Alex tiene el comando unix)
	9 - Actividad: arreglar las referencias a "Quién" change_data::update_matrix_activity_quien
	10 - Adminer Dedalo Usuarios crear usuario -666 
		{
		    "label": "Usuarios",
		    "components": {
		        "dd132": {
		            "dato": {
		                "lg-nolan": "unknow"
		            },
		            "info": {
		                "label": "Usuario",
		                "modelo": "component_input_text"
		            }
		        }
		    },
		    "section_id": -666,
		    "created_date": "2013-02-07 13:48:31",
		    "section_tipo": "dd128",
		    "created_by_userID": -666,
		    "section_real_tipo": "dd128",
		    "ar_section_creator": {},
		    "id_matrix_anterior": -666
		}

*/



/**
* RENAME_FILES [POR VERIFICAR]
*/
if ($mode=='rename_files') {

	$save = false;

	$dir = DEDALO_ROOT.'/media/av/posterframe'; 
	echo "dir: $dir<hr>";
	
	$files = scandir($dir);
	#unset($files[0],$files[1]);

	$regex = "/^(.*)-(.*)(\..{3})$/";

	foreach ($files as $oldname){
		// like rsc35-5.mp4
		#echo " $oldname <br>";

		preg_match($regex, $oldname, $output_array);
		if (empty($output_array[3])) continue;
		#if ( strpos($oldname, '.jpg')!==false) {

			$new_name = preg_replace($regex, "$1_rsc167_$2$3", $oldname);			

			if ($save===true) {
				rename ($dir.'/'.$oldname, $dir.'/'.$newname);
				echo "Renamed: $oldname -> $new_name <br>";
			}else{
				echo "Preview: $oldname -> $new_name <br>";
			}			
		#}
	    #$newname = substr($oldname, -12);
	    #rename ($dir.'/'.$oldname, $dir.'/'.$newname);
	   
	}

}//end if ($mode=='rename_files')



/**
* SET_MATRIX_SECTION_TIPO_COLUMN
* despeja el section tipo (si es una sección virtual será distinto del real tipo usado actualmente) y lo
* asigna a la columna 'section_tipo' de la tabla matrix actual (sólo una tabla matrix por script)
* b3 to b4 (9-4-2015)
* Tables to change: matrix, matrix_activity, matrix_dd, matrix_layout, matrix_layout_dd, matrix_list, matrix_profiles, matrix_projects, matrix_time_machine, matrix_users
*/
if ($mode=='set_matrix_section_tipo_column') {

	echo "<h1>set_matrix_section_tipo_column HERRIMEMORIA </h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "<b>WARNING!!! PREVIEW ONLY. NOTHING IS SAVED (1)</b><br>\n";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");

	$matrix_table		= $table;
	if ($matrix_table=='matrix_time_machine') {
		$strQuery = 'SELECT id, dato as datos FROM "'.$matrix_table.'" WHERE state IS NOT NULL ORDER BY id ASC  ';
	}else{
		$strQuery = 'SELECT id, datos FROM "'.$matrix_table.'"  ORDER BY id ASC LIMIT 999999999999999 OFFSET 0  '; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000	
	}
	dump($strQuery, ' strQuery');
	
	$result				= JSON_RecordObj_matrix::search_free($strQuery);

	while ($rows = pg_fetch_assoc($result)) {

		$id 	= (int)$rows['id'];
		$datos 	= (string)$rows['datos'];

		

		$datos	= (object)json_handler::decode($datos);

		if (!isset($datos->section_tipo)) {			
			continue;
		}
		$current_section_tipo	= $datos->section_tipo;	

		// Mupreva case
		if ($idsite=='mupreva' && $datos->section_tipo=='rsc2') { 
			$datos->section_creator_portal_section_tipo = 'mupreva21';
			$datos->section_creator_portal_tipo  		= 'mupreva17';
		}			
		
		#
		# RESUELVE EL SECTION TIPO DE LAS VIRTUALES
		$section_creator_portal_section_tipo = !empty($datos->section_creator_portal_section_tipo) ? $datos->section_creator_portal_section_tipo : false ;
		if ($section_creator_portal_section_tipo) {
			// la cogemos del dato del portal creator (es un recurso o similar llamado desde una sección de inventario)
			$section_tipo = $section_creator_portal_section_tipo;
		}else{
			$section_tipo = $current_section_tipo;	//(string)section::get_section_real_tipo_static($current_section_tipo);
		}


		$datos->section_real_tipo = $datos->section_tipo;	// la actual (siempre era la real)
		$datos->section_tipo 	  = $section_tipo;			// Calculada real o no


		
		if (isset($datos->created_by_userID)) {
			if ($datos->created_by_userID==1) {
				$datos->created_by_userID = (int)$datos->created_by_userID -2;
			}else{
				$datos->created_by_userID = (int)$datos->created_by_userID -1;
			}
		}
				
		if (isset($datos->modified_by_userID)) {
			if ($datos->modified_by_userID==1) {
				$datos->modified_by_userID = (int)$datos->modified_by_userID -2;
			}else{
				$datos->modified_by_userID = (int)$datos->modified_by_userID -1;
			}
		}		
		
		$lang='lg-nolan';
		#dump($datos->components->dd543->dato->$lang,'1 $datos->components->dd543->dato->$lang - '.$matrix_table);
		if ($matrix_table=='matrix_activity') {
			if (isset($datos->components->dd543)) {
				
				if ($datos->components->dd543->dato->$lang === 1) {
					#$datos->components->dd543->dato->$lang = (int)$datos->components->dd543->dato->$lang -2;
					#dump($datos->components->dd543->dato->$lang, ' BEFORE ');
					$locator = new locator();
						$locator->set_section_tipo('dd128');
						$locator->set_section_id('-1');
					$datos->components->dd543->dato->$lang = array( (object)$locator );
						#dump($datos->components->dd543->dato->$lang, ' AFTER ');
				}else if ( is_int($datos->components->dd543->dato->$lang) && $datos->components->dd543->dato->$lang >0 ) {
				
					#$datos->components->dd543->dato->$lang = (int)$datos->components->dd543->dato->$lang -1;
					dump($datos->components->dd543->dato->$lang, ' BEFORE2 ');
					$locator = new locator();
						$locator->set_section_tipo('dd128');
						$locator->set_section_id( (int)$datos->components->dd543->dato->$lang -1 );
					$datos->components->dd543->dato->$lang = array( (object)$locator );
						dump($datos->components->dd543->dato->$lang, ' AFTER2 ');
				}
			}			
		}
		#dump($datos->components->dd543->dato->$lang,'2 $datos->components->dd543->dato->$lang');


		$datos_ob = $datos;

 		$datos = (string)json_handler::encode($datos);		
		$datos = pg_escape_string($datos);

		#dump($datos," section_real_tipo"); 	


		// Save section dato
		if ($matrix_table=='matrix_activity') {
			
			$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
		
		}else if ($matrix_table=='matrix_time_machine'){
			
			$strQuery = "UPDATE \"$matrix_table\" SET dato = '$datos' WHERE id = $id";
		
		}else{
			
			$strQuery = "UPDATE \"$matrix_table\" SET section_tipo = '$section_tipo', datos = '$datos' WHERE id = $id";
		}		
		
		if ($save) {
			$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
			if (!$update_result) {
				dump($strQuery,"strQuery");
				echo pg_last_error();
				echo "<br> Error on Update row id_matrix:$id  (csection_real_tipo:$datos_ob->section_real_tipo - section_tipo:$datos_ob->section_tipo) - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
			}else {
				echo "<br> Updated row id_matrix:$id  (section_real_tipo:$datos_ob->section_real_tipo - section_tipo:$datos_ob->section_tipo) - ". '' ." <hr> "; //substr($strQuery, 0,250)
			}
		}else{
			echo "<hr> (PREVIEW) Updated row id_matrix:$id  (section_real_tipo:$datos_ob->section_real_tipo - section_tipo:$datos_ob->section_tipo) - ". '' ."  "; 
		}
		#dump($dato," dato");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end set_matrix_section_tipo_column








/**
* UPDATE_COMPONENTS_SECTION_ID_REFERENCES
* Resuleve y actualiza las referencias al nuevo formato b4
* Sólo corre en la beta4 (Con los cambios de los componentes y JSONRecorDatabounceObject)
* b3 to b4 (9-4-2015)
* Ejemplo:
* portal 
*	[{"section_id_matrix":"5"},{"section_id_matrix":"6"}]   >>   [{"section_id": "5","section_tipo": "dd125"},{"section_id": "6","section_tipo": "dd125"}]
*
* Tables to change: matrix, matrix_layout, matrix_layout_dd, matrix_list, matrix_profiles, matrix_projects, matrix_users
* NORRR : matrix_activity, matrix_dd, matrix_time_machine
*/
if ($mode=='update_components_section_id_references') {

	echo "<h1>update_components_section_id_references ".DEDALO_DATABASE_CONN."  /// </h1>";

	# FALSE / TRUE SAVE
	$save = false; 
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");	


	# 
	# AUTOLOGIN
	$_SESSION['dedalo4']['auth']['user_id']		= -1;
	$_SESSION['dedalo4']['auth']['username']	= 'admin';
	$_SESSION['dedalo4']['auth']['is_logged']	= 1;
	# CONFIG KEY
	$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encrypt_openssl(DEDALO_SALT_STRING);

	$matrix_table		= $table;
	$where 				= '';// "WHERE id = 185";
	
	if ($matrix_table=='matrix_time_machine') {
		$strQuery_base 	= 'SELECT id, tipo as section_tipo, section_id, dato as datos FROM "'.$matrix_table.'" WHERE state IS NOT NULL ORDER BY id ASC LIMIT 50000000000000 OFFSET 0 '; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000
	}else{
		$strQuery_base 	= 'SELECT id, section_tipo, section_id, datos FROM "'.$matrix_table.'" '.$where.' WHERE id != -666 AND id != -1 ORDER BY id ASC LIMIT 99999999999 OFFSET 0 '; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000
	}
	$result = JSON_RecordObj_matrix::search_free($strQuery_base);

	echo "<hr> $strQuery_base <hr>";

	while ($rows = pg_fetch_assoc($result)) {


		$id 		  	= (int)$rows['id'];
		$section_tipo 	= (string)$rows['section_tipo'];
		$section_id   	= (int)$rows['section_id'];
		$datos 			= (string)$rows['datos'];
		$datos			= (object)json_handler::decode($datos);

		# Section tipo IMPORTANT. if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
		$RecordObj_dd = new RecordObj_dd($section_tipo);
		$propiedades  = $RecordObj_dd->get_propiedades();
		$propiedades  = json_decode($propiedades);
		if(isset($propiedades->section_tipo) && $propiedades->section_tipo == "real"){
			$section_tipo = section::get_section_real_tipo_static($section_tipo);
		}

		if ($matrix_table=='matrix_time_machine') {
			# code...
		}
		#dump($section_id," section_id");	continue;
		

		echo "<h3>ID $id [$matrix_table]</h3>  ";

		# 0 Components
		if (!property_exists($datos, 'components')) {
			print("<hr>Skip id_matrix:$id - section_id:$section_id - section_tipo:$section_tipo without components - $strQuery_base");
			continue;
		}

		foreach ($datos->components as $component_tipo => $component_datum) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			
			
			# FILTER TEMPORAL
			#if ($modelo_name!='component_autocomplete') {
			#continue;
			#}

			$ar_modelo_name_to_change = array('component_portal','component_radio_button','component_select','component_autocomplete','component_check_box','component_filter');
			if (!in_array($modelo_name, $ar_modelo_name_to_change)) continue;
			
			echo "<h4>$modelo_name</h4>  ";
			

			#
			# MATRIX TABLE
				if ($modelo_name=='component_filter' || $modelo_name=='component_filter_master') {
					$current_matrix_table = 'matrix_projects';
				}else{

					#$section_tipo 		  = component_common::get_section_tipo_from_component_tipo($component_tipo);
					#$current_matrix_table = common::get_matrix_table_from_tipo($section_tipo);
					
					$related_component_tipo = RecordObj_dd::get_ar_terminos_relacionados($component_tipo, $cache=true, $simple=true);
						#dump($related_component_tipo," related_component_tipo $component_tipo");
					if (isset($related_component_tipo[0])) {
						$current_matrix_table = common::get_matrix_table_from_tipo($section_tipo);
					}else{
						$current_matrix_table = $matrix_table;	// 
					}
					/**/		
				}
				#dump($current_matrix_table," current_matrix_table");


			#
			# CONVERT
			switch ($modelo_name) {
				
				case 'component_portal':
					# Format:
					# (
					#    [0] => {"section_id_matrix":"5"}
					#    [1] => {"section_id_matrix":"6"}
					#    [2] => {"section_id_matrix":"45"}
					# )	
					$new_dato = array();
					$lang = 'lg-nolan';
					$dato = $component_datum->dato->$lang;		
					if (empty($dato)) continue;
						if (isset($dato->section_tipo) || isset($dato[0]->section_tipo)) {
							# ya hemos pasado por aquí..
							continue;
						}
						dump($dato,"dato $modelo_name $current_matrix_table  component_tipo:$component_tipo - id_matrix:$id");
					
					foreach ($dato as $key => $obj_value) {
						if (isset($obj_value->section_id)) {
							# ya hemos pasado por aquí..
							continue;
						}
						if (property_exists($obj_value, 'section_id_matrix')) {
							// change section_id_matrix:43 to section_id:43
							$strQuery		  = 'SELECT id, section_tipo, section_id FROM "'.$current_matrix_table.'"  WHERE id = '.$obj_value->section_id_matrix.' ';
							$result_component = JSON_RecordObj_matrix::search_free($strQuery);
							$rows_component   = pg_fetch_assoc($result_component);
								#dump($rows_component," rows_component");
							
							if ( !empty($rows_component['section_id']) ) {
								$element_section_id   = $rows_component['section_id'];
								$element_section_tipo = $rows_component['section_tipo'];

								# Section tipo IMPORTANT. if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
								$RecordObj_dd = new RecordObj_dd($element_section_tipo); $prev = $element_section_tipo;
								$propiedades  = $RecordObj_dd->get_propiedades();
								$propiedades  = json_decode($propiedades);
								if(isset($propiedades->section_tipo) && $propiedades->section_tipo == "real"){
									$element_section_tipo = section::get_section_real_tipo_static($element_section_tipo);
									#dump($element_section_tipo, " + new element_section_tipo for $prev - strQuery:$strQuery - propiedades->section_tipo:".to_string($propiedades->section_tipo))." ";
								}
								
								$locator = new locator();
									$locator->set_section_id($element_section_id);
									$locator->set_section_tipo($element_section_tipo);
								$new_dato[] = $locator;

							}else{
								echo "<hr> QUE PASÓ?...";
								dump($rows_component," rows_component - $strQuery");
								if(SHOW_DEBUG) {
									unset($dato[$key]);
								}
								#die("STOP [id matrix $id] ON $modelo_name process");
							}					
						}#end if (property_exists($dato[$key], 'section_id_matrix')) {
					}#end foreach ($dato as $key => $obj_value) {					
					if(empty($new_dato)) continue;
					$component = component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', $lang, $section_tipo); // Coge $section_id y $section_tipo del actual row (al principio del loop)
					$component->set_dato($new_dato);
					if ($save) {
						$component->Save();
					}else{
						
					}
					dump($new_dato, 'new_dato');
					echo "- Saved $modelo_name $component_tipo $current_matrix_table id:$id section_id:$section_id section_tipo:$section_tipo <hr>";					
					break;

				
				case 'component_radio_button':
				case 'component_select':
				case 'component_autocomplete':
					# 
					# Format string "43"
					#
					$new_dato = array();
					$lang = 'lg-nolan';
					$dato = $component_datum->dato->$lang;		
					if (empty($dato)) continue;
						if (isset($dato->section_tipo) || isset($dato[0]->section_tipo)) {
							# ya hemos pasado por aquí..
							continue;
						}

						dump($dato,"dato $modelo_name $current_matrix_table component_tipo:$component_tipo - id_matrix:$id");
						if (is_object($dato) || is_array($dato) || !(int)$dato) {
							echo "WARNING: ($modelo_name) EXPECTED DATO is string. type:".gettype($dato)." is obtained ";
							die("STOP [id matrix $id] ON $modelo_name process");
							throw new Exception("Error Processing Request - dato $modelo_name component_tipo:$component_tipo - id_matrix:$id", 1);
						}
					$strQuery		  = 'SELECT id, section_tipo, section_id FROM "'.$current_matrix_table.'"  WHERE id = '.$dato.' '; 	
					$result_component = JSON_RecordObj_matrix::search_free($strQuery);
					$rows_component   = pg_fetch_assoc($result_component);
						#dump($rows_component," $strQuery");
					$element_section_id   = $rows_component['section_id'];
					$element_section_tipo = $rows_component['section_tipo'];
					if (empty($element_section_id) && $element_section_id!='-1') {
						dump($element_section_id,"element_section_id");dump($strQuery," strQuery");
						echo "REVISAR: ? VACIO (¿CERO EN EL RESULTADO DE SQL?) - dato $current_matrix_table $modelo_name component_tipo:$component_tipo - id_matrix:$id";
						continue;
					}
					# Section tipo IMPORTANT. if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
					$RecordObj_dd = new RecordObj_dd($element_section_tipo);
					$propiedades  = $RecordObj_dd->get_propiedades();
					$propiedades  = json_decode($propiedades);
					if(isset($propiedades->section_tipo) && $propiedades->section_tipo == "real"){
						$element_section_tipo = section::get_section_real_tipo_static($element_section_tipo);
					}

					#dump($element_section_tipo, "$element_section_tipo ".to_string());
					//
					// Excepciones herrimemoria sólo !!
						if ($element_section_tipo=='rsc75' && 
							( $element_section_id=="4" || $element_section_id=="5" ||$element_section_id=="6" ||$element_section_id=="12" ||$element_section_id=="13" ||$element_section_id=="14" ||$element_section_id=="21" || $element_section_id=="22" ||$element_section_id=="23" || $element_section_id=="24" || $element_section_id=="25" )
							) { // herrimemoria error detected
							$element_section_tipo 	= 'rsc194';
							$element_section_id 	= "2";
							echo "+++++ CAMBIADO $element_section_tipo - $element_section_id +++++";
						}

						if ($element_section_tipo=='rsc75' && 
							( $element_section_id=="15" || $element_section_id=="19" )
							) { // herrimemoria error detected
							$element_section_tipo 	= 'rsc194';
							$element_section_id 	= "1";
							echo "+++++ CAMBIADO $element_section_tipo - $element_section_id +++++";
						}

						if ($element_section_tipo=='rsc75' && 
							( $element_section_id=="16" || $element_section_id=="17" || $element_section_id=="18" || $element_section_id=="20")
							) { // herrimemoria error detected
							$element_section_tipo 	= 'rsc194';
							$element_section_id 	= "3";
							echo "+++++ CAMBIADO $element_section_tipo - $element_section_id +++++";
						}



					$locator = new locator();
						$locator->set_section_id($element_section_id);
						$locator->set_section_tipo($element_section_tipo);
					$new_dato[] = $locator;

					if ($component_tipo=='oh62') { // herrimemoria error detected
						$component_tipo='oh32';
					}

					


					# Verificamos si el dato del componente existe en estructura (hay casos en que ha quedado un dato de una estructura anterior)
					$verify_section_tipo 	= component_common::get_section_tipo_from_component_tipo($component_tipo);
					if (empty($verify_section_tipo)) {
						# actualizamos el dato de la sección ?
						print("<hr> WARNING: Component  $component_tipo in section id_matrix: $id do not exists in current structure. Please delete..");
						continue;
					}

					$component = component_common::get_instance($modelo_name,$component_tipo, $section_id, 'edit', $lang, $section_tipo);
					$component->set_dato($new_dato);
						#dump($component," component $component_tipo - $current_matrix_table");
					if ($save) {
						$component->Save();						
					}else{
						
					}		
					dump($new_dato,"new_dato ");			
					echo "- Saved $modelo_name $component_tipo $current_matrix_table id:$id section_id:$section_id section_tipo:$section_tipo [".json_encode($dato)." -> ".json_encode($new_dato)."] <hr>";
					break;


				case 'component_check_box':
					# Format:
					# (
					#    [33] => 2
					#    [34] => 2
					#    [36] => 2
					#    [38] => 2
					#    [41] => 2
					# )	
					$new_dato = array();
					$lang = 'lg-nolan';
					$dato = $component_datum->dato->$lang;		
					if (empty($dato)) continue;
						//dump($dato, " dato 99999".to_string());
						if (is_array($dato) && isset($dato[0]->section_tipo)) {
							continue;
						}
						if ( is_object($dato) && isset($dato->section_tipo)) {
							# ya hemos pasado por aquí..
							continue;
						}
						dump($dato,"dato $modelo_name $current_matrix_table component_tipo:$component_tipo - id_matrix:$id");
						if (!is_array($dato) && !is_object($dato)) {
							dump($dato,"---> dato $modelo_name $current_matrix_table component_tipo:$component_tipo - id_matrix:$id");
							throw new Exception("dato NO es objeto - dato $modelo_name $current_matrix_table component_tipo:$component_tipo - id_matrix:$id", 1);							
						}
					foreach ($dato as $key => $obj_value) {						

						$strQuery		  = 'SELECT id, section_tipo, section_id FROM "'.$current_matrix_table.'"  WHERE id = '.(int)$key.' ';
						$result_component = JSON_RecordObj_matrix::search_free($strQuery);
						$rows_component   = pg_fetch_assoc($result_component);
							#dump($rows_component," rows_component");
						
						if (!empty($rows_component['section_id'])) {
							$element_section_id   = $rows_component['section_id'];
							$element_section_tipo = $rows_component['section_tipo'];

							# Section tipo IMPORTANT. if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
							$RecordObj_dd = new RecordObj_dd($element_section_tipo);
							$propiedades  = $RecordObj_dd->get_propiedades();
							$propiedades  = json_decode($propiedades);
							if(isset($propiedades->section_tipo) && $propiedades->section_tipo == "real"){
								$element_section_tipo = section::get_section_real_tipo_static($element_section_tipo);
							}

							$locator = new locator();
								$locator->set_section_id($element_section_id);
								$locator->set_section_tipo($element_section_tipo);
							$new_dato[] = $locator;

						}else{
								dump($dato, " dato ".to_string());
							echo "<hr> QUE PASÓ 2 ? ...$modelo_name - $id";
							dump($rows_component," rows_component - $strQuery");
							if(SHOW_DEBUG) {
								unset($dato[$key]);
							}
							die("STOP [id matrix $id] ON $modelo_name process");
						}					
						
					}#end foreach ($dato as $key => $obj_value) {					
					if(empty($new_dato)) continue;
					$component = component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', $lang, $section_tipo); // Coge $section_id y $section_tipo del actual row (al principio del loop)
					$component->set_dato($new_dato);
					if ($save) {
						$component->Save();						
					}else{
						
					}
					dump($new_dato, 'new_dato');
					echo "- Saved $modelo_name $component_tipo $current_matrix_table id:$id section_id:$section_id section_tipo:$section_tipo <hr>";		


					/*
					$new_dato = array();
					$lang = 'lg-nolan';
					$dato = $component_datum->dato->$lang;		
					if (empty($dato)) continue;
						dump($dato,"dato $modelo_name $current_matrix_table  component_tipo:$component_tipo - id_matrix:$id");
						if (is_object($dato)) {
							throw new Exception("Error Processing Request - dato $modelo_name component_tipo:$component_tipo - id_matrix:$id", 1);							
						}
					$strQuery		  = 'SELECT id, section_tipo, section_id FROM "'.$current_matrix_table.'"  WHERE id = '.(int)$dato.' '; 	dump($strQuery," strQuery");
					$result_component = JSON_RecordObj_matrix::search_free($strQuery);
					$rows_component   = pg_fetch_assoc($result_component);
						#dump($rows_component," $strQuery");
					$element_section_id   = $rows_component['section_id'];
					$element_section_tipo = $rows_component['section_tipo'];
					$locator = new locator();
						$locator->set_section_id($element_section_id);
						$locator->set_section_tipo($element_section_tipo);
					$new_dato[] = $locator;

					# Verificamos si el dato del componente existe en estructura (hay casos en que ha quedado un dato de una estructura anterior)
					$verify_section_tipo 	= component_common::get_section_tipo_from_component_tipo($component_tipo);
					if (empty($verify_section_tipo)) {
						# actualizamos el dato de la sección ?
						print("<hr> WARNING: Component  $component_tipo in section id_matrix: $id do not exists in current structure. Please delete..");
						continue;
					}

					$component = component_common::get_instance($modelo_name,$component_tipo, $section_id, 'edit', $lang, $section_tipo);
					$component->set_dato($new_dato);
						#dump($component," component $component_tipo - $current_matrix_table");
					if ($save) {
						$component->Save();						
					}
					echo "<hr>- Saved $modelo_name $component_tipo $current_matrix_table id:$id section_id:$section_id section_tipo:$section_tipo [$dato -> $dato_new]";
					*/
					break;

				
				case 'component_filter':
				case 'component_filter_master':
					continue;
					# Format:
					# (
					#    [42] => 2
					#    [34] => 2
					# )	
					$new_dato = array();
					$lang = 'lg-nolan';
					$dato = $component_datum->dato->$lang;
					if (empty($dato)) continue;
					dump($dato,"dato $modelo_name $current_matrix_table  component_tipo:$component_tipo - id_matrix:$id");	#dump($current_matrix_table," current_matrix_table");			

					$new_dato = new stdClass();
					foreach ($dato as $key => $state) {
						
						$strQuery		  = 'SELECT id, section_tipo, section_id FROM "'.$current_matrix_table.'"  WHERE id = '.(int)$key.' ';
						$result_component = JSON_RecordObj_matrix::search_free($strQuery);
						$rows_component   = pg_fetch_assoc($result_component);
							#dump($rows_component," $strQuery");
						$element_section_id   	= $rows_component['section_id'];
						$element_section_tipo 	= $rows_component['section_tipo'];
						$current_section_id 	= (int)$element_section_id;			#dump($current_section_id," current_section_id for key:$key");
						# Set
						$new_dato->$current_section_id = $state;												
					}
					#dump($new_dato," dato edit $current_matrix_table");
					if($new_dato===$dato) continue;  # Si no ha cambiado con el cálculo, no lo salvamos			

					# Verificamos si el dato del componente existe en estructura (hay casos en que ha quedado un dato de una estructura anterior)
					$verify_section_tipo 	= component_common::get_section_tipo_from_component_tipo($component_tipo);
					if (empty($verify_section_tipo)) {
						# actualizamos el dato de la sección ?
						print("<hr>WARNING: Component  $component_tipo in section id_matrix: $id do not exists in current structure. Please delete..");
						continue;
					}

					$component = component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', $lang, $section_tipo);
					$component->set_dato($new_dato);
						#dump($component," component");
					if ($save) {
						$component->Save();	


						#$datos = (string)json_handler::encode($new_dato);		
						#$datos = pg_escape_string($datos);
						#$strQuery = "UPDATE \"$matrix_table\" SET section_tipo = '$section_tipo', datos = '$datos' WHERE id = $id";

					}else{
						
					}
					dump($dato,"new_dato");
					echo "- Saved $modelo_name $component_tipo $current_matrix_table id:$id section_id:$section_id section_tipo:$section_tipo <hr>";								
					break;				
			}


		}#end foreach ($datos as $component_tipo => $component_dato) {


	}#end while


}#end update_components_section_id_references




function save_dato($matrix_table, $dato_obj, $id_matrix) {

	$datos = (string)json_handler::encode($datos);		
	$datos = pg_escape_string($datos);
	$strQuery = "UPDATE \"$matrix_table\" SET section_tipo = '$section_tipo', datos = '$datos' WHERE id = $id";
}




/**
* SET_MATRIX_SECTION_TIPO_COLUMN_CUSTOM
* b3 to b4 (9-4-2015)
* Tables to change: matrix
*/
if ($mode=='set_matrix_section_tipo_column_custom') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");

	$matrix_table		= 'matrix';	
	$strQuery = 'SELECT id, datos FROM "'.$matrix_table.'"  WHERE section_tipo = \'mupreva162\' ORDER BY id ASC LIMIT 9999999999999 OFFSET 0  '; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000	
	
	$result   = JSON_RecordObj_matrix::search_free($strQuery);

	while ($rows = pg_fetch_assoc($result)) {

		$id 	= (int)$rows['id'];
		$datos 	= (string)$rows['datos'];
		

		$datos	= (object)json_handler::decode($datos);

		if (!isset($datos->section_tipo)) {
			echo "<hr> (NOTE) Skiped row id_matrix:$id  (datos->section_tipo is empty) - "; 		
			continue;
		}
		
		$old_section_tipo	= $datos->section_tipo;	 // Debe ser la anterior rsc75
					
		$datos->section_tipo = 'mupreva162';	// Set new	
		

		$datos_ob = $datos;

 		$datos = (string)json_handler::encode($datos);		
		$datos = pg_escape_string($datos);

		#dump($datos," section_real_tipo"); 	


		// Save section dato			
		$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
			
		
		if ($save) {
			$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
			if (!$update_result) {
				dump($strQuery,"strQuery");
				echo pg_last_error();
				echo "<br> Error on Update row id_matrix:$id  (old_section_tipo:$old_section_tipo - section_tipo:$datos_ob->section_tipo) - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
			}else {
				echo "<br> Updated row id_matrix:$id  (old_section_tipo:$old_section_tipo - section_tipo:$datos_ob->section_tipo) - ". '' ." <hr> "; //substr($strQuery, 0,250)
			}
		}else{
			echo "<hr> (PREVIEW) Updated row id_matrix:$id  (old_section_tipo:$old_section_tipo - section_tipo:$datos_ob->section_tipo) - ". '' ."  "; 
		}
		#dump($dato," dato");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end set_matrix_section_tipo_column_custom



/**
* SET_MATRIX_SECTION_TIPO_COLUMN_CUSTOM2
* b3 to b4 (9-4-2015)
* Tables to change: matrix
*/
if ($mode=='set_matrix_section_tipo_column_custom2') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");

	$component_tipo 	= 'rsc29';
	$matrix_table		= 'matrix';	
	$strQuery = 'SELECT id, section_id, section_tipo, datos FROM "'.$matrix_table.'"  WHERE section_tipo = \'mupreva21\' ORDER BY id ASC LIMIT 100'; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000

	echo "<br> strQuery: $strQuery <br>";
	
	$result   = JSON_RecordObj_matrix::search_free($strQuery);


	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$section_id 	= $rows['section_id'];
		$section_tipo 	= $rows['section_tipo'];
		$datos 	= (string)$rows['datos'];		

		$datos	= (object)json_handler::decode($datos);


		#dump($datos->components->rsc29,"rsc29 ");

		$lang='lg-nolan';
		if (isset($datos->components->$component_tipo->dato->$lang->counter)) {
			
			#$old_counter = $datos->components->rsc29->dato->$lang->counter;
			#$datos->components->rsc29->dato->$lang->counter = $section_id;

			#
			# DATO 
			#
			# BEFORE
			dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato BEFORE");
			$locator = new locator();
				
				$locator->section_tipo  = $section_tipo;
				$locator->section_id 	= $section_id;

			$datos->components->$component_tipo->dato->$lang = $locator;
			# AFTER	
			dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato AFTER");

			#
			# VALOR 
			#
			# BEFORE
			dump($datos->components->$component_tipo->valor->$lang, " $component_tipo valor BEFORE");

			$locator->component_tipo= $component_tipo;
			$datos->components->$component_tipo->valor->$lang = $locator->get_flat();	
			# AFTER	
			dump($datos->components->$component_tipo->valor->$lang, " $component_tipo valor AFTER");


			#
			# VALOR_LIST 
			#
			# BEFORE
			dump($datos->components->$component_tipo->valor_list->$lang, " $component_tipo valor_list BEFORE");		

			$datos->components->$component_tipo->valor_list->$lang = '';		

			# AFTER	
			dump($datos->components->$component_tipo->valor_list->$lang, " $component_tipo valor_list AFTER");


			#dump($datos->components->rsc29->valor->$lang," rsc29 valor");
			#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");

		}
		
		#dump($datos->components->rsc29,"rsc29 ");


			

		$datos_ob = $datos;

 		$datos = (string)json_handler::encode($datos);		
		$datos = pg_escape_string($datos);

		#dump($datos," section_real_tipo"); 	


		// Save section dato			
		$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
			
		
		if ($save) {
			$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
			if (!$update_result) {
				dump($strQuery,"strQuery");
				echo pg_last_error();
				echo "<br> Error on Update row id_matrix:$id  (old_section_tipo:$old_section_tipo - section_tipo:$datos_ob->section_tipo) - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
			}else {
				echo "<br> Updated row id_matrix:$id  (old_section_tipo:$old_section_tipo - section_tipo:$datos_ob->section_tipo) - ". '' ." <hr> "; //substr($strQuery, 0,250)
			}
		}else{
			echo "<hr> (PREVIEW) Updated row id_matrix:$id  (old_counter:$old_counter - new_counter:$section_id) - ". '' ."  "; 
		}
		#dump($dato," dato");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end set_matrix_section_tipo_column_custom2




/**
* SET_MATRIX_SECTION_TIPO_COLUMN_CUSTOM3
* b3 to b4 (9-4-2015)
* Tables to change: matrix
*/
if ($mode=='set_matrix_section_tipo_column_custom3') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");

	$component_tipo = 'rsc52';
	$matrix_table	= 'matrix';	
	//$strQuery = 'SELECT id, section_id, section_tipo, datos FROM "'.$matrix_table.'"  WHERE section_tipo = \'mupreva21\' ORDER BY id ASC LIMIT 99999999'; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000
	$strQuery = "
	SELECT id,section_id,section_tipo, datos, datos #> '{components,rsc52 ,dato, lg-nolan}' as rsc52
	FROM \"matrix\"
	where
	datos #> '{components,rsc52,dato, lg-nolan}' @> '{\"section_id\": 95, \"section_tipo\": \"mupreva162\"}'::jsonb
	ORDER by id ASC
	";

	echo "<br> strQuery: $strQuery <br>";
	
	$result   = JSON_RecordObj_matrix::search_free($strQuery);


	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$section_id 	= $rows['section_id'];
		$section_tipo 	= $rows['section_tipo'];
		$datos 	= (string)$rows['datos'];		

		$datos	= (object)json_handler::decode($datos);


		#dump($datos->components->rsc29,"rsc29 ");

		$lang='lg-nolan';
		#dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato BEFORE");

		if (isset($datos->components->$component_tipo->dato)) {
			
			#$old_counter = $datos->components->rsc29->dato->$lang->counter;
			#$datos->components->rsc29->dato->$lang->counter = $section_id;

			
			#
			# DATO 
			#
			# BEFORE
			dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato BEFORE");
			
			$locator = new locator();				
				$locator->section_tipo  = 'mupreva162';
				$locator->section_id 	= 95;

			$datos->components->$component_tipo->dato->$lang = array($locator);
			# AFTER	
			dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato AFTER");
			
			#
			# VALOR 
			#
			# BEFORE
			dump($datos->components->$component_tipo->valor->$lang, " $component_tipo valor BEFORE");
			
			$datos->components->$component_tipo->valor->$lang = null;	//$datos->components->$component_tipo->dato->$lang;	
			# AFTER	
			dump($datos->components->$component_tipo->valor->$lang, " $component_tipo valor AFTER");

			
			#
			# VALOR_LIST 
			#
			# BEFORE
			dump($datos->components->$component_tipo->valor_list->$lang, " $component_tipo valor_list BEFORE");		

			$datos->components->$component_tipo->valor_list->$lang = '';		

			# AFTER	
			dump($datos->components->$component_tipo->valor_list->$lang, " $component_tipo valor_list AFTER");
			

			#dump($datos->components->rsc29->valor->$lang," rsc29 valor");
			#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");
			/**/
		}
		
		#dump($datos->components->rsc29,"rsc29 ");


			

		$datos_ob = $datos;

 		$datos = (string)json_handler::encode($datos);		
		$datos = pg_escape_string($datos);

		#dump($datos," section_real_tipo"); 	


		// Save section dato			
		$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
			
		
		if ($save) {
			$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
			if (!$update_result) {
				dump($strQuery,"strQuery");
				echo pg_last_error();
				echo "<br> Error on Update row id_matrix:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
			}else {
				echo "<br> Updated row id_matrix:$id   - ". '' ." <hr> "; //substr($strQuery, 0,250)
			}
		}else{
			echo "<hr> (PREVIEW) Updated row id_matrix:$id   - ". '' ."  "; 
		}
		#dump($dato," dato");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end set_matrix_section_tipo_column_custom3






/**
* SET_MATRIX_SECTION_TIPO_COLUMN_CUSTOM4
* b3 to b4 (9-4-2015)
* Tables to change: matrix
*/
if ($mode=='set_matrix_section_tipo_column_custom4') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$vars = array('table','idsite');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$table) exit("table is mandatory");
	if (!$idsite) exit("idsite is mandatory");

	#$component_tipo = 'rsc52'; 		// AND section_id = 1
	$matrix_table	= 'matrix';	
	$strQuery = 'SELECT id, section_id, section_tipo, datos FROM "'.$matrix_table.'"  WHERE section_tipo = \'mupreva21\'  ORDER BY id ASC LIMIT 40000 OFFSET 10000 '; //    -    -  - WHERE id = 76559   - LIMIT 10000 OFFSET 88000
	/*
	$strQuery = "
	SELECT id,section_id,section_tipo, datos, datos #> '{components,rsc52 ,dato, lg-nolan}' as rsc52
	FROM \"matrix\"
	where
	datos #> '{components,rsc52,dato, lg-nolan}' @> '{\"section_id\": 95, \"section_tipo\": \"mupreva162\"}'::jsonb
	ORDER by id ASC
	";
	*/
	echo "<br> strQuery: $strQuery <br>";
	
	$result   = JSON_RecordObj_matrix::search_free($strQuery);


	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$section_id 	= $rows['section_id'];
		$section_tipo 	= $rows['section_tipo'];
		$datos 	= (string)$rows['datos'];		

		$datos	= (object)json_handler::decode($datos);


		#dump($datos->components->rsc29,"rsc29 ");

		$lang='lg-nolan';
		#dump($datos->components->$component_tipo->dato->$lang, " $component_tipo dato BEFORE");
		
		$component_tipo 	= 'mupreva208';	// mupreva202			
		#$new_component_tipo = 'mupreva242';

		
		if (isset($datos->components->$component_tipo->dato)) {

			dump($datos->components->$component_tipo->dato,"BEFORE dato $component_tipo");

			$locator = new locator();
				$locator->section_tipo = 'mupreva261';
				$locator->section_id   = '1';

			$datos->components->$component_tipo->dato->$lang = array($locator);
			$datos->components->$component_tipo->valor->$lang = array($locator);
			$datos->components->$component_tipo->valor_list->$lang = "";

			#$datos->section_real_tipo = 'mupreva230';


			/*
			if ( isset($datos->components->rsc89) ) unset($datos->components->rsc89);
			if ( isset($datos->components->rsc91) ) unset($datos->components->rsc91);
			if ( isset($datos->components->rsc92) ) unset($datos->components->rsc92);
			if ( isset($datos->components->rsc97) ) unset($datos->components->rsc97);
			
			if ( isset($datos->components->rsc42) ) unset($datos->components->rsc42);
			if ( isset($datos->components->rsc43) ) unset($datos->components->rsc43);
			if ( isset($datos->components->rsc74) ) unset($datos->components->rsc74);
			*/
			/*
			dump( reset($datos->components->mupreva206->dato->$lang)->section_tipo," mupreva206");

			#$datos->section_real_tipo = 'mupreva200';
			if ( reset($datos->components->mupreva206->dato->$lang)->section_tipo =='dd1117' ) {

				reset($datos->components->mupreva206->dato->$lang)->section_tipo 		= 'mupreva221';
				reset($datos->components->mupreva206->valor->$lang)->section_tipo 		= 'mupreva221';
				reset($datos->components->mupreva206->valor_list->$lang)->section_tipo 	= 'mupreva221';
			
				#dump($datos->components->mupreva206," dato de mupreva206");
			*/
			#
			# DATO 
			#
			# BEFORE
			#dump($datos->components, " $component_tipo dato BEFORE");
			
			#$datos->components->$new_component_tipo = $datos->components->$component_tipo;
			#unset($datos->components->$component_tipo);		
			
				#dump($datos->components->$new_component_tipo," $component_tipo to $new_component_tipo");

			dump($datos->components->$component_tipo->dato,"AFTER dato ($component_tipo)");
			#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");
			


					$datos_ob = $datos;

			 		$datos = (string)json_handler::encode($datos);		
					$datos = pg_escape_string($datos);

					#dump($datos," section_real_tipo"); 	


					// Save section dato			
					$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
						
					
					if ($save) {
						$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
						if (!$update_result) {
							dump($strQuery,"strQuery");
							echo pg_last_error();
							echo "<br> Error on Update row id_matrix:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
						}else {
							echo "<br> Updated row id_matrix:$id   - ". '' ." <hr> "; //substr($strQuery, 0,250)
						}
					}else{
						echo "<hr> (PREVIEW) Updated row id_matrix:$id   - ". '' ."  "; 
					}
					#dump($dato," dato");
			
		}
		
		#dump($datos->components->rsc29,"rsc29 ");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end set_matrix_section_tipo_column_custom4











/**
* change_portal_value
*/
if ($mode=='change_portal_value') {

	$save = false;
	
	$matrix_table = 'matrix';

	$strQuery = 'SELECT id, section_id, section_tipo, datos 
	FROM '.$matrix_table.'
	WHERE section_tipo = \'mupreva162\' 
	ORDER BY id ASC ';
	
	echo "<br> strQuery: $strQuery <br>";
	
	$result   = JSON_RecordObj_matrix::search_free($strQuery);


	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$section_id 	= $rows['section_id'];
		$section_tipo 	= $rows['section_tipo'];
		$datos 	= (string)$rows['datos'];		

		$datos	= (object)json_handler::decode($datos);
			#dump($datos->components->rsc29,"rsc29 ");	continue;

		$lang 			= 'lg-nolan';		
		$component_tipo = 'mupreva243';

		
		if (isset($datos->components->$component_tipo->dato)) {

			dump($datos->components->$component_tipo->dato,"BEFORE dato $component_tipo $section_id");

			$changed=false;
			$ar_locators = (array)$datos->components->$component_tipo->dato->$lang;
			foreach ($ar_locators as $key => $current_locator) {
				if ($current_locator->section_tipo=='mupreva240') {
					$current_locator->section_tipo='mupreva609'; 

					$locator = $current_locator;
					$datos->components->$component_tipo->dato->$lang = array($locator);
					$datos->components->$component_tipo->valor->$lang = array($locator);
					$datos->components->$component_tipo->valor_list->$lang = "";
					$changed=true;
					break; // Sólo hay 1 (es un autocomplete)
				}
			}

			dump($datos->components->$component_tipo->dato,"AFTER dato ($component_tipo) $section_id");
			#dump( htmlentities( $datos->components->rsc29->valor_list->$lang )," rsc29 valor_list");
			#continue;


					$datos_ob = $datos;

			 		$datos = (string)json_handler::encode($datos);		
					$datos = pg_escape_string($datos);
					#dump($datos," section_real_tipo"); 	


					// Save section dato			
					$strQuery = "UPDATE \"$matrix_table\" SET datos = '$datos' WHERE id = $id";
						#dump($strQuery, ' strQuery');
						
					
					if ($save && $changed) {
						$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
						if (!$update_result) {
							dump($strQuery,"strQuery");
							echo pg_last_error();
							echo "<br> Error on Update row id:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
						}else {
							echo "<br> Updated row id:$id   - ". '' ." <hr> "; //substr($strQuery, 0,250)
						}
					}else{
						echo "<hr> (PREVIEW) Updated row id:$id   - ". '' ."  "; 
					}
					#dump($dato," dato");
			
		}
		
		#dump($datos->components->rsc29,"rsc29 ");

	}#end while



}//end if ($mode='change_portal_value') {





/**
* UPDATE_MATRIX_ACTIVITY_QUIEN
* b3 to b4 (9-4-2015)
*/
if ($mode=='update_matrix_activity_quien') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$strQuery = 'SELECT id, section_id, section_tipo, datos FROM matrix_activity  ORDER BY id ASC ';
	echo "<br> strQuery: $strQuery <br>";
	
	$result   	 = JSON_RecordObj_matrix::search_free($strQuery);
	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$section_id 	= $rows['section_id'];
		$section_tipo 	= $rows['section_tipo'];
		$datos 			= (string)$rows['datos'];
		$datos			= (object)json_handler::decode($datos);
		$lang 			= 'lg-nolan';
		$component_tipo = 'dd543';

		$dato_quien 	= isset($datos->components->$component_tipo->dato->$lang) ? $datos->components->$component_tipo->dato->$lang : -666 ;
		if ($dato_quien=='unknow' || $dato_quien==-666) {
			$dato_quien 	= -666;
		}else{
			if ($dato_quien<=1) {
				$dato_quien = -1;
			}else{
				$dato_quien = (int)$dato_quien-1;
			}			
		}
		#dump($dato_quien,'datos');

		$locator = new locator();
			$locator->section_tipo = DEDALO_SECTION_USERS_TIPO;	// 'dd128';
			$locator->section_id   = (int)$dato_quien;
				#dump($locator, " locator ".to_string());

			$datos->components->$component_tipo->dato->$lang  = array($locator);
			#$datos->components->$component_tipo->valor->$lang = array($locator);
			#$datos->components->$component_tipo->valor_list->$lang = "";
		
			$datos = (string)json_handler::encode($datos);		
			$datos = pg_escape_string($datos);
			#dump($datos," section_real_tipo");

			// Save section dato			
			$strQuery = "UPDATE matrix_activity SET datos = '$datos' WHERE id = $id";			
			if ($save) {
				$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
				#$update_result 	= true;
				if (!$update_result) {
					dump($strQuery,"strQuery");
					echo pg_last_error();
					echo "<br> Error on Update row id_matrix:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
				}else {
					echo "<br> Updated row id_matrix:$id   - ". '' ." <hr> "; //substr($strQuery, 0,250)
					dump( htmlspecialchars($strQuery) ,"strQuery");
					#dump($locator, " locator ".to_string($dato_quien));
				}
			}else{
				echo "<hr> (PREVIEW) Updated row id_matrix:$id   - ". '' ."  "; 
				dump($locator, " locator ".to_string($dato_quien));
			}
			#dump($dato," dato");

	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end update_matrix_activity_quien


/**
* UPDATE_IDEX_LOCATORS
* b3 to b4 (9-4-2015)
*/
if ($mode=='update_index_locators') {

	echo "<h1>set_matrix_section_tipo_column_custom</h1><br>";
	echo "<h2> DATABASE : ".DEDALO_DATABASE_CONN."</h2><br>";

	$save = false;
	if (!$save) {
		echo "WARNING!!! PREVIEW ONLY. NOTHING IS SAVED";
	}

	$strQuery = "SELECT id, parent, dato FROM matrix_descriptors WHERE tipo = 'index'  ORDER BY id ASC ";
	echo "<br> strQuery: $strQuery <br>";
	
	$result   	 = JSON_RecordObj_matrix::search_free($strQuery);
	while ($rows = pg_fetch_assoc($result)) {

		$id 			= (int)$rows['id'];
		$parent 		= $rows['parent'];
		$dato 			= (string)$rows['dato'];	if (empty($dato)) continue;
		$datos			= (object)json_handler::decode($dato);
		$lang 			= 'lg-nolan';		
		
		#dump($datos, " datos ".to_string($id));

		$ar_locators=array();
		foreach ($datos as $key => $old_locator) {
			
			#dump($old_locator, " old_locator 1".to_string($id));

			$id_matrix = (int)$old_locator->section_top_id_matrix;
			$strQuery = "SELECT section_id, section_tipo FROM matrix WHERE id = $id_matrix ";
			$current_result = pg_query(DBi::_getConnection(), $strQuery);
			while ($current_rows = pg_fetch_assoc($current_result)) {
				$section_top_tipo 	= $current_rows['section_tipo'];
				$section_top_id 	= $current_rows['section_id'];
			}

			$id_matrix = (int)$old_locator->section_id_matrix;
			$strQuery = "SELECT section_id, section_tipo FROM matrix WHERE id = $id_matrix ";
			$current_result = pg_query(DBi::_getConnection(), $strQuery);
			while ($current_rows = pg_fetch_assoc($current_result)) {
				$section_tipo 	= $current_rows['section_tipo'];
				$section_id 	= $current_rows['section_id'];
			}

			$component_tipo = $old_locator->component_tipo;
			$tag_id 		= $old_locator->tag_id;

			$locator = new locator();
				$locator->set_section_top_tipo($section_top_tipo);
				$locator->set_section_top_id($section_top_id);				
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);
				$locator->set_component_tipo($component_tipo);
				$locator->set_tag_id($tag_id);

			#dump($locator, " new locator 2".to_string());

			$ar_locators[] = $locator;			

		}//end foreach
		
		if(empty($ar_locators)) {
			#echo "SKIP id: $id with dato: $dato => ".to_string($datos)." <br>";
			#continue;
		}

		$dato_string = json_handler::encode($ar_locators);
		#dump($dato_string, " dato_string".to_string());

		$strQuery = "UPDATE matrix_descriptors SET dato = '$dato_string' WHERE id = $id";
		if ($save) {
			$update_result 	= pg_query(DBi::_getConnection(), $strQuery);
			#$update_result 	= true;
			if (!$update_result) {
				dump($strQuery,"strQuery");
				echo pg_last_error();
				echo "<br> Error on Update row id:$id  - pg_last_error:". pg_last_error() ." <hr> "; //substr($strQuery, 0,250)
			}else {
				echo "<br> Updated row id:$id   - ". '' ." <hr> "; //substr($strQuery, 0,250)
				dump( htmlspecialchars($strQuery) ,"strQuery");
				#dump($locator, " locator ".to_string($dato_quien));
			}
		}else{
			echo "<hr> (PREVIEW) Updated row id_matrix:$id   - ". '' ."  "; 
			dump($strQuery, " strQuery ".to_string($id));
		}
		
	}#end while

	echo "<br><br> Total records: ".pg_num_rows($result);
	
}#end update_index_locators



if(DBi::_getConnection()) pg_close(DBi::_getConnection());
if(isset($conn)) mysqli_close($conn);
?>
<div class="time_to_load_div">
<?php printf ("<br><br>Generated in %s seconds<br>", round( microtime(TRUE) - $_SERVER['REQUEST_TIME_FLOAT'] ,4) ); ?>
</div>