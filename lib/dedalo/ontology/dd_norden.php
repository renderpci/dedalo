<?php
// ontology custon config file
require_once( dirname(__FILE__) .'/config/config_ontology.php' );

# Old lang vars
require_once( dirname(__FILE__) . '/lang/lang_code.php' );



/**
* LOGIN
*/
$is_logged	= login::is_logged();

if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB;
	header("Location: $url");
	exit();
}
$is_global_admin = security::is_global_admin(CURRENT_LOGGED_USED_ID);
if($is_global_admin!==true) {
	$url =  DEDALO_ROOT_WEB;
	header("Location: $url");
	exit();
}



require_once(dirname(__FILE__) . '/class.dd.php');
require_once(dirname(__FILE__) . '/d3_functions.php');



# set vars
$vars = array('padre','nordenV','terminoID','termino');
foreach($vars as $name)	$$name = common::setVar($name);

$terminoIDget	= $terminoID;
$terminoget		= stripslashes($terminoID);


# despejamos la tabla
$tld 			= 'dd';
$tabla			= 'jer_'.$tld ;


// actualizar orden
if(isset($_REQUEST["accion"]) && $_REQUEST["accion"]==="norden") {

	$terminoIDf		= safe_xss($_REQUEST['terminoID']);
	$parent			= safe_xss($_REQUEST['parent']);
	$ordenActual	= safe_xss($_REQUEST['ordenActual']);
	$ordenNuevo		= safe_xss($_REQUEST['ordenNuevo']);
	$ordenF			= safe_xss($_REQUEST['ordenF']);	 //formato(1.23,2.68 ...)

	#echo "terminoActual: $terminoIDf, ordenActual: $ordenActual ,  ordenNuevo: $ordenNuevo <br><br> ";

	// construimos el array
	$ordenF = str_replace(".", "=", $ordenF);  //formato(1=23,2=68 ...)
	$piecesArray = explode(",", $ordenF);

	// eliminamos el termino actual
	function remove_element($arr, $val) {

		foreach ($arr as $key => $value){
		  if ($arr[$key] == $val){
			  unset($arr[$key]);
		  }
		}
		return $arr = array_values($arr);
	}
	$piecesArray2 = remove_element($piecesArray, "$terminoIDf=$ordenActual");


	// reordenamos el array resultante
	$i = 1;
	if(is_array($piecesArray2)) foreach($piecesArray2 as $value)
	{
		$valueEx 	= explode("=", $value);
		$value 		= $valueEx[0];
		$key 		= $i ++ ;
		$piecesArray3[$key] = "$value";
	}


	// a todos los valores superiores al ordenNuevo les sumamos 1
	if(is_array($piecesArray3)) foreach($piecesArray3 as $key => $value){
		if($key >= $ordenNuevo){
			$key ++ ;
			$piecesArray4['a'][$key] = $value;
		}else{
			$piecesArray4['a'][$key] = $value;
		}
	}
	// insertamos nuestro termino con el n de orden nuevo
	$piecesArray4['a'][$ordenNuevo] = $terminoIDf;


	// lo recorremos para construir los UPDATE a mysql
	if(is_array($piecesArray4)) foreach($piecesArray4 as $key => $value) {

		if(is_array($value)) foreach($value as $norden => $terminoID) {
			$updateSQL = "UPDATE \"$tabla\" SET norden = $norden WHERE \"terminoID\" = '$terminoID' ";
			$result	= JSON_RecordObj_matrix::search_free($updateSQL);
		}
	}

	# PADRE

	// recargamos la ventana del termino y cerramos esta
	$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
	echo $codHeader ;
    echo "<script type=\"text/javascript\">";
    if( substr($parent, 2)==0 ) {
    	echo "window.opener.location.reload();";
    }else{
    	echo "window.opener.dd.actualizarList('$parent', '$terminoID');";
    }
    echo "window.close();";
    echo "</script>";
	exit();
}



// se reinicia para cada parent
if ($nordenV<1) {
	$nordenV = 1 ;
}


// comprobamos si ya se han numerado, buscando los de este nivel de orden = 0
/*
$query_RS 		= " SELECT count(norden) as no FROM $tabla WHERE parent = '$padre' AND esdescriptor = 'si' AND norden = 0 " ;
$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(mysql_error());
$row_RS 		= mysql_fetch_assoc($RS);
$totalRows_RS 	= mysql_num_rows($RS);

$no				= $row_RS["no"];
$estaOrdenado 	= 1 ;
if($no>0) 		$estaOrdenado = 0 ;
*/
$sql 		= "SELECT count(norden) as no FROM $tabla WHERE parent = '$padre' AND esdescriptor = 'si' AND norden = 0";
$result		= JSON_RecordObj_matrix::search_free($sql);


#$rows	= $result->fetch_array(MYSQLI_ASSOC);
$rows 	= pg_fetch_array($result, NULL, PGSQL_ASSOC);


$no				= $rows['no'];
$estaOrdenado 	= 1;
if($no>0)
$estaOrdenado 	= 0;


$sql 	= "	SELECT \"terminoID\", norden
			FROM $tabla
			WHERE
			parent = '$padre' AND
			esdescriptor = 'si'
			ORDER BY norden ASC
		 ";
$result	= JSON_RecordObj_matrix::search_free($sql);


$ordenF = false;

# Create array objs with all records founded
while ($rows = pg_fetch_assoc($result)) {

	#}
	#if(($result->num_rows)>0) while ($rows = $result->fetch_array(MYSQLI_ASSOC) ) {

	if($estaOrdenado == 0) {
		// Si NO están ordenados, Asignamos una numeración virtual
		$norden	= $nordenV ++ ;
	}else{
		// Si lo están, Usamos la de su numeracion
		$norden	= $rows["norden"];
	}
	$parent		= $padre ;
	$terminoID	= $rows["terminoID"];
	$termino	= RecordObj_dd::get_termino_by_tipo($terminoID);

	$nordenArray[] = "$terminoID,$norden" ;

	$ordenF .= "$terminoID.$norden,";
}

# Free result set
#$result->close();


// Creamos la cadena de valores para el formulario
$ordenF = substr($ordenF, 0, -1);


$page_html = dirname(__FILE__).'/html/dd_norden.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);

# Write session to unlock session file
session_write_close();


