<?php declare(strict_types=1);
/**
 * CLASS TOOL_MEDIA_VERSIONS
 * Tool for managing media file versions and qualities
 *
 * Provides functionality to:
 * - Retrieve file information for different quality versions
 * - Delete specific file versions by quality
 * - Build new versions from originals
 * - Conform file headers for compatibility
 * - Apply rotation transformations
 * - Synchronize component file metadata
 *
 * Key features:
 * - Runtime component instance management
 * - Consistent response objects across all methods
 * - Input validation for safety
 * - Support for asynchronous version building
 *
 * @package Dedalo
 * @subpackage Media
 */
class tool_media_versions extends tool_common {



	/**
	 * GET_FILES_INFO
	 * Get file info for every quality like 'datalist' do
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id
	 * @return object $response Response with result (files_info array) or error message
	 * @throws Exception If tipo or required parameters are missing
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function get_files_info(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo)) {
				return (object)[
					'result' => false,
					'msg'    => 'Error. Missing required parameters: tipo, section_id, section_tipo'
				];
			}

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
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
				if ($files_info !== null && !empty($files_info)) {
					$response->result	= $files_info;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
				}
		} catch (Exception $e) {
			$response->msg = 'Error. ' . $e->getMessage();
		}

		return (object)$response;
	}//end get_files_info



	/**
	 * DELETE_QUALITY
	 * Delete file of given quality
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, quality
	 * @return object $response Standardized response object with result, msg, errors
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function delete_quality(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$delete_response = $component->delete_file($quality);

			// merge responses
				$response->result	= $delete_response->result ?? false;
				$response->msg		= $delete_response->msg ?? 'OK. Request done';
				$response->errors	= $delete_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end delete_quality


	/**
	 * BUILD_VERSION
	 * Creates a new version from original in given quality
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, quality, async
	 * @return object $response Standardized response object with result, msg, errors
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function build_version(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$async			= $options->async ?? true;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$build_response = $component->build_version($quality, $async);

			// merge responses
				$response->result	= $build_response->result ?? false;
				$response->msg		= $build_response->msg ?? 'OK. Request done';
				$response->errors	= $build_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end build_version


	/**
	 * CONFORM_HEADERS
	 * Creates a new version from original in given quality rebuilding headers
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, quality
	 * @return object $response Standardized response object with result, msg, errors
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function conform_headers(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$conform_response = $component->conform_headers($quality);

			// merge responses
				$response->result	= $conform_response->result ?? false;
				$response->msg		= $conform_response->msg ?? 'OK. Request done';
				$response->errors	= $conform_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end conform_headers


	/**
	 * ROTATE
	 * Apply a rotation process to the selected file
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, quality, degrees
	 * @return object $response Response with result (bool), msg, errors (array)
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function rotate(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$degrees		= $options->degrees ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality) || $degrees === null) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality, degrees';
				return $response;
			}

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo, true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

			$data_element = $component->get_data()[0] ?? null;
			$files_info	= $data_element->files_info ?? [];

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
		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end rotate


	/**
	 * SYNC_FILES
	 * Updated component files info data when is not sync (a file is deleted, etc.)
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, regenerate_options
	 * @return object $response Response with result (bool) and msg
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function sync_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$tipo				= $options->tipo ?? null;
			$section_tipo		= $options->section_tipo ?? null;
			$section_id			= $options->section_id ?? null;
			$regenerate_options	= $options->regenerate_options ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo)) {
			$response->msg = 'Missing required parameters: tipo, section_id, section_tipo';
				return $response;
			}

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo, true);
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
				$component->get_data(); // !! Important: get data before regenerate
				$result = $component->regenerate_component($regenerate_options);
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
		} catch (Exception $e) {
			$response->msg = 'Error. ' . $e->getMessage();
		}

		return $response;
	}//end sync_files


	/**
	 * DELETE_VERSION
	 * Delete the selected file version
	 *
	 * @param object $options Options containing: tipo, section_tipo, section_id, quality, extension
	 * @return object $response Response with result (bool), msg, errors (array)
	 * @throws Exception If component instance cannot be created
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function delete_version(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$extension		= $options->extension ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				return (object)[
					'result'	=> false,
					'msg'		=> 'Error. Missing required parameters: tipo, section_id, section_tipo, quality',
					'errors'	=> []
				];
			}

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
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

					default:
						// main file like 'rsc37_rsc176_25.pdf' for component_pdf
						$delete_file_response = $component->delete_file($quality, $extension);

						// update response object
						$response->result	= $delete_file_response->result ?? false;
						$response->msg		= $delete_file_response->msg ?? 'Error. Request failed';
						$response->errors	= $delete_file_response->errors ?? [];
						break;
				}
		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end delete_version


}//end class tool_media_versions
