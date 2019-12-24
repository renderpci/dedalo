<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH .'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* LOAD TARGET COMPONENT (RIGHT SIDE)
* @param $source_tipo
* @param $target_tipo
* @param $section_id
* @param $section_tipo
*/
function pdf_automatic_transcriptionXXX($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('id','parent','dato','tipo','lang','source_lang','target_lang', 'section_id', 'section_tipo', 'source_tipo', 'target_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
		

		#
		# FUNCTIONS
		#
		# VALID_UTF8
		# utf8 encoding validation developed based on Wikipedia entry at:
		# http://en.wikipedia.org/wiki/UTF-8
		# Implemented as a recursive descent parser based on a simple state machine
		# copyright 2005 Maarten Meijer
		# This cries out for a C-implementation to be included in PHP core	
		function valid_utf8($string) {
			$len = strlen($string);
			$i = 0;    
			while( $i < $len ) {
				$char = ord(substr($string, $i++, 1));
				if(valid_1byte($char)) {    // continue
					continue;
				} else if(valid_2byte($char)) { // check 1 byte
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
				} else if(valid_3byte($char)) { // check 2 bytes
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
				} else if(valid_4byte($char)) { // check 3 bytes
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
					if(!valid_nextbyte(ord(substr($string, $i++, 1))))
						return false;
				} // goto next char
			}
			return true; // done
		}
		function valid_1byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0x80) == 0x00;
		}	
		function valid_2byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xE0) == 0xC0;
		}
		function valid_3byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xF0) == 0xE0;
		}
		function valid_4byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xF8) == 0xF0;
		}	
		function valid_nextbyte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xC0) == 0x80;
		}
		# UTF8_CLEAN
		function utf8_clean($string, $control = false) {
		    $string = iconv('UTF-8', 'UTF-8//IGNORE', $string);
		    return $string;

		    if ($control === true)
		    {
		        return preg_replace('~\p{C}+~u', '', $string);
		    }

		    return preg_replace(array('~\r\n?~', '~[^\P{C}\t\n]+~u'), array("\n", ''), $string);
		}


	#
	# TEST ENGINE PDF TO TEXT
	if (defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')===false) {		
		$response->msg = 'Error. Request failed ['.__FUNCTION__.'] config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined';
		return $response;
	}else{
		$transcription_engine = trim(shell_exec('type -P '.PDF_AUTOMATIC_TRANSCRIPTION_ENGINE));
		if (empty($transcription_engine)) {
			$response->msg = 'Error. Request failed ['.__FUNCTION__.'] daemon engine not found';
			return $response;
		}
	}

	$component_pdf  = component_common::get_instance("component_pdf",
													 $source_tipo,
													 $section_id,
													 "edit",
													 DEDALO_DATA_LANG,
													 $section_tipo);
	$path_pdf 		= $component_pdf->get_pdf_path();

	#
	# FILE TEXT FROM PDF
	$filename 	= substr($path_pdf, 0, -4) .'.txt';
	if(SHOW_DEBUG) {
		error_log("filename: $filename");
	}
	$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $path_pdf";
	$output   = shell_exec( $command );			# Generate text version file in same dir as pdf

	if (!file_exists($filename)) {		
		$response->msg = 'Error. Request failed ['.__FUNCTION__.'] Text file not found';
		return $response;
	}
	$pdf_text = file_get_contents($filename);	# Read current text file
		
		#
		# TEST STRING VALUE IS VALID
		# Test is valid utf8
		$test_utf8 = valid_utf8($pdf_text);
		if (!$test_utf8) {
			error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		}		

		# Remove non utf8 chars
		$pdf_text = utf8_clean($pdf_text);

		# Test JSON conversion before save
		$pdf_text 	= json_handler::encode($pdf_text);		
		if (!$pdf_text) {			
			$response->msg = 'Error. Request failed ['.__FUNCTION__.'] String is not saved because format encoding is wrong';
			return $response;
		}		
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		#echo "\n pdf_text: ".$pdf_text;
	
	# Check empty text
	if (empty($pdf_text)) {
		$response->msg = 'Error. Request failed ['.__FUNCTION__.'] Empty text';
		return $response;
	}

	#
	# PAGES TAGS	
	$pages = explode("", $pdf_text);
	#dump($pages,"pages ");die();
	$i=1;
	$pdf_text='';
	foreach ($pages as $current_page) {		
	    $pdf_text .= '[page-n-'. $i .']';
	    $pdf_text .= '<br>';
	    $pdf_text .= nl2br($current_page);
	    $i++;
	}	


	#
	# TARGET TEXT AREA
	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($target_tipo,true);
	$component_text_area = component_common::get_instance(	$modelo_name, //'component_text_area',
															$target_tipo,
															$section_id,
															'edit',
															DEDALO_DATA_LANG,
															$section_tipo);
	$component_text_area->set_dato($pdf_text);
	$component_text_area->Save(false, false);


	//dump($component_text_area,"component_text_area - target_tipo: $target_tipo - section_id: $section_id");
	$response->result 	= true;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {

		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			$degbug->n_chars 	= strlen($pdf_text);
			$debug->path_pdf 	= $path_pdf;
			$debug->command 	= $command;
			$degbug->output 	= $output;

		$response->debug = $debug;
	}
	
	return (object)$response;
}//end pdf_automatic_transcription



?>