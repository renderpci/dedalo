<?php
/**
* JSON_WEB_DATA
* Manage web source data with mysql using http request
*
*/
class json_web_data {


	/**
	* GET_DATA
	* Exec a remote connection and get remote data with options as JSON
	* @return object $rows_data
	*/
	public static function get_data($request_options) {
		
		$start_time = microtime(1);
		
		# FROM JSON URL IN SERVER SIDE
		$url = JSON_TRIGGER_URL . '?code='.API_WEB_USER_CODE.'&options=' . rawurlencode( json_encode($request_options) ); 

		# LANG . Always send lang as param
		if(isset($request_options->lang)){
			// Custom specific lang
			$url .= "&lang=".$request_options->lang;
		}else{
			// Default public web current lang
			$url .= "&lang=".WEB_CURRENT_LANG_CODE;
		}

		# CODE
		#$url .= "&code=" . API_WEB_USER_CODE;
		#dump($url, ' url ++ '.to_string());

		$dedalo_data_file 	= file_get_contents($url) ;
			#dump($dedalo_data_file, ' $dedalo_data_file ++ '.to_string($url));
		$dedalo_data = json_decode( $dedalo_data_file, false, 512, JSON_UNESCAPED_UNICODE );
			#dump($dedalo_data, ' dedalo_data ++ '.to_string($url)); #die();			

		if (!is_object($dedalo_data)) {
			$dedalo_data = new stdClass();
				$dedalo_data->result = array();
				if(SHOW_DEBUG===true) {
					$dedalo_data->debug = new stdClass();
					$dedalo_data->debug->info = "Error in response results: ".to_string($dedalo_data_file);
				}				
		}
		#error_log( to_string($dedalo_data->debug) );

		$dedalo_data->debug = isset($dedalo_data->debug) && is_object($dedalo_data->debug) ? $dedalo_data->debug : new stdClass();
		$dedalo_data->debug->total_time = round(microtime(1)-$start_time,3);

		return (object)$dedalo_data;
	}//end get_data




}//end json_web_data
?>