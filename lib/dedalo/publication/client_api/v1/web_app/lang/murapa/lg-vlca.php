<?php
define('WEB_LANG_BASE_PATH', __DIR__);
include(dirname(dirname(dirname(__FILE__))) . '/common/class.lang.php');
/*
function tstring( $var ) {
	return isset(Titles::$$var) ? Titles::$$var : "<i>$var</i>";		
}

# spa (spanish)
class Titles {
		
	static $inicio = 'Inici';
	static $mas = 'Mès';
	static $load_more = 'Load more';
	static $idioma = 'Lang';
	static $documentos = 'Documents';
	static $testimonio = 'Testimony';
	static $transcripcion = 'Transcripció';
	static $video = 'Vídeo';
	static $ver_video = 'Veure vídeo';
	static $resumen = 'Resum';
	static $busqueda_libre = 'Cerca lliure';
	static $busqueda_tematica = 'Cerca temàtica';
	static $buscar = 'Cercar';
	static $anterior = 'Anterior';
	static $siguiente = 'Següent';
	static $abstract = 'Resum';
	static $reset = 'reset';
	static $fragmento = 'Fragment';
	static $completa = 'Completa';
	static $rostros = 'Protagonistes';
	static $temas = 'Temes';

	static $busqueda_libre_texto = '<span style=\"color: #28292b;\"><span style=\"color: #28292b;\"><span style=\"font-size: 11pt;\">La cerca es pot realitzar amb operadors:</span><br /><br /></span></span>
									<table style=\"height: 132px; width: 970px;\">
									<tbody>
									<tr>
									<td style=\"width: 110px;\">Conté :</td>
									<td style=\"width: 900px;\"><strong>Francisco Franco</strong></td>
									</tr>
									<tr>
									<td style=\"width: 110px;\"> </td>
									<td style=\"width: 900px;\">(es busca \"Francisco\" i es busca \"Franco\" per separat, pot aparèixer \"Francisco Domingo Guasc\", etc)</td>
									</tr>
									<tr>
									<td style=\"width: 110px;\">Literal :</td>
									<td style=\"width: 900px;\"><strong>\"Francisco Franco\"</strong></td>
									</tr>
									<tr>
									<td style=\"width: 110px;\"> </td>
									<td style=\"width: 900px;\">(es busca la coincidència completa i només apareix quan la coincidència de les dues paraules concorda)</td>
									</tr>
									<tr>
									<td style=\"width: 110px;\">Comença per:</td>
									<td style=\"width: 900px;\"><strong>Franci*</strong></td>
									</tr>
									<tr>
									<td style=\"width: 110px;\"> </td>
									<td style=\"width: 900px;\">(Troba \"França\", \"Francisco\", \"Francisca\", etc)</td>
									</tr>
									<tr>
									<td style=\"width: 110px;\">Excloure :</td>
									<td style=\"width: 900px;\"><strong>Francisco -Domingo</strong></td>
									</tr>
									<tr>
									<td style=\"width: 110px;\"> </td>
									<td style=\"width: 900px;\">(Elimina la coincidencia de \"Francisco\" amb \"Domingo\" del resultat de la recerca)</td>
									</tr>
									</tbody>
									</table>';
}
echo addslashes('<span style="color: #28292b;"><span style="color: #28292b;"><span style="font-size: 11pt;">La cerca es pot realitzar amb operadors:</span><br /><br /></span></span>
									<table style="height: 132px; width: 970px;">
									<tbody>
									<tr>
									<td style="width: 110px;">Conté :</td>
									<td style="width: 900px;"><strong>Francisco Franco</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(es busca "Francisco" i es busca "Franco" per separat, pot aparèixer "Francisco Domingo Guasc", etc)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Literal :</td>
									<td style="width: 900px;"><strong>"Francisco Franco"</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(es busca la coincidència completa i només apareix quan la coincidència de les dues paraules concorda)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Comença per:</td>
									<td style="width: 900px;"><strong>Franci*</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(Troba "França", "Francisco", "Francisca", etc)</td>
									</tr>
									<tr>
									<td style="width: 110px;">Excloure :</td>
									<td style="width: 900px;"><strong>Francisco -Domingo</strong></td>
									</tr>
									<tr>
									<td style="width: 110px;"> </td>
									<td style="width: 900px;">(Elimina la coincidencia de "Francisco" amb "Domingo" del resultat de la recerca)</td>
									</tr>
									</tbody>
									</table>');
*/
?>