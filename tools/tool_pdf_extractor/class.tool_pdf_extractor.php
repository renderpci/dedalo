<?php
/**
* CLASS TOOL_PDF_EXTRACTOR
*
*
*/
class tool_pdf_extractor extends tool_common {



	/**
	* GET_PDF_DATA
	* Exec a shell command against selected daemon processor
	* to extract the file text
	* @param object $options
	* @return object $response
	*/
	public static function get_pdf_data(object $options) {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$component_tipo	= $options->component_tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$lang			= $options->lang ?? DEDALO_DATA_LANG;
			$method			= $options->method; // string text|html
			$page_in		= $options->page_in ?? null;
			$page_out		= $options->page_out ?? null;

		// check vars
			if (empty($component_tipo) || empty($section_tipo) || empty($section_id) || empty($method)) {
				$response->errors[] = 'few vars';
				$response->msg .= ' Few vars';
				return $response;
			}

		// component_pdf. Create the component to get the file path
			$model		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

		// extractor_engine
			$config	= tool_common::get_config('tool_pdf_extractor');
			$engine	= $config->config->{$method}->default ?? null;
			if (!isset($engine)) {

				$response->result	= false;
				$response->msg		= "Error Processing Request pdf_automatic_transcription: config extractor engine is not defined";
				debug_log(__METHOD__
					." $response->msg ".PHP_EOL
					.' config: '. to_string($config)
					, logger::ERROR
				);
				$response->errors[] = 'config extractor engine is not defined';
				return $response;

			}
			$transctipton_options = new stdClass();
				$transctipton_options->engine	= $engine;
				$transctipton_options->method	= $method; // string text|html
				$transctipton_options->page_in	= $page_in; // number of first page. default is 1
				$transctipton_options->page_out	= $page_out;

			try {
				$process_text_response = $component->get_text_from_pdf( $transctipton_options );
			} catch (Exception $e) {
				debug_log(__METHOD__
					. " Caught exception: " . PHP_EOL
					. $e->getMessage()
					, logger::ERROR
				);
			}

		// response
			$response->result	= htmlentities($process_text_response->result);
			$response->msg		= "OK Processing Request pdf_automatic_transcription: text processed";
			// $response->original = trim($original_text);


		return $response;
	}//end get_pdf_data



	/**
	* GET_TEXT_FROM_PDF
	* @param object $new_options
	* @return object $response
	*/
		// public static function get_text_from_pdf(object $new_options) : object {

		// 	$options = new stdClass();
		// 		$options->pdf_path		= null;	// full source pdf file path
		// 		$options->first_page	= 1; 	// number of first page. default is 1

		// 	// new_options overwrite options defaults
		// 		foreach ((object)$new_options as $key => $value) {
		// 			if (property_exists($options, $key)) {
		// 				$options->$key = $value;
		// 			}
		// 		}

		// 	#
		// 	# TEST STRING VALUE IS VALID
		// 	# Test is valid utf8
		// 	$test_utf8 = self::valid_utf8($pdf_text);
		// 	if (!$test_utf8) {
		// 		error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		// 	}

		// 	# Remove non utf8 chars
		// 	$pdf_text = self::utf8_clean($pdf_text);

		// 	# Test JSON conversion before save
		// 	$pdf_text 	= json_handler::encode($pdf_text);
		// 	if (!$pdf_text) {
		// 		$response->result = false;
		// 		$response->msg 	  = "Error Processing Request pdf_automatic_transcription: String is not valid because format encoding is wrong";
		// 		return $response;
		// 	}
		// 	$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		// 	$pdf_text 	= trim($pdf_text);	// Trim before check is empty
		// 	if (empty($pdf_text)) {
		// 		$response->result = false;
		// 		$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Empty text";
		// 		return $response;
		// 	}

		// 	return $response;
		// }//end get_text_from_pdf



}//end class tool_pdf_extractor
