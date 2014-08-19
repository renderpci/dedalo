<?php
# paginación general Recordset1
if($incPag==1)
{
	if ((isset($_REQUEST['max'])) && ($_REQUEST['max'] != "")) $maxRows_Recordset1 = $_REQUEST['max']; 
	$pageNum_Recordset1 = 0;
	if (isset($_GET['pageNum_Recordset1'])) {
	  $pageNum_Recordset1 = $_GET['pageNum_Recordset1'];
	}
	$startRow_Recordset1 = $pageNum_Recordset1 * $maxRows_Recordset1;
}
if($incPag==2)
{
	if (isset($_GET['totalRows_Recordset1'])) {
	  	$totalRows_Recordset1 = $_GET['totalRows_Recordset1'];
	} else {
		# Búsqueda de TODOS los registros (sin filtro de paginacion)
	  	#$all_Recordset1 = mysql_query($query_Recordset1);
	  	$result_all 		= DBi::_getConnection()->query($sql);

	  	#$totalRows_Recordset1 = mysql_num_rows($all_Recordset1);
	  	$totalRows_Recordset1 = $result_all->num_rows;
	}


	$totalPages_Recordset1 = ceil($totalRows_Recordset1/$maxRows_Recordset1)-1;
	
	$queryString_Recordset1 = "";
	if (!empty($_SERVER['QUERY_STRING'])) {
	  $params = explode("&", $_SERVER['QUERY_STRING']);
	  $newParams = array();
	  foreach ($params as $param) {
		if (stristr($param, "pageNum_Recordset1") == false && 
			stristr($param, "totalRows_Recordset1") == false) {
		  array_push($newParams, $param);
		}
	  }
	  if (count($newParams) != 0) {
		$queryString_Recordset1 = "&" . htmlentities(implode("&", $newParams));
	  }
	}
	$queryString_Recordset1 = sprintf("&totalRows_Recordset1=%d%s", $totalRows_Recordset1, $queryString_Recordset1);	
}

?>