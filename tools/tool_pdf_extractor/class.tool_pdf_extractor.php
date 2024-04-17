<?php
/**
* CLASS TOOL_PDF_EXTRACTOR
*
*
*/
class tool_pdf_extractor extends tool_common {



	/**
	* GET_PDF_DATA
	* @param object $options
	* @return object $response
	*/
	public static function get_pdf_data(object $options) {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			// $component_options 	= $options->component;
			// $extractor_config 	= $options->extractor_config;
			$component_tipo	= $options->component_tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$lang			= $options->lang;
			$method			= $options->method; // string text|html
			$page_in		= $options->page_in;
			$page_out		= $options->page_out;

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
			$pdf_path = $component->get_media_filepath();

		// pdf_path error on missing properties
			if (empty($pdf_path) || !file_exists($pdf_path)) {
				$response->result = false;
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: source pdf file not found";
				debug_log(__METHOD__
					." $response->msg "
					.' pdf_path:' . to_string($pdf_path)
					, logger::ERROR
				);
				return $response;
			}

		// test engine PDF to text
			$config				= tool_common::get_config('tool_pdf_extractor');
			$extractor_engine	= $config->config->{$method}->default ?? null;

			if (!isset($extractor_engine)) {

				$response->result	= false;
				$response->msg		= "Error Processing Request pdf_automatic_transcription: config extractor engine is not defined";
				debug_log(__METHOD__
					." $response->msg ".PHP_EOL
					.' config: '. to_string($config)
					, logger::ERROR
				);
				return $response;

			}else{

				$transcription_engine = trim( shell_exec('type -P '.$extractor_engine) ?? '' );
				if (empty($transcription_engine)) {
					$response->result	= false;
					$response->msg		= "Error Processing Request pdf_automatic_transcription: daemon engine not found";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' extractor_engine: ' . to_string($extractor_engine)
						, logger::ERROR
					);
					return $response;
				}
			}

		// engine config $options:
			// text_engine
				// -f <int> 			: first page to convert
		 		// -l <int> 			: last page to convert
				// -layout 				: maintain original physical layout
		  		// -simple 				: simple one-column page layout
				// -enc <string> 		: output text encoding name
			// html_engine
				// -f <int> 			: first page to convert
				// -l <int> 			: last page to convert
				// -p                    : exchange .pdf links by .html
			    // -c                    : generate complex document
			    // -s                    : generate single document that includes all pages
			    // -i                    : ignore images
			    // -noframes             : generate no frames
			    // -stdout               : use standard output
			    // -hidden               : output hidden text
			    // -nomerge              : do not merge paragraphs
			    // -enc <string>         : output text encoding name

			$engine_config = '';

			if(!empty($page_in)){
				$engine_config .= ' -f ' .$page_in;
			}
			if(!empty($page_out)){
				$engine_config .= ' -l ' .$page_out;
			}

			$file_extension = '.txt';
			if($method==='html_engine'){
				$engine_config .= ' -i -p -noframes ' ;
				$file_extension = '.html';
			}

		// file text from PDF. Create a new text file from pdf text content (.txt for text, .html for html)
			$extraction_filename = substr($pdf_path, 0, -4) . $file_extension;

		// exec the extraction
			// $command  = $extractor_engine ." -enc UTF-8 $engine_config $pdf_path 2>&1";
			$command  = $extractor_engine ." -enc UTF-8 $engine_config $pdf_path $extraction_filename";
			debug_log(__METHOD__
				." Executing command: ".PHP_EOL
				. $command
				, logger::DEBUG
			);
			$output = exec($command, $result);	// Generate text version file in same dir as pdf
			if ( strpos( strtolower($output), 'error') ) {
				$response->result	= false;
				$response->msg		= "$output";
				debug_log(__METHOD__
					." $response->msg ".PHP_EOL
					. 'result: '.to_string($result)
					, logger::ERROR
				);
				return $response;
			}

		// test if the file is saved
			if (!file_exists($extraction_filename)) {
				$response->result	= false;
				$response->msg		= "Error Processing Request pdf_automatic_transcription: Extraction file not found";
				debug_log(__METHOD__
					." $response->msg "
					, logger::ERROR
				);
				return $response;
			}

		// pdf_text contents
			$pdf_text = file_get_contents($extraction_filename); // Read current text/html file

		// response
			$response->result  = htmlentities($pdf_text);
			$response->msg 	   = "OK Processing Request pdf_automatic_transcription: text processed";
			// $response->original = trim($original_text);

		// (!) Note: This tool is not finished!

			// Work in progress !

		// #
		// # PAGES TAGS
		// $original_text = str_replace("","", $pdf_text);
		// // explode by the page mark invisible text of return character
		// $pages = explode("", $pdf_text);
		// $i=(int)$options->first_page;
		// $pdf_text='';
		// foreach ($pages as $current_page) {
		// 	$pdf_text .= '[page-n-'. $i .']';
		// 	$pdf_text .= '<br>';
		// 	$pdf_text .= nl2br($current_page);
		// 	$i++;
		// }
		//
		// $response->result  = (string)$pdf_text;
		// $response->msg 	   = "Ok Processing Request pdf_automatic_transcription: text processed";
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
