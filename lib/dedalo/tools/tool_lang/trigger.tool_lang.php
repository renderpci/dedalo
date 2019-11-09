<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* render_component
* @param object $json_data
*/
function render_component($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','modo','lang','section_tipo','role');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);	
	$modo 			= 'tool_lang';
	#$modo 			= 'tool_structuration';

	# COMPONENT	
	$component_obj	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);	
	#dump($component_obj,"component_obj tipo:$tipo, parent:$parent, modo:$modo, lang: $lang");
	#$component_obj->set_variant( tool_lang::$source_variant );


	if ($role==="selector_source") {
		$component_obj->role = "source_lang";
	}	

	# Get component html
	$html = $component_obj->get_html();
	
	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

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
}//end render_component



/**
* update_tool_header 
* @param $caller_component_tipo
* @param $caller_element
* @param $parent
*/
function update_tool_header($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','section_tipo','lang','tool_locator','top_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	
	

	$modelo_name    = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj  = component_common::get_instance($modelo_name,
													$tipo,
													$parent,
													'edit_tool',
													$lang,
													$section_tipo);
	#
	# STATE
	# Create component_state configurated
	$component_state 		= $component_obj->get_component_state( $tool_locator, $component_obj->get_lang() );
	$component_state_html 	= '';
	if ( !empty($component_state) && is_object($component_state) ) {
		$component_state_html = $component_state->get_html();
	}	
	debug_log(__METHOD__." Updated tool header ".to_string(), logger::DEBUG);
	
	$response->result 	= $component_state_html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

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
}//end update_tool_header



/**
* AUTOMATIC TRANSLATION
* @param $source_lang
* @param $target_lang
* @param $source_id
* @param $tipo
* @param $parent
*/
function automatic_translation($json_data) {
	global $start_time;
	
	# Write session to unlock session file
	#session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# mandatory vars
	$vars = array('source_lang','target_lang','tipo','parent','section_tipo','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}	
			#debug_log(__METHOD__." options ".to_string($json_data), logger::DEBUG);
			
	// Options are the same as reveived json_data object
	$options  = $json_data;
	$response = tool_lang::automatic_translation($options);

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
}//end automatic_translation



/**
* PROPAGATE MARKS
*
*/
function propagate_marks() {
	die(" NO ACABADA !!");
	if(!$sourceID || !$targetID) die("propagateMarks: Need more vars ! (sourceID:$sourceID , targetID:$targetID, $texto:$texto");
	if(!isset($texto)) exit();
	
	$html = '';	
	
	# Set and save (save post text)
	$RecordObj_trans	= new RecordObj_trans($targetID);	
	$texto				= TR::limpiezaPOSTtr($texto);
	
	# before save, remove changes in log index /**/	
	if($ar_indexID_click || $confirmAllIndexReview) {	
	require_once( DEDALO_ROOT . '/ind/class.IndexToReview.php');
	
		$RecordObj_ind 		= new RecordObj_ind_tr($targetID);
		
		if($confirmAllIndexReview==1) {
			# delete all indexTo review
			$indexToReviewObj	= new indexToReview($RecordObj_ind,$ar_indexID_click,$texto);			
			$ar_indexID_db		= $indexToReviewObj->get_ar_indexID_db();	 						#$html.= $ar_indexID_db; die($html);#print_r($ar_indexID_db);
			if(is_array($ar_indexID_db)) foreach($ar_indexID_db as $indexID) {
				if($indexID!=$ar_indexID_click)			
				$ar_indexID_click .= 	",$indexID";			
			}
		}
		# delete current array of indexTo review		
		$indexToReviewObj	= new indexToReview($RecordObj_ind,$ar_indexID_click,$texto);			#$html .= " ar_indexID_click: $ar_indexID_click \n";	die($html); #confirmAllIndexReview
		$indexToReviewObj->remove_indexTag_in_current_trans();			
	}
	$RecordObj_trans->set_texto($texto);		
	$save 				 = $RecordObj_trans->Save(); 	#var_dump($save);	
	
	# save confirm msg
	if($save!==true)	 die("Error on propagateMarks save ! [$save] Text is NOT saved");
	$html 				.= "\n\n $propagar_title $marcas_title OK \n\n";
	
	# Propagate tc (get saved text, propagate tcs and save text again)
	# if two texts source and translated have the same  number of paragraphs
	$TransPropagatorObj	 = new TransPropagator($RecordObj_trans,$rpAlltags);
	$propagateTC		 = $TransPropagatorObj->propagateTC();	
	$propagateIndex		 = $TransPropagatorObj->propagateIndex();			
	  
	
	$sourceNumberOfParagraphs	= $TransPropagatorObj->get_sourceNumberOfParagraphs();
	$targetNumberOfParagraphs	= $TransPropagatorObj->get_targetNumberOfParagraphs();
	
	if($sourceNumberOfParagraphs != $targetNumberOfParagraphs)	
	$html 				.= " \n PROPAGATOR ALERT: \n Paragraphs inconsistency founded ! \n Source paragraphs: $sourceNumberOfParagraphs \n Target paragraphs: $targetNumberOfParagraphs. \n Text is not sync. \n Solve this problem ASAP to can propagate marks. \n\n ";

	if($TransPropagatorObj->get_html_log() && SHOW_DEBUG==true)
	$html 				.= " \n PROPAGATOR LOG: \n".$TransPropagatorObj->get_html_log();
	
	exit(msgJS($html));
}//end propagate_marks



/**
* OPEN_STRUCTURATION_SELECTOR
* @return object $response
*/
function open_structuration_selector($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','section_id','component_tipo','lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$source_lang 	= component_text_area::force_change_lang($component_tipo, $section_id, 'lang', $lang, $section_tipo);
	if ($source_lang===$lang) {
		$response->msg 		= "Warning. Lang ($lang) and source lang ($source_lang) are the same..";
		return $response;
	}

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'list',
													 $source_lang,
													 $section_tipo);

	$dato = $component->get_dato();
	$dato = component_text_area::resolve_titles($dato, $component_tipo, $section_tipo, $section_id, null, $source_lang, true);
	$dato = TR::addTagImgOnTheFly($dato);
	$response->result 	= $dato;
	$response->msg = 'OK. Loaded component source lang ($source_lang)';

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
}//end open_structuration_selector



?>