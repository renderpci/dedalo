<?php 
include( dirname(dirname(__FILE__)) .'/config/config4.php');
# Old lang vars
include(DEDALO_LIB_BASE_PATH . '/dd/lang/lang_code.php');
include(DEDALO_LIB_BASE_PATH . '/dd/class.dd.php');
include(DEDALO_LIB_BASE_PATH . '/dd/d3_functions.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
$is_global_admin = component_security_administrator::is_global_admin( $_SESSION['dedalo4']['auth']['user_id'] );
if($is_global_admin!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}


# CSS
css::$ar_url[] = DEDALO_LIB_BASE_URL .'/dd/css/dd_list.css';

# JS
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/common/js/common.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/menu/js/menu.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/common/js/cookies.js';
#js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/common/js/lang/'.DEDALO_APPLICATION_LANG.'.js';
#js::$ar_url[]  = DEDALO_ROOT_WEB 	 . '/lib/jquery/AjaxQ-master/ajaxq.js';
#js::$ar_url[]  = DEDALO_ROOT_WEB 	 . '/lib/jquery/jquery.ajaxQueue.min.js';
js::$ar_url[]  = DEDALO_ROOT_WEB 	 . '/inc/javascript.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/tools/tool_common/js/tool_common.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/dd/js/dd_common.js';
js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/dd/js/dd_list.js';



$area = 'tesauro'; #verify_access_area($area);

# set vars
$vars = array('modo','ts_lang','type','head','mostrarNorden','accion','terminoIDlist','terminoID','termino','def','indexacionID','modelo_name');
foreach($vars as $name)	$$name = common::setVar($name);

# fix area
if($modo==='tesauro_edit') 	$_SESSION['area_ts'] = 'ts';
if($modo==='modelo_edit') 	$_SESSION['area_ts'] = 'model';


#print_r($_SESSION);

# mostrar/ocultar orden
$_SESSION['mostrarNorden'] = 0;
if($mostrarNorden)	$_SESSION['mostrarNorden'] = $mostrarNorden ;

# modo
if(!$modo || $modo==='') $modo = 'tesauro_edit';		#echo $modo;

# type
#if(!$type || $type==='') 	$type = 'all';				#var_dump($type);



# localización (between tesaur / modelo)
$localizacion = $tesaurus_title ;
if($modo==='modelo_edit'){
	$localizacion2 	= ucfirst($modelo_title) ;
}else{
	$localizacion2 	= ucfirst($tesaurus_title) ;
}


# reseteamos las var sesión
unset($_SESSION['rel']); 
unset($_SESSION['frg']);

# VARIABLES DE SESION USADAS PARA PASAR LOS VALORES A TESAURO CUANDO SE INDEXA
$vars = array('rel','frg','reelID','reelID','indexID','captacionID');
foreach($vars as $name)	$$name = common::setVar($name);

if ($head) 			$_SESSION['head']			= $head ;
if ($rel) 			$_SESSION['rel']			= $rel ;
if ($frg)			$_SESSION['frg']			= $frg ;
if ($indexacionID)	$_SESSION['indexacionID']	= $indexacionID;
if ($reelID)		$_SESSION['reelID'] 		= $reelID;
if ($indexID)		$_SESSION['indexID']		= $indexID;
if ($captacionID)	$_SESSION['captacionID']	= $captacionID;



# search vars
$vars = array('t','n','p','max');
foreach($vars as $name)	$$name = common::setVar($name);
# t = tipo (form, tr, ...)
# n = numero total de registros
# p = página actual
# max = máximos reg


	# LANGS SELECTOR
	$select_html  = (function($ts_lang){

		$select_html  = '';
		$select_html .= '<select name="SelectLangList" id="SelectLangList" class="selectProjectLang" onchange="newLang(this.value)" title="Langs">';
		$select_html .= '<option></option>';
		$ar_all_langs = common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);
		foreach($ar_all_langs as $current_lang => $lang_name) {
			
			$select_html .= '<option value="'.$current_lang.'"';

			if($current_lang===$ts_lang) {
				$select_html .= ' selected="selected" ';
			}		

			$select_html .= '>'.$lang_name;
			#if(SHOW_DEBUG)
			#$select_html .= " [$current_lang]";
			$select_html .= '</option>';
			
		}
		$select_html .= '</select>';

		return $select_html;
	})($ts_lang);
	
	$SelectLangList = $select_html;


	# MODEL SELECTOR




#*************************************************
#	LISTADO INICIAL
#*************************************************	
$tsInicioList 	= new dd($modo,$type,$ts_lang);
$buildTreeHtml 	= false;

if($t==='form' && $n===0) { 
	
		$notFoundHtml  = '<div style="padding:100px; padding-top:150px; padding-bottom:150px; color:red; font-weight:bold">';
		$notFoundHtml .= $no_hay_resultados_coincidentes_title ;
		$notFoundHtml .= "<br><br>"; ;
		
		if(isset($_REQUEST['terminoID']))	$notFoundHtml .= " $tesaurus_title ID: ".	safe_xss($_REQUEST['terminoID'])."<br>" ;
		if(isset($_REQUEST['termino'])) 	$notFoundHtml .= " $termino_title : ".		safe_xss($_REQUEST['termino'])."<br>" ;
		if(isset($_REQUEST['def'])) 		$notFoundHtml .= " $definicion_title : ".	safe_xss($_REQUEST['def'])."<br>" ;
		if(isset($_REQUEST['obs'])) 		$notFoundHtml .= " $observaciones_title : ".safe_xss($_REQUEST['obs'])."<br>" ;
		
		$notFoundHtml .= "</div>" ;
		
		$buildTreeHtml = $notFoundHtml ;		
	
}else{
		#
		# ARBOL Constrimos el arbol a partir del array de los que hay activos 
		#					
		$parentInicialActual 	= 'dd0';
		#$tipoActual 			= 5;						
				
		$buildTreeHtml = $tsInicioList->buildTree($parentInicial='dd0', $terminoIDActual='', $terminoIDresalte=$terminoIDlist, $header='si');			

}//if($t=='form')



// menu
	if (isset($_GET['menu']) && $_GET['menu']==='no') {
		$html_header = '';
	}else{
		$menu_html = NULL;
		if(empty($caller_id)) {
			$menu 		= new menu($modo);
			$menu_html 	= $menu->get_html();
		}
		$file			= DEDALO_LIB_BASE_PATH . '/html_page/html/html_page_header.phtml';
		ob_start();
		include ( $file );
		$html_header =  ob_get_contents();
		ob_get_clean();
	}



// page html
	$page_html = dirname(__FILE__).'/html/dd_list.phtml';
	include($page_html);


# Write session to unlock session file
// session_write_close();

