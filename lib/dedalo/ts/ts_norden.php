<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}


require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');
require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');
require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');



# set vars
$vars = array('padre','nordenV','terminoID','termino');
foreach($vars as $name)	$$name = setVar($name);

$terminoIDget	= $terminoID;
$terminoget		= stripslashes($terminoID);


# despejamos la tabla
$tld 			= Tesauro::terminoID2prefix($terminoIDget);
$tabla			= 'jer_'.$tld ;


// actualizar orden
if(isset($_REQUEST["accion"]) && $_REQUEST["accion"]=="norden") {

	#print_r($_REQUEST);	die();
	
	$terminoIDf		= $_REQUEST['terminoID'];
	$parent			= $_REQUEST['parent'];
	$ordenActual	= $_REQUEST['ordenActual'];	
	$ordenNuevo		= $_REQUEST['ordenNuevo'];	
	$ordenF			= $_REQUEST['ordenF'];	 //formato(1.23,2.68 ...)
	
	#echo "terminoActual:  $terminoIDf , ordenActual: $ordenActual  ,  ordenNuevo: $ordenNuevo <br><br> ";
	
	// construimos el array
	$ordenF = str_replace(".", "=", $ordenF);  //formato(1=23,2=68 ...)
	$piecesArray = explode(",", $ordenF);
	
	// eliminamos el termino actual	
	$piecesArray2 = remove_element($piecesArray, "$terminoIDf=$ordenActual");	
	#print_r($piecesArray2); exit();
	
	// reordenamos el array resultante
	$i = 1;
	if(is_array($piecesArray2)) foreach($piecesArray2 as $value)
	{
		$valueEx 	= explode("=", $value);
		$value 		= $valueEx[0];
		$key 		= $i ++ ;
		$piecesArray3[$key] = "$value";
	}
	#print_r($piecesArray3); exit();
	
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
	
	#print_r($piecesArray4); exit();
	
	
	// lo recorremos para construir los UPDATE a mysql
	if(is_array($piecesArray4)) foreach($piecesArray4 as $key => $value) {

		if(is_array($value)) foreach($value as $norden => $terminoID) {			
			$updateSQL = "UPDATE \"$tabla\" SET norden = $norden WHERE \"terminoID\" = '$terminoID' ";	  	
			$result	= JSON_RecordObj_matrix::search_free($updateSQL);
		}
	}

	# PADRE 
	
	// recargamos la ventana del termino y cerramos esta
	echo $codHeader ;
    echo "<script type=\"text/javascript\">";
    #echo "alert('$parent');";
    if( substr($parent, 2)==0 ) {
    	#echo "window.opener.ts.actualizarList('$parent', '$terminoID');";
    	echo "window.opener.location.reload();";
    }else{
    	echo "window.opener.ts.actualizarList('$parent', '$terminoID');";
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
	#dump($result,'$result');

#$rows	= $result->fetch_array(MYSQLI_ASSOC);
$rows 	= pg_fetch_array($result, NULL, PGSQL_ASSOC);
	#dump($rows,'rows');

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
	#dump($result,'$result');

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
	$termino	= RecordObj_ts::get_termino_by_tipo($terminoID);
	
	$nordenArray[] = "$terminoID,$norden" ;
	
	$ordenF .= "$terminoID.$norden,";	
}

# Free result set
#$result->close();


// Creamos la cadena de valores para el formulario
$ordenF = substr($ordenF, 0, -1); #echo $ordenF ;




$page_html = dirname(__FILE__).'/html/ts_norden.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);

# Write session to unlock session file
session_write_close();
?>
