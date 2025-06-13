<?php declare(strict_types=1);
/**
* METRICS CLASS
* Class to centralize performance info like permissions calculation, etc.
*/
final class metrics {


	// permissions. Time to calculate user permissions
		static $security_permissions_table_time = 0;
		static $security_permissions_table_count = 0;
		static $security_permissions_total_time = 0;
		static $security_permissions_total_calls = 0;

	// search
		static $search_total_time = 0;
		static $search_total_calls = 0;

	// ontology
		static $ontology_total_time = 0;
		static $ontology_total_calls = 0;
		static $ontology_total_calls_cached = 0;

	// matrix
		static $matrix_total_time = 0;
		static $matrix_total_calls = 0;

	// search_free (JSON_RecordDataBounceObject)
		static $search_free_total_time = 0;
		static $search_free_total_calls = 0;

	// get_tools (current element context tools calculations)
		static $get_tools_total_time = 0;
		static $get_tools_total_calls = 0;
		static $get_tool_config_total_time = 0;
		static $get_tool_config_total_calls = 0;

	// section_save
		static $section_save_total_time = 0;
		static $section_save_total_calls = 0;

	// context
		static $structure_context_total_time = 0;
		static $structure_context_total_calls = 0;

	// data
		static $data_total_time = 0;
		static $data_total_calls = 0;

	// presets
		static $presets_total_time = 0;
		static $presets_total_calls = 0;



	/**
	* ADD_METRIC
	* @param string $name
	* 	e.g. data_total_time, data_total_calls
	* @param float|null $start_time
	* @return bool
	*/
	public static function add_metric( string $name, ?float $start_time=0 ) : bool {

		if (!property_exists('metrics', $name)) {
			return false;
		}

		// get last word (e.g. 'time' for 'data_total_time')
		$beats	= explode('_', $name);
		$type	= array_pop( $beats );

		switch ($type) {

			case 'time':
				$total_time_ms = exec_time_unit($start_time, 'ms');
				metrics::$$name += $total_time_ms;
				break;

			case 'calls':
				metrics::$$name++;
				break;

			default:
				return false;
		}

		return true;
	}//end add_metric



}//end class metrics
