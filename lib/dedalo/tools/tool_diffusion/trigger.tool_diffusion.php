<?php
/**
* TRIGGER TOOL_DIFFUSION
*/
set_time_limit ( 259200 );  // 3 dias

include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
include( DEDALO_LIB_BASE_PATH .'/diffusion/class.diffusion.php');

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* EXPORT_LIST
*/
function export_list() {
	
	$start_time = start_time();

	# Write session to unlock session file
	session_write_close();

	$seconds = 60 * 10; set_time_limit($seconds); 

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error on export_list';

	$vars = array('section_tipo','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

		if (!$section_tipo) {
			$response->msg = "Sorry. section_tipo is mandatory";
			return $response;
		}
		if (!$diffusion_element_tipo) {
			$response->msg = "Sorry. diffusion_element_tipo is mandatory";
			return $response;
		}

	# Reset msg
	$response->msg = '';

	$search_options_session_key = 'section_'.$section_tipo;
	# dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], '$_SESSION ++ '.to_string());
	if ( !isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]) ) {
		$response->msg = "<span class=\"warning\">Warning. Error on publish records</span>";
		if(SHOW_DEBUG) {
			$response->msg .= "<hr>search_options_session_key ($search_options_session_key) not found in search_options session";
		}
	}
	#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], '$_SESSION ++ '.to_string());	

	$options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
		#$options->layout_map = array();
		$options->modo 	 	 = 'edit';
		$options->limit 	 = null;
		$options->offset 	 = 0;
		$options->order_by 	 = false;
			#dump($options, ' options ++ '.to_string());

	$records_data = search::get_records_data($options);
		#dump($records_data, ' records_data ++ '.to_string());
	
	$resolve_references = true;
	$n_records_published= 0;	
	foreach ((array)$records_data->result as $ar_value) foreach ((array)$ar_value as $key => $row) {
		#dump($ar_value2, ' ar_value2 ++ '.to_string());
		$section_id 	= (int)$row['section_id'];
		$section_tipo 	= (string)$row['section_tipo'];
		
		$export_result = tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo, $resolve_references=true);	

		if($export_result->result==true) {
			$n_records_published++;
		}else{
			$response->msg .= $export_result->msg;
			debug_log(__METHOD__." export_result ".to_string(), logger::DEBUG);
		}
	}
	$response->n_records_published = $n_records_published;	

	if ($n_records_published>0) {
		#echo "Published record: $section_id ";
		$response->msg .= sprintf("<span class=\"ok\">Ok. Published %s records successfully</span>",$n_records_published);
		
	}else{
		$response->msg .= "<span class=\"warning\">Warning. Error on publish records. $n_records_published records area publish</span>";
		if(SHOW_DEBUG) {
			#dump($response, ' response ++ '.to_string());;
		}
	}

	if(SHOW_DEBUG) {
		$response->msg .= "<span>Exec in ".exec_time_unit($start_time,'secs')." secs </span>";  //style=\"position:absolute;right:12px;top:8px\"
	}

	return $response;
}//end export_list



/**
* EXPORT_RECORD
*/
function export_record() {
	
	set_time_limit ( $seconds=300 ); // Avoid some infinite loop cases when data is bad formed

	$start_time = start_time();

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error on export_record. ';

	$vars = array('section_tipo','section_id','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
		if (!$section_tipo) {
			$response->msg .= "Sorry. section_tipo is mandatory";
			return $response;
		}
		if (!$section_id) {
			$response->msg .= "Sorry. section_id is mandatory";
			return $response;
		}	
		if (empty($diffusion_element_tipo)) {
			$response->msg .= "Sorry. diffusion_element_tipo is mandatory";
			return $response;
		}

	$result = tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo);

	$response->result = $result->result;
	$response->msg 	  = $result->msg;

	return $response;
}//end export_record



/**
* DIFFUSION_COMPLETE_DUMP
* Hace un exportado general de datos a la web, de la misma forma que lo harías sección por sección, 
* pero en una sola orden (por comodidad)
*/
function diffusion_complete_dump() {

	$start_time = start_time();

	# Write session to unlock session file
	session_write_close();

	#$response = new stdClass();
	#	$response->result 	= false;
	#	$response->msg 		= 'Error on diffusion_complete_dump';

	$response = tool_diffusion::diffusion_complete_dump();

	#$response->msg .= $result->msg;

	/*
		$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string()); 
			#die();	

		
		$ar_de_result=array();
		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $value_obj) {

			# Diffusiion classname (diffusion_mysq, diffusion_rdf, etc..)
			$class_name = $value_obj->class_name;

			include_once(DEDALO_LIB_BASE_PATH .'/diffusion/class.'.$class_name.'.php' );

			$diffusion 	= new $class_name;
			$de_result 	= $diffusion->diffusion_complete_dump( $diffusion_element_tipo, $resolve_references=true );
			
			#$response->msg .= isset($de_result->msg) ? "<br>".$de_result->msg : '';

			

			// let GC do the memory job
			time_nanosleep(0, 10000000); // 10 ms

		}//end foreach ($ar_diffusion_map_elements as $diffusion_element => $value_obj) {
		*/
		
	$response->msg .= sprintf ("<br>Export diffusion elements completed in %s seconds ", exec_time_unit($start_time,'secs') );

	if(SHOW_DEBUG) {
		if (function_exists('bcdiv')) {
			$memory_usage = bcdiv(memory_get_usage(), 1048576, 3);
		}else{
			$memory_usage = memory_get_usage();
		}
		$response->msg .= " <span>MB: ". $memory_usage ."</span>";
	}
	
	return $response;
}//end diffusion_complete_dump



/**
* EXPORT_THESAURUS
*//*
function export_thesaurus() {

	$seconds = 60 * 10; set_time_limit($seconds); 
	
	$start_time = start_time();

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error on export_thesaurus';

	$vars = array('section_tipo','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
		if (!$section_tipo) {
			$response->msg = "<span class=\"error\">Sorry. section_tipo is mandatory</span>";
			return $response;
		}
		if (empty($diffusion_element_tipo)) {
			$response->msg = "<span class=\"error\">Sorry. diffusion_element_tipo is mandatory</span>";
			return $response;
		}

	$ar_prefix 	= json_decode($section_tipo);
	$result 	= tool_diffusion::export_thesaurus($ar_prefix, $diffusion_element_tipo);

	$response->result  = $result->result;
	$response->msg 	  .= $result->msg;

	if(SHOW_DEBUG) {
		if (function_exists('bcdiv')) {
			$memory_usage = bcdiv(memory_get_usage(), 1048576, 3);
		}else{
			$memory_usage = memory_get_usage();
		}
		$response->msg .= "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".$memory_usage."</span>";
	}

	return $response;
}//end export_thesaurus
*/



?>