<?php  // FUNCIONES GENERALES  //////////////////////////////////////////////////////////////////////////////////////////////


/************************************* UTILIDADES VARIAS *****************************************/
if(!isset($volver_title)) $volver_title = 'back';
$renderBtnVolver = "<input name=\"volver\" type=\"button\" value=\"$volver_title\" onClick=\"javascript:history.go(-1);\">";
function flechasOrden($campo)
{
	$campoInfo	= $campo;
	
	$flechaUp 	= "<img src=\"../images/iconos/flecha_up.png\" onClick=\"ordenar('$campo','DESC');\" class=\"flechas\" title=\"Sort by $campoInfo Ascending\" />";
	$flechaDown = "<img src=\"../images/iconos/flecha_down.png\" onClick=\"ordenar('$campo','ASC');\" class=\"flechas\" title=\"Sort by $campoInfo Descending\" />";
	
	$orden 	= setVar('orden');
	$ot		= setVar('ot'); 
	
	if($orden==$campo && $ot=='ASC') {
		$html = $flechaUp;
	}else{
		$html = $flechaDown;
	}
	
	return $html ;
}

	
if(!function_exists('setVar')) {
	
	function setVar($name,$default=false) {
		
		$$name = $default; 
		if(isset($_REQUEST["$name"])) $$name = $_REQUEST["$name"];
		
		if($$name)
		return $$name ;
	}
}
function setVarPost($name,$default=false) {
		
	$$name = $default; 
	if(isset($_POST["$name"])) $$name = $_REQUEST["$name"];
	
	return $$name ;
}
function setVarSession($name,$default=false) {
		
	$$name = $default; 
	if(isset($_SESSION["$name"])) $$name = $_SESSION["$name"];
	
	return $$name ;
}

/*
* formatea los mensajes Javascript para evitar problemas con los retornos de carro
*/
function msgJS($value)
{
	$value = addslashes($value) ;
	$value = trim( str_replace(array( "\r", "\n", "%0a", "%0d", "<br>","<br />"), "\n", $value) );
	
	#$ar = explode("\n",$value);	
	#$value = implode("<br>",$ar);
	
	$value = $value ;
	#$result = addslashes($value) ;	
	#$result = urlencode($value) ;
	
	return $value ;
}

/*
* formatea los mensajes HTML para evitar problemas con los retornos de carro
*/
function msgHTML($value)
{
	$value = trim( str_replace(array( "\r", "\n", "%0a", "%0d"), '<br>', $value) );
	
	return $value ;
}

function buid_select_options_from_array() {
	
	
	
}

/*
* formato de datos formularios
*/
function GetSQLValueString($theValue, $theType, $theDefinedValue = "", $theNotDefinedValue = "") 
{
  $theValue = (!get_magic_quotes_gpc()) ? addslashes($theValue) : $theValue;

  switch ($theType) {
    case "text":
      $theValue = ($theValue != "") ? "'" . $theValue . "'" : "NULL";
      break;    
    case "long":
    case "int":
      $theValue = ($theValue != "") ? intval($theValue) : "NULL";
      break;
    case "double":
      $theValue = ($theValue != "") ? "'" . doubleval($theValue) . "'" : "NULL";
      break;
    case "date":
      $theValue = ($theValue != "") ? "'" . $theValue . "'" : "NULL";
      break;
    case "defined":
      $theValue = ($theValue != "") ? $theDefinedValue : $theNotDefinedValue;
      break;
  }
  return $theValue;
}



/*
* Control de tiempo de generación de páginas
* Codigo a insertar al principio de la web
*/
function getTiempo()
{ 
	list($usec, $sec) = explode(" ",microtime()); 
	return ((float)$usec + (float)$sec); 
} 
$TiempoInicial = getTiempo(); 



/*********************
* Formateo de fechas
*********************/
function cambiaf_a_normal($fecha){
	$mifecha = explode('-',$fecha);
    $lafecha = $mifecha[2]."-".$mifecha[1]."-".$mifecha[0];
    return $lafecha;
}
function timestamp2fecha($fecha){
	  $ano  	= substr($fecha, 0, 4);
	  $mes 		= substr($fecha, 4, 2);
	  $dia   	= substr($fecha, 6, 2);
	  	// 2008-02-06 20:42:41
	  	$ano  	= substr($fecha, 0, 4);
	  	$mes 	= substr($fecha, 5, 2);
	 	$dia   	= substr($fecha, 8, 2);
	  return $dia . '-' .$mes . '-' .$ano ;
}
function timestamp2fechaHora($fecha,$seconds=false) {
	// 2008-02-06 20:42:41
	$ano  	= substr($fecha, 0, 4);
	$mes 	= substr($fecha, 5, 2);
	$dia   	= substr($fecha, 8, 2);
	$hora 	= substr($fecha, 11, 2);
	$min 	= substr($fecha, 14, 2);
	
	$date	= $dia . '-' .$mes . '-' .$ano . ' ' .$hora . ':' .$min ;
	
	if($seconds!==false) {
		$sec 	= substr($fecha, 17, 2);
		$date	.= ':'.$sec ;	
	}
		
	return $date;
}
function calendari2DB($fecha)
{
      // formato original  27/11/2007
	  $ano  = substr($fecha, 6, 4);
	  $mes 	= substr($fecha, 3, 2);
	  $dia  = substr($fecha, 0, 2);
	  // formato final  para DB  2007-07-18
	  return $ano . '-' .$mes . '-' .$dia ;
}
function DB2calendar($fecha)
{
      // formato original  DB  2007-07-18
	  $ano  = substr($fecha, 0, 4);
	  $mes 	= substr($fecha, 5, 2);
	  $dia	= substr($fecha, 8, 2);
	  // formato final  27/11/2007
	  if($ano && $mes && $dia) return $dia . '-' .$mes . '-' .$ano  ;
}





/*
* Búsquedas con operadores
*/
# limpiar rango de espacios en blanco, etc..
function limpiarRango($valor)
{
	$valor = trim($valor);
	$valor = str_replace('  ', '', $valor);
	$valor = str_replace(' ', '', $valor);
	$valor = str_replace('...', '..', $valor);
	$valor = str_replace(',,,', '..', $valor);
	$valor = str_replace(',,', '..', $valor);
	
	return $valor ;
}
# operadores en campo numérico ( > < .. ) v.1.1
function opNumSearch($campo, $valor)
{
	$valor 		= trim($valor);
	$sqlFilter 	= '';
	$i			= 0;
	
	# construimos el query en función de operador detectado	
	if( strstr($valor,'..') || strstr($valor,',,') ){
		$op = '..' ;
		$valorR = limpiarRango($valor);		# limpiamos $campo de espacios etc..	
		$esRango = strstr($valorR, $op) ;	# buscamos rango .. en el campo campo
		if($esRango){
			$partes = explode($op, $valorR);
			$rMin  = intval($partes [0]);
			$rMax = intval($partes [1]);
			$sqlFilter = " AND ($campo >= $rMin AND $campo <= $rMax) " ; 
		}
	}else if( strstr($valor,',') ){		
		$op = ',' ;
		$ar_partes = explode($op, $valor);
		if(is_array($ar_partes)) {
			$n = count($ar_partes);
			$sqlFilter .= " AND ";			
			foreach($ar_partes as $value) { 			
				$sqlFilter .= " $campo = '$value' " ;				
				$i++;
				if($i < $n)
				$sqlFilter .=  " OR ";				
			}
		}
	}else if( strstr($valor, '!=') ){
		$op = '!=' ;
		$partes = explode($op , $valor);
		$valor = intval($partes [1]);
		$sqlFilter = " AND $campo $op $valor " ;
	}else if( strstr($valor, '>=') ){
		$op = '>=' ;
		$partes = explode($op , $valor);
		$valor = intval($partes [1]);
		$sqlFilter = " AND $campo $op $valor " ;
	}else if( strstr($valor, '<=') ){
		$op = '<=' ;
		$partes = explode($op , $valor);
		$valor = intval($partes [1]);
		$sqlFilter = " AND $campo $op $valor " ;
	}else if( strstr($valor, '<') ){
		$op = '<' ;
		$partes = explode($op , $valor);
		$valor = intval($partes [1]);
		$sqlFilter = " AND $campo $op $valor " ;
	}else if( strstr($valor, '>') ){
		$op = '>' ;
		$partes = explode($op , $valor);
		$valor = intval($partes [1]);
		$sqlFilter = " AND $campo $op $valor " ;
	}else{
		$op = '=' ;
		$valorF = GetSQLValueString($valor, 'int');
		$sqlFilter = " AND $campo $op $valorF " ; 
	}
	#echo $sqlFilter ;
	return $sqlFilter ;
}

/*
* opTextSearch. Crea el codigo SQL para efectuar una busqueda literal o contiene de strings V1.0
* en función de que se escriba entre comillas o no 
* searcch:'casa' buscará sólo casa
* searcch: casa  busacará además de casa, casament, casanova, etc.... ---> v.1.0
*/
function opTextSearch($campo,$string,$boolean=1)
{	
	$sqlFilter = false ;


	# WARNING : FullTex is only supported by MySQL InnoDB >= 5.6
	# DEDALO4 FORCE LIKE INSTEAD FOR THE MOMENT
	if ($boolean==1) $boolean=2;

	
	if($boolean==1)
	{
		$sqlFilter = "AND MATCH($campo) AGAINST('$string' IN BOOLEAN MODE ) "; #die($sqlFilter );
		
	}else if($boolean==2)
	{
		$sqlFilter = " AND $campo LIKE  '".$string."' " ;		
	
	}else if($boolean==3)
	{
		$sqlFilter = " AND $campo = '$string' " ;		
	
	}else{
		
		$string		= stripslashes($string);
	
		$firstCh 	= $string[0];
		$lastCh	 	= $string[strlen($string)-1];
		
		if( ($firstCh=="'" && $lastCh= "'")  )
		{
			$string = substr($string,0,-1);
			$string = substr($string,1);
			
			$sqlFilter = " AND $campo RLIKE '[[:<:]]".$string."[[:>:]]' ";
			
			
		}else{
			
			$sqlFilter = " AND $campo LIKE  '%".$string."%'  " ;	
		}
	}
	
	return $sqlFilter ;
}









/*****************************
* Código de tiempo
*****************************/
define("TCIN", '[TC_' );
define("TCOUT", '_TC]' );

# Localiza y devuelve la marca TC más próxima al inicio o al final dependiendo del tipo recibido (in/out)
function returnTCS($text, $openingMarker, $closingMarker, $tipo)
{
    $openingMarkerLength	= strlen($openingMarker);
    $closingMarkerLength	= strlen($closingMarker);

    $result = array();
    $position = 0;
    while (($position = strpos($text, $openingMarker, $position)) !== false)
	{
    	$position += $openingMarkerLength;
		if (($closingMarkerPosition = strpos($text, $closingMarker, $position)) !== false)
		{
			$result[] = substr($text, $position, $closingMarkerPosition - $position);
			$position = $closingMarkerPosition + $closingMarkerLength;
		}
    }
	if($tipo=='in')		$tc = end($result); # el ultimo valor del texto pasado
	if($tipo=='out')	$tc = current($result); # el primer valor del texto pasado
	
	return $tc ;
};

# Devuelve la suma de horas, minutos  segundos. Para verificar que no es 0
function valorTC($tc)
{
	die("valorTC Deprecated. Use class Optimize instead!");
	$tcTrozos = array(); 
	$tcTrozos = explode(':', $tc);
	
		$horas = 0 ;
		$minutos = 0 ;
		$segundos = 0 ;
		
		if(isset($tcTrozos[2]))	$segundos 	= $tcTrozos[2];
		if(isset($tcTrozos[1]))	$minutos 	= $tcTrozos[1];
		if(isset($tcTrozos[0]))	$horas 		= $tcTrozos[0];
		
		$valor = 0 ;
		if($horas) 		$valor += $horas ;
		if($minutos) 	$valor += $minutos ;
		if($segundos) 	$valor += $segundos ;		
	
	return intval($valor) ;
}

// extraer fragmento de entrevista o indice ////////////////////////////////////////////////////////
function extraerFragmento($in,$out,$texto,$tc=0) {
	
	/////////////// CORTAR HACIA ADELANTE //////////////
	$string1	= $texto ;
	$etiqueta	= $in ;
	//find length of the etiqueta
	$etiqueta_len = strlen($etiqueta);
	//find postion
	$position_num = strpos($string1,$etiqueta) + $etiqueta_len;
	//cut the string from position_num
	$result_string = substr("$string1",$position_num); // seleccionamos todo el texto a partir de la posicion de la etiqueta in (+ los caracteres de la etiqueta), en adelante
	
	
	if($tc==1){
		// seleccionamos el texto desde inicio hasta la marca de entrada
		$text = substr($texto,0,strpos($texto,$in));
		// localizamos el tc mas cerca del final 
		$tcentrada = returnTCS($text, TCIN , TCOUT, 'in');	 #$_SESSION['tcentrada']	= $tcentrada ;
		
		// seleccionamos el texto desde la marca de salida hasta el final
		$text = substr($texto,strpos($texto,$out));
		$tcsalida = returnTCS($text, TCIN , TCOUT, 'out');	 #$_SESSION['tcsalida']	= $tcsalida ;
	}
	

	/////////////// CORTAR HACIA ATRAS ////////////////
	$string1	= $result_string ;
	$etiqueta	= $out  ;
	//find length of the etiqueta
	$etiqueta_len = strlen($etiqueta);
	//find postion
	$position_num = strpos($string1,$etiqueta);
	//cut the string from position_num
	$result_string = substr("$string1",0,$position_num); // seleccionamos todo el texto (ya cortado) desde 0 hasta el comienzo de la etiqueta out
	

	#SHORTER VERSION:
	#$result_string = substr("$string1",0,strpos($string1,$etiqueta)+strlen($etiqueta));
	
	return $fragmento = $result_string ;	
	// desactivo de momento
	#return $fragmento = $tcentrada .' '. $result_string . ' ' . $salida ;
};

// cambiar las marcas por lo que sea (o eliminar las marcas) usado en ind_nou_fragmento
function cMarcas($texto,$in,$out)
{
	// Eliminar posibles etiquetas index
	$textoRin 	= preg_replace('/\[index_......./', $in, $texto);
	$textoRout 	= preg_replace('/\[out_index_..../', $out, $textoRin);
	
	// ELIMINAR <h5> en el texto plano mostrado
	$textoRout2 = str_replace(htmlentities('<h5>'), '', $textoRout);
	$textoRout 	= str_replace(htmlentities('</h5>'), '', $textoRout2);	
	
	// Eliminar posibles etiquetas tc
	$textoRout = preg_replace('/\[TC_........_TC]/', '', $textoRout);
	//$textoRout = str_replace('<p>&nbsp;</p>',' ', $textoRout); 
	
	return  $textoRout ;
}



/**********************************
 REMARCADO DE TEXTO INICIO 
**********************************/
define("SPAN_IN", '<div class="hilite">'); 		#echo ' SPAN_IN: '.htmlspecialchars(SPAN_IN) ;
define("SPAN_OUT", '</div>' ); 					#echo ' SPAN_OUT: '.SPAN_OUT ;
define("H_IN", '<h5>' );				 		#echo ' H_IN: '.H_IN ;
define("H_OUT", '</h5>' );  					#echo ' H_OUT: '. H_OUT ;				  

# hilite text between index tags
function hiliteIndexText($content)
{														  
	die("DEACTIVATED FUNCTION funciones: hiliteIndexText . USE TR::addTagImgOnTheFly($string) ");
	
	$content = str_replace( 'in]'.H_OUT, 'in]'.H_OUT.SPAN_IN,   $content);	// in]</h5>   --->   in]</h5><span class="hilite">
	$content = str_replace( H_IN.'[out' , SPAN_OUT.H_IN.'[out', $content);	// <h5>[out  --->  	</span><h5>[out													  
	
	return $content ;	
}

/*
* al indexar, eliminamos los estilos añadidos para visualizar las marcas +++	
*/
function limpiezaPOSTindexStyles($content)
{	
	die("DEACTIVATED FUNCTION funciones: limpiezaPOSTindexStyles. USE TR::limpiezaPOSTtr($string)  ");	
	/* FUNCION ANULADA... INNECESARIA...
	
	#$sin = addslashes(SPAN_IN); // se guardaron en DB con addslashes
	#$sout = addslashes(SPAN_OUT); // se guardaron en DB con addslashes
	
	$sin 	= SPAN_IN ;
	$sout 	= SPAN_OUT;	
	
	$content = str_replace( $sin , '', $content);
	$content = str_replace( $sout , '', $content);
	$content = str_replace('<p>&nbsp;</p>', '', $content);
	$content = str_replace('<p> </p>', '', $content);
	$content = str_replace('  ', ' ', $content);
	$content = trim($content);
		
	return $content;
	*/
}


// REMARCADO DE TEXTO FIN /////////////////////////////////////////////////////////////////////////////////////////////////









/*
* Funciones diversas útiles
*/

# Convierte retornos de línea en el tag <br>
function nl2br2($string)
{
	$string = str_replace(array("\r\n", "\r", "\n"), "<br>", $string);
	#$string = str_replace(array("\r\n", "\r", "\n"), "<br />", $string);
	return $string;
}

# Convierte a texto el estado de la copia dvd captación
function copiaDVD2text($valor)
{
	global $realizada_title, $entregada_title ;
	switch($valor){		
		case 1 : $valor = $realizada_title ; break ;
		case 2 : $valor = $entregada_title ; break ;
	}
	return $valor ;
}

# Convierte a texto de difundible de la captación
function difundible2text($valor)
{
	global $si_title, $no_title, $restringido_title, $no_definido_title ;
	switch($valor){
		case 'si' 			: $result = $si_title ; 			break ;
		case 'no' 			: $result = $no_title ; 			break ;
		case 'restringit' 	: $result = $restringido_title ;	break ;
		default 			: $result = $no_definido_title ;
	}
	return $result ;
}


# Convierte a texto el estado del master (cinta)
function estadoMaster2text($valor)
{
	global $normal_title, $solo_camara_title, $sonido_mal_title, $video_mal_title, $inutilizable_title ;
	switch($valor){
		case 0 : $valor = $normal_title ; break ;
		case 1 : $valor = $solo_camara_title ; break ;
		case 2 : $valor = $sonido_mal_title ; break ;
		case 3 : $valor = $video_mal_title ; break ;
		case 4 : $valor = $inutilizable_title ; break ;
	}
	return $valor ;
}

# Convierte a texto el estado del ámbito del proyecto
function ambito2text($valor)
{
	global $pci_ambito_1_title,$pci_ambito_2_title,$pci_ambito_3_title,$pci_ambito_4_title,$pci_ambito_5_title ;
	switch($valor){
		case 1 : $valor = $pci_ambito_1_title  ; break ;
		case 2 : $valor = $pci_ambito_2_title ; break ;
		case 3 : $valor = $pci_ambito_3_title ; break ;
		case 4 : $valor = $pci_ambito_4_title ; break ;
		case 5 : $valor = $pci_ambito_5_title ; break ;
		#default : "0";
	}
	return $valor ;
}

# Convierte a todos los idiomas los distintos tipos de ubicaiones (municipio, comarca, provincia, comunidad, pais)
function mn2Text($valor)
{
	global $pais_title, $comunidad_title, $provincia_title, $comarca_title, $municipio_title ;
	switch($valor){
		case 'pais' 	: 	$valor = $pais_title  ; 	break ;
		case 'comunidad': 	$valor = $comunidad_title ; break ;
		case 'provincia': 	$valor = $provincia_title ; break ;
		case 'comarca' 	: 	$valor = $comarca_title ; 	break ;
		case 'municipio': 	$valor = $municipio_title ; break ;
	}
	return $valor ;
}

# Cambia a texto la comprobación de si un término del termino es descriptor o no
function esdescriptor2text($esdescriptor)
{
	global $no_descriptor_title,$descriptor_title, $no_definido_title ;
	switch($esdescriptor){
		case 'no' 	: $esdescriptor = strtoupper($no_descriptor_title);	break ;
		case 'si' 	: $esdescriptor = strtoupper($descriptor_title);	break ;
		default 	: $esdescriptor = $no_definido_title ;
	}
	return $esdescriptor ;
}

# Cambia a texto la comprobación de si un término del termino es descriptor o no
function esidentificador2text($esidentificador)
{
	global $no_title, $si_title, $no_definido_title ;
	switch($esidentificador){
		case 'no' 	: $esidentificador = strtoupper($no_title); 			break ;
		case 'si'   : $esidentificador = strtoupper($si_title);	break ;
		default 	: $esidentificador = $no_definido_title ;
	}
	return $esidentificador ;
}

# Cambia a texto la comprobación de si un término del termino es descriptor o no
function usableIndex2text($usableIndex)
{
	global $no_title, $si_title, $no_definido_title ;
	switch($usableIndex){
		case 'no' 	: $usableIndex = strtoupper($no_title);	break ;
		case 'si' 	: $usableIndex = strtoupper($si_title); break ;
		default		: $usableIndex = $no_definido_title ;
	}
	return $usableIndex ;
}

# Convierte a texto la serie de la entrevista. OPSOLETO !! sólo para datos antíguos
function serie2text($valor)
{
	global $no_definido_title, $investigaciones_title, $exposiciones_title, $donaciones_title ;
	switch($valor){
		case 0 : $valor = $no_definido_title ; break ;
		case 1 : $valor = $investigaciones_title ; break ;
		case 2 : $valor = $exposiciones_title; break ;
		case 3 : $valor = $donaciones_title; break ;
		default : $valor = $no_definido_title ; break ;
	}
	return $valor ;
}

# Convierte a texto el nivel del usuario.
function nivel2text($valor) {
	
	global $usuario_title, $administrador_title ;
	switch($valor){		
		case 8 	: $valor = $usuario_title  		; break ;
		case 9 	: $valor = $administrador_title ; break ;
		case 10 : $valor = $programador_title 	; break ;
		default	: $valor = '';
	}
	
	return $valor ;
}



function tipoSearch2text($tipo){
	global $exacto_title, $contiene_title ;
	switch($tipo){
		case 1 ; $tipo = $exacto_title ; break ;
		case 2 ; $tipo = $contiene_title ; break ;
	}
	return $tipo ;
}

function sexo2text($sexo){
	global $hombre_title, $mujer_title ;
	switch($sexo){
		case 'h' ; $sexo = $hombre_title ; break ;
		case 'd' ; $sexo = $mujer_title ; break ;
	}
	return $sexo ;
}

// DESPEJAR  A PARTIR DE ID OUT /////////////////////////////////////////////////////////////////////////////////////////





/*
* crear desplegable básico
*/
function crearDesplegableBasico($tabla, $campo, $campoValor, $valorGet, $filtro='', $char='150', $width='98%',$sinOpcion0='no', $nombre_select=false) {

	global  $sin_seleccion_title ;
	$select 	= '';
	$html 		= '';

	# SQL
	if($campoValor != '') 		$select = ", $campoValor ";
	if($campo == 'captacionID') $select = ", codigo ";

	$sql 		= "
					SELECT SQL_CACHE $campo $select
					FROM $tabla
					WHERE $campo IS NOT NULL
					$filtro
					GROUP BY $campo 
					ORDER BY $campo ASC
					";
	$result 	= DBi::_getConnection()->query($sql);
		#dump($result,'$result');

	# No results
	if($result->num_rows<1)	return(false);

	
	# Select html
	if($tabla=='municipios') {
		$html .= "<select name=\"municipio\" id=\"municipio\" style=\"color:#333333;width:$width;\" > " ;
	}else if($nombre_select !== false){
		$html .= "<select name=\"$nombre_select\" id=\"$nombre_select\" style=\"color:#333333;width:$width;\" > " ;
	}else{
		$html .= "<select name=\"$campo\" id=\"$campo\" style=\"color:#333333;width:$width;\" > " ;
	}
	
	if($sinOpcion0=='no') {
		$html .= "<option value=\"\" ";
			if (!(strcmp("", $valorGet))) $html .= "selected=\"selected\" ";
		$html .= "> </option>";
	}


		# Create array objs with all records founded
		if(($result->num_rows)>0) while ($rows = $result->fetch_array(MYSQLI_ASSOC) ) {
			
			$campo2 = $rows[$campo];
				if($campo=='captacionID') $campo2 = intval($campo2);
			$campoValor2 = $rows[$campoValor];
				if($campoValor=='') $campoValor2 = $campo2 ;
			$html .= "<option value=\"". addslashes($campoValor2)."\" ";
				if (!(strcmp($valorGet, $campoValor2))) $html .= "selected=\"selected\" ";
			$html .= ">";
			
			$opcion = substr($campo2, 0, $char) ;
			if($campo == 'captacionID') $opcion = " $campo2 -  [ $rows[codigo] ] " ;
			
			$html .= $opcion ;
			
			$html .= "</option>";
		}

		# Free result set
		#$result->close();


	$html .= "</select>";
	
	return $html ;


	/*
	require('../Connections/config.php');
	global  $sin_seleccion_title ;
	
	$select = " " ;
	$html = false ;
	
	if($campoValor != '') $select = ", $campoValor ";
	if($campo == 'captacionID') $select = ", codigo ";
	
	$query_RS 		= "SELECT SQL_CACHE $campo $select FROM $tabla WHERE $campo IS NOT NULL $filtro GROUP BY $campo ORDER BY $campo ASC " ; #echo $query_RS ;
	$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(__FUNCTION__ .mysql_error());
	$row_RS 		= mysql_fetch_assoc($RS);
	$totalRows_RS 	= mysql_num_rows($RS);
	
	if($tabla=='municipios') {
		$html .= "<select name=\"municipio\" id=\"municipio\" style=\"color:#333333;width:$width;\" > " ;
	}else if($nombre_select !== false){
		$html .= "<select name=\"$nombre_select\" id=\"$nombre_select\" style=\"color:#333333;width:$width;\" > " ;
	}else{
		$html .= "<select name=\"$campo\" id=\"$campo\" style=\"color:#333333;width:$width;\" > " ;
	}
	
	if($sinOpcion0=='no') {
		$html .= "<option value=\"\" ";
			if (!(strcmp("", $valorGet))) $html .= "selected=\"selected\" ";
		$html .= "> </option>";
	}
	
	if($totalRows_RS>0) do {
		
		$campo2 = $row_RS[$campo]; 				if($campo=='captacionID') $campo2 = intval($campo2);
		$campoValor2 = $row_RS[$campoValor];	if($campoValor=='') $campoValor2 = $campo2 ;
		$html .= "<option value=\"". addslashes($campoValor2)."\" ";
			if (!(strcmp($valorGet, $campoValor2))) $html .= "selected=\"selected\" ";
		$html .= ">";
		
		$opcion = substr($campo2, 0, $char) ;
		if($campo == 'captacionID') $opcion = " $campo2 -  [ $row_RS[codigo] ] " ;
		
		$html .= $opcion ;
		
		$html .= "</option>";
		
	} while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);	
	
    $html .= "</select>";
	
	return $html ;
	*/
}




/*
* crear desplegable de sugerencia con valores unicos: crearDesplegable
*/
function crearDesplegable($campo, $tabla, $row_Recordset1, $filtro='', $char='90', $width='110px') {

	global  $sin_seleccion_title ;
	
	$html = '';
	
	$query_RS 		= "SELECT SQL_CACHE DISTINCT $campo FROM $tabla WHERE $campo != '' $filtro ORDER BY $campo ASC" ;
	$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(__FUNCTION__ .mysql_error());
	$row_RS 		= mysql_fetch_assoc($RS);
	$totalRows_RS 	= mysql_num_rows($RS);
	$campoID 		= $campo ;
	
	$html .= "<select name=\"$campo.1\" id=\"$campo.1\" style=\"color:#333333;width:$width;\" onchange=\"javascript:pasarValor('$campoID', this.value);\" > " ;
	$html .= "<option value=\"\" ";
	
	if (!(strcmp("", $row_Recordset1)))	$html .= "selected=\"selected\" ";
	
	$html .= "> </option>";
	
	if($totalRows_RS>0) do { 
	 	
		$campoD = $row_RS[$campo];
		
		$html .= "<option value=\"$campoD\" ";		
		if (!(strcmp($row_Recordset1, $campoD))) $html .= "selected=\"selected\" ";
		$html .= ">"; 
		$html .= $campoD ;
		$html .= "</option>";
		
	} while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
  	
    $html .= "</select>";
	
	if($filtro=='') $html .= "<input name=\"$campoID\" type=\"text\" id=\"$campoID\" style=\"width:$width;\" value=\"$row_Recordset1\"> ";	
	
	return $html;
}


function cortarPalabra($texto,$largo=20) {
	// insertar espacios en palabras largas
	#if(!$largo) $largo = 20 ;
	$mitexto=explode(" ",trim($texto));
	$textonuevo=array();
	foreach($mitexto as $k=>$txt) {
		if (strlen($txt)>$largo) {
			$txt=wordwrap($txt, $largo, " ", 1);
		}
	$textonuevo[]=$txt;
	}
	return implode(" ",$textonuevo);
}


// Cortar un texto sin cortar palabras a mitad
function cortarTexto($texto, $tamano=50) {
	die("Deprecated function. Use myTruncate2 instead");
	$final 	= false ;
	$texto 	= trim($texto);
	$tamano	= intval($tamano);
	
	
	// Inicializamos las variables
	$textoO = $texto;
	#if(!$tamano) $tamano = 50; // tamaño máximo
	
	
	// Si el numero de carateres del texto es menor que el tamaño maximo,
    // el tamaño maximo pasa a ser el del texto
    if (strlen($texto) < $tamano) $tamano = strlen($texto);
 	$textoFinal = '';
    for ($i=0; $i <= $tamano - 1; $i++) {
        // Añadimos uno por uno cada caracter del texto
        // original al texto final, habiendo puesto
        // como limite la variable $tamano
        $textoFinal .= $texto[$i];
    }
	
	/*
	if(strpos($texto,' '))
	{		
		# Cortamos la cadena por los espacios
		$arrayTexto = explode(' ',$texto);
		$contador = 0;
		$texto = '';
		
		# Reconstruimos la cadena
		if(is_array($arrayTexto))
		{
			while(intval($tamano) >= (strlen($texto) + strlen($arrayTexto[$contador]))  ){
						
				$texto .= ' '. $arrayTexto[$contador];
				$contador++;
			}
		}
	}
	*/
	
	if (strlen($textoO) > strlen($textoFinal)) {
		$final = trim($textoFinal).' ..' ;
	}else{
		$final = trim($texto) ;
	}
	
	return $final ;
}

# TRUNCATE
function  myTruncate2($string, $limit, $break=" ", $pad="...") {

  # return with no change if string is shorter than $limit
  if(strlen($string) <= $limit) return $string;

  $string = substr($string, 0, $limit);
  if(false !== ($breakpoint = strrpos($string, $break))) {
	$string = substr($string, 0, $breakpoint);
  }

  return $string . $pad;
}

/*
* Crea los enlaces:  Completo | Simple | Ver todas
*/
function linksListadoT()
{
	$html = false ;
	
	$queryString = $_SERVER['QUERY_STRING']; 
	$urlBase = '?'.eliminarOT($queryString);
		
	global $completo_title ;
	global $simple_title ;
	
	$html .= "<a href=\"$urlBase";
	$html .= "&listadoT=completo\" >$completo_title</a>";
	$html .= " | ";
	$html .= "<a href=\"$urlBase";
	$html .= "&listadoT=simple\" >$simple_title</a>";
	
	return $html ; 
}

/**
* eliminar ot y orden del query
*/
function eliminarOT() {
	
	#echo $queryString."<br>";
	$qs = false ;
	
	$queryString = $_SERVER['QUERY_STRING']; # like max=10
	
	$search  = array('&&',	'&=',	'=&',	'??',	);
	$replace = array('&',	'&',	'&',	'?',	);
	$queryString = str_replace($search, $replace, $queryString);
	
	$posAND 	= strpos($queryString, '&');
	$posEQUAL 	= strpos($queryString, '=');
	
	if($posAND !== false){ # query tipo ?captacionID=1&informantID=6&list=0
		
		$ar_pares = explode('&', $queryString);		
		if(is_array($ar_pares)) foreach ($ar_pares as $par){
			
			#echo " $key - $value <br>";			
			$troz		= @ explode('=',$par) ;
			if($troz)
			{
				$varName	= NULL;
				if (isset($troz[0])) {
					$varName = $troz[0];
				}
				
				$varValue 	= NULL;
				if (isset($troz[1])) {
					$varValue= $troz[1];
				}
				
				if($varName !='orden' &&  $varName !='ordenGET' && $varName !='ot' && $varName !='listadoT' && $varName !='accion' && $varName !='lang'){
					$qs .= $varName . '=' . $varValue .'&';
				}
			}
		}
		#echo "1".$qs ;
	}else if($posAND === false && $posEQUAL !== false) { # query tipo ?captacionID=1
	
		$qs = $queryString ;
		#echo "2".$qs ;							
	}
	
	$qs = str_replace($search, $replace, $qs);
	
	# if last char is & delete it
	if(substr($qs, -1)=='&') $qs = substr($qs, 0, -1);
	
	#echo "eliminarOT: ".$qs ; #die();
	return $qs ;
}
/**
* We exec allways elimanrOT for disponibility in javascript function ordenar ()javasc
* execute eliminarOT()
*$eliminarOT = eliminarOT();
*/

# eliminar ot y orden del query de paginacion public
function eliminarOT_2($queryString) {
	
		#$queryString = $_SERVER['QUERY_STRING'];
		#$piezas =array();
		$qs = '';
		
		$piezas = explode('&', $queryString);
		if(is_array($piezas)) foreach ($piezas as $key => $value) {
			
			$troz	= explode('=',$value) ;
			if(is_array($troz) && isset($troz[0]) && isset($troz[1]) ) {
				
				$trozE 	= $troz[0] ;
				if ($trozE !='page' &&  $trozE !='ordenGET' && $trozE !='ot' && $trozE !='key'){
					$qs .= $troz[0] . '=' . $troz[1].'&';
				}
			}
		}
		return substr($qs,0,-1) ;
}


// eliminar top del query
function eliminarTop($queryString)
{
	#$queryString = $_SERVER['QUERY_STRING'];
	$piezas =array();
	$piezas = explode('&', $queryString);
	foreach ($piezas as $key => $value) {
		$troz	= explode('=',$value) ;
		$trozE 	= $troz[0] ;
		if ($trozE!='top'){
			$qs .= $troz[0] . '=' . $troz[1].'&';
		}
	}
	return $qs ;
}


// crear desplegable valores unicos
function listadoUnicos($t, $campo, $valor='',$width='100px') 
{	
	$query_RS 		= "SELECT SQL_CACHE DISTINCT $campo FROM $t ORDER BY $campo ASC";
	$RS 			= mysql_query($query_RS, DB::_getConnection()) or die(__FUNCTION__ .mysql_error());
	$row_RS 		= mysql_fetch_assoc($RS);
	$totalRows_RS 	= mysql_num_rows($RS);
	
	echo "<select name=\"$campo\" id=\"$campo\" class=\"selectFunction\" style=\"width:$width\" >";
	echo '<option value="" ';	
	if (!(strcmp("", $valor))) echo "selected=\"selected\" ></option>" ;
	
	do { 	
	echo '<option value="'.$row_RS[$campo].'" ' ;
	if (!(strcmp($valor, $row_RS[$campo]))) echo "selected=\"selected\" " ;	
	echo '>';
	echo $row_RS[$campo] ;
		#if($_SESSION['auth']['userID']==1) echo ' ['.$id.'] ' ;
		#if(NIVEL==10 && $resolveHost==1 && $campo=='ip'){ $ip= $row_RS[$campo] ;echo ' ['. @ gethostbyaddr($row_RS['ip']) .'] '; } ;
	echo '</option>';
	} while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
	
	 echo '</select>'; 
	 #echo $valor;	
}


// registrar acción	
function registrarAccion($userID, $accion, $detalle, $donde='', $ip='0') {

	#throw new Exception("Error Processing Request : registrarAccion", 1);
	trigger_error("registrarAccion is obsolete... Change this  ASAP");
	
	return null;
	
	
	require_once('../log/class.RecordObj_log.php');
	
	# log action obj	
	$RecordObj_log 	= new RecordObj_log();
	$RecordObj_log->set_userID($userID);
	$RecordObj_log->set_accion($accion);
	$RecordObj_log->set_tabla($donde);
	$RecordObj_log->set_detalle($detalle);
	$RecordObj_log->Save();
	
	/*
	# desglosamos el array del post "detalle"
	if( is_array($detalle) ){
		foreach( $detalle as $key => $value ) {
	   		$detalle2 .= "$key : $value <br>\n";
		}
	} else {
		$detalle2 = $detalle ;
	};
	//$detalle2 = addslashes($detalle2);
	$ip			= $_SERVER['REMOTE_ADDR'];
	$timestamp 	= date("Y-m-d H:i:s",time()); # formt 2008-09-26 14:35:07
	#$con1 		= @ include('../Connections/config.php'); 
	#if(!$con1)	@ require('../Connections/config.php'); 
	$insertSQL 	= "INSERT INTO act (userID, accion, detalle, donde, ip, fecha) VALUES ('$userID', '$accion', '$detalle2', '$donde', '$ip', '$timestamp')";  	
	$Result = mysql_query($insertSQL, DB::_getConnection()) or die("registrarAccion<hr>".mysql_error());
	
	return $reel = 'ok' ;
	*/
}

// Solo para php4
if (!function_exists("stripos")) {
  function stripos($str,$needle,$offset=0)
  {
      return strpos(strtolower($str),strtolower($needle),$offset);
  }
}


// 2 funciones para devolver fragmento de texto entre marcas ////////////////

  

# Here's a function i've created to return an array of each substring searched in a string. 
# Devuelve el fragmento de texto entre 2 marcas 
# Example Return_Substrings:
# $string = "<b>bonjour</b> à tous, <b>comment</b> allez-vous ?";
# $result = Return_Substrings($string, "<b>", "</b>") ;
function Return_Substrings($text, $sopener, $scloser)
{
	die("INACTIVE !!");	
	$result = array();
	
	$noresult = substr_count($text, $sopener);
	$ncresult = substr_count($text, $scloser);
	
	if ($noresult < $ncresult)
		  $nresult = $noresult;
	else
		  $nresult = $ncresult;
	
	unset($noresult);
	unset($ncresult);
	
	for ($i=0;$i<$nresult;$i++)
	{
	  $pos = strpos($text, $sopener) + strlen($sopener);

	  $text = substr($text, $pos, strlen($text));

	  $pos = strpos($text, $scloser);
	 
	  $result[] = substr($text, 0, $pos);

	  $text = substr($text, $pos + strlen($scloser), strlen($text));
	}
		 
	return $result;
}				



# Detectar la verión de GD incorporada
function getVersionGD()
{
	$gd = array();
	$GDfuncList = get_extension_funcs('gd');
	ob_start();
	@phpinfo(INFO_MODULES);
	$output=ob_get_contents();
	ob_end_clean();
	$matches[1]='';
	if (preg_match("/GD Version[ \t]*(<[^>]+>[ \t]*)+([^<>]+)/s",$output,$matches)) {
		$gdversion = $matches[2];
	}
	if ($GDfuncList) {
	 if (in_array('imagegd2', $GDfuncList)) {
		$gd['gd2'] = $gdversion;
	 } else {
		$gd['gd1'] = $gdversion;
	 }
	}	
	return $gd;
}


#
# Fija los márgenes del video. Streaming
#
function tcMargen($tc,$tipo,$margen=2) {
	die("tcMargen Deprecated. Use class Optimize instead!");
	$tcTrozos	= explode(':', $tc);
	$segundos	= $tcTrozos[2];
	$minutos 	= $tcTrozos[1];
	$horas		= $tcTrozos[0];
	if($tipo=='tcin'){
		if($segundos >= $margen){
		  $segundos = $segundos  - $margen ;
		}else{
		  $minutos	= $minutos -1 ;
		  $segundos = 59 ;
		}
	}
	if($tipo=='tcout'){
	  if($segundos <= 55){
		$segundos = $segundos  + $margen ;
	  }else{
		$minutos ++ ;
		$segundos = '00' ;
	  }
	}
	
	$tc	= "$horas:$minutos:$segundos";
	
	return  $tc	;
}



// ------- remove array item by value with fast for loop
function removeElementFromArrayByValue($ar,$item2removeValue) {	
	
	$ar_result = array();
	
	$n = count($ar);
	for($i=0; $i < $n; $i++)
	{
		if( $ar[$i] != $item2removeValue )	$ar_result[] = $ar[$i];
	}
	return $ar_result ;
}


function verify_access_area($area_name) {
	return true;
	/*
	try{
		# verify only for non admin
		if($_SESSION['auth']['nivel']<9) {
			
			$value	= $_SESSION['auth']["acceso_area_{$area_name}"];	
			if($value!='si') {
				global $no_tiene_acceso_a_esta_zona_title;
				$html = " Sorry, area not allowed for you ! <br> $no_tiene_acceso_a_esta_zona_title <hr> <a href=\"../\"> Dédalo Home </a>  "  ;
				exit($html);
			}
		}
	}catch(Exception $e) { 
		echo $e->getMessage();
	};
	*/
}

/* strposall				
*  Find all occurrences of a needle in a haystack
*  @param string $haystack
*  @param string $needle
*  @return array or false */
function strposall($haystack,$needle) {  
 
	  $s=0;
	  $i=0;	 
	  while (is_integer($i)){		 
		  $i = strpos($haystack,$needle,$s);		 
		  if (is_integer($i)) {
			  $aStrPos[] = $i;
			  $s = $i+strlen($needle);
		  }
	  }
	  if (isset($aStrPos)) {
		  return $aStrPos;
	  }
	  else {
		  return false;
	  }
};

function random_color() {
	
    mt_srand((double)microtime()*1000000);
    $c = '';
    while(strlen($c)<6){
        $c .= sprintf("%02X", mt_rand(0, 255));
    }
	if($c=='FFFFFF') {
		random_color(); 
		return;
	}
    return $c;
}


/* usage
    sortDataSet(data set, column1[, mixed arg [, mixed ... [, array ...]]])
*/
/* arguments
    the first argument is the multidimensional array
    subsequent arguments follow the argument order of array_multisort(),
    except that you do not pass arrays to the function but keys (string!) of the columns
*/
/* note
    read the documentation of array_multisort() for more information
*/
function sortDataSet(&$dataSet) {
	
    if(!is_array($dataSet) || count($dataSet)==0) return false;
	
	$args = func_get_args();
    $callString = 'array_multisort(';
    $usedColumns = array();
    for($i = 1, $count = count($args); $i < $count; ++$i) {
        switch(gettype($args[$i])) {
            case 'string':
                $callString .= '$dataSet[\''.$args[$i].'\'], ';
                array_push($usedColumns, $args[$i]);
                break;
            case 'integer':
                $callString .= $args[$i].', ';
                break;
            default:
                throw new Exception('expected string or integer, given '.gettype($args[$i]));
        }
    }
    foreach($dataSet as $column => $array) {
        if(in_array($column, $usedColumns)) continue;
        $callString .= '$dataSet[\''.$column.'\'], ';
    }
    eval(substr($callString, 0, -2).');');
} 

function remove_element($arr, $val) {
	
	foreach ($arr as $key => $value){
	  if ($arr[$key] == $val){
		  unset($arr[$key]);
	  }
	}
	return $arr = array_values($arr);
}

?>