<?php
/**
* CLASS BABEL
* HTTP adapter for the Apertium-based Babel translation service.
*
* This class provides the low-level integration layer between Dédalo's
* tool_lang and an external Babel (Apertium) server.  It is responsible for:
* - Building the cURL request (direction string, API key, source text).
* - Protecting Dédalo's custom markup tags (timecodes, index marks, SVG
*   annotations, etc.) from being mangled by the Apertium engine, by wrapping
*   them in <apertium-notrans> elements before transmission via TR::addBabelTagsOnTheFly().
* - Decoding HTML-entity-encoded output that Babel returns for special characters.
* - Stripping the residual <apertium-notrans> wrapper elements from the translated
*   result so the restored tags look identical to the originals.
* - SSRF defence: validating the target URL (SEC-076) before issuing any outbound
*   HTTP request.
*
* This class is NOT responsible for persisting translated data — that is done by
* tool_lang::automatic_translation() which calls babel::translate() as a black box
* and maps the returned string back into the component data model.
*
* Relationships:
* - Called exclusively by tool_lang (lazily loaded via include_once when the
*   'babel' engine is selected for a translation request).
* - Delegates tag-preservation logic to TR::addBabelTagsOnTheFly() (class.TR.php).
* - Delegates outbound HTTP to the global curl_request() helper and URL validation
*   to is_safe_remote_url() (both defined in core shared helpers).
*
* @package Dédalo
* @subpackage Tools
*/
class babel {



	/**
	* TRANSLATE
	* Send a single text string to the Babel (Apertium) translation service via
	* cURL and return the translated result.
	*
	* Processing pipeline:
	*   1. Merge caller-supplied $request_options into a known-keys stdClass to
	*      prevent arbitrary property injection.
	*   2. Convert source/target lang codes (e.g. 'lg-spa', 'lg-eng') to the
	*      Apertium direction format (e.g. 'sp-en') via get_babel_direction().
	*   3. Wrap Dédalo custom markup tags in <apertium-notrans> using
	*      TR::addBabelTagsOnTheFly() so the engine leaves them untouched.
	*   4. Validate the target URL against SSRF rules (SEC-076) before sending.
	*   5. POST {key, text, direction} to the Babel endpoint via curl_request().
	*   6. Check the raw response for known Babel error strings ("Error: Mode",
	*      "Error. You need authorization") and bail early if found.
	*   7. Decode HTML entities (Babel always returns special chars as HTML
	*      entities; ENT_COMPAT + UTF-8 is used to avoid quote corruption).
	*   8. Strip residual <apertium-notrans> wrapper tags from the result via
	*      sanitize_result() while preserving allowed inline HTML (<p>, <br>,
	*      <strong>, <em>).
	*
	* On failure (SSRF block, cURL error, Babel error string), $response->result
	* is false and $response->msg carries a human-readable explanation.  The
	* caller (tool_lang::automatic_translation) treats result===false as a hard
	* stop and returns an error response without saving anything.
	*
	* @param object $request_options Translation request parameters.
	*   {
	*     uri         : string|null — Full URL to the Babel HTTP endpoint.
	*     key         : string|null — API key sent as a POST field.
	*     source_lang : string|null — Source language in Dédalo format (e.g. 'lg-spa').
	*     target_lang : string|null — Target language in Dédalo format (e.g. 'lg-eng').
	*     text        : string|null — Source text to translate (may contain Dédalo markup).
	*   }
	* @return object $response
	*   {
	*     result     : string|false — Translated and sanitized text, or false on error.
	*     msg        : string       — Status or error description.
	*     raw_result : string       — Unmodified body returned by the Babel service
	*                                 (populated only on success; useful for debug logging).
	*   }
	*/
	public static function translate(object $request_options): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$options = new stdClass();
			$options->uri			= null;
			$options->key			= null;
			$options->source_lang	= null;
			$options->target_lang	= null;
			$options->text			= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// babel config
			$direction	= self::get_babel_direction($options->source_lang, $options->target_lang);
			$url		= $options->uri; // DEDALO_TRANSLATOR_URL['babel'];

		// add custom image tags to avoid Apertium change original tags
			$source_text = trim(TR::addBabelTagsOnTheFly($options->text ?? ''));

		// http query vars
			$fields = [
				'key' 		=> $options->key,
				'text' 		=> $source_text,
				'direction' => $direction
			];

		// SEC-076: SSRF defence-in-depth. $url is config-defined
		// (DEDALO_TRANSLATOR_URL['babel']), but validating it here means a
		// misconfiguration can't be weaponised to hit cloud-metadata or
		// internal services. Allow non-standard ports (translation backends
		// often listen on :8080 / :8443).
			if (!is_safe_remote_url((string)$url, (object)['allow_custom_ports' => true])) {
				debug_log(__METHOD__
					.' SEC-076: refused unsafe babel URL: ' . to_string($url)
					, logger::ERROR
				);
				$response->msg = 'Trigger Error: ['.__FUNCTION__.'] invalid translator URL';
				return $response;
			}

		// curl request (core functions)
			$curl_response = curl_request((object)[
				'url'			=> $url,
				'postfields'	=> $fields,
				'header'		=> false
			]);
			$result = $curl_response->result;

		// raw result
			$raw_result = $result;
			debug_log(__METHOD__." babel:translate ----> raw_result ".PHP_EOL.to_string($raw_result), logger::DEBUG);

		// check invalild response or error
			$ar_invalid_response = array('Error: Mode','Error. You need authorization');
			foreach ($ar_invalid_response as $invalid_response) {
				if( strpos($result, $invalid_response)!==false ) {
					$response->msg = 'Trigger Error: ['.__FUNCTION__.'] '.$result;
					return $response;
				}
			}

		// decode html entities. Babel returns the special characters encoded as html entities.
		// To reverse the format we use html_entity_decode converting double quotes to
		// simple (flag ENT_COMPAT) and forcing the final format to UTF-8
			$result = html_entity_decode($result, ENT_COMPAT, 'UTF-8');

		// Sanitize babel result
		// Apertium changes the format of the labels upon return. They are replaced here
			$result = self::sanitize_result($result);

		// response object
			$response = new stdClass();
				$response->result		= $result;
				$response->msg			= 'Ok. Request done ['.__FUNCTION__.']';
				$response->raw_result	= $raw_result;


		return (object)$response;
	}//end translate



	/**
	* GET_BABEL_DIRECTION
	* Convert Dédalo language codes to the two-part direction string expected by
	* the Apertium/Babel API (e.g. 'lg-spa' + 'lg-eng' → 'sp-en').
	*
	* Dédalo stores language identifiers as 'lg-' + ISO 639-3 code (three chars),
	* e.g. 'lg-spa', 'lg-eng', 'lg-cat', 'lg-deu'.  Apertium's direction parameter
	* uses two-letter codes for most language pairs but requires the full three-letter
	* 'deu'/'eng' suffix for the German pair — hence the special-case branch.
	*
	* Extraction strategy:
	*   For standard languages: substr offset 3, length 2 strips 'lg-' and takes the
	*   first two characters of the ISO code (e.g. 'lg-spa' → 'sp').
	*   For German source: the full three-character code 'deu' is used; the only
	*   supported German target is English ('lg-eng' → 'eng').
	*
	* (!) The German exception only reassigns $target_babel when $target_lang is
	* 'lg-eng'. Other German target languages retain the generic substr extraction,
	* which may be incorrect — document and validate when adding new German pairs.
	*
	* @param string $source_lang — Source language in Dédalo format (e.g. 'lg-spa').
	* @param string $target_lang — Target language in Dédalo format (e.g. 'lg-eng').
	* @return string — Direction string in Apertium format (e.g. 'sp-en', 'deu-eng').
	*/
	public static function get_babel_direction($source_lang, $target_lang) {

		# for babel like "ca-es";
		$source_babel	= substr($source_lang,3,2);
		$target_babel	= substr($target_lang,3,2);

		// german exception
		if ($source_lang==='lg-deu') {
			$source_babel = 'deu';
			if ($target_lang==='lg-eng') {
			$target_babel = 'eng';
			}
		}

		return $source_babel . '-' . $target_babel ;
	}//end get_babel_direction



	/**
	* SANITIZE_RESULT
	* Remove residual Apertium wrapper tags from the translated string while
	* preserving a small set of allowed inline HTML elements.
	*
	* After translation the Babel service returns the text with the
	* <apertium-notrans>…</apertium-notrans> wrappers still in place around the
	* Dédalo markup tags that were protected in translate().  strip_tags() with an
	* allowlist removes the Apertium wrapper and any other unknown tags, but keeps
	* the protected Dédalo tags (which are already inside the wrappers as plain
	* text) and the small set of semantic HTML elements (<p>, <br>, <strong>, <em>)
	* that may legitimately appear in transcription text.
	*
	* The commented-out '<apertium-notrans>' in the allowlist is intentionally left
	* so that future developers can see it was evaluated and rejected — stripping
	* that tag is the whole point of this method.
	*
	* @param string $result — Raw translated string returned by the Babel service,
	*   potentially containing <apertium-notrans> wrapper elements.
	* @return string — Sanitized string with Apertium wrapper tags removed and
	*   inline Dédalo markup restored.
	*/
	public static function sanitize_result($result) {

		// Strip tags is applied to remove tags added to non translatable elements (apertium tags like '<apertium-notrans>')
		$sanitized = strip_tags($result, '<p><br><strong><em>');	//'<br><strong><em><apertium-notrans>'

		return $sanitized;
	}//end sanitize_result



}//end class babel
