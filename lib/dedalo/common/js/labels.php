<?php
/**
* LABELS 
*/
die("DEPRECATED");

# JS LABELS
	/*
	session_start();
		#print_r($_SESSION['dedalo4']['config']['dedalo_application_lang']);
	$label_path = 'lang/' . $_SESSION['dedalo4']['config']['dedalo_application_lang'] . '.js';
	if (!file_exists($label_path)) {
		require( dirname(dirname(__FILE__))."/class.label.php" );
		$ar_label = label::get_ar_label();; // Get all properties
			#dump($ar_label, ' ar_label');

		file_put_contents( dirname(__FILE__).'/'.$label_path, 'get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
	}
	header("HTTP/1.1 301 Moved Permanently");	
	header("Location: $label_path"); exit();
	*/


	require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

	$ar_label = label::get_ar_label();
		#dump($ar_label,"ar_label");				
		
		# JSON OBJECT MODE
		# js object formated like person={firstname:"John",lastname:"Doe",age:50,eyecolor:"blue"};
		$js = 'get_label=' . json_handler::encode($ar_label,JSON_UNESCAPED_UNICODE) . '';

		#file_put_contents(dirname(__FILE__).'/labels_'.DEDALO_APPLICATION_LANG.'.js', $js);

	# HEADERS
	header("Cache-Control: private, max-age=10800, pre-check=10800");
	header("Pragma: private");
	header("Expires: " . date(DATE_RFC822,strtotime(" 120 day")));

	header("Content-type: application/javascript; charset=utf-8");
	print $js;
	exit();
/*
}else{
	header("Content-type: application/javascript;");
	header("HTTP/1.1 301 Moved Permanently");	
	header("Location: $location"); exit();
}
*/
?>