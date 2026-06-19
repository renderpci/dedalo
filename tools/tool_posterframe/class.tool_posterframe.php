<?php declare(strict_types=1);
/**
* CLASS TOOL_POSTERFRAME
* Tool for managing posterframe (thumbnail) extraction from audiovisual media files.
*
* Provides a two-operation API callable via dd_tools_api::tool_request:
*
* 1. create_identifying_image — full end-to-end workflow:
*    - Creates a new portal record element in the target component_portal,
*    - Instantiates a component_image inside that portal record to receive the image,
*    - Resolves the original AV file path through component_av (falling back to
*      default quality if the original-quality file is missing),
*    - Invokes Ffmpeg::create_posterframe() to extract a single frame at the given
*      timecode, and
*    - Calls component_image::process_uploaded_file() to generate all derivative
*      sizes (thumb, standard, etc.) from the extracted frame.
*
* 2. get_ar_identifying_image — read path:
*    - Loads the inverse references of a section (all records that link to it),
*    - Walks each referring section looking for portal components whose ontology
*      node carries an `identifying_image` property, and
*    - Returns the metadata needed by the client to render or trigger a posterframe
*      creation.
*
* The identifying_image property on a portal component's ontology node (ontology_node
* → get_properties() → identifying_image) stores the tipo of the component_image
* component that will hold the posterframe inside that portal's target section.
*
* Access control follows the SEC-024 pattern: every public action checks tipo-level
* permission and per-record scope before touching data.
*
* Extends tool_common for tool registration, security, and lifecycle integration.
* Ported from Dédalo v5 with v7 adaptations.
*
* External dependencies:
* - FFmpeg / Ffmpeg class: video processing and frame extraction
* - component_av: AV file management, quality resolution, and filepath lookup
* - component_image: image file handling and derivative-format generation
* - component_portal: portal record creation and element management
* - ontology_node: component property and term lookups
* - section_record::get_inverse_references(): inverse locator resolution
*
* @package Dédalo
* @subpackage Tools
*/
class tool_posterframe extends tool_common {



	/**
	* Explicit allowlist of methods callable via dd_tools_api::tool_request.
	*
	* SEC-024 (§9.2): any action name absent from this list is refused by the
	* API dispatcher before reaching business logic.
	*
	* @var array<string> $API_ACTIONS
	*/
	public const API_ACTIONS = [
		'create_identifying_image',
		'get_ar_identifying_image'
	];



	/**
	* CREATE_IDENTIFYING_IMAGE
	* Extract a posterframe from an audiovisual file and store it as an identifying
	* image on a newly created portal record.
	*
	* Full workflow:
	* 1. Validate all required parameters from $options.
	* 2. Enforce SEC-024 tipo-level and per-record read permission on the source AV
	*    component and write permission on the target portal component.
	* 3. Resolve component_portal by tipo/section and call add_new_element() to
	*    create a new linked record in the portal's target section.
	* 4. Instantiate component_image in the new portal record to determine the
	*    filesystem path where the posterframe will be written.
	* 5. Instantiate component_av and obtain the source file path, preferring the
	*    original-quality file and falling back to the default quality.
	* 6. Call Ffmpeg::create_posterframe() to extract the frame at $current_time.
	* 7. Call component_image::process_uploaded_file() to register the file and
	*    generate all configured derivative sizes (thumb, standard, …).
	*
	* All steps after parameter validation run inside a try/catch; any Exception
	* sets result=false, populates $response->errors, and logs at ERROR level.
	*
	* @param object $options Options object with the following required properties:
	*   - string   $tipo           Tipo of the source AV component (e.g. 'dd123')
	*   - string   $section_tipo   Section type that hosts the AV component
	*   - string   $section_id     Section record ID of the AV source
	*   - object   $item_value     Sub-object with:
	*       - string component_portal  Tipo of the portal that receives the new record
	*       - string component_image   Tipo of the image component inside that portal
	*       - string section_id        Section record ID of the portal host record
	*       - string section_tipo      Section type of the portal host record
	*   - string   $current_time   FFmpeg-compatible timecode for frame extraction
	*                              (e.g. "00:00:05.000" or a float in seconds)
	* @return object Response with:
	*   - bool         result   true on success, false on any error
	*   - string       msg      Human-readable status message
	*   - array<string> errors  Populated on failure; empty on success
	*/
	public static function create_identifying_image(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options with validation
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$item_value		= $options->item_value ?? null;
			$current_time	= $options->current_time ?? null;

		// validate required parameters
			if (empty($tipo) || empty($section_tipo) || empty($section_id) || empty($item_value) || $current_time === null) {
				$missing = [];
				if (empty($tipo)) $missing[] = 'tipo';
				if (empty($section_tipo)) $missing[] = 'section_tipo';
				if (empty($section_id)) $missing[] = 'section_id';
				if (empty($item_value)) $missing[] = 'item_value';
				if ($current_time === null) $missing[] = 'current_time';

				$response->msg = 'Error. Missing required parameters: ' . implode(', ', $missing);
				$response->errors[] = $response->msg;
				debug_log(__METHOD__ . " " . $response->msg, logger::ERROR);
				return $response;
			}

		// SEC-024 (§9.2): WRITE gates. create_identifying_image both READS the
		// source AV component (section_tipo, tipo) and WRITES a new portal
		// record on (item_value->section_tipo, item_value->component_portal).
			security::assert_tipo_permission($section_tipo, $tipo, 1, __METHOD__);
		// SEC-024 (§9.4): per-record gate on the source AV record.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);
			$portal_section_tipo	= $item_value->section_tipo	?? null;
			$portal_component_tipo	= $item_value->component_portal ?? null;
			if (empty($portal_section_tipo) || empty($portal_component_tipo)) {
				$response->msg		= 'Error. Missing item_value->section_tipo or item_value->component_portal';
				$response->errors[]	= 'invalid_request';
				return $response;
			}
			security::assert_tipo_permission(
				$portal_section_tipo,
				$portal_component_tipo,
				2,
				__METHOD__
			);
		// SEC-024 (§9.4): per-record gate on the portal host record.
			$portal_section_id = $item_value->section_id ?? null;
			if (!empty($portal_section_id)) {
				security::assert_record_in_user_scope(
					$portal_section_tipo,
					(int)$portal_section_id,
					__METHOD__
				);
			}

		try {
			// component_portal. Create a new section and attach it to the target portal
				$component_portal_model = ontology_node::get_model_by_tipo(
					$item_value->component_portal,
					true
				);
				if (empty($component_portal_model)) {
					throw new Exception("Unable to determine model for component_portal: {$item_value->component_portal}");
				}

				$component_portal = component_common::get_instance(
					$component_portal_model,
					$item_value->component_portal,
					$item_value->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$item_value->section_tipo
				);

				if ($component_portal === null) {
					throw new Exception("Failed to instantiate component_portal");
				}

				// portal_section_target_tipo
				// The portal may link to multiple target section types; the first is used
				// as the section type for the new record created by add_new_element().
					$ar_portal_section_target_tipo = $component_portal->get_ar_target_section_tipo();
					if (empty($ar_portal_section_target_tipo)) {
						throw new Exception('portal_section_target_tipo not found');
					}
					$portal_section_target_tipo = reset($ar_portal_section_target_tipo);

				// add_new_element
				// Creates a new record in the portal's target section and appends a locator
				// to the portal's relation list. $new_element_response->section_id holds
				// the freshly created record's ID, used below to anchor component_image.
					$new_element_response = $component_portal->add_new_element((object)[
						'target_section_tipo' => $portal_section_target_tipo
					]);
					if ($new_element_response->result === false) {
						throw new Exception("Unable to create portal record element");
					}

					// save portal if all is OK
					$component_portal->Save();

					// check locator section id is valid
					$new_section_id = $new_element_response->section_id ?? null;
					if (empty($new_section_id) || (int)$new_section_id < 1) {
						throw new Exception("Invalid new portal section_id: " . (string)$new_section_id);
					}

			// component_image. Gets the proper path and filename where to save the posterframe file
			// Instantiated at 'original' quality so get_media_filepath() returns the full-resolution
			// destination path. process_uploaded_file() will derive smaller sizes afterwards.
				$component_image_model = ontology_node::get_model_by_tipo(
					$item_value->component_image,
					true
				);
				if (empty($component_image_model)) {
					throw new Exception("Unable to determine model for component_image: {$item_value->component_image}");
				}

				$component_image = component_common::get_instance(
					$component_image_model,
					$item_value->component_image,
					$new_section_id,
					'edit',
					DEDALO_DATA_LANG,
					$portal_section_target_tipo
				);

				if ($component_image === null) {
					throw new Exception("Failed to instantiate component_image");
				}

				// desired image is 'original' quality
					$component_image->set_quality(DEDALO_IMAGE_QUALITY_ORIGINAL);

			// component_av. Needed to get av file paths
				$component_av_model = ontology_node::get_model_by_tipo($tipo, true);
				if (empty($component_av_model)) {
					throw new Exception("Unable to determine model for component_av: $tipo");
				}

				$component_av = component_common::get_instance(
					$component_av_model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				if ($component_av === null) {
					throw new Exception("Failed to instantiate component_av");
				}

			// Get source AV file path
				$quality = $component_av->get_original_quality();
				$src_file = $component_av->get_media_filepath($quality);

				if (!file_exists($src_file)) {
					// try with default quality
					// The original-quality file may not yet exist (e.g. upload in progress
					// or only a transcoded version is available). Fall back to default.
					$quality = $component_av->get_default_quality();
					$src_file = $component_av->get_media_filepath($quality);
				}

				if (!file_exists($src_file)) {
					throw new Exception("AV file not found in original or default quality: $src_file");
				}

				// posterframe_filepath. Target to generate posterframe
				$posterframe_filepath = $component_image->get_media_filepath(DEDALO_IMAGE_QUALITY_ORIGINAL);

			// FFmpeg create_posterframe
			// Runs FFmpeg synchronously via shell_exec to extract a single frame.
			// The resulting file is written directly to $posterframe_filepath.
				Ffmpeg::create_posterframe((object)[
					'timecode'				=> $current_time,
					'src_file'				=> $src_file, // av file
					'quality'				=> $quality,
					'posterframe_filepath'	=> $posterframe_filepath // full target file path
				]);

			// component_image process_uploaded_file
			// Registers the extracted file with the component and generates all configured
			// derivative sizes (thumb, default, …). The second argument (process_options)
			// is null because no special override options are required here.
				$original_file_name = pathinfo($posterframe_filepath, PATHINFO_BASENAME);
				$process_response = $component_image->process_uploaded_file(
					(object)[
						'original_file_name'	=> $original_file_name,
						'full_file_path'		=> $posterframe_filepath,
						'full_file_name'		=> $original_file_name
					],
					null
				);

				if ($process_response === null) {
					throw new Exception("process_uploaded_file returned null");
				}

				if ($process_response->result === false) {
					throw new Exception("Error processing posterframe file: " . ($process_response->msg ?? 'unknown'));
				}

			// response OK
				$response->result = true;
				$response->msg = 'OK. Posterframe created successfully';

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' tipo: ' . (string)$tipo . PHP_EOL
				. ' section_tipo: ' . (string)$section_tipo . PHP_EOL
				. ' section_id: ' . (string)$section_id
				, logger::ERROR
			);
		}

		return $response;
	}//end create_identifying_image


	/**
	* GET_AR_IDENTIFYING_IMAGE
	* Retrieve all identifying image descriptors reachable from the given section
	* through its inverse reference relationships.
	*
	* An "identifying image" is a posterframe stored in a component_image that lives
	* inside a portal record linked back to this section. The portal component type
	* is recognised by an `identifying_image` property on its ontology node.
	*
	* Algorithm:
	* 1. Load the target section via section::get_instance().
	* 2. Collect all inverse locators (records that reference this section) via
	*    section_record::get_inverse_references().
	* 3. For each inverse locator, delegate to get_identifying_image_from_section()
	*    to check whether that referring section hosts a qualifying portal component.
	* 4. Aggregate non-null results into the response array.
	*
	* Permission checks run outside the try/catch so that a permission_exception
	* propagates to dd_manager rather than being silently swallowed as an error.
	*
	* @param object $request_options Options object with:
	*   - string $section_tipo  Type of the section to query (required)
	*   - string $section_id    ID of the section record to query (required)
	* @return object Response with:
	*   - array<object>|false result   Array of identifying image descriptors on success;
	*                                  false on error. Each descriptor contains:
	*                                  section_id, section_tipo, component_portal,
	*                                  component_image, label.
	*   - string              msg      Human-readable status message
	*   - array<string>       errors   Populated on failure; empty on success
	*/
	public static function get_ar_identifying_image(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options + validation outside the try/catch so permission_exception
		// propagates to dd_manager rather than being masked.
			$section_tipo = $request_options->section_tipo ?? null;
			$section_id = $request_options->section_id ?? null;
			if (empty($section_tipo) || empty($section_id)) {
				$response->msg		= 'Error. Missing required parameters: section_tipo, section_id';
				$response->errors[]	= 'invalid_request';
				return $response;
			}

		// SEC-024 (§9.2): READ gate.
			security::assert_section_permission($section_tipo, 1, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// section locators
				$section = section::get_instance($section_id, $section_tipo);
				if ($section === null) {
					throw new Exception("Unable to load section: section_tipo=$section_tipo, section_id=$section_id");
				}

				$inverse_locators = $section->get_inverse_references();

			// ar_identifying_image
			// Walk every incoming reference and collect those whose hosting section
			// has a portal component marked with an identifying_image ontology property.
				$ar_identifying_image = [];
				foreach ($inverse_locators as $locator) {
					$identifying_image = self::get_identifying_image_from_section(
						$locator->from_section_tipo,
						(int)$locator->from_section_id
					);
					if (!empty($identifying_image)) {
						$ar_identifying_image[] = $identifying_image;
					}
				}

			// response
				$response->result = $ar_identifying_image;
				$response->msg = 'OK. Request done';

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		return $response;
	}//end get_ar_identifying_image


	/**
	* GET_IDENTIFYING_IMAGE_FROM_SECTION
	* Search a section's portal components for one that declares an identifying_image
	* property in its ontology node, and return its full descriptor.
	*
	* The identifying_image property is defined per-portal in the ontology and holds
	* the tipo string of the component_image component that stores the posterframe
	* inside that portal's target section. Only the first matching portal is returned.
	*
	* Returns null (not throws) when no qualifying portal is found or when an ontology
	* lookup fails, so the caller's loop can continue safely across multiple sections.
	*
	* Returned descriptor shape (on match):
	*   {
	*     section_id      : int,    // the section_id passed in
	*     section_tipo    : string, // the section_tipo passed in
	*     component_portal: string, // tipo of the matching portal component
	*     component_image : string, // tipo from identifying_image ontology property
	*     label           : string  // display label of the section in DEDALO_APPLICATION_LANG
	*   }
	*
	* @param string $section_tipo Section type to inspect
	* @param int    $section_id   Section record ID (used only to populate the descriptor)
	* @return object|null Descriptor object on match; null if no identifying_image portal found
	*                     or if an exception occurs during ontology resolution
	*/
	private static function get_identifying_image_from_section(string $section_tipo, int $section_id) : ?object {

		try {
			$result = null;

			// portals_tipo in section
			// Retrieves all portal component tipos defined for this section type.
			// resolve_virtual=true ensures tipos inherited through virtual nodes are included.
				$ar_portals_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					['component_portal'],
					true, // bool from_cache
					true // bool resolve_virtual
				);

				if (empty($ar_portals_tipo)) {
					return null;
				}

			// section label
			// Fetched once outside the portal loop since all portals share the same section label.
				$label = ontology_node::get_term_by_tipo(
					$section_tipo,
					DEDALO_APPLICATION_LANG,
					true, // bool from_cache
					true // bool fallback
				);

			// match properties->identifying_image with portal_tipo
			// Only portals whose ontology node has an explicit `identifying_image` property
			// are used for posterframe workflows. Other portals are silently skipped.
				foreach ($ar_portals_tipo as $portal_tipo) {
					$ontology_node = ontology_node::get_instance($portal_tipo);
					if ($ontology_node === null) {
						continue;
					}

					$properties = $ontology_node->get_properties();
					if ($properties && isset($properties->identifying_image)) {
						$result = (object)[
							'section_id'		=> $section_id,
							'section_tipo'		=> $section_tipo,
							'component_portal'	=> $portal_tipo,
							'component_image'	=> $properties->identifying_image,
							'label'				=> $label
						];
						break;
					}
				}

			return $result;

		} catch (Exception $e) {
			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . $section_id
				, logger::ERROR
			);
			return null;
		}
	}//end get_identifying_image_from_section

}//end class tool_posterframe
