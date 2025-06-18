<?php
/**
* PARSER_MAIN
*
* Loads all common independent parsers files.
* It is used to load all the parser utilities into `diffusion_element` in one call.
* Example to load it using properties.
* {
* 	"diffusion":{
* 		"parser":[
* 			"/core/diffusion/parser/parser_main.php"
* 		]
* 	}
* }
* once the parsers are loaded is possible call to specific parser as:
* parser_text::join()
* parser_date::merge()
* etc.
* text parser, utilities to join, split, merge, cut, etc texts
*/

include_once(DEDALO_CORE_PATH . '/diffusion/parser/class.parser_text.php');
include_once(DEDALO_CORE_PATH . '/diffusion/parser/class.parser_date.php');
