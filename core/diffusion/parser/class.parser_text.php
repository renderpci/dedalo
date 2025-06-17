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
* Processing ata:
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
	* @return
	*/
	public static function default_join( array $data, object $options ) {

	}//end default_join

	/**
	* TEXT_FORMAT
	* @return
	*/
	public static function text_format( array $data, object $options ) {

	}//end text_format

}//end parser_text