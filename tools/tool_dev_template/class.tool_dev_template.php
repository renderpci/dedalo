<?php



/**
* CLASS TOOL_DEV_TEMPLATE
* This tool is intended to be used as a base build for new tools. Do not use as a production tool.
*
*/
class tool_dev_template extends tool_common {



	/**
	* MY_CUSTOM_STATIC_FAKE_METHOD
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function my_custom_static_fake_method(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$component_tipo	= $options->component_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$config			= $options->config ?? null;

		// optional config read from config
			// get all tools config sections
				$tool_name	= get_called_class();
				$config		= tool_common::get_config($tool_name);

		// DDB data
			$model = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component = component_common::get_instance(
				$model, // string model
				$component_tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);
			$dato = $component->get_dato();

		// awesome tool process...
			$my_process_result = (object)[
				'test_value1' => 1,
				'test_value2' => 2,
				'test_value3' => (object)[
					'type'	=> 'object',
					'value'	=> 'Test object value'
				],
				'test_value4'		=> ['array_val_1','array_val_2'],
				'date'				=> date("Y-m-d H:i:s"),
				'component_data'	=> $dato
			];

		// response
			$response->result	= $my_process_result;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end my_custom_static_fake_method



}//end class tool_dev_template
