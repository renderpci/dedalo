<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");
if ((int)$_SESSION['dedalo4']['auth']['user_id']!==1 || strpos(DEDALO_HOST, '8888')===false) {
	die("<span class='error'> Auth error: please login as admin in development host </span>");
}

$seconds = 60 * 60 * 8;
set_time_limit ( $seconds );

# set vars
	$vars = array('data_base_origen','data_base_destino','tabla_origen','tabla_destino','sended','options');
	foreach($vars as $name) $$name = common::setVar($name);

# DEFAULTS CONFIG
if (!$data_base_origen) 	$data_base_origen 	= 'dedalo4_development';
if (!$data_base_destino) 	$data_base_destino 	=  DEDALO_DATABASE_CONN;
if (!$tabla_origen) 		$tabla_origen 		= 'matrix';
if (!$tabla_destino) 		$tabla_destino 		= 'matrix';


$html='<!DOCTYPE html>';
$html='<head><title>Import MySQL to PostgreSQL</title><style>
  html {background-color:#f1f1f1; font-family:Helvetica; font-size:12px;}
  h1   {color:blue}
  p    {color:green}
</style></head>';
$html.= "<body><h1>IMPORT RECORDS MySQL to POSTGRESQL</h1><form method=\"post\">";
$html.= "<table>";
$html.= "<tr>";

	$html.= "<td>data_base_origen</td>";
	$html.= "<td><input type=\"text\" name=\"data_base_origen\" value=\"$data_base_origen\"> </td>";

	$html.= "<td>data_base_destino</td>";
	$html.= "<td><input type=\"text\" name=\"data_base_destino\" value=\"$data_base_destino\" readonly></td>";

$html.= "</tr>";
$html.= "<tr>";

	$html.= "<td>tabla_origen </td>";
	$html.= "<td><input type=\"text\" name=\"tabla_origen\" value=\"$tabla_origen\"></td>";

	$html.= "<td>tabla_destino</td>";
	$html.= "<td><input type=\"text\" name=\"tabla_destino\" value=\"$tabla_destino\"></td>";

$html.= "</tr>";
$html.= "<tr>";
$html.= "<td>Options </td>";
$html.= "<td> 
		<input type=\"checkbox\" name=\"options[import]\" value=\"1\">Import data <input type=\"checkbox\" name=\"options[renumber]\" value=\"1\">Renumber records<br> 
		 
		</td>";
$html.= "</tr>";
#<input type=\"checkbox\" name=\"options[regenerate]\" value=\"1\">Regenerate data (value_list) <br>

$html.= "</table>";


$html.= "<input type=\"hidden\" name=\"sended\" value=\"1\" />";
$html.= "<input type=\"submit\" value=\"Send\" />";
$html.= "</form>";

echo $html;
#echo html_page::get_html($html);

if ($sended!=1) {
exit();
}



#################### CONVERT ##################################################
/*
$data_base_origen 	= 'dedalo4_development';
$data_base_destino 	= 'usar config db para cambiarla'; 		# DEFINIDA EN CONFIG DB:  define('DEDALO_DATABASE_CONN', 'dedalo4_development');
$tabla_origen 		= 'matrix_dd';
$tabla_destino 		= 'matrix_dd';
*/
# MYSQL CONFIG 
define('MYSQL_DEDALO_HOSTNAME_CONN'   , 'localhost');
define('MYSQL_DEDALO_DB_PORT_CONN'    ,  NULL);
define('MYSQL_DEDALO_SOCKET_CONN'     , '/Applications/MAMP/tmp/mysql/mysql.sock');
define('MYSQL_DEDALO_DATABASE_CONN'   , $data_base_origen);
define('MYSQL_DEDALO_USERNAME_CONN'   , 'root');
define('MYSQL_DEDALO_PASSWORD_CONN'   , 'capicua');

$conn = mysqli_connect(MYSQL_DEDALO_HOSTNAME_CONN,MYSQL_DEDALO_USERNAME_CONN,MYSQL_DEDALO_PASSWORD_CONN,MYSQL_DEDALO_DATABASE_CONN);    #http://debug:8888/dedalo4/lib/dedalo/test/test2.php
// Check connection
if (mysqli_connect_errno()) {
  echo "Failed to connect to MySQL: " . mysqli_connect_error();
}
# UTF8 : Change character set to utf8 
if (!$conn->set_charset("utf8")) {
	printf("Error loading character set utf8: %s\n", $conn->error);
}




/**
* IMPORT
* Pasa los dato de la tabla MySQL a la tabla PostgreSQL
*/
if ($options['import']==1) {

	require_once('tipo_map.php');

	$strQuery = " SELECT * FROM ".MYSQL_DEDALO_DATABASE_CONN.".$tabla_origen WHERE parent = 0 "; 

	$result = mysqli_query($conn, $strQuery);

	$i=1;
	while($row = mysqli_fetch_array($result)) {


		$current_id     = $row['id'];
		$section_tipo   = $row['tipo'];
		$section_tipo 	= map_tipos($section_tipo);
		$section_dato   = $row['dato'];
		$section_dato   = json_decode($section_dato);

		if ($options['renumber']==1) {
			$counter 	= (int)$i;
		}else{
			$counter 	= (int)$current_id;
		}
		
		#dump($section_dato,"");

		echo "<hr>";
		echo '- id:'.$current_id;
		echo " - ";
		echo $row['tipo'];
		echo " - ";
		echo $row['dato'];
		echo " - ";
		echo $row['parent'];
		echo " - ";
		echo $row['lang'];		
		echo "<blockquote>";

		#
		# SECTION
		/* 
		JSON reference
			"section_id": 42,
			"created_date": "2014-11-07 20:54:25",
			"section_tipo": "dd12",
			"modified_date": "2014-11-07 21:20:56",
			"created_by_userID": 8,
			"modified_by_userID": 1,
			"section_creator_top_tipo": "dd12",
			"section_creator_portal_tipo": "",
			"section_creator_portal_section_tipo": ""
		*/
		$section_obj = new stdClass();
		$section_obj->label             	= (string)$section_dato->ref_name;
		$section_obj->section_id			= (int)$section_dato->section_id;
		$section_obj->created_date			= (string)$section_dato->created_date;
		$section_obj->section_tipo			= (string)$section_tipo;
	 	$section_obj->modified_date			= (string)$section_dato->created_date;
	 	$section_obj->created_by_userID		= (int)$section_dato->created_by_userID;
	 	$section_obj->modified_by_userID	= (int)$section_dato->created_by_userID;

	 	# ID_MATRIX_ANTERIOR
	 	# Es específico para la exportación. No se usa en los datos estándar, pero puede ayudar en tareas de reasignación tras importar registros
		$section_obj->id_matrix_anterior	= (int)$current_id;	
		
		if (isset($section_dato->ar_section_creator->top_tipo)) {
			$section_obj->section_creator_top_tipo = (string)$section_dato->ar_section_creator->top_tipo;
		}
		if (isset($section_dato->ar_section_creator->portal_section_tipo)) {
			$section_obj->section_creator_portal_tipo = (string)$section_dato->ar_section_creator->portal_section_tipo;
		}
		if (isset($section_dato->ar_section_creator->portal_tipo)) {
			$section_obj->section_creator_portal_section_tipo = (string)$section_dato->ar_section_creator->portal_tipo;
		}

		#
		# SECTION -> COMPONENTS
		/* 
		JSON reference
			"dd23": {
		            "dato": {
		                "lg-nolan": "INTERVIEW-1"
		            },
		            "info": {
		                "label": "Código",
		                "modelo": "component_input_text"
		            },
		            "valor": {
		                "lg-nolan": "INTERVIEW-1"
		            },
		            "valor_list": {
		                "lg-nolan": "\n <span class=\"css_span_dato\">INTERVIEW-1</span>"
		            }
		        }, ...
		*/
		$section_obj->components = new stdClass();

		$strQuery = " SELECT * FROM ".MYSQL_DEDALO_DATABASE_CONN.".$tabla_origen WHERE parent = $current_id ORDER BY tipo ";
		$result2 = mysqli_query($conn,$strQuery);
		$last_tipo=null;
		while ( $row2 = mysqli_fetch_array($result2) ) {

			$component_id   = $row2['id'];
			$component_tipo = $row2['tipo'];
			$component_tipo = map_tipos($component_tipo);
			$component_lang = $row2['lang'];
			$component_dato = $row2['dato'];
			$component_dato = json_decode($component_dato,false);

				#
				# CORRECCIONES ESPECÍFICA DE CASOS CONOCIDOS
				# Caso component_relation conocidos. Formateamos para igualar tipos
				$ar_relaciones_tipo = array('dd71','dd169','dd174','dd533','dd615','dd623');
				if (in_array($component_tipo, $ar_relaciones_tipo) 
					&& ($component_dato=='""' || $component_dato=='null' || $component_dato=='' || !is_array($component_dato))) {
				   $component_dato = array(); # Array vacío para que json escriba [] como valor y no se mezclen tipos
				}

				# Caso component Cuenta activa
				if ($component_tipo=='dd131' && is_array($component_dato)) {		
					$component_dato = $component_dato[0];		
				}

			echo "id: $component_id - component_tipo: $component_tipo - lang: $component_lang - dato: ".print_r($component_dato,true)."<br>";

			if ($last_tipo!=$component_tipo) {        
				$section_obj->components->$component_tipo = new stdClass();
				# Info
				$section_obj->components->$component_tipo->info = new stdClass();
				$section_obj->components->$component_tipo->info->label  = (string)RecordObj_dd::get_termino_by_tipo($component_tipo,null, true);
				$section_obj->components->$component_tipo->info->modelo = (string)RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				
				# Dato
				$section_obj->components->$component_tipo->dato 	  = new stdClass();
				$section_obj->components->$component_tipo->valor 	  = new stdClass();
				$section_obj->components->$component_tipo->valor_list = new stdClass();		
			}
			# JSON encode : Los datos (en MYSQL son siempre string) con apariencia de json (comienzan por '{' o '['), son codificados como json
			if( is_string($component_dato) && (strpos($component_dato,'[')=== 0 || strpos($component_dato,'{')=== 0) ){
				$component_dato = json_encode($component_dato,JSON_UNESCAPED_UNICODE);
			}
			$section_obj->components->$component_tipo->dato->$component_lang = $component_dato;				

			$last_tipo = $component_tipo;
		}
		#$section_obj = json_encode($section_obj);
		#dump($section_obj,"section_obj");
		#print_r($section_obj);


		echo "</blockquote>";
		

		# SALVAMOS EL OBJETO EN POSTGRES
		$pg_strQuery = 'INSERT INTO "'.$tabla_destino.'" ("id","datos") VALUES ($1,$2);';
		$pg_result   = pg_query_params(DBi::_getConnection(), $pg_strQuery, array( $counter, json_encode($section_obj,JSON_UNESCAPED_UNICODE) ));

		echo "<hr><b> -> Inserted record ($current_id [$counter]) in postgres sql </b>";#.json_encode($section_obj);	
		$i++;
		#if ($i>=100) {
		#	break;
		#}

	}#end while($row = mysqli_fetch_array($result))

}#end if ($options['import']==1)









if(DBi::_getConnection()) pg_close(DBi::_getConnection());
if(isset($conn)) mysqli_close($conn);
?>
<div class="time_to_load_div">
<?php printf ("<br><br>Generated in %s seconds<br>", round( microtime(TRUE) - $_SERVER['REQUEST_TIME_FLOAT'] ,4) ); ?>
</div>