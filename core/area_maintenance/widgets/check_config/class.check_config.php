<?php declare(strict_types=1);
/**
* CHECK_CONFIG
* Review config vars status
*/
class check_config {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// result
			$result = [];

		// ar_files_name iterate
			$ar_files_name = [
				'config',
				'config_db',
				'config_core'
			];
			foreach ($ar_files_name as $file_name) {

				$item = new stdClass();
					$item->file_name		= $file_name;
					$item->config_vs_sample	= [];
					$item->sample_vs_config	= [];


				// sample file
					$sample_path = DEDALO_CONFIG_PATH . '/sample.'.$file_name.'.php';
					if (!file_exists($sample_path) || !is_readable($sample_path)) {
						debug_log(__METHOD__
							. " Ignored sample config comparison because the sample config file do not exists." . PHP_EOL
							. ' sample_path: ' . to_string($sample_path)
							, logger::ERROR
						);
						$response->errors[] = 'Sample config file unavailable: ' . 'sample.'.$file_name.'.php';
						continue;
					}

				// sample_config_constants_list
					$sample_config_constants_list = area_maintenance::get_file_constants(
						$sample_path
					);
					$item->sample_config_constants_list	= $sample_config_constants_list;

				// config file
					$config_path = DEDALO_CONFIG_PATH . '/'.$file_name.'.php';
					if (!file_exists($config_path) || !is_readable($config_path)) {
						debug_log(__METHOD__
							. " Ignored config comparison because the config file do not exists." . PHP_EOL
							. ' config_path: ' . to_string($config_path)
							, logger::ERROR
						);
						$response->errors[] = 'Config file unavailable: ' . $file_name.'.php';
						continue;
					}

				// config_constants_list
					$config_constants_list = area_maintenance::get_file_constants(
						$config_path
					);
					$item->config_constants_list = $config_constants_list;

				// config_vs_sample. Compares defined config constants vs sample config
					$ignore = ['DEDALO_MAINTENANCE_MODE_CUSTOM','DEDALO_NOTIFICATION','GEONAMES_ACCOUNT_USERNAME','EXPORT_HIERARCHY_PATH'];
					foreach ($config_constants_list as $const_name) {
						if (!in_array($const_name, $sample_config_constants_list)) {
							// exceptions (ignore optional constants that could be disabled)
							if (!in_array($const_name, $ignore)) {
								$item->config_vs_sample[] = $const_name;
							}
						}
					}

				// sample_vs_config. Compares defined sample constants vs config
					$ignore = ['DEDALO_MAINTENANCE_MODE','DEDALO_API_URL'];
					foreach ($sample_config_constants_list as $const_name) {
						if (!in_array($const_name, $ignore) && !defined($const_name)) {
							$item->sample_vs_config[] = $const_name;
						}
					}

				// add
					$result[] = $item;
			}//end foreach


		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. Request done with errors';
			$response->sample_config_constants_list	= $sample_config_constants_list;


		return $response;
	}//end get_value



}//end check_config
