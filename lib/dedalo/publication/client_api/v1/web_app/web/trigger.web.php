<?php
/**
* TRIGGER
*/
# CONFIG
	$start_time=microtime(1);
	include(dirname(dirname(__FILE__)) . '/config/config.php');	

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	common::trigger_manager();



/**
* LOAD_VIDEO_SEARCH_FREE
* @return object $response
*/
function load_video_search_free($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('q','lang','section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	#$q = (string)($json_data->q);
	$q = htmlspecialchars_decode($q); // Transform &quot;La Pirenaica&quot; to "La Pirenaica"

	# Search	
	$options = new stdClass();
		$options->dedalo_get 		= 'free_search';
		$options->code 				= API_WEB_USER_CODE;
		$options->q 				= (string)$q;
		$options->search_mode 		= 'full_text_search';
		$options->lang 				= $lang;
		$options->filter 			= 'section_id = ' . $section_id;
		$options->list_fragment 	= false;
		$options->video_fragment 	= true;
		$options->fragment_terms 	= false; // true
		$options->image_type 		= 'posterframe';

	# Http request in php to the API
	$response = json_web_data::get_data($options);


	# full_reel
	$options = new stdClass();
		$options->dedalo_get 		= 'full_reel';
		$options->lang 				= $lang;
		$options->av_section_id 	= $section_id;

	$response->full_reel = json_web_data::get_data($options);


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
}//end load_video_search_free



/**
* LOAD_VIDEO_SEARCH_THEMATIC
* @return object $response
*/
function load_video_search_thematic($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('lang','index_locator','locator_key','context_data');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='locator_key' || $name==='context_data') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$locator_key 	  = (int)$locator_key;
	$selected_locator = $index_locator[$locator_key];

	# Search fragment info
	$options = new stdClass();
		$options->dedalo_get 		= 'fragment_from_index_locator';
		$options->lang 				= $lang;
		$options->index_locator 	= $selected_locator;

	# Http request in php to the API
	$response = json_web_data::get_data($options);

	$context_data = true; // Forced
	# Context data. Optionally, get interview and informant data from locator
	# {"type":"dd96","tag_id":"1","section_id":"2","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"2","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}
	if ($context_data!==false) {

		# Search fragment info
		$options = new stdClass();
			$options->dedalo_get 		= 'full_reel';
			$options->lang 				= $lang;
			$options->av_section_id 	= $selected_locator->section_id;

		$response->full = json_web_data::get_data($options);
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
}//end load_video_search_thematic



/**
* load_video_interview
* @return object $response
*/
function load_video_interview($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('lang','av_section_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='locator_key' || $name==='context_data') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	# Search fragment info
	$options = new stdClass();
		$options->dedalo_get 		= 'full_reel';
		$options->lang 				= $lang;
		$options->av_section_id		= $av_section_id;				
		$options->image_type 		= 'posterframe';
		$options->terms 			= false;

	# Http request in php to the API
	$response = json_web_data::get_data($options);


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
}//end load_video_interview



/**
* LOAD_MORE_ITEMS
* @return object $response
*/
function load_more_items($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('template_map');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	
	$row = new stdClass();
		$row->{$template_map->colname} = $template_map->ar_value;

	$page = new page();
		$page->area_name = $template_map->area_name;
	$html = $page->get_portal_value($template_map, $row, (int)$template_map->max_records, (int)$template_map->offset);

	$response->result 	= true;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	$response->html 	= $html;

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
}//end load_more_items



/**
* THESAURUS_AUTOCOMPLETE +++++ +++++++ ++++ ! NO usado todavía !!
* Only print string formatted to js autocomplete call
* @return object $response
*/
function thesaurus_autocomplete($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('q');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	$options = new stdClass();
		$options->dedalo_get 	= 'thesaurus_autocomplete';
		$options->q 			= $q;
		$options->lang 			= WEB_CURRENT_LANG_CODE;
		$options->limit 		= 30;

	$rows_data = json_web_data::get_data($options);
		dump($rows_data, ' rows_data ++ '.to_string());

	$html='';
	foreach ((array)$rows_data->result as $key => $term) {
		$html .= "$term|$term\n";
	}	

	$response->result 	= true;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
	$response->html 	= $html;


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
}//end thesaurus_autocomplete



?>