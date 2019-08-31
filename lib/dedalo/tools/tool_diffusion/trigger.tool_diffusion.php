<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
include( DEDALO_LIB_BASE_PATH .'/diffusion/class.diffusion.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
#ignore_user_abort(true);

# Disable logging activity and time machine # !IMPORTANT
logger_backend_activity::$enable_log = false;



/**
* EXPORT_LIST
*/
function export_list($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','diffusion_element_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$seconds = 60 * 15; set_time_limit($seconds);

	# Write session to unlock session file
	session_write_close();

	// diffusion_element
		$RecordObj_dd		  = new RecordObj_dd($diffusion_element_tipo);
		$propiedades 		  = $RecordObj_dd->get_propiedades(true);	
		$diffusion_class_name = $propiedades->diffusion->class_name; 

	try{
		# Reset msg
		$response->msg = '';	

		# SEARCH_OPTIONS
			$search_options_id    = $section_tipo; // section tipo like oh1
			$saved_search_options = section_records::get_search_options($search_options_id);
		
		# SEARCH_QUERY_OBJECT
			# Use saved search options (deep cloned to avoid propagation of changes !)
			$search_options 	 = unserialize(serialize($saved_search_options));
			$search_query_object = $search_options->search_query_object;
				$search_query_object->limit   = 0;  // unset limit
				$search_query_object->offset  = 0;  // unset offset
				$search_query_object->order   = false;  // unset order
				$search_query_object->select  = []; // unset select
		
		# SEARCH
			$search  = new search($search_query_object);
			$rows_data 		 	 = $search->search();
		
		
		$resolve_references = true;
		$n_records_published= 0;	
		foreach ((array)$rows_data->ar_records as $row) {
			
			$section_id 	= (int)$row->section_id;
			$section_tipo 	= (string)$row->section_tipo;
			
			// tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo, $resolve_references=true);
			$export_result = tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo, true, $rows_data->ar_records);	

			if($export_result->result==true) {
				$n_records_published++;
			}else{
				$response->msg .= $export_result->msg;
				debug_log(__METHOD__." export_result ".to_string($export_result), logger::DEBUG);
			}

			if ($diffusion_class_name==='diffusion_rdf') {
				break; // Only one iteration is needed
			}
		}
		$response->n_records_published = $n_records_published;	

		if ($n_records_published>0) {
			#echo "Published record: $section_id ";
			$response->result = true;
			if ($diffusion_class_name==='diffusion_rdf') {
				$response->msg .= to_string($export_result->msg);
			}else{
				$response->msg .= sprintf("<span class=\"ok\">Ok. Published %s records successfully</span>",$n_records_published);
			}			
			
		}else{
			$response->result = false;
			$response->msg .= "<span class=\"warning\">Warning. Error on publish records. $n_records_published records area publish</span>";
			if(SHOW_DEBUG) {
				#dump($response, ' response ++ '.to_string());;
			}
		}

		// Update schema data always
		// $publication_schema_result = tool_diffusion::update_publication_schema($diffusion_element_tipo);

		
	}catch (Exception $e) {
		$response->result = false;
		$response->msg 	  = 'EXCEPTION: ' . $e->getMessage();
	}


	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'secs')." secs";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			// $debug->publication_schema = $publication_schema_result;

		$response->debug = $debug;
	}


	return (object)$response;
}//end export_list



/**
* EXPORT_RECORD
*/
function export_record($json_data) {
	global $start_time;

	$seconds = 60 * 5; set_time_limit($seconds); // Avoid some infinite loop cases when data is bad formed	

	# Write session to unlock session file
	session_write_close();	

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','section_id','diffusion_element_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	
	try{
		$result = tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo);
		
		$response->result = $result->result;
		$response->msg 	  = $result->msg;

		// Update schema data always
		// $publication_schema_result = tool_diffusion::update_publication_schema($diffusion_element_tipo);
		
	}catch (Exception $e) {
		$response->result = false;
		$response->msg 	  = 'EXCEPTION: ' . $e->getMessage();
	}
	

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			// $debug->publication_schema = $publication_schema_result;

		$response->debug = $debug;
	}

	return (object)$response;
}//end export_record



/**
* DIFFUSION_COMPLETE_DUMP
* Hace un exportado general de datos a la web, de la misma forma que lo harías sección por sección, 
* pero en una sola orden (por comodidad)
*/
function diffusion_complete_dump($json_data) {
	global $start_time;

	$seconds = 60 * 30; set_time_limit($seconds); // Avoid some infinite loop cases when data is bad formed

	# Write session to unlock session file
	session_write_close();
	

	$response = (object)tool_diffusion::diffusion_complete_dump();

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
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end diffusion_complete_dump



/**
* EXPORT_THESAURUS
*//*
function export_thesaurus($json_data) {

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