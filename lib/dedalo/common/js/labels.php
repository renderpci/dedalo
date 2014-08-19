<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
/**
* LABELS 
*/
$js = '';

$ar_label = label::get_ar_label();
	#dump($ar_label,"ar_label");
	#print_r($ar_label);

	#
	# ARRAY MODE
	/*
	foreach ($ar_label as $key => $value) {

		$label = addslashes($value);

		if(!empty($key)) {
			$js .= "$key:\"$label\",\n";
		}	
	}
	$js = substr($js, 0,-2);
	$js .= '};';
	*/

	
	#
	# JSON OBJECT MODE
	# js object formated like person={firstname:"John",lastname:"Doe",age:50,eyecolor:"blue"};
	$js = 'get_label=new Object(' . json_handler::encode($ar_label,JSON_UNESCAPED_UNICODE) . ')';


# HEADERS
header("Cache-Control: private, max-age=10800, pre-check=10800");
header("Pragma: private");
header("Expires: " . date(DATE_RFC822,strtotime(" 120 day")));

header("Content-type: text/javascript; charset=utf-8");
print $js;
exit();
?>