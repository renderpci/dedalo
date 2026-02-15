<?php declare(strict_types=1);
/**
* PARSER_DATE
* Process the diffusion object date values.
* It will apply some rules to text values to join, split, cut, etc.
* All public functions needs to be static.
* They will called by every diffusion class as: diffusion_xml.php, diffusion_sql.php, etc.
*
* It can be loaded with `parser_main.php` or alone.
* Example to load it using properties in `diffusion_element`.
*	{
*		"diffusion":{
*			"parser":[
*				"/core/diffusion/parser/class.parser_date.php"
*			]
*		}
*	}
*
* And use in the diffusion nodes as:
*	{
*		"fn"		: "parser_date::default_join"
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
*					"fn"		: "parser_date::text_format",		<-- The function to be used, it must to be compatible with the data function.
*					"options"	: {"pattern":"${a}, ${b}/${c}}"}	<-- The arguments to be sent to the parser function
*				}
*			]
*		}
*	}
*
*/
class parser_date {



	/**
	* STRING_DATE
	* Generic date as string parser
	* @param array|null $data
	* @param object $options
	* @return string|null $value
	*/
	public static function string_date( ?array $data, object $options ) : ?string {

		// options
		$pattern			= $options->pattern ?? 'Y-m-d'; // Y-m-d H:i:s
		$records_separator	= $options->records_separator ?? ' | ';
		$fields_separator	= $options->fields_separator ?? ', ';
		$date_mode			= $options->date_mode ?? 'date';
		$lang				= isset($options->lang) && $options->lang!==DEDALO_DATA_NOLAN
			? $options->lang
			: DEDALO_DATA_LANG;

		// empty data case. Nothing to parse
		if(empty($data)) return null;

		$ar_values = [];
		foreach ($data as $data_item) {

			$data_item_value = $data_item->value ?? [];
			foreach ($data_item_value as $date_value) {

				// date_mode conditional
				switch ($date_mode) {

					case 'range':
					case 'time_range':
						$ar_date = [];
						// start
						if (isset($date_value->start->year)) {
							$dd_date	= new dd_date($date_value->start);
							$timestamp	= $dd_date->get_dd_timestamp($pattern);
							$ar_date[]	= $timestamp;
						}
						// end
						if (isset($date_value->end->year)) {
							$dd_date	= new dd_date($date_value->end);
							$timestamp	= $dd_date->get_dd_timestamp($pattern);
							$ar_date[]	= $timestamp;
						}
						if (!empty($ar_date)) {
							$ar_values[] = implode($fields_separator, $ar_date);
						}
						break;

					case 'period':
						// Compute days / month / years
						if (isset($date_value->period)) {
							$ar_string_period = [];
							if (isset($date_value->period->year)) {
								$ar_string_period[] = $date_value->period->year .' '. label::get_label('years', $lang);
							}
							if (isset($date_value->period->month)) {
								$ar_string_period[] = $date_value->period->month .' '. label::get_label('months', $lang);
							}
							if (isset($date_value->period->day)) {
								$ar_string_period[] = $date_value->period->day .' '. label::get_label('days', $lang);
							}
							if (!empty($ar_string_period)) {
								$ar_values[] = implode($fields_separator, $ar_string_period);
							}
						}
						break;

					case 'date':
					default:
						if (isset($date_value->start->year)) {
							$dd_date		= new dd_date($date_value->start);
							$timestamp		= $dd_date->get_dd_timestamp( $pattern );
							$ar_values[]	= $timestamp;
						}
						break;
				}
			}
		}

		$value = implode($records_separator, $ar_values);


		return $value;
	}//end string_date



}//end parser_date
