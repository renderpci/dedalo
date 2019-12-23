<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
require_once( dirname(__FILE__) .'/class.tool_calendar.php');  
/*
	$tool_name 	  = 'tool_calendar';
	$ar_tool_data = $_SESSION['dedalo4'][$tool_name]
	if( isset($ar_tool_data['custom_script']) ) {
		$custom_class = 'class.'.pathinfo($ar_tool_data['custom_script'])['basename'] .'.php';
		if (file_exists(DEDALO_LIB_BASE_PATH . $custom_class)) {
			require_once(DEDALO_LIB_BASE_PATH . $custom_class);
		}	
	}
*/

# login verify
	if(login::is_logged()!==true) {
		$string_error = "Auth error: please login";
		print dd_error::wrap_error($string_error);
		die();
	}

# set vars
	$vars = array('mode','options','start','end','arr_events');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");



	
/**
* GET_EVENTS
*
*/
if ($mode=='get_events') {

	// Require our Event class and datetime utilities
	require(DEDALO_ROOT . '/lib/fullcalendar/demos/php/utils.php');

	$options = json_decode($options);	// Decode received string
		#dump($options," options");	

	// Section tipo like 'mupreva106' for 'Turnos'
	if (empty($options->tipo)) {
		exit("Error. options->tipo is mandatory");
	}
	if (empty($options->section_tipo)) {
		exit("Error. options->section_tipo is mandatory");
	}
	$section_tipo = $options->section_tipo;
	
	#
	# Tool vars (fixed in cotroller)
		$tool_name = 'tool_calendar';
		$tool_vars = (object)$_SESSION['dedalo4'][$tool_name][$options->tipo];
		if (empty($tool_vars->tipo)) { // Same as $options->tipo
			exit("Error. tipo is mandatory");
		}
		if (empty($tool_vars->event->title)) {
			exit("Error. event_title is mandatory");
		}
		if (empty($tool_vars->event->start)) {
			exit("Error. event_start is mandatory");
		}
		if (empty($tool_vars->event->end)) {
			exit("Error. event_end is mandatory");
		}

	#
	# Range
		if (empty($start) || empty($end)) {
			error_log("Error. range is mandatory");
			exit("Error. range is mandatory");
		}
		// Parse the start/end parameters.
		// These are assumed to be ISO8601 strings with no time nor timezone, like "2013-12-29".
		// Since no timezone will be present, they will parsed as UTC.
		$range_start = parseDateTime($start);
		$range_end 	 = parseDateTime($end);
			#dump($range_start,"range_start"); dump($range_end,"range_end");
	
	// Parse the timezone parameter if it is present.
	$timezone = null;
	if (isset($timezone)) {
		$timezone = new DateTimeZone($timezone);
	}

	$input_arrays = array();

	#
	# DATA BACKGROUND
		if (!empty($tool_vars->backgound_events_tipo)) {

			#$ar_all_section_records = (array)section::get_ar_all_section_records_unfiltered($tool_vars->backgound_events_tipo);
			#foreach ($ar_all_section_records as $current_section_id) {
			$result = section::get_resource_all_section_records_unfiltered($tool_vars->backgound_events_tipo);
			while ($rows = pg_fetch_assoc($result)) {			

				$current_section_id = $rows['section_id'];

				# title
				$component_tipo = $tool_vars->backgound_event_title;
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
				$title 		= $component->get_dato();

				# start
				$component_tipo = $tool_vars->backgound_event_start;
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
				$start 		= $component->get_dato();

				# end
				$component_tipo = $tool_vars->backgound_event_end;
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
				$end 		= $component->get_dato();

				$event = array(
					'title' 	=> $title,
					'start' 	=> $start,
					'end'   	=> $end,
					'section_id' => $current_section_id,
					'rendering' => 'background',	// IMPORTANT
					'id'		=> 'available'
					);	

				$input_arrays[] = $event;
			}
		}


	#
	# DATA
		#$ar_all_section_records = (array)section::get_ar_all_section_records_unfiltered($tool_vars->tipo);
		#dump($ar_all_section_records," ar_all_section_records");
		#foreach ($ar_all_section_records as $current_section_id) {
		$result = section::get_resource_all_section_records_unfiltered($tool_vars->tipo);
		while ($rows = pg_fetch_assoc($result)) {		

			$current_section_id = $rows['section_id'];

			# title
			$component_tipo = $tool_vars->event->title;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
			$title 		= $component->get_dato();

			# start
			$component_tipo = $tool_vars->event->start;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
			$start 		= $component->get_dato();

			# end
			$component_tipo = $tool_vars->event->end;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component  = component_common::get_instance($modelo_name,$component_tipo,$current_section_id,'edit',DEDALO_DATA_NOLAN,$section_tipo);
			$end 		= $component->get_dato();

			/*
			$event = new stdClass();
				$event->title 	  = $title;
				$event->start 	  = $start;
				$event->end   	  = $end;
				$event->section_id = $current_section_id;
			*/
			$event = array(
				'title' 	=> $title,
				'start'	 	=> $start,
				'end' 		=> $end,
				'section_id'=> $current_section_id
				);
			if (!empty($tool_vars->backgound_events_tipo)) {
				$event['constraint'] = 'available';
			}

			$input_arrays[] = $event;
		}


	// Accumulate an output array of event data arrays.
	$output_arrays = array();
	foreach ($input_arrays as $array) {

		// Convert the input array into a useful Event object
		$event = new Event($array, $timezone);

		// If the event is in-bounds, add it to the output
		if ($event->isWithinDayRange($range_start, $range_end)) {
			$output_arrays[] = $event->toArray();
		}
	}
	#dump($output_arrays,"output_arrays ");

	// Send JSON to the client.
	echo json_encode($output_arrays);

}//end get_events



/**
* SAVE_ONE_EVENT
*/
function save_one_event( $options ) {
	// Require our Event class and datetime utilities
	# require(DEDALO_ROOT . '/lib/fullcalendar/demos/php/utils.php');

	#$options = json_decode($options);	// Decode received string
	#dump($options, ' options (request)');

	// Section tipo like 'mupreva106' for 'Turnos'
	if (empty($options->tipo) ) {
		$msg = "Error. options->tipo is mandatory";
		error_log($msg);
		exit($msg);
	}
	if (empty($options->section_tipo)) {
		$msg = "Error. options->section_tipo is mandatory";
		error_log($msg);
		exit($msg);
	}
	$section_tipo = $options->section_tipo;
	
	#
	# Tool vars (fixed in cotroller)
		$tool_name = 'tool_calendar';
		$tool_vars = (object)$_SESSION['dedalo4'][$tool_name][$options->tipo];	
		if (empty($tool_vars->tipo)) { // Same as $options->tipo
			exit("Error. tipo is mandatory");
		}
		if (empty($tool_vars->event->title)) {
			exit("Error. event_title is mandatory");
		}
		if (empty($tool_vars->event->start)) {
			exit("Error. event_start is mandatory");
		}
		if (empty($tool_vars->event->end)) {
			exit("Error. event_end is mandatory");
		}

	if(SHOW_DEBUG) {
		#dump($options, ' options (request)');
		#dump($tool_vars, ' tool_vars (session)');
	}

	#
	# OPTIONS		
		# Verify options		
		if (empty($options->title)) {
			exit("Error. title is mandatory");
		}
		if (empty($options->start)) {
			exit("Error. start is mandatory");
		}
		if (empty($options->end)) {
			exit("Error. end is mandatory");
		}
		if (empty($options->section_id)) {
			# Create new record
			$section = section::get_instance(null, $tool_vars->tipo);
			$section_id = $section->Save();

			if(SHOW_DEBUG) {
				#dump($section_id, ' section_id created new');;
			}

			# PROJECT (only once, when section is created)
			$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($tool_vars->tipo, 'component_filter', true);
			if (empty($ar_component_tipo[0])) {
				throw new Exception("Error Processing Request. Component filter not found", 1);		
			}
			$component_tipo = $ar_component_tipo[0];
			$component  = component_common::get_instance('component_filter', $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo); # Already saves default project when load in edit mode		
			# Already saves default project when load in edit mode
		}else{
			$section_id = (int)$options->section_id;
		}
		if(SHOW_DEBUG) {
			#dump($section_id," section_id"); #die();
		}

	
		#dump($options," options");
		#dump($tool_vars," tool_vars");
		#die();
		$ar_exclude = array('section_id','tipo','section_tipo');
		foreach ($options as $key => $value) {
			if (in_array($key, $ar_exclude)) continue; # Skip this keys

			$component_tipo = $tool_vars->event->$key;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component  	= component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
			$component->set_dato($value);
			$component->Save();
		}

	return (int)$section_id;
	/*
	echo "<span>Saved event $options->section_id <br>
	title:$options->title, start:$options->start, end:$options->end [$options->section_id]</span>";
	*/
}


/**
* SAVE_EVENT
* @param string $options . Event object encoded in JSON
*/
if ($mode=='save_event') {

	$options = json_decode($options);	// Decode received string
	$result  = save_one_event( (object)$options );

	echo $result;

}//end save_event



/**
* SAVE_ARRAY_EVENTS
* @param array $arr_events Array of objects encoded in JSON
*/
if ($mode=='save_array_events') {

	if (empty($arr_events)) {
		exit("Error. arr_events is mandatory");
	}

	$arr_events = json_decode($arr_events);
	if(SHOW_DEBUG) {
		#dump($arr_events, ' arr_events');;
	}

	foreach ($arr_events as $options) {		
		$result  = save_one_event( (object)$options );
			#dump($result,"result ");
	}
	#echo $result;

}//end save_array_events



/**
* DELETE_EVENT_RECORD
*
*/
if ($mode=='delete_event_record') {

	$options = json_decode($options);	// Decode received string
		#dump($options," options");	

	// Section tipo like 'mupreva106' for 'Turnos'
	if (empty($options->tipo)) {
		exit("Error. options->tipo is mandatory");
	}
	if (empty($options->section_tipo)) {
		exit("Error. options->section_tipo is mandatory");
	}
	$section_tipo = $options->section_tipo;

	#
	# Tool vars (fixed in cotroller)
		$tool_name = 'tool_calendar';
		$tool_vars = (object)$_SESSION['dedalo4'][$tool_name][$options->tipo];	
		if (empty($tool_vars->tipo)) { // Same as $options->tipo
			exit("Error. tipo is mandatory");
		}
		if (empty($tool_vars->event->title)) {
			exit("Error. event_title is mandatory");
		}
		if (empty($tool_vars->event->start)) {
			exit("Error. event_start is mandatory");
		}
		if (empty($tool_vars->event->end)) {
			exit("Error. event_end is mandatory");
		}

	#
	# OPTIONS			
		# Verify options		
		if (empty($options->section_id)) {
			exit("Error. section_id is mandatory");
		}

	$section = section::get_instance($options->section_id, $tool_vars->tipo);
	$section->Delete('delete_record');

	echo "<span>Deleted event $options->section_id </span>";

}//end remove_event











/**
* LOAD_EVENT_RECORD
*/
if ($mode=='load_event_record DEPRECATED') {

	$options = json_decode($options);	// Decode received string
	
	# Verify section tipo
	if (empty($options->tipo)) {
		exit("Error. tipo is mandatory");
	}

	if (empty($options->id)) {
		$options->id=null;
	}
	#dump($options," options");#exit();
	
	# Section
	$section = section::get_instance($options->id, $options->tipo, 'edit');
	$html 	 = $section->get_html();

	echo $html;

}//end load_event_record





?>