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
$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');


require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/lang_translate/class.LangTranslate.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');

$localizacion 	= $tesaurus_title ;
$localizacion2 	= $editar_title ;
$area			= 'tesauro'; verify_access_area($area);


$modo = $_REQUEST['modo']; if(!$modo) die("modo is required!");

$head = 'si'; 
if(isset($_REQUEST['head'])) $head	= $_REQUEST['head'];
	
if($modo=='edit') {
	
	$id	= $_REQUEST['id'];	if(!isset($_REQUEST['id']) || $_REQUEST['id']=='NULL')	exit(" <b> id $no_definido_title </b>");
	
	# Inicializamos la clase Toponimia
	$ts = new Jerarquia();
	
	# Datos del grupo topónimo actual
	$datos = $ts->datosGrupoJerarquia($id);
	
	# array de id's ocupados
	$idsOcupados = $ts->camposOcupados('id');
		#dump($idsOcupados,"idsocupados"); die();
	
	# array de tlds alpha2 ocupados
	$alpha2Ocupados = $ts->camposOcupados('alpha2');
	
	# array de tlds alpha3 ocupados
	$alpha3Ocupados = $ts->camposOcupados('alpha3');
	
	#vars
	$activa = $datos['activa']; if(!isset($activa) || $activa=='NULL')	exit(" <b> activa $no_definido_title </b>");
}

if($modo=='insert') {	

	# Inicializamos la clase Toponimia
	$ts = new Jerarquia();
	
	$datos = false ;
		
	# array de id's ocupados
	$idsOcupados = $ts->camposOcupados('id');
	
	# array de tlds alpha2 ocupados
	$alpha2Ocupados = $ts->camposOcupados('alpha2');
	
	# array de tlds alpha3 ocupados
	$alpha3Ocupados = $ts->camposOcupados('alpha3');
	
	#vars	
}

#print_r($datos);



?>

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>D4 TS</title>
<link rel="shortcut icon" href="../favicon.ico" />

<link rel="stylesheet" type="text/css" charset="utf-8" href="../css/general.css" />
<link rel="stylesheet" type="text/css" charset="utf-8" href="../css/edit.css" />
<link rel="stylesheet" type="text/css" charset="utf-8" href="../jer/css/jer_edit.css" />

<script language="JavaScript" type="text/javascript" charset="utf-8" src="<?php echo JQUERY_LIB_URL_JS ?>"></script>
<script language="JavaScript" type="text/javascript" charset="utf-8" src="../inc/javascript.js"></script>
<script language="JavaScript" type="text/javascript" charset="utf-8" src="../jer/js/jer_edit.js"></script>
<script type="text/javascript">
var DEDALO_LIB_BASE_URL	= '<?php echo DEDALO_LIB_BASE_URL ?>', DEDALO_ROOT_WEB = '<?php echo DEDALO_ROOT_WEB ?>';
var page_globals = new Object();
	page_globals.dedalo_application_lang	= '<?php echo DEDALO_APPLICATION_LANG ?>' ;
	page_globals.dedalo_data_lang		= '<?php echo DEDALO_DATA_LANG ?>' ;
	page_globals.dedalo_data_nolan		= '<?php echo DEDALO_DATA_NOLAN ?>' ;	

DEBUG = <?php var_export(SHOW_DEBUG); ?>;
// vars
var id										= '<?php echo $datos['id'];?>' ;
var alpha2									= '<?php echo $datos['alpha2'];?>' ;
var activa									= '<?php echo $datos['activa'];?>' ;
var modo									= '<?php echo $modo ?>' ;
var tipoSelected							= '<?php echo $datos['tipo'] ?>' ;
var mainLang								= '<?php echo $datos['mainLang'] ?>' ;

var debe_introducir_title					= '<?php echo msgJS($debe_introducir_title)?>';
var idioma_title							= '<?php echo msgJS($idioma_title)?>';
var nombre_title							= '<?php echo msgJS($nombre_title)?>';
var unico_title								= '<?php echo msgJS($unico_title)?>';
var utilizado_title							= '<?php echo msgJS($utilizado_title)?>';
var no_title								= '<?php echo msgJS($no_title)?>';
var un_title								= '<?php echo msgJS($un_title)?>';
var se_eliminaran_todos_los_datos_title		= '<?php echo msgJS($se_eliminaran_todos_los_datos_title)?>';
var de_title								= '<?php echo msgJS($de_title)?>';
var tipo_title								= '<?php echo msgJS($tipo_title)?>';
var ya_se_usa_title							= '<?php echo msgJS($ya_se_usa_title)?>';
var valido_title							= '<?php echo msgJS($valido_title)?>';
var esta_seguro_de_eliminar_registro_1_title= '<?php echo msgJS($esta_seguro_de_eliminar_registro_1_title)?>';

var idsOcupados=new Array();
<?php 
if(is_array($idsOcupados)) foreach($idsOcupados as $key=>$idactual)
{
	if($idactual != $datos['id'])
	echo "idsOcupados[$key]='$idactual';\n";
}
?>
var alpha2Ocupados=new Array();
<?php 
if(is_array($alpha2Ocupados)) foreach($alpha2Ocupados as $key=>$alpha2Actual)
{
	if($alpha2Actual != $datos['alpha2'])
	echo "alpha2Ocupados[$key]='$alpha2Actual';\n";
}
?>
var alpha3Ocupados=new Array();
<?php 
if(is_array($alpha3Ocupados)) foreach($alpha3Ocupados as $key=>$alpha3Actual)
{
	if($alpha3Actual != $datos['alpha3'])
	echo "alpha3Ocupados[$key]='$alpha3Actual';\n";
}
?>
//alert(idsOcupados)



$(document).ready(function() {
	
	if(modo=="edit" && activa == 'no') {
		
		document.form1.nombre.focus();		
		//$('#tipoBtn').show();
	}
	
	selectTipos(tipoSelected);	// load tipos selector 
	
	newLang(mainLang);		// load current mainLang
	
	
}); //FIN domready jquery

</script>

</head>
<body>
<div id="wrapGeneral" >
<table width="100%"  height="100%" border="0" cellspacing="0" cellpadding="0">
  
  <tr>
    <td align="center" valign="top" >
      
      
    <form name="form1" id="form1" method="post" action="controller.Jerarquia.php?accion=<?php echo $modo ?>" onSubmit="return validar(this)" >
    
      <table class="table_edit" style=" width:400px">
		
        <tr>
          <td colspan="2" align="right" nowrap class="topTDround"><?php echo "$modo $jerarquias_title " ?><?php if(isset($id)) echo " ID: $id " ?></td>
		</tr>
        
		<tr align="center">
          <td width="160" align="right" nowrap  >&nbsp;</td>
          <td width="78%" align="left" nowrap >&nbsp;</td>
        </tr>
        
         <!-- ID -->
        <tr align="center"  style="margin-left:4px" >
          <td width="160" align="right" nowrap  > ID <?php echo " $unico_title " ?></td>
          <td align="left" nowrap  >
          	<div id="id2aviso" style="float:right;margin-top:4px; margin-right:4px;width:auto;text-align:right;color:red; font-weight:bold"></div>
            <input name="id" type="text" id="id" style="width:50px; text-align:center; font-weight:bold; color:#000"  value="<?php if(isset($id)) echo $id ?>" onChange="estaUsado_id(this.value)" <?php if(isset($activa) && $activa=='si') print 'readonly'; ?>  >
          </td>
        </tr>
        
		<!-- NOMBRE -->
        <tr align="center"  style="margin-left:4px" >
          <td width="160" align="right" nowrap  > <?php echo $nombre_title ?>  </td>
          <td align="left" nowrap  >
          	<input name="nombre" type="text" id="nombre" style="width:200px;padding-left:5px;" value="<?php echo $datos['nombre'] ?>" <?php if(isset($activa) && $activa=='si') print 'readonly'; ?> >
          </td>
        </tr>
        
         <!-- ALPHA 2 -->
        <tr align="center"  style="margin-left:4px" >
          <td width="160" align="right" valign="middle" nowrap  >TLD (alpha2)</td>
          <td align="left" nowrap >
          	<div id="alpha2aviso" style="float:right;margin-top:4px; margin-right:4px;width:auto;text-align:right;color:red; font-weight:bold"></div>
            <input name="alpha2" type="text" id="alpha2" style="width:30px; text-align:center" value="<?php echo $datos['alpha2'] ?>" maxlength="2" onKeyUp="this.value=this.value.toUpperCase();" onChange="estaUsado_alpha2(this.value)" <?php if(isset($activa) && $activa=='si') print 'readonly'; ?>> 
          	<span class="anotacionTexto"> ej. ES  (<?php echo $solo_letras_title ?>)</span>            
          </td>
        </tr>
        
         <!-- ALPHA 3 -->
        <tr align="center"  style="margin-left:4px" >
          <td width="160" align="right" valign="middle" nowrap  >TLD (alpha3)</td>
          <td align="left" nowrap >
          	<div id="alpha3aviso" style="float:right;margin-top:4px; margin-right:4px;width:auto;text-align:right;color:red; font-weight:bold"></div>
          	<input name="alpha3" type="text" id="alpha3" style="width:40px; text-align:center" value="<?php echo $datos['alpha3'] ?>" maxlength="3" onKeyUp="this.value=this.value.toUpperCase();" onChange="estaUsado_alpha3(this.value)" <?php if(isset($activa) && $activa=='si') print 'readonly'; ?>> 
          	<span class="anotacionTexto"> ej. ESP (<?php echo $solo_letras_title ?>)</span>
            </td>
        </tr>
        
        <!-- MAIN LANG SELECT -->
        <tr align="center"  style="margin-left:4px" >
          <td align="right" valign="top" nowrap  style="padding-top:8px;"><?php echo "$idioma_title $pricipal_title" ?></td>
          <td align="left" nowrap >          
          <div id="langDIV"><!-- Ajax content from jer trigger --></div> 
          <input type="button" id="newlangBtn" value="<?php echo "$idioma_title" ?>" onClick="abrirTSlist('tesauro_rel','lenguaje')" style="margin-right:95px;" >        
		  <?php
			$mainLang	= $datos['mainLang'];
		   
		  	# Comprobamos si existe la tabla "jer_lg"
			$tabla = 'jer_lg';


			### POSTGRESQL ####
			$strQuery = "
			SELECT count(*) AS full_count FROM \"$tabla\"
			";
			$result	= JSON_RecordDataBoundObject::search_free($strQuery);			
			$rows 	= pg_fetch_assoc($result);
				#dump($rows['count'],"result tabla:$tabla - sql:$sql");die();
			if ($rows['full_count']<1) {
				echo '<input type="text" name="SelectLangList" id="SelectLangList" style="width:40px; text-align:center" value="en" readonly >';
			}
			### /POSTGRESQL ####


			
			
			/* OLD  WORLD
			$sql 	= "SELECT terminoID FROM $tabla";
			$result = DBi::_getConnection()->query($sql);
				#dump($result,'$result');			
			##

			if(!is_object($result)) {
				echo '<input type="text" name="SelectLangList" id="SelectLangList" style="width:40px; text-align:center" value="en" readonly >';
			}else{
				
				#$selectLang	= LangTranslate::createSelectLangList($mainLang);
				#echo $selectLang ;
			}
			*/
			/*	 <span class="anotacionTexto"> current: <?php echo $datos['mainLang'] ?></span> */ 
		  ?>
          </td>
        </tr>
        
        <!-- TIPO SELECT -->
        <tr align="center"  style="margin-left:4px" >
          <td align="right" valign="top" nowrap  style="padding-top:8px;"><?php echo $tipo_title ?></td>
          <td align="left" nowrap  >
            <div id="selectTipos" style="float:left;padding:3px; "> <!-- Ajax content here --> </div>
            <input type="button" name="tipoBtn" value="<?php echo $editar_title.' '.$tipo_title ?>"  onClick="openTipo('insertTipoForm')" style="clear:both; " >
            <div id="divTipo" style=" display: block;padding:5px; background-color:#999; clear:both; width:360px; display:none"> <!-- Ajax content here --> </div>
          </td>
        </tr>
        
        <!-- ACTIVA -->
        <tr align="center"  style="margin-left:4px" >
          <td align="right" valign="middle" nowrap  ><?php echo $activa_title ?></td>
          <td align="left" nowrap >
            <?php 
			$selectBGcolor = false ;
			$activa = $datos['activa']; if(!isset($activa)) $activa = 'no';
			if($activa=='si') $selectBGcolor = "background-color:#090;" ;
			if($activa=='no') $selectBGcolor = "background-color:#FF0000;" ;
			?>
        	<select name="activa" id="activa" <?php echo $selectBGcolor ?>  onChange="activaChange(this.value)">
				<option value="si" <?php if (!(strcmp('si', $activa))) {echo "selected=\"selected\" ";} ?> ><?php echo $si_title ?></option>
				<option value="no" <?php if (!(strcmp('no', $activa))) {echo "selected=\"selected\" ";} ?> ><?php echo $no_title ?></option>              
			</select>
            <div style="width:18px; height:18px;<?php echo $selectBGcolor ?>display:inline-block; vertical-align: middle">&nbsp;</div>
          </td>
        </tr>
        
        
        <!-- HIDEN FIELDS -->  
        <tr align="center">
          <td height="50" align="left" valign="middle" nowrap  >&nbsp;</td>
          <td align="left" valign="middle" nowrap  >           
            <!-- Campos obligatorios -->
            <input type="hidden" name="activaAnterior" value="<?php echo $datos['activa']; ?>" >
            <input type="submit" name="Submit" value="  <?php echo $modificar_title ?>  " class="SubmitButon" >
            <?php if($head=='no'){ ?>
            <input name="cancelar" type="button" value=" <?php echo $cerrar_title ?> "  class="flechas" onClick="javascript: window.close() ;">
            <?php }else{ ?>
            <input name="cancelar" type="button" value=" <?php echo $cancelar_title ?> " onClick="javascript: history.go(-1);">
            <?php }//if($head=='no'){ ?>
		</tr>
          
	</table>
    </form> 
    
       
	
      
      </td>
  </tr>
  
  
  </table>
</div><!-- wrapGeneral -->

</body>
</html>
