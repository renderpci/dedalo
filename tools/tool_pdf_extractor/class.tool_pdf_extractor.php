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
				$response->msg		= 'Error Processing Request pdf_automatic_transcription: config extractor engine is not defined';
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
				$response->errors[] = 'exception: ' . $e->getMessage();
			}

		// response
			$response->result = is_string($process_text_response->result)
				? htmlentities($process_text_response->result)
				: $process_text_response->result;
			$response->msg = $process_text_response->msg;
			$response->errors = array_merge($response->errors, (array)$process_text_response->errors);


		return $response;
	}//end get_pdf_data



}//end class tool_pdf_extractor
