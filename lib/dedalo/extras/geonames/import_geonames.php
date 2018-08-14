<?php
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
include( dirname(__FILE__) .'/class.geonames.php');
# http://api.geonames.org/childrenJSON?geonameId=2510769&username=yoadev&maxRows=5000000


# ONLY USE THIS SCRIPT FOR DOWNLOAD GEONAMES DATA. (Not for import)

# Write session to unlock session file
session_write_close();

ignore_user_abort(true);

$start_time=microtime(1);


	echo $msg = "Downloading geonames childrens json data for root code: {$code}<hr>"; ob_flush();flush();


	#$code = 2510769; // Spain
	#$code = 2593113; // Valencia

	/*
	# GREECE
	$code = 390903; // Grecia
	$code = 6692632; // Attica
	$code = 6697800; // Central Greece
	$code = 6697801; // Central macedonia
	$code = 6697802; // Creta
	$code = 6697803; // East macedonia and Thrace
	$code = 6697804; // Epirus
	$code = 6697805; // Ionian islands
	$code = 736572; // Mont Athos
	$code = 6697806; // North Aegean
	$code = 6697807; // Peloponnese
	$code = 6697808; // South Aegean
	$code = 6697809; // Thesaly
	$code = 6697810; // West Greece
	$code = 6697811; // West macedonia
	*/

	# AUSTRIA
	#$code = 2782113; //Austria
	#$code = 2781194; //Burgenland
	#$code = 2774686; //Kärnten
	#$code = 2770542; //Niederösterreich
	#$code = 2766823; //Salzburg
	#$code = 2764581; //Steiermark
	#$code = 2763586; //Tirol
	#$code = 2769848; //Oberösterreich
	#$code = 2761367; //Wien
	#$code = 2762300; //Vorarlberg

	# EGYPT
	#$code = 357994; // EGYPT
	#$code = 361059; // Muḩāfaz̧at al Iskandarīyah
	#$code = 359787; // Muḩāfaz̧at Aswān
	#$code = 359781; // Muḩāfaz̧at Asyūţ
	#$code = 361370; // Beheira Governorate
	#$code = 359171; // Muḩāfaz̧at Banī Suwayf
	#$code = 360631; // Cairo Governorate
	#$code = 361849; // Muḩāfaz̧at ad Daqahlīyah
	#$code = 358044; // Damietta Governorate
	#$code = 361323; // Muḩāfaz̧at al Fayyūm
	#$code = 361294; // Muḩāfaz̧at al Gharbīyah
	#$code = 360997; // Muḩāfaz̧at al Jīzah
	#$code = 361056; // Ismailia Governorate
	#$code = 354500; // Kafr ash Shaykh
	#$code = 7603259; // Muḩāfaz̧at al Uqşur
	#$code = 352603; // Muḩāfaz̧at Maţrūḩ
	#$code = 360688; // Muḩāfaz̧at al Minyā
	#$code = 360689; // Muḩāfaz̧at al Minūfīyah
	#$code = 360483; // Muḩāfaz̧at al Wādī al Jadīd
	#$code = 349401; // Muḩāfaz̧at Shamāl Sīnā’
	#$code = 358617; // Muḩāfaz̧at Būr Sa‘īd
	#$code = 360621; // Muḩāfaz̧at al Qalyūbīyah
	#$code = 350546; // Muḩāfaz̧at Qinā
	#$code = 361468; // Red Sea Governorate
	#$code = 360016; // Muḩāfaz̧at ash Sharqīyah
	#$code = 347794; // Muḩāfaz̧at Sūhāj
	#$code = 355182; // South Sinai Governorate
	#$code = 359797; // As Suways

	# RUSSIA
	#$code = 2017370; // Russia

	# POLAND
	#$code = 798544; // Poland

	# Germany
	#$code = 2921044; // Federal Republic of Germany

	# Croatia
	#$code = 3202326; // Republic of Croatia

	# Bosnia
	#$code = 3277605; // Bosnia and Herzegovina

	# Kosovo
	#$code = 831053;	// Republic of Kosovo

	# România
	#$code = 798549; // România

	# Bulgaria
	#$code = 732800; // Republic of Bulgaria

	# Israel
	#$code = 294640; // State of Israel

	# Libya
	#$code = 2215636; // Libya
	
	# Canada
	#$code = 6251999;

	# Colombia
	#$code = 3686110;

	# http://192.168.0.7:8080/dedalo4/lib/dedalo/extras/geonames/import_geonames.php?code=6251999&section_tipo=ca1&import=true
	


	$code = false; // reset avoid errors

	if (isset($_GET['code'])) {
		$code = (int)safe_xss($_GET['code']);
	}
	if (empty($code)) {
		echo $msg = "Error. Data is NOT downloaded: code is empty <hr>"; ob_flush();flush();
		exit();
	}


	# Filename compose from code
	$filename = dirname(__FILE__) .'/files/geonames_import_'.$code.'.json';

	echo $msg = "<br> - Calculating childrens of code: $code <hr>";	ob_flush();flush();
	debug_log(" $msg ".to_string(), logger::WARNING);

	
	// Get data from Geonames API
	if (!file_exists($filename)) {
		# Only call when file not exists (remove file to recreate it again)	
		echo $msg = "Calling to geonames API for get childrens of $code ...<hr>";
		debug_log(" $msg ".to_string(), logger::WARNING);
		$code 				= (int)$code;
		$recursive 			= true;
		$level  			= 0;	// Level 0 for root elements only. Else 1 for non root
		$base_lang_alpha2 	= 'en';
		$result = geonames::walk_data($code, $recursive, $level, $base_lang_alpha2);	//$code, $recursive=true, $level=0, $base_lang_alpha2='en'
		$put_contents = file_put_contents($filename, json_encode($result));

			$total=round(microtime(1)-$start_time,3);
			dump($code, ' code ++ counter: '.geonames::$counter." - ".exec_time_unit($start_time,'ms').' ms');
	}else{
		echo $msg = "<br><div style=\"color:green;font-weight:bold\"> - File already exists for code: $code </div>"; ob_flush();flush();
	}
	
	
	/*
	// Importa data
	$import = isset($_GET['import']) ? true : false;
	if($import!==true) {
		echo $msg = "Data is NOT imported <hr>"; ob_flush();flush();
	}

	$section_tipo	= isset($_GET['section_tipo']) ? safe_tipo($_GET['section_tipo']) : false;
	if($section_tipo==false) {
		echo $msg = "Data is NOT imported: section_tipo is empty <hr>"; ob_flush();flush();
	}
	
	if($import===true && !empty($section_tipo) && file_exists($filename)) {
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
		
			$total=round(microtime(1)-$start_time,3);
			dump($result, ' result ++ '.exec_time_unit($start_time,'ms').' ms');
	}
	*/
	

ob_end_flush();
?>