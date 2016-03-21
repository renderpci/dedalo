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

	$vars = array('section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$section_tipo) {
		exit("Sorry. section_tipo is mandatory");
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
	
	$diffusion 			= new diffusion();
	$result 			= false;
	$resolve_references = true;
	$n_records_published= 0;
	foreach ((array)$records_data->result as $ar_value) foreach ((array)$ar_value as $key => $row) {
		#dump($ar_value2, ' ar_value2 ++ '.to_string());
		$section_id 	= (int)$row['section_id'];
		$section_tipo 	= (string)$row['section_tipo'];

		$options = new stdClass();
			$options->section_tipo = $section_tipo;
			$options->section_id   = $section_id;

		$result = $diffusion->update_record( $options, $resolve_references );

		if($result) $n_records_published++;
	}
	

	if ($result) {
		#echo "Published record: $section_id ";
		printf("<span class=\"ok\">Ok. Published %s records successfully</span>",$n_records_published);
		
	}else{
		echo "<span class=\"warning\">Warning. Error on publish records</span>";
		if(SHOW_DEBUG) {
			dump($result, ' result ++ '.to_string());;
		}
	}

	if(SHOW_DEBUG) {

		echo "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>";  //style=\"position:absolute;right:12px;top:8px\"
	}
	exit();

}//end export_list





/**
* EXPORT_RECORD
*/
if($mode=='export_record') { 	
	
	$start_time = start_time();
	
	set_time_limit ( 120 ); // Avoid some infinite loop cases when data is bad formed

	$vars = array('section_tipo','section_id');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (!$section_tipo) {
		exit("Sorry. section_tipo is mandatory");
	}
	if (!$section_id) {
		exit("Sorry. section_id is mandatory");
	}
	if (strpos($section_id, ',')!==false) {
		$ar_section = explode(',', $section_id);
	}else{
		$ar_section = array( $section_id );
	}

	#
	# Close session to liberate browser
	session_write_close();
	
	
	$diffusion = new diffusion();
	
	foreach ($ar_section as $current_section_id) {		

		$options = new stdClass();
			$options->section_tipo = (string)$section_tipo;
			$options->section_id   = (int)$current_section_id;
				#dump($options, ' options ++ '.to_string());	

		$result = $diffusion->update_record( $options, $resolve_references=true );
			#dump($result, " result ".to_string() );

		if ($result) {
			#echo "Published record: $section_id ";
			printf("<span class=\"ok\">Ok. Published record ID %s successfully</span>",$current_section_id);
			
		}else{
			echo "Warning. Error on publish record $current_section_id";
			if(SHOW_DEBUG) {
				dump($result, ' result ++ '.to_string());;
			}
		}

	}//end foreach ($ar_section as $current_section_id) {

	

	if(SHOW_DEBUG) {
		dump($diffusion->ar_published_records, 'DEBUG $ar_published_records ++ '.to_string());
		echo "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>"; // style=\"position:absolute;right:12px;top:8px\"
	}
	
	exit();

}//end export_record




/**
* EXPORT_THESAURUS
*/
if($mode=='export_thesaurus') {

	$seconds = 60 * 10; 	set_time_limit ( $seconds ); 
	
	$start_time = start_time();
	

	$vars = array('section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (!$section_tipo) {
		exit("Sorry. section_tipo is mandatory");
	}
	//dump($section_tipo, ' section_tipo ++ '.to_string()); die();
	$ar_prefix = json_decode($section_tipo);
			

	foreach ((array)$ar_prefix as $prefix) {
		
		$diffusion = new diffusion();
		
		$options = new stdClass();
			$options->section_tipo = $prefix;	

		$result = $diffusion->update_thesaurus( $options );
		#dump($result, " result ".to_string() );

		if ($result) {
			#echo "Published record: $section_id ";
			printf("<div class=\"ok\">Ok. Published thesaurus %s successfully</div>",$prefix);
			
		}else{
			echo "Warning. Error on publish thesaurus $prefix";
			if(SHOW_DEBUG) {
				dump($result, ' result ++ '.to_string());;
			}
		}

	}//end foreach ($ar_prefix as $prefix) {

	

	if(SHOW_DEBUG) {
		echo "<span>Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ".bcdiv(memory_get_usage(), 1048576, 3)."</span>"; // style=\"position:absolute;right:12px;top:8px\"
	}
	
	exit();

}//end export_thesaurus
?>