<?php declare(strict_types=1);
include __DIR__ .'/class.json_streaming_handler.php';
/**
* JSON_HANDLER
* Centralised, error-aware wrapper around PHP's native json_encode / json_decode.
*
* All Dédalo code that needs to serialise or deserialise JSON MUST go through
* this class rather than calling json_encode/json_decode directly.  Doing so
* gives three guarantees:
*
* - Encode failures are never silently swallowed: json_handler::encode() throws
*   a RuntimeException (and emits a structured debug dump when SHOW_DEBUG is on)
*   so a bad value never silently propagates a boolean false into a DB write or
*   an API response.
* - Decode errors are always logged via debug_log (logger::ERROR) with enough
*   context (the raw string, the caller trace) to diagnose corruption quickly.
* - A lightweight is_json() guard lets callers distinguish a serialised datum
*   (returned as a JSON string from the DB) from a plain string value without
*   writing ad-hoc json_decode probes all over the codebase.
*
* The class also auto-includes json_streaming_handler, which provides chunked
* output for large array responses (see class.json_streaming_handler.php).
*
* Relationships:
* - Used by virtually every component, DB manager, and API endpoint in Dédalo.
* - json_streaming_handler (included here) delegates back to json_handler::encode
*   for non-list values and for pretty-print mode.
*
* @package Dédalo
* @subpackage Core
*/
class json_handler {



	/**
	* Human-readable labels for PHP's JSON_ERROR_* constants.
	* Keyed by the integer error code returned by json_last_error().
	* Used when building exception messages and log entries after a failed
	* json_encode call.  Codes not listed here fall back to json_last_error_msg().
	*
	* @var array<int,string> $_messages
	*/
	protected static array $_messages = [
		JSON_ERROR_NONE				=> 'No error has occurred',
		JSON_ERROR_DEPTH			=> 'The maximum stack depth has been exceeded',
		JSON_ERROR_STATE_MISMATCH	=> 'Invalid or malformed JSON',
		JSON_ERROR_CTRL_CHAR		=> 'Control character error, possibly incorrectly encoded',
		JSON_ERROR_SYNTAX			=> 'Syntax error',
		JSON_ERROR_UTF8				=> 'Malformed UTF-8 characters, possibly incorrectly encoded'
	];



	/**
	* ENCODE
	* Serialises $value to a JSON string, throwing on failure.
	*
	* Uses JSON_UNESCAPED_UNICODE by default so that multi-language strings
	* stored in component datos (e.g. {"lg-spa":"…","lg-eng":"…"}) survive
	* round-trips without unnecessary \uXXXX escaping.
	*
	* When encoding fails (json_encode returns false):
	*   - If SHOW_DEBUG is true, dumps the offending value, its type, and the
	*     full call stack to the browser/CLI output for immediate diagnosis.
	*   - Always writes a structured entry to the Dédalo logger at ERROR level.
	*   - Throws RuntimeException so the caller cannot silently continue with
	*     a false value masquerading as valid JSON.
	*
	* @param mixed $value - The value to encode; any PHP type that json_encode accepts.
	* @param int $options [= JSON_UNESCAPED_UNICODE] - Bitmask of JSON_* option flags
	*        passed directly to json_encode.  Override when the caller needs
	*        JSON_PRETTY_PRINT, JSON_UNESCAPED_SLASHES, etc.
	* @return string|false - The encoded JSON string.  Returns false only if
	*         json_encode itself returns false AND execution somehow continues past
	*         the RuntimeException (practically unreachable).
	* @throws RuntimeException - When json_encode fails; message taken from
	*         $_messages keyed by json_last_error(), falling back to json_last_error_msg().
	*/
	public static function encode(mixed $value, int $options=JSON_UNESCAPED_UNICODE) : string|false {

		$result = json_encode($value, $options);

		// success case
			if($result!==false) {
				return $result;
			}

		// error case
			if(SHOW_DEBUG===true) {

				$type = gettype($value);
				dump($result, ' result (json_encoded) ++ '.to_string());
				dump($value,  ' value - type: '.to_string($type));
				trigger_error("json_handler GETTYPE: ".$type);

				if ($type==='string') {
					$encoding = mb_detect_encoding($value);
					trigger_error("MB_DETECT_ENCODING: ".$encoding);
				}
				dump(debug_backtrace(), ')))) debug_backtrace() ++ '.to_string());
			}

			debug_log(__METHOD__
				. " JSON encode error " .PHP_EOL
				. 'value: ' . print_r($value, true) .PHP_EOL
				. 'json_last_error: '.json_last_error() .PHP_EOL
				. 'json_last_error_msg: '.json_last_error_msg() .PHP_EOL
				// DB-08: parenthesize the coalesce. Without parens, '.' binds tighter
				// than '??', so the fallback applied to the whole (never-null) string
				// and an unknown error code produced an undefined-index null instead.
				. (json_handler::$_messages[json_last_error()] ?? 'Unknown error')
				, logger::ERROR
			);

		throw new RuntimeException(static::$_messages[json_last_error()] ?? json_last_error_msg());
	}//end encode



	/**
	* DECODE
	* Deserialises a JSON string, logging any parse error without throwing.
	*
	* The 'null' literal is treated as a special case: PHP's json_decode('null')
	* returns null with no error, but callers that store an intentional SQL NULL
	* as the string 'null' would get back a PHP null without the caller knowing
	* whether the DB column was empty or contained the JSON null literal.
	* Returning PHP null early for this input makes the behaviour explicit and
	* consistent across the codebase.
	*
	* On a parse error json_last_error() is checked and the problem is recorded
	* via debug_log (logger::ERROR) with: the raw input string, the error code/
	* message, the assoc flag, and a two-frame backtrace.  The method still
	* returns whatever json_decode produced (typically null) so callers are not
	* forced to wrap every call in try/catch.
	*
	* @param string $json - The raw JSON string to decode.
	* @param bool $assoc [= false] - When true, JSON objects are decoded as
	*        associative arrays rather than stdClass instances.  Mirrors the
	*        native json_decode $associative parameter.
	* @return mixed - Decoded PHP value; null on parse failure or when $json
	*         is the literal string 'null'.
	*/
	public static function decode(string $json, bool $assoc=false) : mixed {

		if ($json==='null') {
			return null;
		}

		$result = json_decode($json, $assoc);

		// check errors
			if (json_last_error()!==JSON_ERROR_NONE) {
				$trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
				debug_log(__METHOD__
					. " Error on decode JSON value: " .PHP_EOL
					. 'json_last_error: '.json_last_error() .PHP_EOL
					. 'json_last_error_msg: '.json_last_error_msg() .PHP_EOL
					. 'string $json: '. $json .PHP_EOL
					. 'assoc: '. to_string($assoc) .PHP_EOL
					. 'trace: '. print_r($trace, true)
					, logger::ERROR
				);
			}

		return $result;
	}//end decode



	/**
	* IS_JSON
	* Returns true only when $value is a well-formed JSON-encoded array string.
	*
	* Used throughout Dédalo's import pipeline (conform_import_data) to decide
	* whether an incoming field value is a serialised dato (e.g. the Dédalo
	* localized-text structure {"lg-spa":["…"],"lg-eng":["…"]}) or a plain
	* scalar string that still needs to be wrapped.  The check decodes the string
	* and verifies the top-level type is array so that plain JSON scalars such as
	* "42" or "true" are not mistakenly treated as structured dato objects.
	*
	* (!) The check calls json_decode internally, which can be non-trivial for
	* long strings.  Avoid calling this in tight loops on large datasets.
	*
	* @param mixed $value - Value to test; non-string values always return false.
	* @return bool - true if $value is a string containing a valid JSON array,
	*         false otherwise (wrong type, invalid JSON, or a JSON non-array).
	*/
	public static function is_json(mixed $value) : bool {
		return is_string($value) && is_array(json_decode($value, true)) && (json_last_error() == JSON_ERROR_NONE)
			? true
			: false;
	}//end is_json



}//end class json_handler
