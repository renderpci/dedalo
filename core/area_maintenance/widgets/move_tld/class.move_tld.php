<?php declare(strict_types=1);
/**
* MOVE_TLD
* Widget to manage Dédalo TLD (tipo) transformation tasks
*/
class move_tld {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'move_tld'
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
			'body' => 'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>
					   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_tld')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_TLD
	* Transform Dédalo data from all tables replacing tipos
	* using selected JSON file map
	* @param object $options
	* {
	* 	files_selected : array ['finds_numisdata279_to_tchi1.json']
	* }
	* @return object $response
	*/
	public static function move_tld(object $options): object
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
		$definitions_files = area_maintenance::get_definitions_files('move_tld');
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

		// process changes_in_tipos
		$ar_tables = [
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_stats',
			'matrix_time_machine'
		];
		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::changes_in_tipos(
			$ar_tables,
			$ar_file_name
		);

		$response->result = $result;
		$response->msg = ($result === false)
			? 'Error. changes_in_tipos failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_tld



}//end move_tld