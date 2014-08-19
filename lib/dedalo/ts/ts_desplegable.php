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

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');


$query_RS 		= "SELECT tesauroID, tesauro, parent FROM tesauro WHERE children = '0' ORDER BY tesauro ASC LIMIT 0, 1000";
$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(mysql_error());
$row_RS 		= mysql_fetch_assoc($RS);
$totalRows_RS 	= mysql_num_rows($RS);
?>

<select name="tesauroID" id="tesauroID"  class="textoIndex" style="color:#333333">

  <option value="" <?php if (!(strcmp("", $row_Recordset1['tesauroID']))) {echo "selected=\"selected\"";} ?>>- <?php echo $sin_seleccion_title ?> -</option>
  <?php
	do {  
	
	///// SACAMOS EL PADRE DEL TESAURO ACTUAL TESAURO ACTUAL ////////////////
  		$parentInicial = $row_RS['parent']; // empezamos con el que viene del get
	
	    $query_RS2 		= "SELECT tesauro  FROM tesauro WHERE tesauroID = '$parentInicial' LIMIT 0 , 1" ;
		$RS2 			= mysql_query($query_RS2, DB::_getConnection()) or die(mysql_error());
		$row_RS2 		= mysql_fetch_assoc($RS2);
		$totalRows_RS2 	= mysql_num_rows($RS2);
		
		$padre = $row_RS2['tesauro'];
  	///////////////////////////////////////////////////////////////////////////////////
  
	
	$tesauroID = $row_RS['tesauroID']; 
	$tesauro = $row_RS['tesauro'];
	
	$parentInicial = $row_RS2['parent']; // lo sustituimos por el resultado recursivamente hasta el primero	
	$matriz[$tesauroID] = $tesauro ; // añadimos cada uno a la matriz
	?>
  <option value="<?php echo $tesauroID ?>"<?php if (!(strcmp($row_Recordset1['tesauroID'], $tesauroID))) {echo "selected=\"selected\"";} ?><?php echo $tesauroID ?>>
  <?php 
  echo $tesauro ;
  if ($padre) echo  ' - [ '.$padre . ' ]' ;
  ?>
  </option>
  
  
  <?php
  } while ($row_RS = mysql_fetch_assoc($RS));
  $rows = mysql_num_rows($RS);
  if($rows > 0) {
      mysql_data_seek($RS, 0);
	  $row_RS = mysql_fetch_assoc($RS);
  }
?>
</select>