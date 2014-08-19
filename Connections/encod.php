<?php 
die('ENCOD DEPRECATED !');
/*
// SET DB GENERAL ENCODING	
	$query_RS = " SET NAMES '$encodeDB'   ";
	$RS = mysql_query($query_RS, $conn) or die("Set general encoding: ".mysql_error());
// verificacion admin
	if( defined('NIVEL') && NIVEL==10)
	{
	$query_RS = " SHOW VARIABLES LIKE 'character_set%' ";
	$RS = mysql_query($query_RS, $conn) or die(mysql_error());
	$row_RS = mysql_fetch_assoc($RS);	
	$ar_character_set = $row_RS ;
	mysql_free_result($RS);
	foreach($ar_character_set AS $ar_character_set_key => $ar_character_set_value)
	{
		#echo " $ar_character_set_key - $ar_character_set_value <br>";	
		if($ar_character_set_key=='Value') $character_set = $ar_character_set_value ;
	}	
	#print_r($character_set);		
	$query_RS = "SHOW VARIABLES LIKE 'collation%' ";
	$RS = mysql_query($query_RS, $conn) or die(mysql_error());
	$row_RS = mysql_fetch_assoc($RS);	
	$collation_connection = $row_RS ;
	#print_r($collation_connection);
	mysql_free_result($RS); 
	}
*/
?>