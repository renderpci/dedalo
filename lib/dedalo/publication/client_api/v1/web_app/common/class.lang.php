<?php
/**
* LANG
* 
*
*/
class lang {
	

	/**
	* GET_LANG_OBJ
	* Simply read requested json file and parse
	* @return 
	*/
	public static function get_lang_obj( $lang=WEB_CURRENT_LANG_CODE ) {

		static $lang_obj;

		if (!isset($lang_obj)) {
			
			$lang_file = lang::get_lang_file($lang);
		
			if(!$lang_obj = json_decode($lang_file)) {
				debug_log(__METHOD__." ERROR: on json decode lang_file ".to_string($lang_file), 'ERROR');
			}	
			
			if (empty($lang_obj)) {
				debug_log(__METHOD__." ERROR: Empty lang_obj ".to_string(), 'ERROR');
			}
		}
		

		return $lang_obj;
	}//end get_lang_obj
		

	
	/**
	* GET_LANG_FILE
	* Simply read requested json file
	* @return string $lang_file
	*/
	public static function get_lang_file( $lang=WEB_CURRENT_LANG_CODE ) {

		static $lang_file; // Avoid read file again

		if (!isset($lang_file)) {
			$json_file_path = WEB_LANG_BASE_PATH .'/'. $lang . '.json';
			$lang_file 		= file_get_contents($json_file_path);

			if (empty($lang_file)) {
				debug_log(__METHOD__." ERROR: Empty lang_file ".to_string(), 'ERROR');
			}

		}else{
			debug_log(__METHOD__." Already loaded lang_file ".to_string(), 'DEBUG');
		}		
		

		return $lang_file;
	}//end get_lang_file

	

}//end lang



/**
* TSTRING
* Read requested lang json file, parse and get property
* @param string $var
*	Label name like 'home'
* @param string $lang
*	Desired Dédalo notation lang like 'lg-eng'
* @return string $label
*/
function tstring( $var, $lang=WEB_CURRENT_LANG_CODE ) {

	$lang_obj = lang::get_lang_obj($lang);

	$label = isset($lang_obj->{$var}) ? $lang_obj->{$var} : '<i>'.$var.'</i>';

	return $label;
}
?>