<?php declare(strict_types=1);
/**
* MOVE_LANG
* Widget to manage Dédalo language transformation tasks
*/
class move_lang {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'move_lang'
	];



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>
					   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
			'files' => area_maintenance::get_definitions_files('move_lang')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_LANG
	* Transform Dédalo data from specific tables defined changing data lang
	* using selected JSON file map
	* @param object $options
	* {
	* 	files_selected : array ['change_hierarchy89_to_nolan.json']
	* }
	* @return object $response
	*/
	public static function move_lang(object $options): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files_selected = $options->files_selected;
		if (empty($files_selected)) {
			$response->errors[] = 'empty files_selected';
			return $response;
		}

		// files
		$definitions_files = area_maintenance::get_definitions_files('move_lang');
		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);

		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::change_data_lang(
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_lang



}//end move_lang