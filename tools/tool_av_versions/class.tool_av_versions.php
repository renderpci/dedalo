<?php
// includes. Include another files if need
	// include( dirname(__FILE__) . '/additional/class.additional.php');



/*
* CLASS TOOL_AV_VERSIONS
* This tool is intended to be used as a base build for new tools. Do not use as a production tool.
*
*/
class tool_av_versions extends tool_common {



	/**
	* GET_FILES_INFO
	* Get file info for every quality
	* @param object $request_options
	* @return object $response
	*/
	public static function get_files_info($request_options) {

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_tipo	= null;
				$options->section_id	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$files_info = $component->get_files_info();

		// response
			$response->result	= $files_info;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end get_files_info



	/**
	* DELETE_FILE
	* Delete file of given quality
	* @param object $request_options
	* @return object $response
	*/
	public static function delete_file($request_options) {

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->quality		= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$response = $component->delete_file($quality);


		return (object)$response;
	}//end delete_file



	/**
	* BUILD_VERSION
	* Creates a new version from original in given quality
	* @param object $request_options
	* @return object $response
	*/
	public static function build_version($request_options) {

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->quality		= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$response = $component->build_version($quality);


		return (object)$response;
	}//end build_version



	/**
	* CONFORM_HEADERS
	* Creates a new version from original in given quality rebuilding headers
	* @param object $request_options
	* @return object $response
	*/
	public static function conform_headers($request_options) {

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->quality		= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$response = $component->conform_headers($quality);


		return (object)$response;
	}//end conform_headers


}//end class


