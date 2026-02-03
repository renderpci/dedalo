<?php declare(strict_types=1);
/**
 * CLASS TOOL_PDF_EXTRACTOR
 * Tool for extracting text content from PDF files for indexing and publication search
 *
 * Processes PDF files by delegating to external daemon processors (pdftotext) to extract
 * text with optional page numbering for easy location of content within documents.
 *
 * Key features:
 * - Text extraction from PDF without OCR processing
 * - Page number annotation for content location tracking
 * - Configurable extraction engine (text or HTML output)
 * - Page range filtering (extract specific pages only)
 * - Component-integrated PDF processing
 *
 * External dependencies:
 * - pdftotext daemon (XPDF toolkit: http://www.foolabs.com/xpdf/)
 * - Path configured via PDF_AUTOMATIC_TRANSCRIPTION_ENGINE constant
 * - Typically installed at: /usr/bin/pdftotext
 *
 * @package Dedalo
 * @subpackage Media
 */
class tool_pdf_extractor extends tool_common {

	/**
	 * GET_PDF_DATA
	 * Extract text content from a PDF file using configured daemon processor
	 *
	 * Processes PDF extraction workflow:
	 * 1. Validates input parameters (component_tipo, section_tipo, section_id, method)
	 * 2. Instantiates PDF component to retrieve file information
	 * 3. Loads extractor engine configuration (text or HTML mode)
	 * 4. Executes daemon processor with optional page range filtering
	 * 5. Returns processed text with HTML entity encoding for safety
	 *
	 * Supported output methods:
	 * - 'text': Plain text extraction with page numbers
	 * - 'html': HTML-formatted text extraction with page numbers
	 *
	 * @param object $options Options containing:
	 *                         - component_tipo (required): PDF component type
	 *                         - section_tipo (required): Section type containing component
	 *                         - section_id (required): Section ID (record identifier)
	 *                         - method (required): Extraction method ('text' or 'html')
	 *                         - lang (optional): Language code (defaults to DEDALO_DATA_LANG)
	 *                         - page_in (optional): First page to extract (1-indexed)
	 *                         - page_out (optional): Last page to extract (inclusive)
	 * @return object $response Response object with:
	 *                           - result: extracted text (HTML-encoded) or false on error
	 *                           - msg: operation status message
	 *                           - errors: array of error messages encountered
	 * @throws Exception If component instantiation or PDF processing fails
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function get_pdf_data( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options with validation
			$component_tipo	= $options->component_tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$lang			= $options->lang ?? DEDALO_DATA_LANG;
			$method			= $options->method ?? null;
			$page_in		= $options->page_in ?? null;
			$page_out		= $options->page_out ?? null;

		// validate required parameters
			if (empty($component_tipo) || empty($section_tipo) || empty($section_id) || empty($method)) {
				$missing_params = [];
				if (empty($component_tipo)) $missing_params[] = 'component_tipo';
				if (empty($section_tipo)) $missing_params[] = 'section_tipo';
				if (empty($section_id)) $missing_params[] = 'section_id';
				if (empty($method)) $missing_params[] = 'method';
				
				$error_msg = 'Missing required parameters: ' . implode(', ', $missing_params);
				$response->errors[] = $error_msg;
				$response->msg = 'Error. ' . $error_msg;
				
				debug_log(__METHOD__ . " $error_msg", logger::ERROR);
				return $response;
			}

		// validate method value
			if (!in_array($method, ['text', 'html'], true)) {
				$error_msg = 'Invalid method. Must be "text" or "html", got: ' . $method;
				$response->errors[] = $error_msg;
				$response->msg = 'Error. ' . $error_msg;
				
				debug_log(__METHOD__ . " $error_msg", logger::ERROR);
				return $response;
			}

		try {
			// component_pdf. Create the component to get the file path
				$model = ontology_node::get_model_by_tipo($component_tipo, true);
				if (empty($model)) {
					throw new Exception("Unable to determine model for component_tipo: $component_tipo");
				}

				$component = component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);

				if ($component === null) {
					throw new Exception("Failed to instantiate component: model=$model, tipo=$component_tipo, section_id=$section_id");
				}

			// extractor_engine configuration
				$config = tool_common::get_config('tool_pdf_extractor');
				if ($config === null) {
					throw new Exception("Unable to load configuration for tool_pdf_extractor");
				}

				$engine = $config->config->{$method}->default ?? null;
				if (empty($engine)) {
					throw new Exception("PDF extraction engine not configured for method: $method. Configuration: " . to_string($config));
				}

				// prepare transcription options
				$transcription_options = new stdClass();
					$transcription_options->engine	= $engine;
					$transcription_options->method	= $method; // 'text' or 'html'
					$transcription_options->page_in	= $page_in; // First page (1-indexed), null = start from page 1
					$transcription_options->page_out = $page_out; // Last page (inclusive), null = extract all

			// execute PDF text extraction
				$process_text_response = $component->get_text_from_pdf($transcription_options);

				if ($process_text_response === null) {
					throw new Exception("PDF extraction returned null response from component");
				}

			// process response and apply HTML encoding for safety
				$response->result = is_string($process_text_response->result)
					? htmlentities($process_text_response->result, ENT_QUOTES, 'UTF-8')
					: $process_text_response->result;
				$response->msg = $process_text_response->msg ?? 'OK. Request done';
				$response->errors = array_merge(
					$response->errors,
					(array)($process_text_response->errors ?? [])
				);

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			
			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' component_tipo: ' . $component_tipo . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . $section_id
				, logger::ERROR
			);
		}

		return $response;
	}//end get_pdf_data

}//end class tool_pdf_extractor
