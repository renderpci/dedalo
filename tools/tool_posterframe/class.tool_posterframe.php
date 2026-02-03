<?php declare(strict_types=1);
/**
 * CLASS TOOL_POSTERFRAME
 * Tool for managing posterframe (thumbnail) extraction from audiovisual media files
 *
 * Processes video files to generate identifying images (posterframes) that are automatically
 * assigned to target portal records through inverse reference relationships. Leverages FFmpeg
 * for video processing and integrates with component_av, component_image, and component_portal.
 *
 * Key features:
 * - Extract posterframe from AV files at specified timecode
 * - Generate images in original quality with automatic downsampling
 * - Create new portal section records automatically
 * - Attach posterframe images to target portals via component_image
 * - Retrieve identifying images from section inverse references
 * - Property-driven image assignment through ontology configuration
 *
 * External dependencies:
 * - FFmpeg: Video processing and frame extraction
 * - Ffmpeg class: PHP wrapper for FFmpeg operations
 * - component_av: AV file management and path resolution
 * - component_image: Image file handling and format conversion
 * - component_portal: Portal record and element management
 *
 * Ported from Dédalo v5 with v7 adaptations.
 *
 * @package Dedalo
 * @subpackage Media
 */
class tool_posterframe extends tool_common {

	/**
	 * CREATE_IDENTIFYING_IMAGE
	 * Extract posterframe from audiovisual file and create identifying image in portal
	 *
	 * Complete workflow:
	 * 1. Instantiate portal component and validate target section types
	 * 2. Create new portal record element for identifying image
	 * 3. Add component_image to new portal record for posterframe storage
	 * 4. Extract source AV file path (preferring original quality)
	 * 5. Execute FFmpeg posterframe extraction at specified timecode
	 * 6. Process extracted image through component_image (create formats, sizes)
	 * 7. Generate thumbnails and default quality versions
	 *
	 * @param object $options Options containing:
	 *                         - tipo (required): AV component type
	 *                         - section_tipo (required): Source section type
	 *                         - section_id (required): Source section ID
	 *                         - item_value (required): Object with component_portal, component_image, section_id, section_tipo
	 *                         - current_time (required): Timecode for posterframe extraction (e.g., "00:00:05.000")
	 * @return object $response Response object with:
	 *                           - result: true on success, false on error
	 *                           - msg: operation status message
	 *                           - errors: array of error messages (optional)
	 * @throws Exception If component instantiation fails or FFmpeg processing fails
	 *
	 * @package Dedalo
	 * @subpackage Media
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
					$ar_portal_section_target_tipo = $component_portal->get_ar_target_section_tipo();
					if (empty($ar_portal_section_target_tipo)) {
						throw new Exception('portal_section_target_tipo not found');
					}
					$portal_section_target_tipo = reset($ar_portal_section_target_tipo);

				// add_new_element
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
				$quality = $component_av->get_quality_original();
				$src_file = $component_av->get_media_filepath($quality);

				if (!file_exists($src_file)) {
					// try with default quality
					$quality = $component_av->get_default_quality();
					$src_file = $component_av->get_media_filepath($quality);
				}

				if (!file_exists($src_file)) {
					throw new Exception("AV file not found in original or default quality: $src_file");
				}

				// posterframe_filepath. Target to generate posterframe
				$posterframe_filepath = $component_image->get_media_filepath(DEDALO_IMAGE_QUALITY_ORIGINAL);

			// FFmpeg create_posterframe
				Ffmpeg::create_posterframe((object)[
					'timecode'				=> $current_time,
					'src_file'				=> $src_file, // av file
					'quality'				=> $quality,
					'posterframe_filepath'	=> $posterframe_filepath // full target file path
				]);

			// component_image process_uploaded_file
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
	 * Retrieve all identifying image elements from section inverse reference relationships
	 *
	 * Processes inverse references (incoming relationships) to find all sections that
	 * link to current section. For each inverse reference, checks if the source section
	 * contains portal components with identifying_image property defined in ontology.
	 *
	 * @param object $request_options Options containing:
	 *                                 - section_tipo (required): Section type to query
	 *                                 - section_id (required): Section ID to query
	 * @return object $response Response object with:
	 *                           - result: array of identifying image objects or false on error
	 *                           - msg: operation status message
	 *                           - errors: array of error messages (optional)
	 * @throws Exception If section loading fails
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function get_ar_identifying_image(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// options
				$section_tipo = $request_options->section_tipo ?? null;
				$section_id = $request_options->section_id ?? null;

			// validate input
				if (empty($section_tipo) || empty($section_id)) {
					$missing = [];
					if (empty($section_tipo)) $missing[] = 'section_tipo';
					if (empty($section_id)) $missing[] = 'section_id';
					
					throw new Exception("Missing required parameters: " . implode(', ', $missing));
				}

			// section locators
				$section = section::get_instance($section_id, $section_tipo);
				if ($section === null) {
					throw new Exception("Unable to load section: section_tipo=$section_tipo, section_id=$section_id");
				}

				$inverse_locators = $section->get_inverse_references();

			// ar_identifying_image
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
	 * Extract identifying image configuration from section portal components
	 *
	 * Searches portal components in the given section for those with
	 * identifying_image property defined in ontology. Returns the first match
	 * with all necessary metadata for posterframe creation.
	 *
	 * @param string $section_tipo Section type to search
	 * @param int $section_id Section ID to search
	 * @return ?object Identifying image object containing section_id, section_tipo,
	 *                 component_portal, component_image, and label; null if not found
	 * @throws Exception If ontology lookups fail
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	private static function get_identifying_image_from_section(string $section_tipo, int $section_id) : ?object {

		try {
			$result = null;

			// portals_tipo in section
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
				$label = ontology_node::get_term_by_tipo(
					$section_tipo,
					DEDALO_APPLICATION_LANG,
					true, // bool from_cache
					true // bool fallback
				);

			// match properties->identifying_image with portal_tipo
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
