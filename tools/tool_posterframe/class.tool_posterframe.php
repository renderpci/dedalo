<?php
/**
* CLASS TOOL_POSTERFRAME
* Manages component_av posterframe works.
* Requires FFMPEG library
* Ported from Dédalo v5
*/
class tool_posterframe extends tool_common {



	/**
	* CREATE_POSTERFRAME
	* @param object $request_options
	* @return object $response
	*/
	public static function create_posterframe(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_id	= null;
				$options->section_tipo	= null;
				$options->current_time	= 0;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			// current_time is a double-precision floating-point value indicating the current playback time in seconds.
			$current_time	= $options->current_time;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$result = $component->create_posterframe($current_time);

		// response
			$response->result	= $result;
			$response->msg		= 'Request done ['.__FUNCTION__.']';

		return $response;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* @param object $request_options
	* @return object $response
	*/
	public static function delete_posterframe(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_id	= null;
				$options->section_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

			$result = $component->delete_posterframe();

		// response
			$response->result	= $result;
			$response->msg		= 'Request done ['.__FUNCTION__.']';

		return $response;
	}//end delete_posterframe



	/**
	* CREATE_IDENTIFYING_IMAGE
	* Build a image file from a posterframe of default quality video
	* Is assigned to target portal from a list of inverse references
	* @param object $request_options
	* @return object $response
	*/
	public static function create_identifying_image(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->tipo			= null;
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->item_value	= null;
				$options->current_time	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo			= $options->tipo;
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$item_value		= $options->item_value;
			$current_time	= $options->current_time;

		// component_portal
		// Create a new section and attach it to the target portal
			$component_portal_model	= RecordObj_dd::get_modelo_name_by_tipo($item_value->component_portal, true);
			$component_portal		= component_common::get_instance($component_portal_model,
																	 $item_value->component_portal,
																	 $item_value->section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 $item_value->section_tipo);
			// portal_section_target_tipo
				$ar_portal_section_target_tipo = $component_portal->get_ar_target_section_tipo(); // First only
				if (empty($ar_portal_section_target_tipo)) {
					$msg = ' Error. portal_section_target_tipo not found !';
					$response->msg .= $msg;
					trigger_error($msg);
					return $response;
				}
				$portal_section_target_tipo = reset($ar_portal_section_target_tipo);

			// add_new_element
				$new_element_response = $component_portal->add_new_element([
					'target_section_tipo' => $portal_section_target_tipo
				]);
				if ($new_element_response->result===false) {
					$msg = ' Error. Unable to create portal record !';
					trigger_error($msg);
					$response->msg .= ' Error. Unable to create portal record';
					return $response;
				}

				$new_section_id = $new_element_response->section_id;
				$added_locator 	= $new_element_response->added_locator;
				// check valid new_section_id
				if($new_section_id<1) {
					$msg = " Invalid new portal record";
					trigger_error($msg);
					$response->msg .= ' Error. Unable to create portal record';
					return $response;
				}


		// component_image
		// Gets the proper path and filename where to save the posterframe file
			$component_image_model	= RecordObj_dd::get_modelo_name_by_tipo($item_value->component_image, true);
			$component_image		= component_common::get_instance($component_image_model,
																	 $item_value->component_image,
																	 $new_section_id,
																	 'edit',
																	 DEDALO_DATA_LANG,
																	 $portal_section_target_tipo);
			// desired image is 'original' quality
				$component_image->set_quality(DEDALO_IMAGE_QUALITY_ORIGINAL);

			// image from video. custom_ar_target
				$target_path		= $component_image->get_target_dir();
				$target_file		= $component_image->get_image_path();
				$custom_ar_target	= [
					'target_path'	=> $target_path, // Absolute path to image dir
					'target_file'	=> $target_file  // Absolute final path of file (included target_path)
				];

		// component_av
		// Generates the posterframe with name and target from component image values
			$component_av_model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component_av		= component_common::get_instance($component_av_model,
																 $tipo,
																 $section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $section_tipo);

			// posterframen file create. returns result boolean value
				$target_quality	= $component_av->get_quality_default();
				$result			= $component_av->create_posterframe(
					$current_time,
					$target_quality,
					$custom_ar_target
				);

		// original to default quality image conversion
			// $source_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;
			// $target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;
			// $component_image->convert_quality( $source_quality, $target_quality );
			// $component_image->Save(); // Force update list value
			$process_response = $component_image->process_uploaded_file((object)[
				'original_file_name'	=> $component_av->get_posterframe_file_name(), // like rsc35_rsc167_1.jpg
				'full_file_path'		=> $component_av->get_posterframe_path()
			]);
			if ($process_response->result===false) {

				// response error on process posterframe file
				$response->result	= $result;
				$response->msg		= 'Error on process posterframe file ['.__FUNCTION__.']';

			}else{

				// response OK
				$response->result	= $result;
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
			$inverse_locators	= $section->get_inverse_locators();

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
			$ar_portals_tipo = section::get_ar_children_tipo_by_modelo_name_in_section(
				$section_tipo,
				['component_portal'],
				$from_cache=true,
				$resolve_virtual=true
			);

		// section label
			$label = RecordObj_dd::get_termino_by_tipo(
				$section_tipo,
				$lang=DEDALO_APPLICATION_LANG,
				$from_cache=true,
				$fallback=true
			);

		// match properties->identifying_image with portal_tipo
			foreach ($ar_portals_tipo as $portal_tipo) {

				$RecordObj_dd	= new RecordObj_dd($portal_tipo);
				$properties		= $RecordObj_dd->get_properties();
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
