<?php 
error_reporting(E_ERROR);
$php = true?"true":"false";
$phpver = phpversion();
$server = PHP_OS;
$dic_php = diclist( "../dictionaries/", $read_php );
$read_php = $read_php?"true":"false";

echo "{\"php\":$php,\"phpver\":\"$phpver\",\"server\":\"$server\",\"dic_php\":\"$dic_php\",\"read_php\":$read_php}";


#UTIL

function diclist($path, &$read_php){
	$read_php = false;
	$myDirectory = opendir(  $path);
	while( $entryName = readdir( $myDirectory) ){
		
		if( $entryName=='custom.txt' || (strpos( $entryName, ".dic" ) === strlen( $entryName )-4 && substr($entryName,0,1) !="." )  ){
			$dirArray  []= $entryName;
			
			if(!$read_php && strpos( $entryName, ".dic" ) === strlen( $entryName )-4 ){
				$read_php = is_readable (  $path.$entryName );
			}
		}
	}
	closedir( $myDirectory );
	return implode(",",$dirArray);		
}