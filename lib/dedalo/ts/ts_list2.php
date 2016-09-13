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

require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/lang_translate/class.LangTranslate.php');



$area			= 'tesauro'; #verify_access_area($area);

# set vars
$vars = array('modo','ts_lang','type','head','mostrarNorden','accion','terminoIDlist','terminoID','termino','def','indexacionID','modelo_name');
foreach($vars as $name)	$$name = setVar($name);

# fix area
if($modo=='tesauro_edit') 	$_SESSION['area_ts'] = 'ts';
if($modo=='modelo_edit') 	$_SESSION['area_ts'] = 'model';


#print_r($_SESSION);

# mostrar/ocultar orden
$_SESSION['mostrarNorden'] = 0;
if($mostrarNorden)	$_SESSION['mostrarNorden'] = $mostrarNorden ;

# modo
if(!$modo || $modo=='')		$modo = 'tesauro_edit';		#echo $modo;

# type
#if(!$type || $type=='') 	$type = 'all';				#var_dump($type);



# localización (between tesaur / modelo)
$localizacion 	= $tesaurus_title ;
if($modo=='modelo_edit'){
	$localizacion2 	= ucfirst($modelo_title) ;
}else{
	$localizacion2 	= ucfirst($tesaurus_title) ;
}


# reseteamos las var sesión
unset($_SESSION['rel']); 
unset($_SESSION['frg']);

# VARIABLES DE SESION USADAS PARA PASAR LOS VALORES A TESAURO CUANDO SE INDEXA
$vars = array('rel','frg','reelID','reelID','indexID','captacionID');
foreach($vars as $name)	$$name = setVar($name);

if ($head) 			$_SESSION['head']			= $head ;
if ($rel) 			$_SESSION['rel']			= $rel ;
if ($frg)			$_SESSION['frg']			= $frg ;
if ($indexacionID)	$_SESSION['indexacionID']	= $indexacionID;
if ($reelID)		$_SESSION['reelID'] 		= $reelID;
if ($indexID)		$_SESSION['indexID']		= $indexID;
if ($captacionID)	$_SESSION['captacionID']	= $captacionID;



# search vars
$vars = array('total','n','p','max');
foreach($vars as $name)	$$name = setVar($name);
# t = tipo (form, tr, ...)
# n = numero total de registros
# p = página actual
# max = máximos reg


	# LANGS SELECTOR
	$ar_all_langs 	= common::get_ar_all_langs();	
	$selectedItem 	= $ts_lang;

	$select_html='';
	$select_html .= "\n<select name=\"SelectLangList\" id=\"SelectLangList\" class=\"selectProjectLang\" onchange=\"newLang(this.value)\" title=\"Langs\" >";
	$select_html .= "\n <option value=\"\"></option>";
	if(is_array($ar_all_langs)) foreach($ar_all_langs as $current_select_lang => $lang_name) {
		
		$select_html .= "\n <option value=\"$current_select_lang\" ";

		if($selectedItem==$current_select_lang)
		$select_html .= " selected=\"selected\" ";

		$select_html .= ">$lang_name";
		#if(SHOW_DEBUG)
		#$select_html .= " [$current_select_lang]";
		$select_html .= "</option>";
		
	}
	$select_html .= "\n</select>\n";
	$SelectLangList = $select_html;


# selects
#$nombre_select		= crearDesplegableBasico('jerarquia_tipos', 'nombre', 'id', $type, $filtro='', $char='100', $width='70px', $sinOpcion0='no');
$nombre_select		= Jerarquia::crearDesplegableJerTipo($type,$ancho='70','nombre');




#*************************************************
#	LISTADO INICIAL
#*************************************************	
$tsInicioList 	= new Tesauro($modo,$type,$ts_lang);
$buildTreeHtml 	= false ;

if($total=='form' && $n==0) { 
	
		$notFoundHtml = "<div style=\"padding:100px; padding-top:150px; padding-bottom:150px; color:red; font-weight:bold\" >";
		$notFoundHtml .= $no_hay_resultados_coincidentes_title ;
		$notFoundHtml .= "<br><br>"; ;
		
		if(isset($_REQUEST['terminoID']))	$notFoundHtml .= " $tesaurus_title ID: ".$_REQUEST['terminoID']."<br>" ;
		if(isset($_REQUEST['termino'])) 	$notFoundHtml .= " $termino_title : ".$_REQUEST['termino']."<br>" ;
		if(isset($_REQUEST['def'])) 		$notFoundHtml .= " $definicion_title : ".$_REQUEST['def']."<br>" ;
		if(isset($_REQUEST['obs'])) 		$notFoundHtml .= " $observaciones_title : ".$_REQUEST['obs']."<br>" ;
		
		$notFoundHtml .= "</div>" ;
		
		$buildTreeHtml = $notFoundHtml ;		
	
}else{
		#
		# ARBOL Constrimos el arbol a partir del array de los que hay activos 
		#			
		$arrayTablas 	= $tsInicioList->get_arrayTablas();
			#dump( $arrayTablas,'arrayTablas' );
		$tipoFix 		= false ;
		
					
		if(is_array($arrayTablas)) foreach($arrayTablas['prefijo'] as $key => $prefijo) {
					
			$parentInicialActual 	= $prefijo .'0';
			$tipoActual 			= $arrayTablas['tipo'][$key];

			# Tipo 5 is not showed
			if( $tipoActual==5 && SHOW_DEBUG==false ) {

				# Nothing to do

			}else{				

				if($tipoActual==$tipoFix) {
					$headerActual   = 'no';
					$buildTreeHtml .= "<div id=\"tesauroDivLine\"></div>";	
				}else{
					$headerActual = 'si';		
				}			
				$buildTreeHtml .= $tsInicioList->buildTree($parentInicial="$parentInicialActual", $terminoIDActual='', $terminoIDresalte=$terminoIDlist, $header=$headerActual);				
				
				$tipoFix = $arrayTablas['tipo'][$key];								

			}#if($tipoActual!=5) 
			
			
		}#foreach($arrayTablas['prefijo'] as $key => $prefijo)		

};//if($t=='form')



ob_start();
include ( DEDALO_LIB_BASE_PATH . '/ts/html/ts_list2.phtml' );
$html =  ob_get_contents();
ob_get_clean();
echo html_page::get_html($html);

# Write session to unlock session file
session_write_close();

exit();

?>