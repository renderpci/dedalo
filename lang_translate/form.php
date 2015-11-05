<?php if(!isset( $_SESSION )) session_start();
if(isset($_REQUEST['guest']) && $_REQUEST['guest']==1) {
	
	# acceso libre (sin login)
	$guest = true;
	$_SESSION['auth']['usuario'] = 'guest';
	
}else{
	
	# acceso normal (necesita login)
	require_once('../auth/seguridad.php');
	$guest = false;	
}

require_once('../Connections/config.php');
require_once('../inc/funciones.php');
require_once("../lang_translate/class.LangTranslate.php");

$localizacion 	= $administracion_abrev_title ;
$localizacion2 	= $idioma_title ;
$area			= 'admin'; verify_access_area($area);
if(NIVEL<9) 	exit(" $no_tiene_acceso_a_esta_zona_title ");

# fix area
$_SESSION['area_admin'] = 'lang';


$source = false ;
if(isset($_REQUEST['source'])) $source = $_REQUEST['source'] ; #if(!$sourceF) exit("source not defined!");

$lg = new LangTranslate();

?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title><?php echo $pagTitle ?></title>
<link rel="shortcut icon" href="../favicon.ico" />

<link rel="stylesheet" type="text/css" charset="utf-8" href="../css/general.css" />
<link rel="stylesheet" type="text/css" charset="utf-8" href="../lang_translate/css/lang_form.css" />

<script type="text/javascript">
// vars
var source	= '<?php echo $source ?>' ;
</script>

</head>
<body>
<div id="wrapGeneral">
<table width="100%" height="100%" border="0" cellspacing="0" cellpadding="0" style="">

	<tr><td height="77" valign="top"><?php include_once('../inc/header.php'); ?></td></tr>
  
	<tr>
        <td align="left" valign="top" >
        
        <?php if($guest) echo "<div style=\"margin-left:20px; color:#FFF;float:left; font-size:14px\"> Guest access </div>"; ?>
        
        
        <div id="listLangCode">
		<?php 
		$google_ar_codes = $lg->get_google_ar_codes();
		
		if(is_array($google_ar_codes) && !isset($_GET['source']) ) foreach($google_ar_codes as $key => $value)
		{
			if(!$value || $value=='') $value = "-";
			echo " <div class=\"listLangCode\" > $value </div> <div class=\"listLangName\"> $key </div>";	
		}		
		?>
        </div>
        
        
        <?php echo $lg->createFormFromFile($source); #var_dump($source) ; ?>  
    
        </td>
	</tr>

	<tr><td align="center" valign="bottom"><?php include_once('../inc/footer.php'); ?></td></tr>

</table>
</div>
</body>
</html>

<?php require_once("../inc/javascript.php");?>
<script language="JavaScript" type="text/javascript" src="../inc/javascript.js"></script>
<script language="JavaScript" type="text/javascript" src="../lang_translate/js/lang_form.js"></script>