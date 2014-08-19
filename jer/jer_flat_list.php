<?php 
require_once( dirname(dirname(__FILE__)).'/lib/dedalo/config/config4.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');


require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');

require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');

$localizacion 	= $jerarquias_title ;
$area			= 'tesauro'; verify_access_area($area);

# set vars
$vars = array('tld','parent','frg','tipo','from');
foreach($vars as $name)	$$name = setVar($name);

$head = setVar('head','no');
$modo = setVar('modo','tesauro_edit');


if(!$tld || $tld=='') {
	
	echo $codHeader;
	#echo '<link rel="stylesheet" type="text/css" charset="utf-8" href="../css/general.css" />';
	echo " <div style=\"color:#888; width:200px;margin-left:auto;margin-right:auto; margin-top:65px;font-family:Arial,Helvetica,sans-serif;font-size:12px\"> <img src=\"../images/iconos/flecha.gif\" align=\"bottom\" /> Select hierarchy </div> ";
	die();	
}
	
$tld = strtolower($tld);

$tabla 	= 'jer_'.$tld ;

if($modo=='modelo_edit') {
	$esmodelo = 'si';	
}else{
	$esmodelo = 'no';	
}

# inicializamos clase tesauro
$ts 			= new Tesauro($modo);

# inicializamos clase jerarquia
$jer 			= new Jerarquia();
$jer->tabla 	= $tabla ;
$datosFromTLD 	= $jer->datosGrupoJerarquia(false,$tld);
$nombreGrupo 	= $datosFromTLD['nombre'];

# fijamos la localización 2
$localizacion2 	= "$nombreGrupo";

# comprobamos que la tabla está activa
if($datosFromTLD['activa']!='si') die(" Select hierarchy please ");


/*
* Búsqueda
*/
$maxRows_Recordset1 = 15 ;
$incPag=1;require('../inc/incPag.php');# paginación
 
   $terminoIDGET 	= false;
   $terminoGET		= false;
   $esdescriptorGET	= false;   
   $filtro = "" ;
   
   if ((isset($_REQUEST['filtro'])) && ($_REQUEST['filtro'] == "y"))
   {
 	$terminoIDGET	 	= $_REQUEST['terminoID'];		if($terminoIDGET!='') 		$filtro .= " AND terminoID LIKE '$terminoIDGET' " ;
 	$terminoGET			= $_REQUEST['termino'];			if($terminoGET!='') 		$filtro .= " AND termino LIKE '%$terminoGET%' " ;	
	$esdescriptorGET	= $_REQUEST['esdescriptor'];	if($esdescriptorGET!='') 	$filtro .= " AND esdescriptor = '$esdescriptorGET' " ;
   }
 
 	$orden = 'id';
 	$ot = 'ASC';
	if (isset($_GET['orden']) && $_GET['orden']!=' ' ) 	$orden = $_GET['orden'] ;
	if (isset($_GET['ot']) && $_GET['ot']!=' ' ) 		$ot = $_GET['ot'];
	$ordenacion = " ORDER BY $orden  $ot  "; 
	
/*
$query_Recordset1 = "
SELECT SQL_CACHE terminoID FROM 
$tabla
WHERE
esmodelo = '$esmodelo'
$filtro
$ordenacion 
";
$query_limit_Recordset1 = sprintf("%s LIMIT %d, %d", $query_Recordset1, $startRow_Recordset1, $maxRows_Recordset1);
$Recordset1 			= mysql_query($query_limit_Recordset1, DB::_getConnection()) or die(mysql_error());
$row_Recordset1 		= mysql_fetch_assoc($Recordset1);
*/
####
$sql 		= "SELECT SQL_CACHE terminoID 
				FROM $tabla
				WHERE
				esmodelo = '$esmodelo'
				$filtro
				$ordenacion 
			  ";
$sql_limited= sprintf("%s LIMIT %d, %d", $sql, $startRow_Recordset1, $maxRows_Recordset1);
$result 	= DBi::_getConnection()->query($sql_limited);
	#dump($result,'$result');

$row_Recordset1 = $result->fetch_array(MYSQLI_ASSOC);
####

$incPag=2;require('../inc/incPag.php');# paginacion



$page_html = 'html/jer_flat_list.phtml'; 

# LOAD VISTA TEMPLATE CODE
require_once($page_html);
exit();
?>