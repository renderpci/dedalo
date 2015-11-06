<?php
/*
* CLASS TOOL LANG
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_transcription extends tool_common {
	
	# media component
	protected $component_obj ;

	# text component
	protected $component_related_obj ;


	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;

		# Fix related component (text)
		#$this->component_related_obj = $this->get_component_related_obj();
	}


	/**
	* GET_COMPONENT_RELATED_OBJ
	*/
	protected function get_component_related_obj() {

		if(isset($this->component_related_obj)) return $this->component_related_obj;

		# media tipo
		$tipo = $this->component_obj->get_tipo();

		# media parent
		$parent = $this->component_obj->get_parent();

		$section_tipo = $this->component_obj->get_section_tipo();
			

		# media related terms
		/*
		$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true);
			dump($ar_terminos_relacionados,'$ar_terminos_relacionados');

		# Verify is set in structure
		if (empty($ar_terminos_relacionados[0])) {
			throw new Exception("Component related not exists. Please configure dependencies", 1);			
		}
		*/
		# Verify modelo
		/*
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($ar_terminos_relacionados[0]);
		if ($modelo_name!='component_text_area') {
			throw new Exception("Component related tipo is invalid (only 'component_text_area' is accepted). Please configure dependencies", 1);			
		}
		*/
		# método acceso directo al componente. buscamos probablemente el componente text_area para transcripbir (pude no haber)
		$ar_terminos_relacionados = $this->component_obj->get_relaciones();
			#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');
		
		if(empty($ar_terminos_relacionados)) {
			#throw new Exception("Component related not exists. Please configure dependencies", 1);
			return null;
		}
			
		foreach ($ar_terminos_relacionados as $modelo => $termino_relacionado_tipo) {
			break;
		}


		# Create final related component
		$component_text_area = component_common::get_instance('component_text_area', $termino_relacionado_tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);


		$this->component_related_obj = $component_text_area;

		return $this->component_related_obj;
	}


	
	

	
	
	/**
	* GET_TEXT_FROM_PDF
	* Extract text from pdf file
	* @param object $new_options
	* @return object $response
	*/
	public static function get_text_from_pdf( $new_options ) {
		$response=new stdClass();

		$options = new stdClass();
			$options->path_pdf 	 = null;	# full source pdf file path
			$options->first_page = 1; 		# number of first page. default is 1

		# new_options overwrite options defaults
		foreach ((object)$new_options as $key => $value) {			
			if (property_exists($options, $key)) {
				$options->$key = $value;				
			}
		}

		if (empty($options->path_pdf) || !file_exists($options->path_pdf)) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: source pdf file not found";
			return $response;			
		}		


		#
		# TEST ENGINE PDF TO TEXT
		if (defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')===false) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined";
			return $response;			
		}else{
			$transcription_engine = trim(shell_exec('type -P '.PDF_AUTOMATIC_TRANSCRIPTION_ENGINE));
			if (empty($transcription_engine)) {
				$response->result = 'error';
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: daemon engine not found";
				return $response;
			}
		}

		#
		# FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename 	= substr($options->path_pdf, 0, -4) .'.txt';
		if(SHOW_DEBUG) {
			#error_log("text_filename: $text_filename");
		}
		$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $options->path_pdf";
		$output   = exec( "$command 2>&1", $result);			# Generate text version file in same dir as pdf
		if ( strpos( strtolower($output), 'error')) {
			$response->result = 'error';
			$response->msg 	  = "$output";
			return $response;			
		}
		
		if(SHOW_DEBUG) {
			#dump($command, ' command');
			#dump($output, ' output');
			#dump($result, ' result');
		}

		if (!file_exists($text_filename)) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Text file not found";
			return $response;
		}
		$pdf_text = file_get_contents($text_filename);	# Read current text file


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
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: String is not valid because format encoding is wrong";
			return $response;			
		}		
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		if (empty($pdf_text)) {			
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Empty text";
			return $response;	
		}


		#
		# PAGES TAGS	
		$original_text = str_replace("","", $pdf_text);
		$pages = explode("", $pdf_text);
		#dump($pages,"pages ");die();
		$i=(int)$options->first_page;
		$pdf_text='';
		foreach ($pages as $current_page) {		
		    $pdf_text .= '[page-n-'. $i .']';
		    $pdf_text .= '<br>';
		    $pdf_text .= nl2br($current_page);
		    $i++;
		}

		$response->result = (string)$pdf_text;
		$response->msg 	  = "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original = $original_text;
		return $response;

	}#end build_pdf_transcription





	
	
}#end class tool_transcription








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

?>