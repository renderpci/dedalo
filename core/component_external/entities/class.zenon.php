<?php
/**
* CLASS ZENON
* Manage specific entity Dainst Zenon API elements
* @see https://zenon.dainst.org/swagger-ui/
*/
class zenon {



	/**
	* BUILD_ROW_REQUEST_URL
	* @param object $options
	* {
	* 	api_url : string,
	* 	ar_fields: array,
	* 	section_id: int|string,
	* 	lang: string
	* }
	* @return string $url
	*  sample:
	*  https://zenon.dainst.org/api/v1/record?id=000903635&lgn=en&field[]=id&field[]=title&field[]=authors
	*/
	public static function build_row_request_url( object $options ) : string {

		// options
			$api_url	= $options->api_url;
			$ar_fields	= $options->ar_fields;
			$section_id	= $options->section_id ;
			$lang		= $options->lang;

		// lang value tld 2
			$lang_value = lang::get_alpha2_from_code($lang);

		// ar_fields_var
			$ar_fields_var = [];
			foreach($ar_fields as $field) {
				$ar_fields_var[] = 'field[]=' . $field;
			}

		// url
			$url = $api_url .'?id='. $section_id .'&lgn='. $lang_value .'&'. implode('&', $ar_fields_var);


		return $url;
	}//end build_row_request_url



}//end class zenon
