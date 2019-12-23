<?php


class zenon {


	/**
	* BUILD_ROW_REQUEST_URL
	* @return string $url
	*/
	public static function build_row_request_url($request_options) {

		$options = new stdClass();
			$options->api_url 		= null;
			$options->ar_fields 	= null;
			$options->section_id 	= null;
			$options->lang 			= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$lang_value = lang::get_alpha2_from_code($options->lang);		

		$ar_fields_var = [];
		foreach ($options->ar_fields as $field) {
			$ar_fields_var[] = 'field[]=' . $field;
		}

		$url = $options->api_url . '?id='. $options->section_id .'&lgn='. $lang_value .'&'. implode('&', $ar_fields_var);

		return $url;
	}//end build_row_request_url



}