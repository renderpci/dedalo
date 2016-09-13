<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* LOAD TARGET COMPONENT (RIGHT SIDE)
* @param $source_tipo
* @param $target_tipo
* @param $section_id
* @param $section_tipo
*/
if($mode=='pdf_automatic_transcription') {

	$vars = array('id','parent','dato','tipo','lang','source_lang','target_lang', 'section_id', 'section_tipo', 'source_tipo', 'target_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

	if (empty($section_id) || empty($section_tipo) || empty($source_tipo) || empty($target_tipo)) {
		if (SHOW_DEBUG) {
			dump($_REQUEST);
		}
		throw new Exception("Error Processing Request: Unable load_source_component ! (Few vars1)", 1);
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

	if(SHOW_DEBUG) {
		$start_time = microtime(true);
	}

	#
	# TEST ENGINE PDF TO TEXT
	if (defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')===false) {
		exit("Error on pdf_automatic_transcription: config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined");
	}else{
		$transcription_engine = trim(shell_exec('type -P '.PDF_AUTOMATIC_TRANSCRIPTION_ENGINE));
		if (empty($transcription_engine)) {
			exit("Error on pdf_automatic_transcription: daemon engine not found");
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
		exit("Error on pdf_automatic_transcription: Text file not found");
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
			die("Error: String is not saved because format encoding is wrong");
		}		
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		#echo "\n pdf_text: ".$pdf_text;
	

	if (empty($pdf_text)) {
		exit("Error on pdf_automatic_transcription: Empty text");
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
	$component_text_area = component_common::get_instance('component_text_area', $target_tipo, $section_id, 'edit', DEDALO_DATA_LANG, $section_tipo);
	$component_text_area->set_dato($pdf_text);
	$component_text_area->Save(false, false);


	if(SHOW_DEBUG) {
		$total=round(microtime(1)-$start_time,3);
		$n_chars = strlen($pdf_text);
		error_log(__METHOD__." total time: $total - n_chars:$n_chars");
	}

	//dump($component_text_area,"component_text_area - target_tipo: $target_tipo - section_id: $section_id");
	echo "ok";
	exit();

}//end pdf_automatic_transcription



/**
* CHANGE_TEXT_EDITOR_LANG
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='change_text_editor_lang') {

	$vars = array('tipo','parent','section_tipo','lang');
		foreach($vars as $name) $$name = common::setVar($name);
	
	if (empty($tipo)) die("Error Processing Request: Unable load component ! (Few vars1 tipo)");
	if (empty($parent)) die("Error Processing Request: Unable load component ! (Few vars1 parent)");
	if (empty($section_tipo)) die("Error Processing Request: Unable load component ! (Few vars1 section_tipo)");
	if (empty($lang) ) die("Error Processing Request: Unable load component ! (Few vars1 lang)");

	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);	
	$modo 		 = 'tool_transcription'; // Fixed always 'tool_transcription'
	
	# COMPONENT	
	$component_obj	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);

	# Set variant to configure 'identificador_unico' of current component
	#$component_obj->set_variant( tool_lang::$target_variant );

	# Get component html
	$html = $component_obj->get_html();
	
	echo $html;
	exit();

}//end change_text_editor_lang








?>