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
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");





/**
* Add the data to the component
*/
if ($mode=='add_data') {

	$vars = array('json_data');
		foreach($vars as $name) $$name = common::setVar($name);	

	$data = json_decode($json_data);
	
	$action			= $data->action;
	$component_tipo	= $data->component_tipo;
	$section_id		= $data->parent;
	$section_tipo	= $data->section_tipo;
	$temp_id		= $data->temp_id;
	$top_tipo		= $data->top_tipo;


	header('Content-Type: text/event-stream');
	header('Cache-Control: no-cache'); // recommended to prevent caching of event data.
	

	$start_time= start_time();

	set_time_limit ( 32000 );	
	# Disable logging activity !IMPORTANT
	logger_backend_activity::$enable_log = false;

	
	// temporal component	
		$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component		= component_common::get_instance($model, $component_tipo, $temp_id, 'list', DEDALO_DATA_LANG, $section_tipo);	
		$source_dato	= $component->get_dato();


	// tool (tool doesn't use 'component_id' so we can send the temporary component here safely)
		$tool_add_component_data	= new tool_add_component_data($component);
		$ar_records_replaced		= (array)$tool_add_component_data->propagate_data($source_dato, $action);



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
}//end if ($mode=='add_data')


