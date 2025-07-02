<?php declare(strict_types=1);
/**
* PARSER_TEXT
* Process the diffusion object text values.
* It will apply some rules to text values to join, split, cut, etc.
* All public functions needs to be static.
* They will called by every diffusion class as: diffusion_xml.php, diffusion_sql.php, etc.
*
* It can be loaded with `parser_main.php` or alone.
* Example to load it using properties in `diffusion_element`.
*	{
*		"diffusion":{
*			"parser":[
*				"/core/diffusion/parser/class.parser_text.php"
*			]
*		}
*	}
*
* And use in the diffusion nodes as:
*	{
*		"fn"		: "parser_text::text_format"
*		"options"	: {
*			"pattern":"{a}, ${b}, ${c}/${d}"
*		}
*	}
* inside `process->parser` property.
*
* Processing data:
* The data resolution of the `ddo_map` chain, will be sent to the parser function as an array of objects with the data resolution in `value` property.
* Therefore, the called function here must be data compatible with the get data function defined in specific `ddo` in `ddo_map` chain.
* By default the data function is: `get_value`, but is possible defines any other data functions of the component inside a `ddo` in `ddo_map` of the `process` object.
* For example:
* To join a Title (rsc23), Date (rsc26) and Code (rsc21) of Interviews section (oh1) to obtain a specific formatted text chain with specific text pattern as:
*	{$title, $date/$code}
*
* and get something as:
*	"My first title, 25/02/1975/aoh25_dfcv"
*
* it must defines the `ddo_map` chain to get the value of every component data and defines the `ddo` `id` to identify every value.
* The data resolution will be send to the parser function as an array of objects like:
*	"data" : [
*		{"id": "a", "value": "My first title"},
*		{"id": "b", "value": "25/02/1975"},
*		{"id": "c", "value": "aoh25_dfcv"}
*	]
*
* and the parser function will get the pattern definition in options object as:
*	"options": {
*		"pattern":"${a}, ${b}/${c}}"
*	}
*
* Its full definition in the properties:
*
*	{
*		"process" :{
*			"ddo_map" :[
*				{
*					"section_tipo"  : "oh1",
*					"tipo"			: "rsc23"
*					"fn"			: "get_value",	<-- The get data function, it must be compatible with the parser function.
*					"id"			: "a",			<-- The id will send in data to identify the source.
*					"parent"		: "self"
*				},
*				{
*					"section_tipo"  : "oh1",
*					"tipo"			: "rsc26"
*					"fn"			: "get_value",	<-- The get data function, it must be compatible with the parser function.
*					"id"			: "b",			<-- The id will send in data to identify the source.
*					"parent"		: "self"
*				},
*				{
*					"section_tipo"  : "oh1",
*					"tipo"			: "rsc21"
*					"fn"			: "get_value",	<-- The get data function, it must be compatible with the parser function.
*					"id"			: "c",			<-- The id will send in data to identify the source.
*					"parent"		: "self"
*				},
*			],
*			"parser": [
*				{
*					"fn"		: "parser_text::text_format",		<-- The function to be used, it must to be compatible with the data function.
*					"options"	: {"pattern":"${a}, ${b}/${c}}"}	<-- The arguments to be sent to the parser function
*				}
*			]
*		}
*	}
*
*/
class parser_text {



	/**
	* DEFAULT_JOIN
	* Creates a generic $separator concatenated string with all values (stringify non strings).
	* It is used as the default parser for data if no parser is set in the properties.
	* @param array|null $data
	* @param object $options
	* @return string|null $value
	*/
	public static function default_join( ?array $data, object $options ) : ?string {

		// options
		$separator = $options->separator ?? ' | ';

		if(empty($data)) return null;

		$values = [];
		foreach ($data as $current_item) {
			$values[] = is_string($current_item->value)
				? $current_item->value
				: json_encode( $current_item->value );
		}

		$value = implode($separator, $values);


		return $value;
	}//end default_join



	/**
	* TEXT_FORMAT_LEGACY
	* Generic text parser
	* @param array|null $data
	* @param object $options
	* @return string|null $value
	*/
	public static function text_format_legacy( ?array $data, object $options ) : ?string {

		// options
		$pattern = $options->pattern ?? null;

		if(empty($data)) return null;

		// pattern case
		if ($pattern) {
			// replace the text template with the data ex: "${a}, ${b}, ${c}/${d}"
			foreach ($data as $current_ddo_to_join) {

				$search = '${' . ($current_ddo_to_join->id ?? '') .'}';

				$current_value	= is_array($current_ddo_to_join->value)
					? implode(',', $current_ddo_to_join->value)
					: ($current_ddo_to_join->value ?? '');

				$replace_value = is_string($current_value) || $current_value===null
					? $current_value
					: json_encode($current_value);

				$pattern = !empty($pattern)
					? str_replace($search, $replace_value, $pattern)
					: $pattern;
			}

			$value = $pattern ?? null;
		}else{
			$value = self::default_join($data, $options);
		}


		return $value;
	}//end text_format_legacy



	/**
	 * TEXT_FORMAT - Generic Text Pattern Processor
	 *
	 * This method processes an array of structured data objects and formats them according to
	 * a specified pattern template. It's designed to work with data objects that have 'id' and
	 * 'value' properties, extracting the values and substituting them into a pattern string.
	 *
	 * The method supports two modes:
	 * 1. Pattern-based formatting using placeholders like '${a}, ${b} : ${c}'
	 * 2. Default joining fallback when no pattern is provided
	 *
	 * @param array|null $data Array of objects, each containing 'id' and 'value' properties
	 *                         Example: [
	 *                             (object)['id' => 'name', 'value' => 'John'],
	 *                             (object)['id' => 'surname', 'value' => 'Doe'],
	 *                             (object)['id' => 'city', 'value' => 'London']
	 *                         ]
	 *
	 * @param object $options Configuration object that may contain:
	 *                       - pattern: String template with ${variable} placeholders
	 *                       - Additional options passed to default_join() if no pattern
	 *
	 * @return string|null Formatted string according to pattern, or null if no data provided
	 *
	 * @example
	 * $data = [
	 *     (object)['id' => 'firstName', 'value' => 'John'],
	 *     (object)['id' => 'lastName', 'value' => 'Doe'],
	 *     (object)['id' => 'city', 'value' => 'London']
	 * ];
	 * $options = (object)['pattern' => '${firstName} ${lastName} from ${city}'];
	 * $result = self::text_format($data, $options);
	 * // Returns: "John Doe from London"
	 */
	public static function text_format(?array $data, object $options): ?string {

		// Extract pattern from options, default to null if not provided
		$pattern = $options->pattern ?? null;

		// Early return if no data provided - nothing to format
		if (empty($data)) {
			return null;
		}

		// pattern-based processing
		if ($pattern) {
			// Initialize array to collect processed values from data objects
			$values = [];

			// Process each data item and extract values for pattern replacement
			foreach ($data as $index => $item) {

				// Validate that each item is a properly structured data object
				// Expected structure: object with 'id' and 'value' properties
				if (!is_object($item) ||
					!property_exists($item, 'id') ||
					!property_exists($item, 'value')) {

					// Log validation error for debugging purposes
					debug_log(
						__METHOD__ . " Ignored invalid data object at index {$index}" . PHP_EOL .
						' item: ' . to_string($item),
						logger::ERROR
					);

					// Add null placeholder to maintain array index consistency
					// This ensures pattern replacement positions remain aligned
					$values[] = null;
					continue;
				}

				// value type processing and conversion
				$itemValue = $item->value;

				// Handle different value types appropriately for string interpolation
				if (is_array($itemValue)) {
					// Convert arrays to comma-separated strings
					// Example: ['apple', 'banana', 'cherry'] → 'apple,banana,cherry'
					$values[] = implode(',', $itemValue);

				} elseif (is_scalar($itemValue) || $itemValue === null) {
					// Handle scalar types (int, float, string, bool) and null
					// Explicit string casting ensures consistent type for pattern replacement
					$values[] = ($itemValue !== null) ? (string) $itemValue : null;

				} else {
					// Handle complex types (objects, resources, etc.) by JSON encoding
					// This provides a readable string representation of complex data
					$values[] = json_encode($itemValue);
				}
			}

			// pattern replacement execution
			try {
				// Use the pattern_replacer class to perform sophisticated replacement
				// This handles empty values, spacing, and punctuation cleanup
				$replacer = new pattern_replacer();
				$value = $replacer->replace($pattern, $values);

			} catch (Exception $e) {
				// Log pattern replacement errors
				debug_log(
					__METHOD__ . " Pattern replacement failed" . PHP_EOL .
					" Pattern: {$pattern}" . PHP_EOL .
					" Values: " . json_encode($values) . PHP_EOL .
					" Error: " . $e->getMessage(),
					logger::ERROR
				);

				// Fallback to default join on pattern replacement failure
				$value = self::default_join($data, $options);
			}

		} else {

			// fallback to default join

			// When no pattern is specified, use the default joining method
			// This provides a fallback formatting option with simpler logic
			$value = self::default_join($data, $options);
		}

		return $value;
	}//end text_format



}//end parser_text
