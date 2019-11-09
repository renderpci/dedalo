<?php
/*
// headers
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache'); // recommended to prevent caching of event data.


	$bb = safe_xss($_REQUEST['bb']);

	for ($i=1; $i <= 10 ; $i++) { 

		$n_var = array(
			"bb" => $bb .' - '. $i, 
			"time" => time(),
			"percent" => $i,
			);

		echo "retry: 5000" . PHP_EOL; // miliseconds
		echo "id: $i".PHP_EOL;
		echo "data: ".json_encode($n_var).PHP_EOL;	
		echo PHP_EOL;
		//ob_flush();
		flush();
		sleep(1);
	}

	
	exit();
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* BUILD_SUBTITLES_TEXT
*/
if ($mode==='replace_data') {

	$vars = array('json_data');
		foreach($vars as $name) $$name = common::setVar($name);

	
	if (isset($json_data)) {
		$data = json_decode($json_data);	
		foreach ($data as $key => $value) {
			$$key = $value;
		}
	}

	if (empty($component_tipo)) {
		$msg = "<span class='error'> Trigger: Error Need component_tipo..</span>";		
	}
	if (empty($parent)) {
		$msg = "<span class='error'> Trigger: Error Need parent..</span>";
	}
	if (empty($section_tipo)) {
		$msg = "<span class='error'> Trigger: Error Need section_tipo..</span>";
	}
	if (isset($msg)) {
		trigger_error($msg);
	}


	header('Content-Type: text/event-stream');
	header('Cache-Control: no-cache'); // recommended to prevent caching of event data.
	

	$start_time= start_time();

	set_time_limit ( 32000 );	
	# Disable logging activity !IMPORTANT
	logger_backend_activity::$enable_log = false;

	#
	# Component
	$tipo 			= (string)$component_tipo;
	$section_tipo 	= (string)$section_tipo;
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj  = component_common::get_instance($modelo_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);

	

	$tool_replace_component_data = new tool_replace_component_data($component_obj);
	$ar_records_replaced 		 = (array)$tool_replace_component_data->propagate_data();

	#echo count($ar_records_replaced)." ".label::get_label('registros_actualizados');


	# Enable logging activity !IMPORTANT
	logger_backend_activity::$enable_log = true;

	

	#
	# EXC INFO
	$msg = "<h1> ok </h1>";
	if(SHOW_DEBUG) {		
		$exec_time 		= exec_time_unit($start_time, $unit='sec');
		$memory_usage 	= tools::get_memory_usage(false);	
		$msg .= " <div class=\"info_processed_file\">Executing time: $exec_time secs - memory_usage: $memory_usage</div>";		
	}

	
	
	echo "data: ".json_encode($msg). PHP_EOL;
	echo PHP_EOL;
	//ob_flush();
	flush();


	exit();
}//end if ($mode=='replace_data')
?>