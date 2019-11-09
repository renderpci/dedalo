<?php

	#
	# COMMON IMPORT MUPREVA
	#

	
	

	#
	# REGEX : Expresión regular a usar al leer los ficheros
	# $regex = "/((\w+)-(\d*)).([a-zAZ]+)\z/";
	#
	#$regex = "/(\d*)[-|_]?(\d*)_?(\w{0,}\b.*)\.([a-zA-Z]{3,4})\z/";
	#$regex = "/(\d*)-(\d*).([a-zA-Z]{3,4})\z/";


	#
	# INFO : Texto informativo relativo a la anatomía o structura del nombre de fichero
	#
	$import_help  ='';
	
	$import_help .= "<div class=\"info_line import_help\">";	
	$import_help .= "Seleccione en su disco duro los archivos a importar";
	$import_help .= "
	- La imágenes se importarán adoptando un ‘código’ secuencial de formato 1-1,1-2,1-3,… donde el primer número será el section_id de la ficha de inventario o galería que agrupa los recursos, y el segundo número será la secuencia de recursos asociados al la ficha “nodriza”.
	- Si se reimporta sobre la misma ficha (mismo ID) se añadirán recursos a partir del número del último de recurso de la misma (ej. 1-9 para la ficha 1 con 8 recursos).
	- Si se desvincula un recurso del portal de la ficha, el código (ej. 1-7) se respetará para la siguiente importación (sería 1-8). Si se borra el recurso, el código (ej. 1-7) quedará libre y si era el último, será reutilizado en la siguinte importación de esa ficha. Si no era el último se mantendrá el hueco.
	";
	$import_help .= "</div>"; //
	$import_help = nl2br($import_help);


	$debug_msg = [];

	

	if(!function_exists('get_last_disparo_number')) { function get_last_disparo_number($numero_inventario) {
		global $debug_msg;

		$componente_tipo 	= MUPREVA_COMPONENT_TIPO_CODIGO;	//'rsc21'; 		// Virtual de Sección Media Recursos (rsc2), campo 'código'
		$section_tipo 		= SECTION_TIPO_IMAGENES;			// Virtual de Sección Media Recursos (rsc2)'
		$value 				= $numero_inventario.'-'; 
		$matrix_table		= common::get_matrix_table_from_tipo($section_tipo);
		$strQuery="
		-- get_last_disparo_number
		SELECT 
		datos #>>'{components,$componente_tipo,dato,lg-nolan}' as codigo
		FROM \"$matrix_table\"
		WHERE
		section_tipo = '$section_tipo' AND 
		datos #>>'{components,$componente_tipo,dato,lg-nolan}' LIKE '$value%'
		ORDER BY id DESC
		LIMIT 1
		";
		#dump($strQuery, 'strQuery'); #die();
		$debug_msg[] = $strQuery;
		$result		= JSON_RecordObj_matrix::search_free($strQuery);	
		while ($rows = pg_fetch_assoc($result)) {
			$codigo = $rows['codigo'];
			$ar_parts = explode('-', $codigo);
			return (int)$ar_parts[1]; 	# Like 4 from '45000-4'
		}
		return 0;
	}}


	# IMPORT SCRIPT MUPREVA IMAGENES ASOCIADAS 
	require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
	require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');

	# Login check
		if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	# Set vars
		$vars = array('process','quality','fotografo','dibujante','delete_after','import_image_checkbox');
			foreach($vars as $name)	$$name = common::setVar($name);



	


?>