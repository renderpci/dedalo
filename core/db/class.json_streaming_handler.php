<?php declare(strict_types=1);
/**
* CLASS JSON_STREAMING_HANDLER
* Outputs large PHP values as JSON directly to the output buffer in fixed-size
* chunks, avoiding the peak-memory spike caused by building one giant string in
* json_encode() before writing a single byte.
*
* Responsibilities:
* - Detect whether a value is large enough to warrant chunk-streaming.
* - Walk arrays (sequential lists only) in batches of $chunk_size items,
*   serialising each batch with json_encode() and echoing the raw element
*   tokens between the opening and closing brackets, so the complete output
*   is valid JSON.
* - Walk objects property-by-property, recursing into nested values so that
*   deeply nested large lists are also streamed.
* - Delegate to json_handler::encode() when pretty-printing is requested
*   (streaming + pretty-print is incompatible) or when the value is too small
*   to benefit from chunking.
*
* Primary call site: core/api/v1/json/index.php, which invokes
* json_streaming_handler::stream($response, $options) after building the full
* $response object. Streaming is skipped inside RoadRunner (DEDALO_RR_WORKER)
* where ob_start() intercepts output and native json_encode() is faster.
*
* Relationship:
* - Included by class.json_handler.php (which defines json_handler::encode,
*   the fallback used throughout this class).
* - Has NO state; all methods are static and the class is never instantiated.
*
* @package Dédalo
* @subpackage Core
*/
class json_streaming_handler {


	/**
	* STREAM
	* Entry point. Serialises $value as JSON and echoes it directly to the
	* output buffer, streaming large sequential arrays in chunks to cap memory
	* usage regardless of dataset size.
	*
	* Decision tree:
	* 1. JSON_PRETTY_PRINT requested → delegate entirely to json_handler::encode()
	*    because pretty-printing requires global indentation context that cannot
	*    be reconstructed across independent chunk calls.
	* 2. Sequential list with count > $chunk_size → stream_array().
	* 3. Object → stream_object(), which recurses into large nested arrays.
	* 4. Everything else (scalars, small arrays, associative arrays) →
	*    json_handler::encode() in one shot.
	*
	* (!) Associative arrays fall to branch 4. stream_array() strips outer
	* brackets from each chunk's json_encode() output; doing so on an
	* associative-array chunk would produce malformed key:value pairs inside
	* a JSON array context (see DB-04 note in the body). Callers must not pass
	* associative arrays larger than $chunk_size expecting chunked output.
	*
	* @param mixed $value       - the PHP value to serialise
	* @param int   $options     = 0          - bitmask of json_encode() flags
	* @param int   $chunk_size  = 1000       - item count above which a sequential
	*                                          array is streamed rather than encoded
	*                                          in one call
	* @return void
	*/
	public static function stream($value, int $options = 0, int $chunk_size = 1000): void {

		// If pretty print is requested, fallback to standard json_handler to ensure proper formatting
		// Streaming pretty print is complex and not performance-critical for production
		if ($options & JSON_PRETTY_PRINT) {
			echo json_handler::encode($value, $options);
			return;
		}

		// Use matching options for internal json_encode calls
		// We remove JSON_PRETTY_PRINT from options passed down if we get here,
		// but we already returned above if it was set.

		// DB-04: only stream true LISTS. stream_array reindexes its chunk buffer and
		// strips the outer brackets, which drops the string keys of an associative
		// array and emits a values-only array instead of the intended object. Large
		// associative arrays fall through to json_handler::encode, which is correct.
		if (is_array($value) && array_is_list($value) && count($value) > $chunk_size) {
			self::stream_array($value, $options, $chunk_size);
		} elseif (is_object($value)) {
			// Check if object has a large array property that we should stream?
			// For generic objects, we'll implement a shallow inspection to find the "data" property if it exists and is large
			// This is tailored for the specific API response structure (result, msg, data:[...])
			// but we can make it generic iterate.
			self::stream_object($value, $options, $chunk_size);
		} else {
			echo json_handler::encode($value, $options);
		}
	}

	/**
	* STREAM_ARRAY
	* Serialises a sequential PHP array to JSON by encoding $chunk_size items
	* at a time and writing the inner token sequence (without enclosing brackets)
	* to the output buffer, surrounding the whole output with literal '[' / ']'.
	*
	* The bracket-stripping technique works safely here because:
	* - The caller (stream() / stream_recursive()) guarantees the input passes
	*   array_is_list(), so json_encode($buffer) always produces "[item,item,…]".
	* - substr($json_chunk, 1, -1) removes exactly those two bracket characters,
	*   leaving the comma-separated element tokens that belong between the
	*   already-emitted outer brackets.
	*
	* (!) Do NOT call this method on associative arrays. Each chunk would be
	* encoded as a JSON object ("{…}"), and stripping one character from each
	* end would produce syntactically invalid JSON.
	*
	* Side effects: echoes directly to the output buffer.
	*
	* @param array $array      - sequential (list) array to serialise
	* @param int   $options    - json_encode() flag bitmask
	* @param int   $chunk_size - number of items per batch
	* @return void
	*/
	protected static function stream_array(array $array, int $options, int $chunk_size): void {
		echo '[';

		$buffer = [];
		$count = 0;
		$has_printed = false;

		foreach ($array as $item) {
			$buffer[] = $item;
			$count++;

			if ($count >= $chunk_size) {
				if ($has_printed) {
					echo ',';
				}
				$json_chunk = json_encode($buffer, $options);
				// Remove leading '[' and trailing ']' from the chunk
				// echo substr($json_chunk, 1, -1);
				// Actually, removing brackets is risky if keys are preserved or if it allows assoc.
				// For a list (indexed array), json_encode([item1, item2]) -> "[item1,item2]". substr -> "item1,item2" works.
				// If the array is associative, this basic chunking logic implies we are treating it as a list
				// or we need to be careful.
				// If the input $array is associative, json_encode($buffer) might produce {"a":1,"b":2}.
				// Removing default brackets from {"a":1} -> "a":1 is valid for object internals.

				// Let's implement a safer check:
				// If we are iterating an array, we should check if it's associative or sequential?
				// For the "data" of 19000 objects, it's a sequential array.
				// We will assume sequential for the "array" chunks for now as that's the performance target.

				// Optimization: We know we want to output comma separated items.
				if ($json_chunk !== false && strlen($json_chunk) > 2) {
					echo substr($json_chunk, 1, -1);
					$has_printed = true;
				}

				$buffer = [];
				$count = 0;
			}
		}

		// Flush remaining
		if (!empty($buffer)) {
			if ($has_printed) {
				echo ',';
			}
			$json_chunk = json_encode($buffer, $options);
			if ($json_chunk !== false && strlen($json_chunk) > 2) {
				echo substr($json_chunk, 1, -1);
			}
		}

		echo ']';
	}

	/**
	* STREAM_OBJECT
	* Serialises a PHP object to JSON by iterating its public properties and
	* echoing each key:value pair surrounded by literal '{' / '}'. Each value
	* is delegated to stream_recursive() so that any large sequential array
	* encountered at any nesting depth is itself streamed rather than
	* json_encode()'d in full.
	*
	* This method is the primary path for the top-level Dédalo API response
	* object, which typically has the shape:
	*   { "result": true, "msg": "", "data": [ …thousands of records… ] }
	* The "data" property, when large, is handed off to stream_array() by
	* stream_recursive().
	*
	* Side effects: echoes directly to the output buffer.
	*
	* @param object $object     - the object whose public properties to serialise
	* @param int    $options    - json_encode() flag bitmask
	* @param int    $chunk_size - propagated to stream_recursive() for nested arrays
	* @return void
	*/
	protected static function stream_object(object $object, int $options, int $chunk_size): void {
		echo '{';

		$first = true;
		foreach ($object as $key => $val) {
			if (!$first) {
				echo ',';
			}

			// Key
			echo json_encode((string)$key, $options) . ':';

			// Value
			self::stream_recursive($val, $options, $chunk_size);

			$first = false;
		}

		echo '}';
	}

	/**
	* STREAM_RECURSIVE
	* Helper to handle nested values consistently
	*
	* Dispatches a single property value to the correct serialisation strategy:
	* - Sequential array exceeding $chunk_size → stream_array() (chunked).
	* - Smaller or associative array             → json_encode() in one call
	*   (associative arrays must never enter stream_array(); see DB-04).
	* - Object                                   → stream_object() (recursive).
	* - Scalar / null                            → json_encode() in one call.
	*
	* Called by stream_object() for every property value, and indirectly by
	* stream_array() for each item that itself happens to be an object.
	*
	* @param mixed $val        - the value to serialise
	* @param int   $options    - json_encode() flag bitmask
	* @param int   $chunk_size - threshold for triggering chunked array streaming
	* @return void
	*/
	protected static function stream_recursive($val, int $options, int $chunk_size): void {
		if (is_array($val)) {
			// Only stream sequential arrays that exceed the chunk size
			if (array_is_list($val) && count($val) > $chunk_size) {
				self::stream_array($val, $options, $chunk_size);
			} else {
				echo json_encode($val, $options);
			}
		} elseif (is_object($val)) {
			// Objects are always streamed recursively to find nested large arrays
			self::stream_object($val, $options, $chunk_size);
		} else {
			echo json_encode($val, $options);
		}
	}

}
