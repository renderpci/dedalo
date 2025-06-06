<?php declare(strict_types=1);
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

		$response->result	= $pdf_text;
		$response->msg		= "OK Processing Request pdf_automatic_transcription: text processed";
		$response->original	= trim($original_text);


		return $response;
	}//end build_pdf_transcription



	/**
	* AUTOMATIC_TRANSCRIPTION
	* Exec a transcription request against the transcriber service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that transcriber config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function automatic_transcription( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$source_lang			= $options->source_lang;
			$transcription_ddo		= $options->transcription_ddo;
			$media_ddo				= $options->media_ddo;
			$transcriber_engine		= $options->transcriber_engine;
			$transcriber_quality	= $options->transcriber_quality;
			$config					= $options->config;

		// component to use
			$user_id		= logged_user_id();
			$entity_name	= DEDALO_ENTITY;

		// tool config
			$tool_name	= get_called_class();
			$config		= tool_common::get_config($tool_name);

		// config JSON . Must be compatible with tool properties transcriber_engine data
			$ar_transcriber_configs	= $config->config->transcriber_config->value ?? [];
			$transcriber_name		= $transcriber_engine;
			// search current transcriber config in tool config (stored in database, section 'dd996' Tools configuration)
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name===$transcriber_name;
			}) ?? new stdClass();

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
			$audio_file	= $component->quality_file_exist( 'audio' );
			if($audio_file===false){
				$component->build_version('audio', false);
			}
			$audio_file	= $component->quality_file_exist( 'audio' );
			// Audio file is not available case
			if($audio_file===false){
				$response->msg = 'Error. Audio file is not available.';
				$response->errors[] = 'audio file not found';
				debug_log(__METHOD__
					." $response->msg "
					, logger::ERROR
				);
				return $response;
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio');

		// iterate component array data
			switch ($transcriber_name) {
				case 'google_translation':
					// Not implemented yet
					$response->msg = "Sorry. '{$transcriber_name}' is not implemented yet"; // error msg
					break;

				case 'local':
					$transcriber_engine = 'babel_transcriber';
					// continue here only changing the transcriber_engine name

				case 'babel_transcriber':
				default:
					include_once(dirname(__FILE__) . '/transcribers/babel/class.babel_transcriber.php');

					// babel use tld2 instead tld3
					$lang_tld2 = lang::get_alpha2_from_code($source_lang);

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
					$babel_transcriber->exec_background_check_transcription($pid);

					// result set from transcriber response
					$response->result = $result;
					break;
			}


		return $response;
	}//end automatic_transcription



	/**
	* CREATE_TRANSCRIBABLE_AUDIO_FILE
	* Build the media component and create a version compatible with Whisper
	* To avoid problems with compressed audio files Whisper works better with uncompressed audio file in wave format
	* and the file needs to be resample in 16khz mono
	* As the Whisper parameters are different of Dédalo standards, build a new quality : audio_tr
	* This quality is created `on the fly` and is not necessary to specify in config.php
	* The files are created as temporal version, that will removed when the transcription will done.
	* @param object $options
	* {
	*	media_ddo : {
	*		component_tipo		: string media_component tipo as rsc35
	*		section_id			: int|string media_component section_id as 14
	*		section_tipo		: string media_component section_tipo as rsc176
	*	}
	* }
	* @return object $response
	*/
	public static function create_transcribable_audio_file( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// component to use
			$media_ddo = $options->media_ddo;

		// Source text . Get source text from component (source_lang)
			$model		= RecordObj_dd::get_modelo_name_by_tipo($media_ddo->component_tipo, true);
			$component	= component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);
			$component->extension = 'wav';

			$audio_file	= $component->quality_file_exist( 'audio_tr' );
			if($audio_file===false){
				$component->build_version('audio_tr', false);
			}
			$audio_file	= $component->quality_file_exist( 'audio_tr' );

			if($audio_file===false){
				$response->msg		= 'Error. Audio file is not available.';
				$response->errors[] = 'audio file not found';
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio_tr');

			$response->result	= $av_url;
			$response->msg		= 'OK: file was created';


		//  debug
			if(SHOW_DEBUG===true) {
				$response->debug			= new stdClass();
				$response->debug->av_url	= $av_url;
			}


		return $response;
	}//end create_transcribable_audio_file



	/**
	* DELETE_TRANSCRIBABLE_AUDIO_FILE
	* Hard delete of the temporal audio file that was created to be used in automatic transcription
	* It doesn't use the component delete process because the component has not a hard delete
	* component move the delete files to `delete` directory because needs to be accessible/recoverable in time machine
	* The transcribable audio file is a temporal format. This format is not used in any other Dédalo parts.
	* @param object $options
	* {
	*	media_ddo : {
	*		component_tipo		: string media_component tipo as rsc35
	*		section_id			: int|string media_component section_id as 14
	*		section_tipo		: string media_component section_tipo as rsc176
	*	}
	* }
	* @return object $response
	*/
	public static function delete_transcribable_audio_file( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// component to use
			$media_ddo = $options->media_ddo;

		// Source text . Get source text from component (source_lang)
			$model		= RecordObj_dd::get_modelo_name_by_tipo($media_ddo->component_tipo, true);
			$component	= component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);
			$component->extension = 'wav';

			$file_path	= $component->get_media_filepath( 'audio_tr', 'wav' );
			$audio_file	= $component->quality_file_exist( 'audio_tr' );
			if($audio_file===false){
				$response->result = true;
				$response->msg	= 'OK. File not exist in server, nothing to delete';
				return $response;
			}

			// delete the file
			$deleted = unlink($file_path);

			if($deleted===false){
				$response->msg		= 'Error. It was impossible to delete the audio file. View server log.';
				$response->errors[] = 'unable to delete file';
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

			$response->result	= true;
			$response->msg		= 'Ok: file was deleted';

		// debug
			if(SHOW_DEBUG===true) {
				$response->debug			= new stdClass();
				$response->debug->deleted	= $file_path;
			}


		return $response;
	}//end delete_transcribable_audio_file



	/**
	* CHECK_SERVER_TRANSCRIBER_STATUS
	* Exec a translation request against the transcriber service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that transcriber config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function check_server_transcriber_status( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// component to use
			$media_ddo				= $options->media_ddo;
			$transcriber_engine		= $options->transcriber_engine;
			$config					= $options->config;
			$pid					= $options->pid;
			$user_id				= logged_user_id();
			$entity_name			= DEDALO_ENTITY;

		// config
			// get all tools config sections
				$tool_name	= get_called_class();
				$config = tool_common::get_config($tool_name);

		// config JSON . Must be compatible with tool properties transcriber_engine data
			$ar_transcriber_configs	= $config->config->transcriber_config->value ?? [];
			$transcriber_name		= $transcriber_engine;
			// search current transcriber config in tool config (stored in database, section 'dd996' Tools configuration)
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name===$transcriber_name;
			}) ?? new stdClass();

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

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio');

		// iterate component array data
			switch ($transcriber_name) {
				case 'google_translation':
					// Not implemented yet
					$response->msg = "Sorry. '{$transcriber_name}' is not implemented yet"; // error msg
					$response->errors[] = 'transcriber not implemented';
					break;

				case 'local':
					$transcriber_engine = 'babel_transcriber';
					// continue without break here

				case 'babel_transcriber':
				default:
					include_once(dirname(__FILE__) . '/transcribers/babel/class.babel_transcriber.php');

					// check background process to check if the transcriber had done.
					$result = babel_transcriber::check_transcriber_status((object)[
						'key'				=> $key,
						'url'				=> $url,
						'av_url'			=> $av_url,
						'engine'			=> $transcriber_engine,
						'user_id'			=> $user_id,
						'entity_name'		=> $entity_name,
						'pid'				=> $pid,
						'delete_result'		=> false
					]);

					$response->result = $result;
					break;
			}


		return $response;
	}//end check_server_transcriber_status



	/**
	* BUILD_SUBTITLES_FILE
	* Generates and write the subtitles text from current component value
	* @param object $options
	* @return object $response
	*/
	public static function build_subtitles_file( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$component_tipo	= $options->component_tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$lang			= $options->lang;
			$key			= $options->key ?? 0; // fixed component dato key as zero
			$max_charline	= $options->max_charline;

		// component_text_area
		// Source text . Get source text from component (source_lang)
			$model					= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			$component_text_area	= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);
			$dato			= $component_text_area->get_dato();
			$text			= $dato[$key] ?? '';
			$source_text	= trim($text);
			if (empty($source_text)) {
				$response->msg = 'Warning. Empty component value!';
				$response->errors[] = 'empty value';
				return $response;
			}

		// component_av
			$component_av_tipo	= $component_text_area->get_related_component_av_tipo();
			$model				= RecordObj_dd::get_modelo_name_by_tipo($component_av_tipo, true);
			$component_av		= component_common::get_instance(
				$model,
				$component_av_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$duration		= $component_av->get_duration(); // seconds
			$total_ms		= (int)round($duration * 1000);
			$subtitles_path	= $component_av->get_subtitles_path($lang);
			$subtitles_url	= $component_av->get_subtitles_url($lang);

		// debug
			debug_log(__METHOD__
				. " launching build_subtitles_text with params:" . PHP_EOL
				. ' max_charline: ' . to_string($max_charline) . PHP_EOL
				. ' total_ms: ' . to_string($total_ms) . PHP_EOL
				. ' source_text: ' . substr($source_text, 0, 256) . ' ..'
				, logger::DEBUG
			);

		// class subtitles
			include_once( DEDALO_SHARED_PATH . '/class.subtitles.php');

		// build_subtitles_text exec
			$subtitles_response = subtitles::build_subtitles_text((object)[
				'sourceText'	=> $source_text,
				'maxCharLine'	=> $max_charline,
				'total_ms'		=> $total_ms
			]);
			if ($subtitles_response->result===false) {
				$response->msg .= PHP_EOL . $subtitles_response->msg ?? 'Unknown error on build_subtitles_text';
				$response->errors[] = 'unable to build subtitles';
				return $response;
			}

		// check target folder
			$target_folder = pathinfo($subtitles_path)['dirname'];
			if (!is_dir($target_folder)) {
				// create the directory
				$response->msg .= PHP_EOL . 'Error: subtitles dir do not exists!';
				debug_log(__METHOD__
					. $response->msg . PHP_EOL
					. ' subtitles dir: ' . to_string($target_folder)
					, logger::ERROR
				);
				$response->errors[] = 'subtitles dir not found '.$target_folder;
				return $response;
			}

		// save to file
			$content = $subtitles_response->result ?? '';
			if( !file_put_contents($subtitles_path, $content) ) {
				$response->msg .= PHP_EOL . 'Error writing subtitles file';
				debug_log(__METHOD__
					. $response->msg . PHP_EOL
					. ' subtitles_path: ' . to_string($subtitles_path)
					, logger::ERROR
				);
				$response->errors[] = 'unable to write subtitles file';
				return $response;
			}

		// all is OK
			$response->result	= true;
			$response->url		= $subtitles_url;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end build_subtitles_file



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
