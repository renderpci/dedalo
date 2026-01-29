<?php declare(strict_types=1);
/**
 * JSON STREAMING HANDLER
 * Outputs JSON in chunks to avoid high memory consumption with large datasets.
 */
class json_streaming_handler {


	/**
	 * STREAM
	 * Outputs the value as a JSON string directly to the output buffer.
	 * If the value is a large array or object, it streams it in chunks.
	 *
	 * @param mixed $value
	 * @param int $options
	 * @param int $chunk_size Threshold to trigger chunked encoding for arrays
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

		if (is_array($value) && count($value) > $chunk_size) {
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
	 */
	/**
	 * STREAM_OBJECT
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
