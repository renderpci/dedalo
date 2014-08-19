<?php
/************************************************************************
	
    Dédalo : Cultural Heritage & Oral History Management Platform
	
	Copyright (C) 1998 - 2014  Authors: Juan Francisco Onielfa, Alejandro Peña

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
	
	http://www.fmomo.org
	dedalo@fmomo.org
	
************************************************************************/

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


/*
*	Jerarquia_ACTIONS
*	ACCIONES SOBRE Jerarquia
*/
require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');
require_once(DEDALO_ROOT . '/jer/class.RecordObj_jer.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');


$codHeader .= '<link rel="stylesheet" type="text/css"href="../css/general.css"><script type="text/javascript" src="<?php echo JQUERY_LIB_URL_JS ?>"></script>';

# set vars
$vars = array('accion','id','tld','campo','value','nombre','terminoID');
if(is_array($vars)) foreach($vars as $name)	$$name = setVar($name);


# INSERT
if($accion=='insert') {
	
	$jer = new Jerarquia(); #print_r($_REQUEST); die("accion: ".$accion . $_REQUEST);
	
	$insert = $jer->insert();
	
	if($insert===true)
	{
		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						//location=\"jer_edit.php?id=$id\";
						window.location=\"".DEDALO_ROOT_WEB."/jer/jer_list.php\";							
					}catch(e){ 
						alert(e)
					}
									
				</script>";
		
		print $html ;	
	}else{
		print("Error Jerarquia insert !");	
	}
	
	die();	
}

# EDIT
if($accion=='edit') {
	
	if(!$id) die("Error: id value not received !");
	
	$jer = new Jerarquia();
	
	$edit = $jer->edit($id);

	
	if($edit===true)
	{
		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						window.location=\"".DEDALO_ROOT_WEB."/jer/jer_list.php?id=$id\";							
					}catch(e){ 
						alert(e)
					}									
				</script>";
		
		print $html ;	
	}
	
	die();	
}

# DELETE
if($accion=='delete') {
	
	if(!$id) 	die("Error: id value not received !");
	if(!$tld) 	die("Error: tld value not received !");
	
	$jer = new Jerarquia();
	
	$delete = $jer->delete($id,$tld);
	
	if($delete===true)
	{
		$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						window.location=\"".DEDALO_ROOT_WEB."/jer/jer_list.php\";							
					}catch(e){ 
						alert(e)
					}
									
				</script>";
		
		print $html ;	
	}
	
	die();	
}

# USADO AUTODETECT
if($accion=='usado') {
	
	if(!$campo) die("Error: campo name not received !");
	if(!$value) die("Error: value not received !");	
	
	$jer = new Jerarquia();
	
	# array de valores usados 
	$usadoArray = $jer->camposOcupados($campo);
	
	if(in_array($value,$usadoArray))
	{
		echo " valor $value ya usado ! ";
	}	
	die();		
}

# INSERT TIPO FORM
if($accion=='insertTipoForm') {
	?>	
 
	<form name="form2" id="form2" method="post" action="controller.Jerarquia.php?accion=insertTipo" >
    	<input name="nombreTipo" type="text" id="nombreTipo" style="width:195px;" value="" >
        <input name="OK" type="button" value="ok" class="SubmitButon" onClick="form2submit()">
    </form>    
	
    <?php
	die();
}#if($accion=='insertTipo')


# INSERT TIPO
if($accion=='insertTipo') {
	
	#print_r($_REQUEST); die("".$_REQUEST);
	if(!$nombre) die("Error: nombre not received !");
	
	$jer = new Jerarquia();
	
	$insertTipo = $jer->insertTipo();
	
	if($insertTipo)
	{
		/*
		#$html .= $codHeader ;
		$html .= "<script type=\"text/javascript\">
					try{
						//alert('tipo insertado !')
						//history.go(-1);
						//window.location.reload( true );
						
						//parent.selectTipos('$insertTipo');
													
					}catch(e){ 
						alert(e)
					}
									
				</script>";
		*/
		
		$html = $insertTipo ;
		
		print $html ;	
	}	
	die();		
}

# LISTA TIPOS
if($accion=='selectTipos') {	
	$jer = new Jerarquia();

	$tipoSelected = $_REQUEST['tipo'];
	echo $jer->crearDesplegableJerTipo($tipoSelected) ;
	die();	
}


if($accion=='newLang') {
	
	#if(!$terminoID) die(" Need terminoID !");
	$mainLangFull	= RecordObj_ts::get_termino_by_tipo($terminoID);
	
	$html = '';
		
		$html .= "\n<div class=\"languageLine\">";
		$html .= "\n<input type=\"hidden\" name=\"mainLang\" id=\"mainLang\" value=\"$terminoID\" readonly=\"readonly\" >";
		
		if($terminoID) {
		$html .= "\n <img src=\"../images/iconos/l-icon.gif\" class=\"l-icon\" > ";
		$html .= "$mainLangFull ";
		$html .= "\n<span class=\"anotacionTexto\">[$terminoID]</span>";
		}
		$html .= "\n</div>";
	
	exit($html);
}
?>