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

if ($modo==='tesauro_rel') {
	# Skip permissions
	$permissions = 3;
}else{
	$security 	 = new security();
	$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);
}

#$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}




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
$vars = array('t','n','p','max');
foreach($vars as $name)	$$name = setVar($name);
# t = tipo (form, tr, ...)
# n = numero total de registros
# p = página actual
# max = máximos reg


	# LANGS SELECTOR
	$ar_all_langs 	= common::get_ar_all_langs_resolved();	
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

if($t=='form' && $n==0) { 
	
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
		$arrayTablas 	= (array)$tsInicioList->get_arrayTablas();
			#dump( $arrayTablas,'arrayTablas' );


		#
		# HIDE_TYPES : Tipos de tesauros a excluir de la presentación (usado por autocomplete_ts)
		$hide_types = isset($_REQUEST['hide_types']) ? $_REQUEST['hide_types'] : false;		
		if ($hide_types && $hide_types=json_decode($hide_types)) {
			foreach ((array)$arrayTablas['tipo'] as $key => $value) {
				if (in_array($value, (array)$hide_types)) {
					unset($arrayTablas['prefijo'][$key]);
				}
			}
		}
		#dump( $arrayTablas,'arrayTablas 2' );

			
		$tipoFix 		= false ;
		
		if(isset($arrayTablas['prefijo'])) foreach((array)$arrayTablas['prefijo'] as $key => $prefijo) {
					
			$parentInicialActual 	= $prefijo .'0';
			$tipoActual 			= $arrayTablas['tipo'][$key];
						

			if($tipoActual==$tipoFix) {
				$headerActual   = 'no';
				$buildTreeHtml .= "<div id=\"tesauroDivLine\"></div>";	
			}else{
				$headerActual = 'si';		
			}			
			$buildTreeHtml .= $tsInicioList->buildTree($parentInicial="$parentInicialActual", $terminoIDActual='', $terminoIDresalte=$terminoIDlist, $header=$headerActual);

			$tipoFix = $arrayTablas['tipo'][$key];			
			
			
		}#foreach($arrayTablas['prefijo'] as $key => $prefijo)	
		

};//if($t=='form')

#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

# CSS
css::$ar_url[] = DEDALO_LIB_BASE_URL .'/component_portal/css/component_portal.css';
css::$ar_url[] = DEDALO_LIB_BASE_URL .'/tools/tool_av_versions/css/tool_av_versions.css';
css::$ar_url[] = DEDALO_LIB_BASE_URL .'/diffusion/diffusion_index_ts/css/diffusion_index_ts.css';
css::$ar_url[] = DEDALO_LIB_BASE_URL .'/ts/css/ts_list.css';

# JS
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/common/js/cookies.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/tools/tool_av_versions/js/tool_av_versions.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/component_portal/js/component_portal.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/common/js/lang/'.DEDALO_APPLICATION_LANG.'.js';
js::$ar_url[]  = DEDALO_ROOT_WEB 	 . '/lib/jquery/AjaxQ-master/ajaxq.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL .'/ts/js/ts_common.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL .'/tools/tool_common/js/tool_common.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL .'/tools/tool_diffusion/js/tool_diffusion.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL .'/tools/tool_indexation/js/tool_indexation.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/ts/js/ts_list.js';
/*
	print js::build_tag(JQUERY_LIB_URL_JS);
	print js::build_tag(JQUERY_UI_URL_JS);
	print js::build_tag(DEDALO_LIB_BASE_URL . '/common/js/common.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/tools/tool_common/js/tool_common.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/login/js/login.js');
	print js::build_tag(DEDALO_LIB_BASE_URL .'/component_portal/js/component_portal.js');
	print js::build_tag(DEDALO_LIB_BASE_URL .'/tools/tool_av_versions/js/tool_av_versions.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/common/js/cookies.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/common/js/lang/'.DEDALO_APPLICATION_LANG.'.js');
	#print js::build_tag(DEDALO_ROOT_WEB 	. '/lib/jquery/jquery.ajaxQueue.min.js');
	print js::build_tag(DEDALO_ROOT_WEB 	. '/lib/jquery/AjaxQ-master/ajaxq.js');
	#print js::build_tag(DEDALO_ROOT_WEB 	. '/inc/javascript.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/ts/js/ts_common.js');
	print js::build_tag(DEDALO_LIB_BASE_URL .'/tools/tool_common/js/tool_common.js');
	print js::build_tag(DEDALO_LIB_BASE_URL .'/tools/tool_indexation/js/tool_indexation.js');
	print js::build_tag(DEDALO_LIB_BASE_URL . '/ts/js/ts_list.js');
	*/
# MENU
$html_header ='';
if($modo=='tesauro_rel') {
	# Nothing to do
}else{
	$menu_html = NULL;
	if(empty($caller_id)) {
		$menu 		= new menu($modo);
		$menu_html 	= $menu->get_html();
	}
	$file		 	= DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml';
	ob_start();
	include ( $file );
	$html_header =  ob_get_contents();
	ob_get_clean();
}




$page_html = dirname(__FILE__).'/html/ts_list.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);
#exit();



# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'LOAD LIST',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		#array("msg"=>$logger_msg)
		array(	"msg"			=> "Loaded ts list",
				"ts_modo"		=> $modo
				)
	);

# Write session to unlock session file
session_write_close();

?>