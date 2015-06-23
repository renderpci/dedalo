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
$security 	 = new security();
$permissions = (int)$security->get_security_permissions(DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');


require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');

$localizacion 	= $jerarquias_title ;
$localizacion2 	= $editar_title  ;


$modo = $_REQUEST['modo']; if(!$modo) die("modo is required!");
	
if($modo=='edit')
{
	$id	= $_REQUEST['id'];	if(!isset($_REQUEST['id']) || $_REQUEST['id']=='NULL')	exit(" <b> id $no_definido_title </b>");
	
	# Inicializamos la clase Toponimia
	$ts = new Jerarquia();
	
	# Datos del grupo topónimo actual
	$datos = $ts->datosGrupoJerarquia($id);
	
	# array de id's ocupados
	$idsOcupados = $ts->camposOcupados('id');
	
	# array de tlds alpha2 ocupados
	$alpha2Ocupados = $ts->camposOcupados('alpha2');
	
	# array de tlds alpha3 ocupados
	$alpha3Ocupados = $ts->camposOcupados('alpha3');
	
	#vars
	$activa = $datos['activa']; if(!isset($activa) || $activa=='NULL')	exit(" <b> activa $no_definido_title </b>");
}

if($modo=='insert')
{	
	# Inicializamos la clase Toponimia
	$ts = new Jerarquia();
		
	# array de id's ocupados
	$idsOcupados = $ts->camposOcupados('id');
	
	# array de tlds alpha2 ocupados
	$alpha2Ocupados = $ts->camposOcupados('alpha2');
	
	# array de tlds alpha3 ocupados
	$alpha3Ocupados = $ts->camposOcupados('alpha3');
	
	#vars
	
}


$page_html = dirname(__FILE__).'/jer_tipo_edit.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);
exit();
?>