<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
include('class.migratev3v4.php');
include('set_up_vars.php');

#die("stop");

if(login::is_logged()!==true) return;
//die("<span class='error'> Auth error: please login </span>");

ignore_user_abort(true);
session_write_close();

#
# LINKS
echo "<a href=\"?mode=migrate_tesaurus_complete\">migrate_tesaurus_complete</a>";
echo "<hr>";
echo "<a href=\"?mode=migrate_indexations\">migrate_indexations</a>";
echo "<hr>";
echo "<a href=\"?mode=migrate_transcriptions\">migrate_transcriptions</a>";
echo "<hr>";
echo "<a href=\"?mode=remove_inverse_locators\">remove_inverse_locators</a>";
echo "<hr>"; 

# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



	
# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* MIGRATE_TESAURUS_COMPLETE v2.1
*/
function migrate_tesaurus_complete() {
	
	$mysql_conn = array(
		'host' 		=> 'localhost',
		'user' 		=> 'root',
		'password' 	=> 'capicua',
		'database' 	=> 'dedalo3_memorial',
		);

	/*
	$mysql_conn = array(
		'host' 		=> 'localhost',
		'user' 		=> 'dedalo',
		'password' 	=> '7PxPBUEDFwpVSHvw',
		'database' 	=> 'dedalo3_memorial',
		);
		*/

	$migratev3v4 = new migratev3v4( $mysql_conn );

	$options = new stdClass();
		#$options->ar_tables = array('dc','ts','on');
		$options->ar_tables = array('ad');// array('es','fr','cu','pt','ma','dz','ad');
		
	$result = $migratev3v4->migrate_tesaurus_complete( $options );
	
	echo wrap_pre(json_encode($result));

	


		/* JERARQUIA_TIPOS MHT
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Descriptores antropológicos', '5');
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Descriptores históricos', '6');
		INSERT INTO "jerarquia_tipos" ("nombre", "orden") VALUES ('Otros', '7');
		*/
		
		/* JERARQUIA MHT
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('AAA', 'AA', 'Antropología social', '5', 'si', 'lg-spa');
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('PHP', 'HP', 'Periodos historico-políticos', '6', 'si', 'lg-spa');
		INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES ('RTD', 'RT', 'Restricted', '7', 'si', 'lg-spa');
		*/


		#
		# TS TABLES AND DESCRIPTORS
		/*
		$ar_tables = array('aa','hp','rt','ad');
		foreach ($ar_tables as $prefix) {

			# Delete and create target tables
			$migratev3v4->migrate_ts_table('jer_'.$prefix);

			# Create / update descriptors in all langs
			$migratev3v4->migrate_descriptors_table( $prefix );
		}
		*/
		
		#
		# INDEXATIONS
		#$migratev3v4->migrate_indexations();


		#$migratev3v4->get_table_records( $table_name='captaciones', $mysqli );
		#$migratev3v4->migrate_captures();
}#end migrate_tesaurus_complete



/**
* REMOVE_INVERSE_LOCATORS
* @return 
*//*
function remove_inverse_locators() {
	
	$section_tipo = 'rsc197';

	# Get section all records
	$ar_all_section_records = section::get_ar_all_section_records_unfiltered( $section_tipo );

	foreach ($ar_all_section_records as $current_section_id) {

		if ($current_section_id!='1100') {
			#continue;
		}
		if ((int)$current_section_id>1101) {
			continue;
		}
		
		$section = section::get_instance($current_section_id, $section_tipo);
		$inverse_locators = $section->get_inverse_locators();
		$section->remove_all_inverse_locator();
		$section->Save();

		echo "Deleted inverse locators from $section_tipo - $current_section_id !<br>";
		debug_log(__METHOD__." Deleted inverse locators from $section_tipo - $current_section_id : ".to_string($inverse_locators), logger::WARNING);
	}


}//end remove_inverse_locators
*/



/**
* MIGRATE_INDEXATIONS
*/
function migrate_indexations() {
	
	if (strpos(DEDALO_HOST, '8888')!==false) {
		$mysql_conn = array(
			'host' 		=> 'localhost',
			'user' 		=> 'root',
			'password' 	=> 'capicua',
			'database' 	=> 'dedalo3_memorial',
			);
	}else{
		
		$mysql_conn = array(
			'host' 		=> 'localhost',
			'user' 		=> 'dedalo',
			'password' 	=> '7PxPBUEDFwpVSHvw',
			'database' 	=> 'dedalo3_memorial',
			);		
	}

	$migratev3v4 = new migratev3v4( $mysql_conn );

	# INDEXATIONS
	$migratev3v4->migrate_indexations();

}//end migrate_indexations



/**
* MIGRATE_TRANSCRIPTIONS
* @return 
*/
function migrate_transcriptions() {

	if (strpos(DEDALO_HOST, '8888')!==false) {
		$mysql_conn = array(
			'host' 		=> 'localhost',
			'user' 		=> 'root',
			'password' 	=> 'capicua',
			'database' 	=> 'dedalo3_memorial',
			);
	}else{
		
		$mysql_conn = array(
			'host' 		=> 'localhost',
			'user' 		=> 'dedalo',
			'password' 	=> '7PxPBUEDFwpVSHvw',
			'database' 	=> 'dedalo3_memorial',
			);		
	}
	

	$migratev3v4 = new migratev3v4( $mysql_conn );
	$migratev3v4->migrate_transcriptions();


}//end migrate_transcriptions
	


?>