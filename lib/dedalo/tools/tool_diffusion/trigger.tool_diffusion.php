<?php
/**
* TRIGGER TOOL_DIFFUSION
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH .'/diffusion/class.diffusion.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");



# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");




/**
* EXPORT_LIST
*/
if($mode=='export_list') {
	
	$start_time = start_time();

	$seconds = 60 * 10; set_time_limit($seconds); 

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$vars = array('section_tipo','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$section_tipo) {
		$response->msg = "Sorry. section_tipo is mandatory";
		echo json_encode($response);
		exit();
	}
	if (!$diffusion_element_tipo) {
		$response->msg = "Sorry. diffusion_element_tipo is mandatory";
		echo json_encode($response);
		exit();
	}	

	$search_options_key = 'section_'.$section_tipo;
	# dump($_SESSION['dedalo4']['config']['search_options'][$search_options_key], '$_SESSION ++ '.to_string());
	if ( !isset($_SESSION['dedalo4']['config']['search_options'][$search_options_key]) ) {
		echo "<span class=\"warning\">Warning. Error on publish records</span>";
		if(SHOW_DEBUG) {
			echo "<hr>search_options_key ($search_options_key) not found in search_options session";
		}
	}
	#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_key], '$_SESSION ++ '.to_string());	

	$options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_key]);
		#$options->layout_map = array();
		$options->modo 	 	 = 'edit';
		$options->limit 	 = null;
		$options->offset 	 = 0;
		$options->order_by 	 = false;
			#dump($options, ' options ++ '.to_string());

	$records_data = search::get_records_data($options);
		#dump($records_data, ' records_data ++ '.to_string());

	#
	# Close session to liberate browser
	session_write_close();	
	
	
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
		$response->msg .= "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";  //style=\"position:absolute;right:12px;top:8px\"
	}

	echo json_encode($response);
	exit();
}//end export_list





/**
* EXPORT_RECORD
*/
if($mode=='export_record') {
	
	set_time_limit ( $seconds=300 ); // Avoid some infinite loop cases when data is bad formed

	$start_time = start_time();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$vars = array('section_tipo','section_id','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (!$section_tipo) {
		$response->msg = "Sorry. section_tipo is mandatory";
		echo json_encode($response);
		exit();
	}
	if (!$section_id) {
		$response->msg = "Sorry. section_id is mandatory";
		echo json_encode($response);
		exit();
	}	
	if (empty($diffusion_element_tipo)) {
		$response->msg = "Sorry. diffusion_element_tipo is mandatory";
		echo json_encode($response);
		exit();
	}

	#
	# Close session to liberate browser
	session_write_close();

	$result = tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo);

	$response->result = $result->result;
	$response->msg 	  = $result->msg;

	echo json_encode($response);
	exit();
}//end export_record




/**
* EXPORT_THESAURUS
*/
if($mode=='export_thesaurus') {

	$seconds = 60 * 10; set_time_limit($seconds); 
	
	$start_time = start_time();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	$vars = array('section_tipo','diffusion_element_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (!$section_tipo) {
		$response->msg = "<span class=\"error\">Sorry. section_tipo is mandatory</span>";
		echo json_encode($response);
		exit();
	}
	if (empty($diffusion_element_tipo)) {
		$response->msg = "<span class=\"error\">Sorry. diffusion_element_tipo is mandatory</span>";
		echo json_encode($response);
		exit();
	}

	$ar_prefix 	= json_decode($section_tipo);
	$result 	= tool_diffusion::export_thesaurus($ar_prefix, $diffusion_element_tipo);

	$response->result  = $result->result;
	$response->msg 	  .= $result->msg;

	if(SHOW_DEBUG) {
		$response->msg .= "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";
	}

	echo json_encode($response);
	exit();
}//end export_thesaurus




/**
* DIFFUSION_COMPLETE_DUMP
* Hace un exportado general de datos a la web, de la misma forma que lo harías sección por sección, 
* pero en una sola orden (por comodidad)
*/
if ($mode=='diffusion_complete_dump') {

	$start_time = start_time();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

	session_write_close(); // Frees the browser page

	$result = tool_diffusion::diffusion_complete_dump();

	$response->msg .= $result->msg;

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
		$response->msg .= " <span>MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";
	}
	
	echo $response->msg; // Not use json output here. Only string
	exit();
}//end diffusion_complete_dump






?>