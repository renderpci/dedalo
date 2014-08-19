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


$page_html = 'jer_tipo_edit.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);
exit();
?>