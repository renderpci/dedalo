<?php
/**
* DD_COMPONENT_3d_API
* Manage API REST data flow of the component with Dédalo
* This class is a collection of component exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_component_3d_api {



	/**
	* MOVE_FILE_TO_DIR
	* Creates a fragment from given av file with TC in:out
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "move_file_to_dir",
	*	dd_api	: 'dd_component_3d_api',
	*	source	: {
	*		tipo			: 'rsc36',
	*		section_tipo	: section_tipo,
	*		section_id		: section_id
	*	},
	* 	options: {
	* 		file_data : {
	*			"name"			: "test26_test3_1.jpg",
	*			"tmp_dir"		: "DEDALO_UPLOAD_TMP_DIR",
	*			"key_dir"		: "3d",
	*			"tmp_name"		: "tmp_test26_test3_1.jpg"
	* 		}
	* 		target_dir : 'posterframe' // string with the quality folder name.
	* 	}
	* }
	* @return object $response
	*/
	public static function move_file_to_dir( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// options
			$options	= $rqo->options;
			$file_data	= $options->file_data;
			$target_dir	= $options->target_dir;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

		// move file
			$user_id = get_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $file_data->key_dir;

			$source_file_path	= $tmp_dir . '/' . $file_data->tmp_name;
			$target_file_path	= $component->get_media_path_dir($target_dir). '/' . $file_data->name;

			debug_log(__METHOD__
				. " Moving file from  " . PHP_EOL
				. ' - ' . $source_file_path .PHP_EOL
				. ' - to' .PHP_EOL
				. ' - ' . $target_file_path
				, logger::DEBUG
			);
			$result = rename($source_file_path, $target_file_path);
			if ($result===false) {
				debug_log(__METHOD__
					. " Error moving file from  " . PHP_EOL
					. ' - ' . $source_file_path .PHP_EOL
					. ' - to' .PHP_EOL
					. ' - ' . $target_file_path .PHP_EOL
					. ' rqo: ' . to_string($rqo)
					, logger::ERROR
				);
			}


		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end add_posterframe



}//end dd_component_3d_api
