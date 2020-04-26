<?php
/*
* CLASS TOOL_UPLOAD
*
*
*/
class tool_pdf_extractor extends tool_common{ // extends tool_common



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

	}//end __construct



	/**
	* GET_SYSTEM_INFO
	* @return
	*/
	public static function get_pdf_data($options) {

		$response=new stdClass();

		$component_options 	= $options->component;
		$extractor_config 	= $options->extractor_config;
		$config 			= $this->get_config();

		dump($config, ' config ++ '.to_string()); die();

		if(!isset($component_options)){
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: impossible know the caller component";
			return $response;
		}

		$model 		= RecordObj_dd::get_modelo_name_by_tipo($component_options->tipo,true);
		$component 	= component_common::get_instance($model,
													$component_options->tipo,
													$component_options->section_id,
													'list',
													DEDALO_DATA_NOLAN,
													$component_options->section_tipo);
		$pdf_path = $component->get_pdf_path();
		// error on missing properties
			if (empty($pdf_path) || !file_exists($pdf_path)) {
				$response->result = 'error';
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: source pdf file not found";
				return $response;
			}

		// test engine pdf to text
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

		// FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename 	= substr($pdf_path, 0, -4) .'.txt';

		// exec the extraction
		$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $pdf_path";
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

		$response->result  = (string)$pdf_text;
		$response->msg 	   = "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original = trim($original_text);



		return $response;
	}//end get_system_info



	public static function get_text_from_pdf( $new_options ) {



		$options = new stdClass();
			$options->$pdf_path 	 = null;	# full source pdf file path
			$options->first_page = 1; 		# number of first page. default is 1

		// new_options overwrite options defaults
			foreach ((object)$new_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}








		#
		# TEST STRING VALUE IS VALID
		# Test is valid utf8
		$test_utf8 = self::valid_utf8($pdf_text);
		if (!$test_utf8) {
			error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		}

		# Remove non utf8 chars
		$pdf_text = self::utf8_clean($pdf_text);

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



		return $response;
	}//end build_pdf_transcription



}//end class
