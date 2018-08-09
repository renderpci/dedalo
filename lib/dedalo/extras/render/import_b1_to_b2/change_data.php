<?php 
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
/*
require_once('tipo_map.php');

#dump($_SESSION['dedalo4']['auth']['user_id']," ");

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

if ( $_SESSION['dedalo4']['auth']['user_id']!=='-1' || strpos(DEDALO_HOST, '8888')===false) {
	die("<span class='error'> Auth error: please login as admin in development host </span>");
}
*/

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



/**
* CHANGE_PROJECTS
*/
if ($mode=='change_property') {	

	/*
	"rsc98": {
        "dato": {
            "lg-nolan": {
                "26": "2"
            }
        },
        "info": {
            "label": "Proyecto",
            "modelo": "component_filter"
        },
        "valor": {},
        "valor_list": {}
    }
    */
    #$componente_tipo 	= 'mupreva16';
    #$componente_tipo 	= 'rsc98';
    #$componente_tipo 	= 'rsc28';
    #$componente_tipo 	= 'rsc24';
    $componente_tipo 	= 'rsc25';
    $section_tipo 		= $componente_tipo;  // PASAR EL SECTION TIPO !!!!!!!!
	$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);

	$filter  = 'datos @> \'{"components":{"'.$componente_tipo.'":{"dato":{"lg-nolan":"12"}}}}\'::jsonb ';
	$strQuery='
	SELECT id, datos FROM "'.$matrix_table.'"
	WHERE
	'.$filter.'
	ORDER BY id ASC
	';
	dump($strQuery, 'strQuery'); die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);
	##$ar_result 	= pg_fetch_assoc($result);
		#dump($ar_result,"ar_result "); die();

	while ($rows = pg_fetch_assoc($result)) {
		$id_matrix 	= $rows['id'];
		$datos 		= $rows['datos'];
		$datos 		= json_decode($datos);
			#dump($datos," datos");

		$newval = "2";	//array('1'=>'2');
		$lang 	= 'lg-nolan';

		if (!isset($datos->components->$componente_tipo->dato->$lang)) {
			
			trigger_error("Error on get dato in json object componente_tipo:$componente_tipo, id:$id_matrix ");
		
		}else{

			$datos->modified_by_userID = 1;

			$datos->components->$componente_tipo->dato->$lang = (string)$newval;
			#dump($datos," datos 2");

			$datos = json_handler::encode($datos);
			#dump($datos," datos ");

			$strQuery 		= "UPDATE \"matrix\" SET datos = $1 WHERE id = $2";
			$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $id_matrix));
				#dump($update_result," update_result update id_matrix:$id_matrix - $strQuery ($datos, $id_matrix)");

			if ($update_result===false) {
				trigger_error("Error in DB UPDATE query $strQuery");
			}
		}
		echo "<hr> Updated row id_matrix:$id_matrix - componente_tipo:$componente_tipo ";
		#dump($rows,"row updated");
	}

	#die();

}#end if ($options['import']==1)






/**
* remove_portal_data
* Elimina los datos del portal dado. Elimina todos los punteros del portal pero no los registros apuntados por los locators
*/
if ($mode=='remove_portal_data') {

	$matrix_table 	= 'matrix';
	$section_tipo 	= 'mupreva86'; // Exposiciones
	$portal_tipo 	= 'mupreva564'; 
	
die();
	$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
	$strQuery='
	SELECT id, section_id FROM "'.$matrix_table.'"
	WHERE
	section_tipo = '$section_tipo'
	ORDER BY id ASC
	';
	#dump($strQuery, 'strQuery'); #die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);
	##$ar_result 	= pg_fetch_assoc($result);
		#dump($ar_result,"ar_result "); die();


	while ($rows = pg_fetch_assoc($result)) {

		$id 	= $rows['id'];
		$datos 	= $rows['datos'];
		$datos	= json_decode($datos);

		foreach ($ar_portals as $current_portal_tipo) {

			if (!isset($datos->components->$current_portal_tipo->dato->$lang) || empty($datos->components->$current_portal_tipo->dato->$lang)) {				
				#trigger_error("Error on get dato in json object componente_tipo:$current_portal_tipo, id:$id_matrix ");
				continue;
			}			

			$portal_dato = (array)$datos->components->$current_portal_tipo->dato->$lang ;

			echo "<hr> [$id] Change portal dato: " .print_r($portal_dato,true). " - id:$id";
			
			$ar_locators = array();
			foreach ($portal_dato as $current_old_locator) {
				
				$ar_parts  = explode('.', $current_old_locator);
				$id_matrix = (int)$ar_parts[0];

				# Buscamos el id matrix anterior
				$strQuery='
				SELECT id FROM "'.$matrix_table.'"
				WHERE
				datos @> \'{"id_matrix_anterior":'.$id_matrix.'}\'::jsonb
				';
				#dump($strQuery, 'strQuery'); #die();
				$result2	= JSON_RecordObj_matrix::search_free($strQuery);
				$rows 		= pg_fetch_assoc($result2);
				$current_portal_ref = $rows['id'];


				$locator = new stdClass();
					$locator->section_id_matrix = (string)$current_portal_ref;

				$ar_locators[] = $locator;

			}#end foreach ($portal_dato as $current_old_locator) 

			$datos->components->$current_portal_tipo->dato->$lang = $ar_locators;	

			echo "<br> Final portal dato: " .print_r($datos->components->$current_portal_tipo->dato->$lang,true);		

		}#end foreach ($ar_portals as $current_portal_tipo) 

		
		# Salvamos el objeto modificado
		$datos = json_handler::encode($datos);
		#dump($datos," datos ");

		$strQuery 		= "UPDATE \"matrix\" SET datos = $1 WHERE id = $2";
		if ($save) {
			$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $id));
			#dump($update_result," update_result update id:$id - $strQuery");
			
			if ($update_result===false) {
				trigger_error("Error in DB UPDATE query $strQuery");
			}else{
				echo "<br> update_result for $id: OK ";
			}
		}else{
			echo "<br> Preview mode saving for $id: OK ";
		}
		

	}#end while

}#END remove_portal_data








/**
* CHANGE_PORTAL_REFERENCES
*/
if ($mode=='change_portal_references') {

	#die("STOP");

	$section_tipo 	= 'mupreva1';
	$modelo_name 	= 'component_portal';
	$relation_type 	= 'children_recursive';
	$lang 			= 'lg-nolan';

	#$RecordObj_dd = new RecordObj_dd();
	$ar_portals = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name, $relation_type);
		#dump($ar_portals," ar_portals"); die();

	$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
	$strQuery='
	SELECT id, datos FROM "'.$matrix_table.'"
	WHERE
	datos @> \'{"section_tipo":"'.$section_tipo.'"}\'::jsonb
	ORDER BY id ASC
	';
	#dump($strQuery, 'strQuery'); die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);


	while ($rows = pg_fetch_assoc($result)) {

		$id 	= $rows['id'];
		$datos 	= $rows['datos'];
		$datos	= json_decode($datos);

		echo "<hr> Update row id_matrix:$id  ";

		foreach ($ar_portals as $current_portal_tipo) {

			$portal_dato = (array)$datos->components->$current_portal_tipo->dato->$lang;
				#dump($portal_dato," portal_dato $current_portal_tipo "); continue;
				echo "<br>[$id] current_portal_tipo: $current_portal_tipo ";

			foreach ($portal_dato as $current_locator) {				
				
				$id_matrix = $current_locator->section_id_matrix;


				# Buscamos el dato
				$strQuery='
				SELECT id, datos FROM "'.$matrix_table.'"
				WHERE
				id = '.(int)$id_matrix.'
				';
				#dump($strQuery, 'strQuery'); #die();
				$result2	= JSON_RecordObj_matrix::search_free($strQuery);
				$rows2 		= pg_fetch_assoc($result2);
				
				$current_id = $rows2['id'];
				$datos2  	= $rows2['datos'];
				$datos2 	= json_decode($datos2);

				$datos2->section_creator_top_tipo 			= 'mupreva1';
				$datos2->section_creator_portal_tipo 		= $current_portal_tipo;
				$datos2->section_creator_portal_section_tipo = 'mupreva21'; // Virtual don están las imágenes
				
				$datos2 		= json_encode($datos2);
				#dump($datos2," datos ");

				$strQuery 		= "UPDATE \"matrix\" SET datos = $1 WHERE id = $2";
				$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos2, $id_matrix));
					#dump($update_result," update_result update id_matrix:$id_matrix - $strQuery ($datos, $id_matrix)");

			}#end foreach ($portal_dato as $current_old_locator) 


			#echo "<br> Final portal dato: <pre>" .print_r($datos,true)."</pre>";		

		}#end foreach ($ar_portals as $current_portal_tipo) 

		/*		
		# Salvamos el objeto modificado
		$datos = json_handler::encode($datos);
		#dump($datos," datos ");

		$strQuery 		= "UPDATE \"matrix\" SET datos = $1 WHERE id = $2";
		$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $id));
			#dump($update_result," update_result update id:$id - $strQuery");
			
		if ($update_result===false) {
			trigger_error("Error in DB UPDATE query $strQuery");
		}else{
			echo "<br> update_result for $id: OK ";
		}
		*/

	}#end while
}




/**
* CHANGE_PORTAL_REFERENCES
*/
if ($mode=='remove_components') {

	#die("STOP");

	$section_tipo 	= 'rsc2';	


	$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
	$strQuery='
	SELECT id, datos FROM "'.$matrix_table.'"
	WHERE
	datos @> \'{"section_tipo":"'.$section_tipo.'"}\'::jsonb
	ORDER BY id ASC
	';
	#dump($strQuery, 'strQuery'); die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);

	$ar_tipos_remove = array('rsc35','rsc36','rsc37','rsc38','rsc42','rsc43','rsc71','rsc72','rsc73','rsc74');


	while ($rows = pg_fetch_assoc($result)) {

		$id 	= $rows['id'];
		$datos 	= $rows['datos'];
		$datos	= json_decode($datos);		

		foreach ($ar_tipos_remove as $current_tipo_remove) {		
			
			if (isset($datos->components->$current_tipo_remove)) {

				unset($datos->components->$current_tipo_remove);
				echo "- Deleted current_tipo_remove: $current_tipo_remove  ";
			}			
		}
		
		$datos 			= json_handler::encode($datos);	
		$strQuery 		= "UPDATE \"matrix\" SET datos = $1 WHERE id = $2";
		$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $id));
					#dump($update_result," update_result update id:$id - $strQuery ($datos, $id)");

		echo "<br> Deleted from row id_matrix:$id <hr> ";

	}#end while
}






/**
* CHANGE_SECTION_LIST
*/
if ($mode=='change_section_list') {

	die("STOP");

	$section_tipo 		= 'dd1303';	
	$new_section_tipo	= 'mdcat251';

	$component_tipos_to_change = array(
		'dd1305' => 'mdcat253'
		);

	$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
	$strQuery='
	SELECT id, datos FROM "'.$matrix_table.'"
	WHERE
	datos @> \'{"section_tipo":"'.$section_tipo.'"}\'::jsonb
	ORDER BY id ASC
	';
	#dump($strQuery, 'strQuery'); die();
	$result		= JSON_RecordObj_matrix::search_free($strQuery);

	#
	# Components tipo
	while ($rows = pg_fetch_assoc($result)) {

		$id 	= $rows['id'];
		$datos 	= $rows['datos'];
		$datos	= json_decode($datos);

		#dump($datos," datos $id BEFORE");
		foreach ($component_tipos_to_change as $current_tipo => $new_tipo) {		
			
			if (isset($datos->components->$current_tipo)) {

				# Copy element
				$datos->components->$new_tipo = $datos->components->$current_tipo;
				echo "- Copy element: $current_tipo to $new_tipo ";

				# Remove old
				unset($datos->components->$current_tipo);
				echo "- Deleted current_tipo: $current_tipo  ";
			}			
		}

		#
		# Section tipo
		$datos->section_tipo = (string)$new_section_tipo;		
		#dump($datos," datos $id AFTER");
		
		$datos 			= json_handler::encode($datos);
		$strQuery 		= "UPDATE \"$matrix_table\" SET datos = $1 WHERE id = $2";
		#$update_result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $datos, $id) );	dump($update_result," update_result update id:$id - $strQuery ($datos, $id)");			

		echo "<br> Updated row id_matrix:$id  - $strQuery <hr> ";

	}#end while
	
	echo "<br> Total records: ".pg_num_rows($result);

}#end if ($mode=='change_section_list')
	





if(DBi::_getConnection()) pg_close(DBi::_getConnection());
if(isset($conn)) mysqli_close($conn);
?>
<div class="time_to_load_div">
<?php printf ("<br><br>Generated in %s seconds<br>", round( microtime(TRUE) - $_SERVER['REQUEST_TIME_FLOAT'] ,4) ); ?>
</div>