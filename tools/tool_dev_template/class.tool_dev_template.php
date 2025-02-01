<?php declare(strict_types=1);
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
			$response->error	= null;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end my_custom_static_fake_method



	/**
	* HANDLE_UPLOAD_FILE
	* Sample of handle uploaded file with service_upload
	* @see https://dedalo.dev/docs/development/services/service_upload/
	* @param object $request_options
	* sample:
	* {
	*    "component_tipo": "hierarchy31",
	*    "section_id": "1",
	*    "section_tipo": "es1",
	*    "config": null,
	*    "file_data": {
	*        "name": "myfile.zip",
	*        "type": "application/octet-stream",
	*        "tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
	*        "key_dir": "component_geolocation",
	*        "tmp_name": "myfile.zip",
	*        "error": 0,
	*        "size": 277998,
	*        "time_sec": "0.003",
	*        "extension": "zip",
	*        "thumbnail_url": "/dedalo/media/upload/service_upload/tmp/1/component_geolocation/thumbnail/myfile.jpg",
	*        "chunked": true,
	*        "total_chunks": "1",
	*        "chunk_index": "0"
	*    }
	* }
	* @return object $response
	*/
	public static function handle_upload_file(object $options) : object {

		// options
			$file_data = $options->file_data;

		// @see PHP error log here
			dump($options, ' options ++ '.to_string());

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		// move file
    		// re-build the real path based on file data
    		// like: '/dedalo/media/upload/service_upload/tmp/' + '1' + '/' + 'component_geolocation'
   			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. logged_user_id() . '/' . $file_data->key_dir .'/'. $file_data->tmp_name;

   		// @see PHP error log here
   			dump($tmp_dir, ' tmp_dir ++ '.to_string());

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end handle_upload_file



}//end class tool_dev_template
