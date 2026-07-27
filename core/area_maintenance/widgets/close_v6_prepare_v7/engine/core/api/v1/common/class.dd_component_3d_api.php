<?php declare(strict_types=1);
/**
* CLASS DD_COMPONENT_3D_API
* REST API handler for 3D media component operations in Dédalo.
*
* Exposes a small, explicitly allow-listed surface of component_3d methods to the
* API layer via the normalised RQO (Request Query Object) convention.  Every method
* declared here is a thin orchestration shim: it unpacks the RQO, enforces a
* security check, resolves the component instance via component_common::get_instance,
* delegates the real work to the component, and wraps the outcome in a uniform
* stdClass response.
*
* Responsibilities:
* - move_file_to_dir : receives an uploaded 3D asset from the tmp upload directory
*   and places it under the component's permanent media tree (most commonly used to
*   set a posterframe image for a 3D model).
* - delete_posterframe : removes the posterframe image file from disk for the
*   identified 3D component instance.
*
* Security model:
* All methods require at minimum permission level 2 (write) on the target
* section_tipo, enforced via security::assert_section_permission().  The API
* dispatcher (dd_tools_api / dd_core_api) must verify that the requested action
* exists in API_ACTIONS before dispatching — this class never self-dispatches.
*
* Related classes:
* - component_3d            — the concrete component whose methods are invoked here
* - component_media_common  — base class for all media components; provides get_media_path_dir,
*                             create_thumb, delete_posterframe, etc.
* - dd_component_av_api     — sibling handler for audio/video components; follows the
*                             same pattern (RQO unpack → security check → delegate)
*
* @package Dédalo
* @subpackage API
*/
final class dd_component_3d_api {



	/**
	* Explicit allow-list of methods callable as remote API actions (SEC-024).
	*
	* The API dispatcher checks this constant before invoking any method on this
	* class.  Adding a new public-static method does NOT make it remotely callable;
	* it MUST also appear in this list.  This prevents unintentional exposure of
	* helper methods as API endpoints.
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'move_file_to_dir',
		'delete_posterframe'
	];



	/**
	* MOVE_FILE_TO_DIR
	* Moves an uploaded file from the per-user temporary upload directory into the
	* component's permanent media directory tree.
	*
	* This is the server-side counterpart to the client's file-upload flow.  The
	* browser first uploads the raw file to the generic upload endpoint (which places
	* it in DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>/), then calls this action to
	* bind it to a specific component instance at a named quality/sub-directory.
	*
	* When target_dir is 'posterframe' the method additionally generates a thumbnail
	* from the new posterframe image and persists the component (Save()).
	*
	* Side effects:
	* - Moves the file on disk via PHP rename().
	* - Creates the target directory if it does not yet exist (0750 mode).
	* - When target_dir === 'posterframe': calls component_3d::create_thumb() and
	*   component_3d::Save() to regenerate the thumbnail and persist component data.
	*
	* @param object $rqo - Normalised Request Query Object. Expected shape:
	* {
	*   action  : "move_file_to_dir",
	*   dd_api  : "dd_component_3d_api",
	*   source  : {
	*     tipo         : string,  // ontology tipo of the 3D component (e.g. "rsc36")
	*     section_tipo : string,  // section tipo owning the component
	*     section_id   : string   // record identifier within the section
	*   },
	*   options : {
	*     file_data  : {
	*       name     : string,  // final file name (e.g. "test26_test3_1.jpg")
	*       tmp_dir  : string,  // symbolic constant "DEDALO_UPLOAD_TMP_DIR" (informational)
	*       key_dir  : string,  // sub-folder inside the tmp dir (e.g. "3d")
	*       tmp_name : string   // current temporary file name in the upload dir
	*     },
	*     target_dir : string   // quality/sub-folder name inside the component media tree
	*                           // (e.g. "posterframe"); determines where the file is placed
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : bool   — true on success, false on failure
	*   msg    : string — human-readable status or error detail
	*   errors : array  — machine-readable error codes ('create_directory failed', 'rename failed')
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

		// SEC: write permission required to bind an uploaded file to a component
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;
				$response->errors   = [];

		// component
			$model		= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

		// move file
			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/' . $user_id . '/' . $file_data->key_dir;

			$source_file_path	= $tmp_dir . '/' . $file_data->tmp_name;
			$target_file_path	= $component->get_media_path_dir($target_dir) . '/' . $file_data->name;

			// debug info
				debug_log(__METHOD__
					. " Moving file from  " . PHP_EOL
					. ' - ' . $source_file_path .PHP_EOL
					. ' - to' .PHP_EOL
					. ' - ' . $target_file_path
					, logger::DEBUG
				);

			// target directory check
			// The quality sub-directory may not exist yet for a new component record;
			// create it with restricted permissions before attempting the move.
				$full_target_dir = dirname($target_file_path);
				if(!create_directory($full_target_dir, 0750)) {
					$response->msg .= ' Error creating directory';
					$response->errors[] = 'create_directory failed';
					return $response;
				}

			// rename file (move)
			// PHP rename() performs an atomic move within the same filesystem; across
			// filesystems it copies-then-deletes. On failure the tmp file is left intact.
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

					$response->msg .= ' Error creating directory';
					$response->errors[] = 'rename failed';
					debug_log(__METHOD__
						. ' '.$response->msg
						, logger::ERROR
					);
					return $response;
				}

		// thumb. Create thumb from posterframe
		// Only the 'posterframe' sub-directory triggers thumbnail generation;
		// other target directories (e.g. quality tiers) are stored as-is.
			if ($target_dir==='posterframe') {
				$component->create_thumb();
				$component->Save();
			}

		// response
			$response->result	= $result;
			$response->msg		= $result===true
				? 'OK. Request done successfully '.__METHOD__
				: $response->msg;


		return $response;
	}//end move_file_to_dir



	/**
	* DELETE_POSTERFRAME
	* Removes the posterframe image file associated with a specific 3D component record.
	*
	* Delegates to component_3d::delete_posterframe(), which resolves the file path
	* from the component's media directory and calls unlink().  Returns false (via the
	* component) when the file does not exist or cannot be removed.
	*
	* Side effects:
	* - Deletes the posterframe file from disk (no trash / soft-delete).
	* - Does NOT regenerate or nullify the thumbnail; callers are responsible for
	*   refreshing the UI after a successful deletion.
	*
	* @param object $rqo - Normalised Request Query Object. Expected shape:
	* {
	*   action  : "delete_posterframe",
	*   dd_api  : "dd_component_3d_api",
	*   source  : {
	*     tipo         : string,  // ontology tipo of the 3D component (e.g. "rsc36")
	*     section_tipo : string,  // section tipo owning the component
	*     section_id   : string   // record identifier within the section
	*   }
	* }
	* @return object $response - stdClass with:
	*   result : bool   — true on success, false on failure (file missing or unlink error)
	*   msg    : string — human-readable status or error detail
	*   errors : array  — machine-readable error codes (populated by the initialiser; the
	*                     delegate component does not append to this array)
	*/
	public static function delete_posterframe( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			$tipo			= $source->tipo;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;
				$response->errors   = [];

		// SEC: write permission required to delete a posterframe
			security::assert_section_permission($section_tipo, 2, __METHOD__);

		// component
			$model		= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

		// move file
			$result = $component->delete_posterframe();

		// response
			$response->result	= $result;
			$response->msg		= $result===true
				? 'OK. Request done successfully '.__METHOD__
				: $response->msg;


		return $response;
	}//end delete_posterframe



}//end dd_component_3d_api
