<?php
/**
* CLASS TOOL_POSTERFRAME
* Manages component_av posterframe works.
* Requires FFMPEG library
* Ported from Dédalo v5
*/
class tool_posterframe extends tool_common {



	/**
	* CREATE_IDENTIFYING_IMAGE
	* Build a image file from a posterframe of default quality video
	* Is assigned to target portal from a list of inverse references
	* @param object $options
	* @return object $response
	*/
	public static function create_identifying_image(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.'] ';

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$item_value		= $options->item_value ?? null;
			$current_time	= $options->current_time ?? null;

		// component_portal. Create a new section and attach it to the target portal
			$component_portal_model	= ontology_node::get_model_by_tipo(
				$item_value->component_portal,
				true
			);
			$component_portal = component_common::get_instance(
				$component_portal_model,
				$item_value->component_portal,
				$item_value->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$item_value->section_tipo
			);

			// portal_section_target_tipo
				$ar_portal_section_target_tipo = $component_portal->get_ar_target_section_tipo(); // First only
				if (empty($ar_portal_section_target_tipo)) {
					$response->msg .= ' Error. portal_section_target_tipo not found !';
					debug_log(__METHOD__
						. ' ' . $response->msg
						, logger::ERROR
					);
					return $response;
				}
				$portal_section_target_tipo = reset($ar_portal_section_target_tipo);

			// add_new_element
				$new_element_response = $component_portal->add_new_element((object)[
					'target_section_tipo' => $portal_section_target_tipo
				]);
				if ($new_element_response->result===false) {
					$response->msg .= ' Error. Unable to create portal record !';
					debug_log(__METHOD__
						. ' ' . $response->msg . PHP_EOL
						. ' portal_section_target_tipo: ' . to_string($portal_section_target_tipo)
						, logger::ERROR
					);
					return $response;
				}
				// save portal if all is all OK
				$component_portal->Save();
				// check locator section id is valid
				$new_section_id	= $new_element_response->section_id;
				// check valid new_section_id
				if( (int)$new_section_id<1 ) {
					$response->msg .= ' Error. Unable to create portal record';
					debug_log(__METHOD__
						. ' ' . $response->msg
						, logger::ERROR
					);
					return $response;
				}

		// component_image. Gets the proper path and filename where to save the posterframe file
			$component_image_model = ontology_node::get_model_by_tipo(
				$item_value->component_image,
				true
			);
			$component_image = component_common::get_instance(
				$component_image_model,
				$item_value->component_image,
				$new_section_id,
				'edit',
				DEDALO_DATA_LANG,
				$portal_section_target_tipo
			);
			// desired image is 'original' quality
				$component_image->set_quality(DEDALO_IMAGE_QUALITY_ORIGINAL);

			// image from video. custom_ar_target
				// $target_path		= $component_image->get_media_path_dir(DEDALO_IMAGE_QUALITY_ORIGINAL);
				// $target_file		= $component_image->get_media_filepath(DEDALO_IMAGE_QUALITY_ORIGINAL);
				// $custom_ar_target	= [
				// 	$target_file  // Absolute final path of file (included target_path)
				// ];

		// component_av. Needed to get av file paths
			$component_av_model	= ontology_node::get_model_by_tipo($tipo,true);
			$component_av		= component_common::get_instance(
				$component_av_model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		// short vars
			// posterframe file create. returns result boolean value
			$quality = $component_av->get_quality_original();
			// src_file. av file full path
			$src_file = $component_av->get_media_filepath($quality);
			if (!file_exists($src_file)) {
				// try with default quality
				$quality	= $component_av->get_default_quality();
				$src_file	= $component_av->get_media_filepath($quality);
			}
			if (!file_exists($src_file)) {
				$response->msg .=  ' Error on get av file. File do not exist in original or default quality';
				debug_log(__METHOD__
					. ' ' . $response->msg . PHP_EOL
					. ' src_file: ' . $src_file
					, logger::ERROR
				);
				return $response;
			}
			// posterframe_filepath. Target to generate posterframe
			// We send the posterframe to the final component_image path as the tool upload would do
			$posterframe_filepath = $component_image->get_media_filepath(DEDALO_IMAGE_QUALITY_ORIGINAL);

		// ffmpeg create_posterframe
			Ffmpeg::create_posterframe((object)[
				'timecode'			=> $current_time,
				'src_file'			=> $src_file, // av file
				'quality'			=> $quality,
				'posterframe_filepath'	=> $posterframe_filepath // full target file path
			]);

		// component_image process_uploaded_file
			// original file name from posterframe path like rsc35_rsc167_1.jpg
			$original_file_name	= pathinfo($posterframe_filepath)['basename'];
			$full_file_path		= $posterframe_filepath; // full path to file
			$full_file_name		= $original_file_name; // same as original_file_name
			// process create default and thumb files and save component files info
			$process_response = $component_image->process_uploaded_file(
				(object)[
					'original_file_name'	=> $original_file_name, // like rsc35_rsc167_1.jpg
					'full_file_path'		=> $full_file_path,
					'full_file_name'		=> $full_file_name
				],
				null
			);

		// response
			if ($process_response->result===false) {
				// response error on process posterframe file
				$response->result	= false;
				$response->msg		= 'Error on process posterframe file ['.__FUNCTION__.']';
			}else{
				// response OK
				$response->result	= true;
				$response->msg		= 'Request done ['.__FUNCTION__.']';
			}


		return $response;
	}//end create_identifying_image



	/**
	* GET_AR_IDENTIFYING_IMAGE
	* Get identifying_image elements possibles from section inverse locators
	* @return object $response
	* 	->result : array $ar_identifying_image
	*/
	public static function get_ar_identifying_image(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->section_tipo	= null;
				$options->section_id	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;

		// section locators
			$section			= section::get_instance($section_id, $section_tipo);
			$inverse_locators	= $section->get_inverse_references();

		// ar_identifying_image
			$ar_identifying_image = [];
			foreach ($inverse_locators as $locator) {

				$identifying_image = self::get_identifying_image_from_section($locator->from_section_tipo, (int)$locator->from_section_id);
				if(empty($identifying_image)) continue;

				$ar_identifying_image[] = $identifying_image;
			}

		$response = new stdClass();
			$response->result	= $ar_identifying_image;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end get_ar_identifying_image



	/**
	* GET_IDENTIFYING_IMAGE_FROM_SECTION
	*  Match every portal_tipo of current section with properties->identifying_image
	* @return object|null $result
	*/
	private static function get_identifying_image_from_section(string $section_tipo, int $section_id) : ?object {

		$result = null;

		// portals_tipo in section
			$ar_portals_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component_portal'],
				true, // bool from_cache
				true // bool resolve_virtual
			);

		// section label
			$label = ontology_node::get_term_by_tipo(
				$section_tipo,
				DEDALO_APPLICATION_LANG, // string lang
				true, // bool from_cache
				true // bool fallback
			);

		// match properties->identifying_image with portal_tipo
			foreach ($ar_portals_tipo as $portal_tipo) {

				$ontology_node	= ontology_node::get_instance($portal_tipo);
				$properties		= $ontology_node->get_properties();
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
	}//end get_identifying_image_from_section



}//end class tool_posterframe
