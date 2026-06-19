<?php declare(strict_types=1);
/**
 * CLASS TOOL_IMAGE_ROTATION
 * Server-side handler for the image rotation and cropping tool.
 *
 * This tool operates on a single `component_image` record and rewrites its
 * on-disk derivative files in place.  It is surfaced as a toolbar button
 * for sections that own image components; the browser UI collects the
 * user's parameters and posts them to the API, which dispatches to the
 * single exposed action `apply_rotation`.
 *
 * Responsibilities:
 * - Validate caller permissions (tipo write ≥ 2, optional record scope).
 * - Load the target component_image instance for the given (tipo, section_id,
 *   section_tipo) triple.
 * - Iterate every quality tier reported by the component's `files_info` array,
 *   skipping the 'original' master so it is never altered.
 * - For each existing, non-original file: delegate rotation to
 *   `component_image::rotate()` (which shells out to ImageMagick) and
 *   accumulate any command errors.
 * - After rotation, apply an optional crop to each non-original quality file,
 *   scaling the crop rectangle proportionally from the default-quality
 *   dimensions to each smaller tier's pixel dimensions.
 *
 * Data shapes consumed:
 * - `$options->crop_area` — pixel-coordinate rectangle relative to the
 *   default-quality image: {x, y, width, height}.  Absent or without an `x`
 *   property means "no crop".
 * - `component_media_common::files_info` entries — objects with at least
 *   `quality` (string), `file_exist` (bool), and `extension` (string|null).
 *
 * Relationships:
 * - Extends `tool_common` (tools/tool_common/class.tool_common.php).
 * - Calls `component_image::rotate()` and `component_image::crop()`, which
 *   themselves delegate to `ImageMagick::rotate()` / `ImageMagick::crop()`.
 * - Security gate: `security::assert_tipo_permission()` (tipo write level 2)
 *   and `security::assert_record_in_user_scope()`.
 * - Dispatch: `dd_tools_api::tool_request` validates `API_ACTIONS` before
 *   calling this class (SEC-024 / tool_security::resolve_action).
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_image_rotation extends tool_common {



	/**
	* API_ACTIONS
	* Explicit allowlist of methods callable via `dd_tools_api::tool_request`.
	*
	* SEC-024 (§9.2): the framework's tool_security layer validates this constant
	* before the method is invoked.  Only actions listed here can be dispatched
	* remotely; lifecycle hooks (is_available, on_register, on_remove) must never
	* appear here.
	*
	* The short-form (no permission sub-object) means the action is listed but the
	* permission gate is handled imperatively inside the method itself rather than
	* declaratively by the framework.  This pre-dates the map form; new actions
	* should use the map form instead (see dedalo-tools skill).
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'apply_rotation'
	];



	/**
	 * APPLY_ROTATION
	 * Applies rotation and/or crop transformations to every non-original quality
	 * tier of a `component_image` component, overwriting the derivative files in place.
	 *
	 * Processing order:
	 *  1. Validate required parameters and assert write permission (≥ 2) on
	 *     (section_tipo, tipo).  If a section_id is provided, assert the record is
	 *     within the caller's scope.
	 *  2. Instantiate the component_image for the given tipo / section_id /
	 *     section_tipo in 'list' mode (DEDALO_DATA_NOLAN) and read its first data
	 *     element's `files_info` array.
	 *  3. ROTATION — when `rotation_degrees` is not "0", iterate `files_info`:
	 *     - Skip the 'original' master (it is never modified).
	 *     - Skip entries where `file_exist` is false.
	 *     - Build a `rotation_options` object and call `$component->rotate()`.
	 *       A non-empty return value is treated as an error string and collected.
	 *  4. CROP — when `crop_area` is present and has an `x` property:
	 *     - Determine the pixel dimensions of the default-quality file (the UI
	 *       reference for crop coordinates).
	 *     - For each non-original, existing quality tier: retrieve that tier's
	 *       pixel dimensions, compute x/y/width/height proportionally, and call
	 *       `$component->crop()`.  Errors are collected the same way.
	 *  5. Return a response object summarising success or failure.
	 *
	 * Note: rotation and crop are independent passes; both can run in the same
	 * request (rotation first, then crop on the already-rotated files).
	 *
	 * @param object $options Configuration object containing:
	 *   - tipo             (string)      Component tipo identifier (e.g. 'dd522').
	 *   - section_id       (int|string)  Section record ID.
	 *   - section_tipo     (string)      Section tipo identifier (e.g. 'dd128').
	 *   - rotation_degrees (int|float|string) Rotation angle in degrees; "0" or 0
	 *                                   skips the rotation pass entirely. Positive
	 *                                   values rotate clockwise.  Default: 0.
	 *   - background_color (string)      Hex colour used to fill the corners exposed
	 *                                   by a rotation with `rotation_mode='expanded'`
	 *                                   (e.g. '#ffffff').  Default: '#ffffff'.
	 *   - alpha            (float|bool|null) Whether to preserve the alpha channel.
	 *                                   Automatically forced to false for JPEG files
	 *                                   inside `component_image::rotate()`.
	 *   - rotation_mode    (string)      'default' (canvas stays the original size,
	 *                                   corners clipped) or 'expanded' (canvas grows
	 *                                   to contain the rotated image).  Default: 'default'.
	 *   - crop_area        (object|null) Pixel-coordinate crop rectangle relative to
	 *                                   the default-quality image.  Expected shape:
	 *                                   { x: int|float, y: int|float,
	 *                                     width: int|float, height: int|float }.
	 *                                   Absent or lacking an `x` property = no crop.
	 *
	 * @return object Response object:
	 *   - result (bool)    true when all rotate/crop operations succeeded.
	 *   - msg    (string)  Human-readable summary.
	 *   - errors (array)   Raw ImageMagick command output strings for any failed
	 *                      operation; empty array on full success.
	 */
	public static function apply_rotation(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id	?? null;
			$section_tipo	= $options->section_tipo ?? null;
			// rotation_degrees is a double-precision floating-point value indicating
			// the current rotation in degrees.
			$degrees			= $options->rotation_degrees ?? 0;
			$background_color	= $options->background_color ?? '#ffffff';
			$alpha				= $options->alpha ?? null;
			$rotation_mode		= $options->rotation_mode ?? 'default';
			$crop_area 			= $options->crop_area ?? null;

		// SEC-024 (§9.2): permission gate. Apply_rotation mutates the on-disk
		// derived files of an image component. Caller must have write (>=2) on
		// (section_tipo, tipo).
			if (empty($tipo) || empty($section_tipo)) {
				$response->msg		= 'Error. Missing required parameters: tipo, section_tipo';
				$response->errors[]	= 'invalid_request';
				return $response;
			}
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			if (!empty($section_id)) {
				security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);
			}

		// component
			// Resolve the concrete class for $tipo (e.g. component_image), then
			// instantiate in 'list' mode with DEDALO_DATA_NOLAN so data is loaded
			// without language filtering — the files_info array is language-neutral.
			$model		= ontology_node::get_model_by_tipo($tipo, true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		// Read files_info from the first (and normally only) data element.
		// files_info is an array of per-quality-tier objects; each entry describes
		// one combination of quality × extension on disk.  Shape per entry:
		//   { quality: string, file_exist: bool, file_name: string|null,
		//     extension: string|null, file_path: string|null, file_size: int|null }
		$data		= $component->get_data()[0] ?? null;
		$files_info	= $data->files_info ?? [];

		$result = true;
		if($degrees !== "0"){

			// ROTATION PASS
			// Rotate each derivative quality in place via ImageMagick.
			// The 'original' master is intentionally skipped to preserve the
			// unmodified upload as a source of truth for future regeneration.
			foreach ($files_info as $value) {

				if($value->quality === 'original'){
					continue;
				}
				if($value->file_exist === true){

					$rotation_options = new stdClass();
						$rotation_options->quality			= $value->quality;
						$rotation_options->extension		= $value->extension;
						$rotation_options->degrees			= $degrees;
						$rotation_options->rotation_mode	= $rotation_mode;
						$rotation_options->background_color	= $background_color;
						$rotation_options->alpha			= $alpha ?? null;

					// result boolean
					// A non-empty return from rotate() is the raw ImageMagick
					// command output, which signals a processing error.
					$command_result = $component->rotate($rotation_options);
					if (!empty($command_result)){
						$result				= false;
						$response->errors[]	= $command_result;
					}
				}
			}
		}

		// CROP PASS
		// The crop_area coordinates are expressed in pixels relative to the
		// default-quality image (the reference tier shown in the UI).  Each
		// lower-resolution tier has different pixel dimensions, so the rectangle
		// must be scaled proportionally before being applied.
		if( isset($crop_area) && isset($crop_area->x) ){
			// Retrieve the pixel dimensions of the default-quality file to use
			// as the scaling reference for all other quality tiers.
			$default_quality	= $component->get_default_quality();
			$default_file		= $component->get_media_filepath($default_quality);
			$default_size		= $component->get_image_dimensions($default_file);

			foreach ($files_info as $value) {

				if($value->quality === 'original'){
					continue;
				}

				if($value->file_exist === true){

					$current_file		= $component->get_media_filepath($value->quality, $value->extension);
					$current_size		= $component->get_image_dimensions($current_file);
					// get the area proportions
					// Compute the ratio of this tier's dimensions to the default-quality
					// dimensions so the crop rectangle is correctly scaled.
					$width_proportion	= $current_size->width / $default_size->width;
					$height_proportion	= $current_size->height / $default_size->height;
					// set the area to crop with the proportions of the current image size
					// Build the scaled crop rectangle for this quality tier.
					$current_crop_area = (object)[
						'x'			=> $crop_area->x 		* $width_proportion,
						'y'			=> $crop_area->y 		* $height_proportion,
						'width'		=> $crop_area->width 	* $width_proportion,
						'height'	=> $crop_area->height 	* $height_proportion
					];

					$crop_options = new stdClass();
						$crop_options->quality			= $value->quality;
						$crop_options->extension		= $value->extension;
						$crop_options->crop_area		= $current_crop_area;

					// result boolean
					// A non-empty return from crop() is the raw ImageMagick
					// command output, which signals a processing error.
					$command_result = $component->crop($crop_options);
					if (!empty($command_result)){
						$result				= false;
						$response->errors[]	= $command_result;
					}
				}
			}
		}

		// response
		$response->result	= $result;
		$response->msg		= ($result === true)
			? 'Success. Request done.'
			: 'Error on rotate file.';


		return $response;
	}//end apply_rotation



}//end class tool_image_rotation
