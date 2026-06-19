<?php declare(strict_types=1);
/**
* CLASS TOOL_PDF_EXTRACTOR
* Tool for extracting text content from PDF files for indexing and publication search.
*
* Exposes a single API action — get_pdf_data — that delegates the actual shell
* execution to component_pdf::get_text_from_pdf() via a resolved component instance.
* This class is responsible for:
* - Enforcing the API allowlist (API_ACTIONS) and READ-level security gate.
* - Resolving the extraction engine path from the tool's stored configuration
*   (dd1633 in the tool registry, keys 'text_engine' / 'html_engine').
* - Building the options object that component_pdf::get_text_from_pdf() consumes.
* - HTML-encoding the returned text before sending it to the browser (XSS safety).
*
* Two extraction modes are supported:
* - 'text': plain-text extraction with page markers via pdftotext (XPDF).
* - 'html': HTML-formatted extraction with page markers via pdftohtml (XPDF).
*
* External runtime dependency:
* - pdftotext / pdftohtml from the XPDF toolkit (http://www.foolabs.com/xpdf/).
*   The resolved binary path is stored in the tool configuration record (dd1633).
*   A fallback constant PDF_AUTOMATIC_TRANSCRIPTION_ENGINE may be used by the
*   underlying component_pdf layer if the config engine is not found.
* - Typical install paths: /usr/bin/pdftotext, /usr/local/bin/pdftohtml.
*
* Extends tool_common which provides get_config(), the tool registry, and the
* shared section/section_id context. This class adds no instance state of its own;
* every method is static.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_pdf_extractor extends tool_common {



	/**
	* Explicit allowlist of methods that dd_tools_api::tool_request() may invoke
	* on behalf of authenticated browser clients (SEC-024 §9.2).
	* Any static method NOT in this list is unreachable through the public API,
	* regardless of what the client sends.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_pdf_data'
	];



	/**
	* GET_PDF_DATA
	* Extract text from a PDF component file and return it HTML-encoded to the browser.
	*
	* Workflow:
	* 1. Validates required options (component_tipo, section_tipo, section_id, method)
	*    and the allowed method values ('text' | 'html').
	* 2. Enforces a READ permission gate via security::assert_tipo_permission()
	*    (throws permission_exception if the user lacks read access).
	* 3. Resolves the component_pdf instance for the given section/record locator.
	* 4. Looks up the extraction engine binary path from the tool's stored config
	*    (tool_common::get_config('tool_pdf_extractor') — returns ?array).
	*    The engine path lives at $config['config']->{$method}->default, where
	*    $method is 'text' or 'html' mapping to the tool's text/html engine key.
	* 5. Delegates execution to component_pdf::get_text_from_pdf() passing the
	*    engine path and optional page range ($page_in / $page_out).
	* 6. HTML-encodes the extracted string (htmlentities ENT_QUOTES UTF-8) before
	*    returning it, so callers can insert it into the DOM safely.
	*
	* All exceptions from steps 3–5 are caught and converted to an error response
	* rather than being propagated — the caller always receives a stdClass object.
	*
	* (!) get_config() returns ?array (not object). The code accesses $config as
	*     $config->config->{$method}->default, which will produce PHP notices if
	*     $config is a plain array. This is a pre-existing behaviour; do not change.
	*
	* @param object $options - Options object with properties:
	*   - string $component_tipo (required) ontology tipo of the PDF component
	*   - string $section_tipo   (required) ontology tipo of the parent section
	*   - string|int $section_id (required) record ID within $section_tipo
	*   - string $method         (required) extraction mode: 'text' or 'html'
	*   - string $lang           (optional) language code; defaults to DEDALO_DATA_LANG
	*   - int|null $page_in      (optional) first page to extract (1-indexed); null = page 1
	*   - int|null $page_out     (optional) last page to extract (inclusive); null = all pages
	* @return object stdClass with:
	*   - bool|string $result : HTML-encoded extracted text, or false on failure
	*   - string $msg         : human-readable status message
	*   - array  $errors      : accumulated error strings (may be non-empty on partial success)
	* @throws \permission_exception If the user lacks read access on $section_tipo / $component_tipo
	*                               (raised by security::assert_tipo_permission, NOT caught internally).
	*/
	public static function get_pdf_data( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options with validation
		// Null-coalesce every property up front; validation below catches missing ones.
			$component_tipo	= $options->component_tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$lang			= $options->lang ?? DEDALO_DATA_LANG;
			$method			= $options->method ?? null;
			$page_in		= $options->page_in ?? null;
			$page_out		= $options->page_out ?? null;

		// validate required parameters
		// Accumulate missing-field names so the error message is actionable.
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
		// Only 'text' and 'html' are understood by component_pdf::get_text_from_pdf().
		// Reject anything else before touching the filesystem or security layer.
			if (!in_array($method, ['text', 'html'], true)) {
				$error_msg = 'Invalid method. Must be "text" or "html", got: ' . $method;
				$response->errors[] = $error_msg;
				$response->msg = 'Error. ' . $error_msg;

				debug_log(__METHOD__ . " $error_msg", logger::ERROR);
				return $response;
			}

		// SEC-024 (§9.2): READ gate. get_pdf_data extracts text from a PDF
		// component file; require read on (section_tipo, component_tipo).
		// Throws permission_exception (uncaught here) if the user has no read access,
		// so the API layer can return a 403 before any file I/O occurs.
			security::assert_tipo_permission($section_tipo, $component_tipo, 1, __METHOD__);

		try {
			// component_pdf. Create the component to get the file path
			// Mode 'list' is sufficient — we only need the file locator, not edit metadata.
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
			// tool_common::get_config() returns ?array (keyed 'config', 'label', …).
			// The code below accesses $config as an object via ->config->{$method}->default;
			// this works when PHP casts the array to an object implicitly, but it is
			// technically accessing the 'config' key of the array through object syntax.
			// (!) Pre-existing behaviour — do not change.
				$config = tool_common::get_config('tool_pdf_extractor');
				if ($config === null) {
					throw new Exception("Unable to load configuration for tool_pdf_extractor");
				}

				$engine = $config->config->{$method}->default ?? null;
				if (empty($engine)) {
					throw new Exception("PDF extraction engine not configured for method: $method. Configuration: " . to_string($config));
				}

				// prepare transcription options
				// component_pdf::get_text_from_pdf() reads these three keys plus 'method'.
				$transcription_options = new stdClass();
					$transcription_options->engine	= $engine;
					$transcription_options->method	= $method; // 'text' or 'html'
					$transcription_options->page_in	= $page_in; // First page (1-indexed), null = start from page 1
					$transcription_options->page_out = $page_out; // Last page (inclusive), null = extract all

			// execute PDF text extraction
			// component_pdf::get_text_from_pdf() shells out to pdftotext/pdftohtml and
			// returns a stdClass{result, msg, errors}. A null return signals an internal
			// failure in the component (rare; treated as fatal here).
				$process_text_response = $component->get_text_from_pdf($transcription_options);

				if ($process_text_response === null) {
					throw new Exception("PDF extraction returned null response from component");
				}

			// process response and apply HTML encoding for safety
			// Only encode when result is a string; the component may return false on failure.
			// ENT_QUOTES encodes both single and double quotes so the text is safe for
			// insertion into HTML attribute values as well as element content.
				$response->result = is_string($process_text_response->result)
					? htmlentities($process_text_response->result, ENT_QUOTES, 'UTF-8')
					: $process_text_response->result;
				$response->msg = $process_text_response->msg ?? 'OK. Request done';
				// merge rather than replace so any errors accumulated before the try block
				// (e.g. validation warnings) are preserved alongside component errors.
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
