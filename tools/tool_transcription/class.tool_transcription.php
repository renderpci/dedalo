<?php
/**
* CLASS TOOL_TRANSCRIPTION
*
*
*/
class tool_transcription extends tool_common {



	# media component (actually component_image, component_av, component_pdf)
	// protected $component_obj;

	# text component (actually component_text_area)
	// protected $component_related_obj;



	/**
	* __CONSTRUCT
	*/
		// public function __construct($component_obj, $mode='button') {

		// 	# Fix mode
		// 	$this->mode = $mode;

		// 	# Fix current media component
		// 	$this->component_obj = $component_obj;

		// 	# Fix lang
		// 	$this->lang = $this->component_obj->get_lang();

		// 	return true;
		// }//end __construct



	/**
	* GET_TEXT_FROM_PDF
	* Extract text from pdf file
	* @param object $new_options
	* @return object $response
	*/
	public static function get_text_from_pdf( object $new_options ) : object {

		$response = new stdClass();

		// options
			$options = new stdClass();
				$options->path_pdf		= null;	# full source pdf file path
				$options->first_page	= 1; 		# number of first page. default is 1

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

		$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $options->path_pdf";
		$output   = exec( "$command 2>&1", $result);	# Generate text version file in same dir as pdf
		if ( strpos( strtolower($output), 'error')) {
			$response->result = 'error';
			$response->msg 	  = "$output";
			return $response;
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
		$pdf_text 	= trim($pdf_text);	// Trim before check is empty
		if (empty($pdf_text)) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Empty text";
			return $response;
		}

		#
		# PAGES TAGS
		$original_text = str_replace("","", $pdf_text);
		$pages = explode("", $pdf_text);
		$i=(int)$options->first_page;
		$pdf_text='';
		foreach ($pages as $current_page) {
		    $pdf_text .= '[page-n-'. $i .']';
		    $pdf_text .= '<br>';
		    $pdf_text .= nl2br($current_page);
		    $i++;
		}

		$response->result	= (string)$pdf_text;
		$response->msg		= "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original	= trim($original_text);


		return $response;
	}//end build_pdf_transcription



	/**
	* AUTOMATIC_TRANSCRIPTION
	* Exec a translation request against the transcriber service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that transcriber config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function automatic_transcription(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// component to use
			$source_lang			= $options->source_lang;
			$transcription_ddo		= $options->transcription_ddo;
			$media_ddo				= $options->media_ddo;
			$transcriber_engine		= $options->transcriber_engine;
			$transcriber_quality	= $options->transcriber_quality;
			$config					= $options->config;
			$user_id				= get_user_id();
			$entity_name			= DEDALO_ENTITY;

		// config
			// get all tools config sections
				$tool_name	= get_called_class();
				$config = tool_common::get_config($tool_name);
			// select current from all tool config matching tool name
				// $tool_name	= get_called_class(); // tool_lang
				// $config		= array_find($ar_config, function($el) use($tool_name) {
				// 	return $el->name===$tool_name;
				// });

		// config JSON . Must be compatible with tool properties transcriber_engine data
			$ar_transcriber_configs	= $config->config->transcriber_config->value;
			$transcriber_name		= $transcriber_engine;
			// search current transcriber config in tool config (stored in database, section 'dd996' Tools configuration)
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name===$transcriber_name;
			});

		// data from transcriber
			$url	= $transcriber_config->uri;
			$key	= $transcriber_config->key;

		// Source text . Get source text from component (source_lang)
			$model		= RecordObj_dd::get_modelo_name_by_tipo($media_ddo->component_tipo,true);
			$component	= component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);
			$quality	= $component->get_quality();
			$audio_file	= $component->quality_file_exist( 'audio' );
			if($audio_file===false){
				$component->build_version('audio', $async=false);
			}
			$audio_file	= $component->quality_file_exist( 'audio' );

			if($audio_file===false){
				$response->msg		= 'Error. Audio file is not available.';
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio');

		// iterate component array data
			switch ($transcriber_name) {
				case 'google_translation':
					// Not implemented yet
					$response->msg = "Sorry. '{$transcriber_name}' is not implemented yet"; // error msg
					return $response;
					break;
				case 'local':
					$transcriber_engine = 'babel_transcriber';
				case 'babel_transcriber':
				default:
					include_once(dirname(__FILE__) . '/transcribers/class.babel_transcriber.php');

					// babel use tld2 instead tld3
					$lang_tld2	 = lang::get_alpha2_from_code($source_lang);

					$babel_transcriber = new babel_transcriber((object)[
						'key'				=> $key,
						'engine'			=> $transcriber_engine,
						'quality'			=> $transcriber_quality,
						'user_id'			=> $user_id,
						'entity_name'		=> $entity_name,
						'url'				=> $url,
						'lang'				=> $source_lang,
						'lang_tld2'			=> $lang_tld2,
						'av_url'			=> $av_url,
						'transcription_ddo'	=> $transcription_ddo
					]);

					$transcriber_response = $babel_transcriber->transcribe();
					$result	= $transcriber_response->result;
					if ($result===false) {
						return $transcriber_response;
					}
					$pid = $transcriber_response->result->pid;

					// check background process to check if the transcriber had done.
					$babel_transcriber->check_transcription($pid);

					break;
			}

			$transcribed_data[] = $result ?? null;

			return $response;

		// Save result on target component (target_lang)
			if (empty($transcribed_data)) {
				// skip save empty values
				debug_log(__METHOD__." Skip empty received value ".to_string(), logger::ERROR);
				$response->msg		= 'Ignored empty result. Nothing is saved!';
			}else{
				$component = component_common::get_instance($model,
					$options->component_tipo,
					$options->section_id,
					'list',
					$options->target_lang,
					$options->section_tipo
				);
				$component->set_dato($transcribed_data);
				$component->Save(false); // (!) Important: send argument 'false' to save to prevent alter other langs tags (propagate)

				// response OK
					$response->result	= true;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
			}

		//  debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				$response->debug->transcribed_data	= $transcribed_data;
				$response->debug->raw_result		= $transcriber->raw_result;
			}


		return (object)$response;
	}//end automatic_transcription



}//end class tool_transcription




#
# FUNCTIONS
#
# VALID_UTF8
# utf8 encoding validation developed based on Wikipedia entry at:
# http://en.wikipedia.org/wiki/UTF-8
# Implemented as a recursive descent parser based on a simple state machine
# copyright 2005 Maarten Meijer
# This cries out for a C-implementation to be included in PHP core
function valid_utf8(string $string) : bool {
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
function valid_1byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0x80) == 0x00;
}
function valid_2byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xE0) == 0xC0;
}
function valid_3byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF0) == 0xE0;
}
function valid_4byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF8) == 0xF0;
}
function valid_nextbyte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xC0) == 0x80;
}
# UTF8_CLEAN
function utf8_clean(string $string, bool $control=false) : string {
    $string = iconv('UTF-8', 'UTF-8//IGNORE', $string);
    return $string;

    if ($control === true)
    {
        return preg_replace('~\p{C}+~u', '', $string);
    }

    return preg_replace(array('~\r\n?~', '~[^\P{C}\t\n]+~u'), array("\n", ''), $string);
}
