<?php
// includes. Include another files if need
	// include( dirname(__FILE__) . '/additional/class.additional.php');



/**
* CLASS TOOL_MEDIA_VERSIONS
* This tool is intended to be used as a base build for new tools. Do not use as a production tool.
*
*/
class tool_media_versions extends tool_common {



	/**
	* GET_FILES_INFO
	* Get file info for every quality like 'datalist' do
	* @param object $options
	* @return object $response
	*/
	public static function get_files_info(object $options) : object {

		// options
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

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
	public static function delete_file(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$response = $component->delete_file($quality);


		return (object)$response;
	}//end delete_file



	/**
	* BUILD_VERSION
	* Creates a new version from original in given quality
	* @param object $options
	* @return object $response
	*/
	public static function build_version(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$response = $component->build_version($quality);


		return (object)$response;
	}//end build_version



	/**
	* CONFORM_HEADERS
	* Creates a new version from original in given quality rebuilding headers
	* @param object $options
	* @return object $response
	*/
	public static function conform_headers(object $options) : object {

		// options
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$response = $component->conform_headers($quality);


		return (object)$response;
	}//end conform_headers



	/**
	* ROTATE
	* Apply a rotation process to the selected file
	* @param object $options
	* @return object $response
	*/
	public static function rotate(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;
			$degrees		= $options->degrees;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		$dato		= $component->get_dato()[0];
		$files_info	= $dato->files_info ?? [];
		// $value

		$result = true;
		foreach ($files_info as $value) {

			if($value->quality === $quality){

				$rotation_options = new stdClass();
					$rotation_options->quality			= $value->quality;
					$rotation_options->extension		= $value->extension;
					$rotation_options->degrees			= $degrees;
					$rotation_options->rotation_mode	= 'expanded';

				// result boolean
				$command_result = $component->rotate($rotation_options);
				if (!empty($command_result)){
					$result				= false;
					$response->errors[]	= $command_result;
				}
			}
		}

		// response
		$response->result	= $result;
		$response->msg		= ($result === true)
			? 'Success. Request done.'
			: 'Error on rotate file.';

		return (object)$response;
	}//end rotate



	/**
	* SYNC_FILES
	* Updated component files info data when is not sync (a file is deleted, etc.)
	* @param object $options
	* @return object $response
	*/
	public static function sync_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$lang		= DEDALO_DATA_LANG;
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo,
				false // cache
			);

		// regenerate data
			$component->get_dato(); // !! Important get dato before regenerate
			$result = $component->regenerate_component();
			if ($result!==true) {
				debug_log(__METHOD__
					. ' Error on regenerate component ' .PHP_EOL
					. ' model: ' .$model .PHP_EOL
					. ' component_tipo: ' .$tipo .PHP_EOL
					. ' section_tipo: ' .$section_tipo .PHP_EOL
					. ' section_id: ' .$section_id
					, logger::ERROR
				);
			}

		// response success
			if ($result===true) {
				$response->result	= true;
				$response->msg		= 'Success. Request done';

				debug_log(__METHOD__
					. ' Regenerated component ' .PHP_EOL
					. ' model: ' .$model .PHP_EOL
					. ' component_tipo: ' .$tipo .PHP_EOL
					. ' section_tipo: ' .$section_tipo .PHP_EOL
					. ' section_id: ' .$section_id
					, logger::DEBUG
				);
			}


		return $response;
	}//end sync_files



	/**
	* DELETE_VERSION
	* 	Delete the selected file version
	* @param object $options
	* @return object $response
	*/
	public static function delete_version(object $options) : object {

		// options
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$quality		= $options->quality;
			$extension		= $options->extension;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		// delete file method is based on quality / extension
			switch (true) {
				case ( $quality===$component->get_thumb_quality() ):

					// thumb case
					$result = $component->delete_thumb();

					// update response object
					$response->result	= $result;
					$response->msg		= $result===false ? 'Error. Request failed' : 'OK file delete successfully';
					$response->errors	= $result===false ? ['file not deleted'] : [];
					break;

				case ( strtolower($extension)===$component->get_extension() ):

					// main file like 'rsc37_rsc176_25.pdf' for component_pdf
					$delete_file_response = $component->delete_file($quality);

					// update response object
					$response->result	= $delete_file_response->result;
					$response->msg		= $delete_file_response->msg;
					$response->errors	= $delete_file_response->errors;
					break;

				default:

					// alternative versions
					// Note that this action is destructive
					$result = $component->delete_alternative_version(
						$quality,
						$extension
					);

					// update response object
					$response->result	= $result;
					$response->msg		= $result===false ? 'Error. Request failed' : 'OK file delete successfully';
					$response->errors	= $result===false ? ['file not deleted'] : [];
					break;
			}


		return $response;
	}//end delete_version



}//end class tool_media_versions
