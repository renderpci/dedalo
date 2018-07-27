<?php
define('WEB_LANG_BASE_PATH', __DIR__);
include(dirname(dirname(dirname(__FILE__))) . '/common/class.lang.php');
/*
function tstring( $var ) {
	return isset(Titles::$$var) ? Titles::$$var : "<i>$var</i>";		
}
# spa (spanish)
class Titles {
	
	static $inicio = 'Inicio';
	static $mas = 'Más';
	static $load_more = 'Cargar más';
	static $idioma = 'Idioma';
	static $documentos = 'Documentos';
	static $testimonio = 'Testimonio';
	static $transcripcion = 'Transcripción';
	static $video = 'Vídeo';
	static $ver_video = 'Ver vídeo';
	static $resumen = 'Resumen';
	static $busqueda_libre = 'Búsqueda libre';
	static $busqueda_tematica = 'Búsqueda temática';
	static $buscar = 'Buscar';
	static $anterior = 'Anterior';
	static $siguiente = 'Siguiente';
	static $abstract = 'Resumen';
	static $reset = 'reset';
	static $fragmento = 'Fragmento';
	static $completa = 'Completa';
	static $rostros = 'Protagonistas';
	static $temas = 'Temas';
	static $busqueda_libre_texto = '<span style="color: #333333;"><span style="color: #333333;"><span style="font-size: 11pt;">La búsqueda se puede realizar con operadores:</span><br /><br /></span></span>
									<table style="height: 132px; width: 970px;">
									<tbody>
									<tr>
									<td style="width: 110px;">Contiene :</td>
									<td style="width: 900px;"><strong>Francisco Franco</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(se busca "Francisco" y se busca "Franco" por separado, puede aparecer "Francisco Domingo Guasc", "piso franco", etc)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Literal :</td>
									<td style="width: 900px;"><strong>"Francisco Franco"</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"></td>
									<td style="width: 900px;">(se busca la coincidencia completa y sólo aparece cuando la coincidencia de las dos palabras concuerda en el orden introducido)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Empieza por:</td>
									<td style="width: 900px;"><strong>Franci*</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"></td>
									<td style="width: 900px;">(Encuentra "Francia", Francisco", "Francisca", etc).</td>
									</tr>
									<tr>
									<td style="width: 110px;">Excluir :</td>
									<td style="width: 900px;"><strong>Francisco -Domingo</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(Elimina la coincidencia de “Francisco” con "Domingo" del resultado de la búsqueda)</td>
									</tr>
									</tbody>
									</table>';
}
echo addslashes('<span style="color: #333333;"><span style="color: #333333;"><span style="font-size: 11pt;">La búsqueda se puede realizar con operadores:</span><br /><br /></span></span>
									<table style="height: 132px; width: 970px;">
									<tbody>
									<tr>
									<td style="width: 110px;">Contiene :</td>
									<td style="width: 900px;"><strong>Francisco Franco</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(se busca "Francisco" y se busca "Franco" por separado, puede aparecer "Francisco Domingo Guasc", "piso franco", etc)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Literal :</td>
									<td style="width: 900px;"><strong>"Francisco Franco"</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"></td>
									<td style="width: 900px;">(se busca la coincidencia completa y sólo aparece cuando la coincidencia de las dos palabras concuerda en el orden introducido)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Empieza por:</td>
									<td style="width: 900px;"><strong>Franci*</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"></td>
									<td style="width: 900px;">(Encuentra "Francia", Francisco", "Francisca", etc).</td>
									</tr>
									<tr>
									<td style="width: 110px;">Excluir :</td>
									<td style="width: 900px;"><strong>Francisco -Domingo</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(Elimina la coincidencia de “Francisco” con "Domingo" del resultado de la búsqueda)</td>
									</tr>
									</tbody>
									</table>')
*/
?>