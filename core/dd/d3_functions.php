<?php 
# D3 Functions (old)



/*
* msgJS
* formatea los mensajes Javascript para evitar problemas con los retornos de carro
*/
function msgJS($value) {

	$value = addslashes($value) ;
	$value = trim( str_replace(array( "\r", "\n", "%0a", "%0d", "<br>","<br />"), "\n", $value) );
	
	$value = $value ;
	
	return $value ;
}#emd msgJS



