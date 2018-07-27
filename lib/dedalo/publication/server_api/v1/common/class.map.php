<?php
/**
* MAP
* Util abstract class to manage data maps on results
* Only static function are defined here 
*/
abstract class map {



	# Version. Important!
	static $version = "1.0.0"; //04-09-2017



	/**
	* RESOLVE_GEOLOCATION
	* Calculate full geolocation data from term_id
	* @return object $geolocation_obj
	*/
	public static function resolve_geolocation( $term_id, $lang ) {

		# Cahe resolved
		$cache_key = $term_id.'_'.$lang;
		static $resolved_geo = array();
		if (isset($resolved_geo[$cache_key])) {
			return $resolved_geo[$cache_key];
		}
		
		# Get all thesaurus geo terms resolved
		$options = new stdClass();
			$options->ar_term_id 	= $term_id;	
			$options->lang 			= $lang;
		
		$rows_data = web_data::get_thesaurus_term($options);
			#dump($rows_data, ' $rows_data ++ '.to_string($options));
	
		#$geolocation_obj = reset($ts_rows_data->result);
 		$geolocation_obj = $rows_data->result;

 		# Cahe resolved
 		$resolved_geo[$cache_key] = $geolocation_obj;
		

		return $geolocation_obj;
	}//end resolve_geolocation



}//end class full_node
?>