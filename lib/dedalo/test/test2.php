<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');



die("STOP");

$seconds = 60 * 60 * 8;
set_time_limit ( $seconds );

$tipo = 'dd20';


$section_obj = new stdClass();
$section_obj->section_tipo = $tipo;
//$section_obj = new stdClass();
#$section_obj->info = new stdClass();
$section_obj->label = "Historia Oral";
$section_obj->section_id ="0";
$section_obj->created_by_userID ="1";
$section_obj->modified_by_userID ="1";
$section_obj->created_date ="2013-02-07 13:48:31";
$section_obj->modified_date ="2013-02-08 13:48:31";
#$section_obj->ar_section_creator =new stdClass();
$section_obj->ar_section_creator_top_tipo ="dd316";
$section_obj->ar_section_creator_portal_section_tipo ="null";
$section_obj->ar_section_creator_portal_tipo ="null";

$section_obj->components = new stdClass();

$json_obj_parsed = json_encode($section_obj);
#print_r($json_obj_parsed);

echo "<br><br>";

#################### CONVERT ##################################################


$data_base_origen 	= 'dedalo4_mupreva';
$data_base_destino 	= 'usar config db para cambiarla'; 		# DEFINIDA EN CONFIG DB:  define('DEDALO_DATABASE_CONN', 'dedalo4_development');
$tabla_origen 		= 'matrix';
$tabla_destino 		= 'matrix';

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

$strQuery = " SELECT * FROM ".MYSQL_DEDALO_DATABASE_CONN.".$tabla_origen WHERE parent = 0 "; 

$result = mysqli_query($conn, $strQuery);

$i=1;
while($row = mysqli_fetch_array($result)) {


	$current_id     = $row['id'];
	$section_tipo   = $row['tipo'];
	$section_dato   = $row['dato'];
	$section_dato   = json_decode($section_dato);
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


	$section_obj = new stdClass();
	$section_obj->section_tipo = (string)$section_tipo;
 
	# Info
	//$section_obj->info = new stdClass();
	$section_obj->label             	= (string)$section_dato->ref_name;
	$section_obj->section_id          	= (int)$section_dato->section_id;
	$section_obj->created_by_userID   	= (int)$section_dato->created_by_userID;
	$section_obj->created_date        	= (string)$section_dato->created_date;
	$section_obj->id_matrix_anterior   	= (int)$current_id;

	# ar_section_creator
	$section_obj->ar_section_creator = new stdClass();
	
	if (isset($section_dato->ar_section_creator->top_tipo)) {
		$section_obj->ar_section_creator_top_tipo               = (string)$section_dato->ar_section_creator->top_tipo;
	}
	if (isset($section_dato->ar_section_creator->portal_section_tipo)) {
		$section_obj->ar_section_creator_portal_section_tipo    = (string)$section_dato->ar_section_creator->portal_section_tipo;
	}
	if (isset($section_dato->ar_section_creator->portal_tipo)) {
	 	$section_obj->ar_section_creator_portal_tipo            = (string)$section_dato->ar_section_creator->portal_tipo;
	}	

	$section_obj->components = new stdClass();

	$strQuery = " SELECT * FROM ".MYSQL_DEDALO_DATABASE_CONN.".$tabla_origen WHERE parent = $current_id ORDER BY tipo ";
	$result2 = mysqli_query($conn,$strQuery);
	$last_tipo=null;
	while ( $row2 = mysqli_fetch_array($result2) ) {

		$component_id   = $row2['id'];
		$component_tipo = $row2['tipo'];
		$component_lang = $row2['lang'];
		$component_dato = $row2['dato'];
		$component_dato = json_decode($component_dato,false);

		# component_relation conocidos. Formateamos para igualar tipos
		$ar_relaciones_tipo = array('dd71','dd169','dd174','dd533','dd615','dd623');
		if (in_array($component_tipo, $ar_relaciones_tipo) 
			&& ($component_dato=='""' || $component_dato=='null' || $component_dato=='' || !is_array($component_dato))) {
		   $component_dato = array(); # Array vacío para que json escriba [] como valor y no se mezclen tipos
		}

		# Cuenta activa
		if ($component_tipo=='dd131' && is_array($component_dato)) {		
			$component_dato = $component_dato[0];		
		}

		echo "id: $component_id - component_tipo: $component_tipo - lang: $component_lang - dato: ".print_r($component_dato,true)."<br>";

		if ($last_tipo!=$component_tipo) {        
			$section_obj->components->$component_tipo = new stdClass();
			# Info
			$section_obj->components->$component_tipo->modelo = (string)RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$section_obj->components->$component_tipo->label  = (string)RecordObj_dd::get_termino_by_tipo($component_tipo,null, true);
			# Dato
			$section_obj->components->$component_tipo->dato 	  = new stdClass();
			$section_obj->components->$component_tipo->valor 	  = new stdClass();
			$section_obj->components->$component_tipo->valor_list = new stdClass();		
		}
		if( is_string($component_dato) && (strpos($component_dato,'[')=== 0 || strpos($component_dato,'{')=== 0) ){
			$component_dato = json_encode($component_dato);
		}
		$section_obj->components->$component_tipo->dato->$component_lang = $component_dato;	

				/*
				# VALOR
				$modelo_name = $section_obj->components->$component_tipo->modelo;
				$componente_virtual = component_common::get_instance($modelo_name, $component_tipo, $current_id, 'edit', $component_lang);	# $component_name=null, $tipo, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG
				$componente_virtual->set_dato($component_dato); 

				$section_obj->components->$component_tipo->valor->$component_lang = $componente_virtual->get_valor();
				
				$componente_virtual->set_modo('list');
				# valor_list is dato for some components
				switch ($modelo_name) {
					case 'component_portal':
					case 'component_relation':
						$html = $componente_virtual->get_dato_unchanged();
						break;			
					default:
						$componente_virtual->set_modo('list');	#dump($componente_virtual,"componente_virtual");
						$html = $componente_virtual->get_html();
						break;
				}
				$section_obj->components->$component_tipo->valor_list->$component_lang = $html;
				*/

		$last_tipo = $component_tipo;
	}
	#$section_obj = json_encode($section_obj);
	#dump($section_obj,"section_obj");
	#print_r($section_obj);
	echo "</blockquote>";
	

	# SALVAMOS EL OBJETO EN POSTGRES
	$pg_strQuery = 'INSERT INTO "'.$tabla_destino.'" ("id","datos") VALUES ($1,$2);';
	$pg_result   = pg_query_params(DBi::_getConnection(), $pg_strQuery, array( $current_id, json_encode($section_obj,JSON_UNESCAPED_UNICODE) ));

	#$pg_strQuery = 'INSERT INTO "'.$tabla_destino.'" ("datos") VALUES ($1);';
	#$pg_result   = pg_query_params(DBi::_getConnection(), $pg_strQuery, array(json_encode($section_obj,JSON_UNESCAPED_UNICODE) ));

	echo "<hr><b> -> Inserted record ($current_id) in postgres sql </b>";#.json_encode($section_obj);
	/*
	$datos = json_encode($section_obj,JSON_UNESCAPED_UNICODE);
	$datos = json_decode($datos,false);
		#dump($datos,"datos");

	$tipo_del_component     = 'dd132';
	$idioma_del_component   = 'lg-nolan';
	dato_component         = $datos->components->$tipo_del_component->dato->$idioma_del_component;   
		dump($dato_component,"dato_component");

	#dump($section_obj,"section_obj");
	*/
	$i++;
	#if ($i>=100) {
	#	break;
	#}

}#end while($row = mysqli_fetch_array($result))


#
# REGENERAR VALOR Y VALOR_LIST
/*
$pg_strQuery = " SELECT * FROM \"$tabla_destino\" ";
$pg_result   = pg_query(DBi::_getConnection(), $pg_strQuery);

# VALOR
		$modelo_name = $section_obj->components->$component_tipo->modelo;
		$componente_virtual = component_common::get_instance($modelo_name, $component_tipo, $current_id, 'edit', $component_lang);	# $component_name=null, $tipo, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG
		$componente_virtual->set_dato($component_dato); 

		$section_obj->components->$component_tipo->valor->$component_lang = $componente_virtual->get_valor();

		$componente_virtual->set_modo('list');
		$section_obj->components->$component_tipo->valor_list->$component_lang = $componente_virtual->get_html();

*/







pg_close(DBi::_getConnection());
mysqli_close($conn);
?>
<div class="time_to_load_div"><?php
# Place this part at the very end of your page 
# PHP >=5.4 $_SERVER['REQUEST_TIME_FLOAT']
printf ("Generated in %s seconds", round( microtime(TRUE) - $_SERVER['REQUEST_TIME_FLOAT'] ,4) );
?>
</div>