<?php
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
include( dirname(__FILE__) .'/class.geonames.php');
# http://api.geonames.org/childrenJSON?geonameId=2510769&username=yoadev&maxRows=5000000


# ONLY USE THIS SCRIPT FOR SAVE ALREADY DOWNLOADED GEONAMES DATA. (Not for call to geonames api)



# Write session to unlock session file
session_write_close();

ignore_user_abort(true);

$start_time=microtime(1);


	echo $msg = "Importing geonames downloaded json file geonames_import_".safe_xss($_GET['code']).".json<hr>"; ob_flush();flush();

	
	#
	# CODE
		$code = false; // reset avoid errors
		if (isset($_GET['code'])) {
			$code = (int)safe_xss($_GET['code']);
		}
		if(empty($code)) {
			echo $msg = "Error. Data is NOT imported: code is empty <hr>"; ob_flush();flush();
			exit();
		}

	#
	# FILE
		$filename = dirname(__FILE__) .'/files/geonames_import_'.$code.'.json';
		if(!file_exists($filename)) {
			echo $msg = "Error. Data is NOT imported: File $filename not exists!"; ob_flush();flush();
			exit();
		}

	
	#
	# IMPORT . Import var
		$import = isset($_GET['import']) ? true : false;
		if($import!==true) {
			echo $msg = "Error. Data is NOT imported: 'import' var is false <hr>"; ob_flush();flush();
			exit();
		}


	#
	# SECTION_TIPO
		$section_tipo	= isset($_GET['section_tipo']) ? safe_tipo($_GET['section_tipo']) : false;
		if(empty($section_tipo)) {
			echo $msg = "Error. Data is NOT imported: section_tipo is empty <hr>"; ob_flush();flush();
			exit();
		}
	
	#
	# IMPORT_DATA
		echo $msg = "Processing already downloaded datafile: $filename <hr>"; ob_flush();flush();
		debug_log(" $msg ".to_string(), logger::WARNING);
		// Read created file (walk)
		$data = file_get_contents($filename);
		$data = json_decode($data); 	#dump($data, ' data ++ '.to_string()); #die();
		#$section_tipo 			= 'bg1';
		$lang_alpha2			= 'en'; // Main lang
		$other_langs_alpha2 	= array(); // Import all langs  // 'el','es','de'
		$hierarchy_section_id 	= 1; // Elements of first level are attached here like '1'. IMPORTANT: Create before the term in the empty section like il (NOT HIERARCHY BUT SPECIFIC SECTION)
		$result = geonames::import_data( $data, $section_tipo, $lang_alpha2, $other_langs_alpha2, $hierarchy_section_id); //  import_data( $data, $section_tipo, $lang_alpha2, $ar_langs_alpha2 )
		
		$total = round(microtime(1)-$start_time,3);
		$msg   = "Imported geonames code $code to section_tipo ++ ".exec_time_unit($start_time,'ms').' ms';
		debug_log("import_geonames2. $msg ".to_string(), logger::ERROR);
		echo "<pre>$msg</pre>";



ob_end_flush();
?>