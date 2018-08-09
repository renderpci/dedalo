<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');
require_once( dirname(__FILE__).'/class.toponomy_import.php');
/*
    TOPONOMY_IMPORT TRIGGER
*/
set_time_limit ( 259200 );  // 3 dias

# set vars
$vars = array('mode');
    foreach($vars as $name) $$name = common::setVar($name);


#
# SESSION STORE DATA AND CLOSE
# We do not need write session info here. Liberate session to free browser
session_write_close();



if($mode=='municipios') {

	$file = 'files/municipios_2016.csv';

	$ar_csv_data = toponomy_import::read_csv_file_as_array( $file, $skip_header=false, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	exit();
	*/
	$prefix = 'es';

	$map = array(
	'nomenclator_code'  => 0,
	'termino'			=> 1,
	'tipology'			=> 2,
	'lat'				=> 3,
	'lon'				=> 4,
	'alt'				=> 5,
	'terminoID'			=> 6,
	);

	toponomy_import::update_dedalo_toponomy_table_municipios( $map, $ar_csv_data, $prefix );

	exit();

}//end if($mode=='municipios') {




if($mode=='aldeas') {

	$file = 'files/aldeas_2016.csv';

	$ar_csv_data = toponomy_import::read_csv_file_as_array( $file, $skip_header=false, ',');
	/*
	echo '<pre>';
	print_r($ar_csv_data);
	echo '</pre>';
	exit();
	*/
	$prefix = 'es';

	$map = array(
	'nomenclator_code'  => 0,
	'termino'			=> 1,
	'tipology'			=> 2,
	'lat'				=> 3,
	'lon'				=> 4,
	'alt'				=> 5,
	#'terminoID'			=> 6,
	);

	# SEQUENCE SET TO CUSTOM VALUE (10000)
	/**/
	$last_id 	= 10000;
	$sequence 	= 'public.jer_'.$prefix.'_id_seq';
	$strQuery 	= "SELECT setval('".$sequence."', $last_id, true);";
	$result		= pg_query(DBi::_getConnection(), $strQuery);
				if (!$result) {
					echo "<span style=\"color:red\">Error Processing Request: ".pg_last_error()."</span>";
					die();
				}
				echo "<span style=\"color:green\">Updated sequence $sequence to $last_id</span><br>"; #die();
	/*
	$last_id 	= 154209;
	$sequence 	= 'public.matrix_descriptors_id_seq';
	$strQuery 	= "SELECT setval('".$sequence."', $last_id, true);";
	$result		= pg_query(DBi::_getConnection(), $strQuery);
				if (!$result) {
					echo "<span style=\"color:red\">Error Processing Request: ".pg_last_error()."</span>";
					die();
				}
				echo "<span style=\"color:green\">Updated sequence $sequence to $last_id</span><br>"; #die();
	*/
		
	#die();			
	toponomy_import::update_dedalo_toponomy_table( $map, $ar_csv_data, $prefix );
	
	exit();

}//end if($mode=='aldeas') {




$html='';

$html .= "<a href=\"?mode=municipios\">municipios</a> ";
$html .= "<br><br>";
$html .= "<a href=\"?mode=aldeas\">aldeas</a> ";

echo wrap_html($html, false);


?>