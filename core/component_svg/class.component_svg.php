<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SVG
* Manage specific component svg logic
* Common components properties and method are inherited of component_common class that are inherited from common class
*/
class component_svg extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/



	/**
	* GET_AR_QUALITY
	* Get the list of defined svg qualities in Dédalo config
	* @return array $ar_quality
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_SVG_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* @return string
	*/
	public function get_default_quality() : string {

		return DEDALO_SVG_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* @return $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_SVG_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* @return array $normalized_ar_quality
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$default_quality = $this->get_default_quality();

		$normalized_ar_quality = [$default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_EXTENSION
	* @return string DEDALO_SVG_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_SVG_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_SVG_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* 	Get element directory from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_SVG_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Extensions list of preferable extensions in original or modified qualities.
	* Ordered by most preferable extension, first is the best.
	* @return array
	*/
	public function get_best_extensions() : array {

		return ['svg'];
	}//end get_best_extensions



	/**
	* GET_URL
	* Get image url for current quality
	* @param string $quality = null
	*	optional default (bool)false
	* @param bool $test_file = true
	*	Check if file exists. If not use 0.jpg as output. Default true
	* @param bool $absolute = false
	* @param bool $default_add = true
	* @return string|null $image_url
	*	Return relative o absolute url. Default false (relative)
	*/
	public function get_url( ?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=true ) : ?string {

		// quality fallback to default
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// image id
			$image_id = $this->get_id();

		// url
			$additional_path	= $this->additional_path;
			$initial_media_path	= $this->get_initial_media_path();
			$folder				= $this->get_folder(); // like DEDALO_SVG_FOLDER
			$extension			= $this->get_extension();
			$file_name			= $image_id .'.'. $extension;

			$image_url = DEDALO_MEDIA_URL . $folder . $initial_media_path . '/' . $quality . $additional_path . '/' . $file_name;

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $this->get_media_filepath($quality);
				if(!file_exists($file)) {
					if ($default_add===false) {
						return null;
					}
					$image_url = DEDALO_CORE_URL . '/themes/default/icons/dedalo_icon_grey.svg';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$image_url = DEDALO_PROTOCOL . DEDALO_HOST . $image_url;
			}

		return $image_url;
	}//end get_url




	/**
	* GET_FILE_CONTENT
	* Get the SVG file data as text
	* @return string|null $file_content
	*/
	public function get_file_content() : ?string {

		$file_path		= $this->get_media_filepath();
		$file_content	= (file_exists($file_path))
			? file_get_contents($file_path)
			: null;

		return $file_content;
	}//end get_file_content



	/**
	* GET_DEFAULT_SVG_URL
	* @return string $url
	*/
	public static function get_default_svg_url() : string {

		$url = DEDALO_CORE_URL . '/themes/default/upload.svg';

		return $url;
	}//end get_default_svg_url



	/**
	* CREATE_THUMB
	*
	* OSX Brew problem: [source: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096]
	* Looks like the issue is that because the PATH variable is not necessarily available to Apache, IM does not actually know where Ghostscript is located.
	* So I modified my delegates.xml file, which in my case is located in [i]/usr/local/Cellar/imagemagick/6.9.3-0_1/etc/ImageMagick-6/delegates.xml[/] and replaced
	* command="&quot;gs&quot;
	* with
	* command="&quot;/usr/local/bin/gs&quot;
	* @return bool
	*/
	public function create_thumb() : bool {

		// check config constant definition
			if (!defined('DEDALO_QUALITY_THUMB')) {
				define('DEDALO_QUALITY_THUMB', 'thumb');
				debug_log(__METHOD__
					." Undefined config 'DEDALO_QUALITY_THUMB'. Using fallback 'thumb' value"
					, logger::WARNING
				);
			}

		// thumb_path
			$file_name			= $this->get_id();
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// thumb not exists case: generate from PDF
			$quality		= $this->get_default_quality();
			$source_file	= $this->get_media_filepath($quality);
			if (!file_exists($source_file)) {
				debug_log(__METHOD__
					." Ignored thumb creation. default quality file does not exist ($file_name)"
					, logger::DEBUG
				);
				return false;
			}

		// dimensions . Like "102x57"
			$width		= defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 224;
			$height		= defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 149;
			$dimensions	= $width.'x'.$height;

			$thumb_pdf_options = new stdClass();
				$thumb_pdf_options->source_file = $source_file;
				$thumb_pdf_options->ar_layers 	= [0];
				$thumb_pdf_options->target_file = $target_file;
				$thumb_pdf_options->density		= 150;
				$thumb_pdf_options->antialias	= true;
				$thumb_pdf_options->quality		= 75;
				$thumb_pdf_options->resize		= $dimensions;

			ImageMagick::convert($thumb_pdf_options);


		return true;
	}//end create_thumb



	/**
	* GET_URL_FROM_LOCATOR
	* @param object $locator
	* @return string|null $url
	*/
	public static function get_url_from_locator(object $locator) : ?string {

		$model		= ontology_node::get_model_by_tipo($locator->component_tipo,true);
		$component	= component_common::get_instance(
			$model,
			$locator->component_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);
		$url = $component->get_url();

		return $url;
	}//end get_url_from_locator



	/**
	* PROCESS_UPLOADED_FILE
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object|null $file_data
	*	Data from trigger upload file
	* Format:
	* {
	*     "original_file_name": "my_file.svg",
	*     "full_file_name": "test81_test65_2.svg",
	*     "full_file_path": "/mypath/media/svg/standard/test81_test65_2.svg"
	* }
	* @param object|null $process_options = null
	* @return object $response
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check file_data
			if (empty($file_data)) {
				$response->msg .= ' Empty file_data';
				return $response;
			}

		// short vars
			$original_file_name			= $file_data->original_file_name;	// kike "my file785.svg"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/svg/standard/test81_test65_2.svg"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.svg"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " process_uploaded_file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

			// upload info
				$original_quality = $this->get_original_quality();
				if ($this->quality===$original_quality) {
					// update upload file info
					$dato = $this->get_dato();
					$key = 0;
					if (!isset($dato[$key]) || !is_object($dato[$key])) {
						$dato[$key] = new stdClass();
					}
					$dato[$key]->original_file_name			= $original_file_name;
					$dato[$key]->original_normalized_name	= $original_normalized_name;
					$dato[$key]->original_upload_date		= component_date::get_date_now();

					$this->set_dato($dato);
				}

			// Generate default_image_format : If uploaded file is not in Dedalo standard format (jpg), is converted,
			// and original file is conserved (like myfilename.tiff and myfilename.jpg)
			// regenerate component will create the default quality image calling build()
			// build() will check the normalized files of the original and modified quality
			// then if the normalized files doesn't exist, will create it
			// then will create the SVG format of the default
			// then save the data.
				$result = $this->regenerate_component();
				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
				}

			// response OK
				$response->result	= true;
				$response->msg		= 'OK. successful request';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__
				." $msg "
				, logger::ERROR
			);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* UPDATE_DATA_VERSION
	* @param object $options
	* {
	* 	"update_version" 	: "7.0.0" | string
	* 	"data_unchanged" 	: [] | array|null previous data
	* 	"reference_id" 		: $current_section_tipo.'.'.$section_id.'.'.$current_component_tipo | string
	* 	"tipo" 				: $current_component_tipo | string
	* 	"section_id" 		: $section_id | string
	* 	"section_tipo" 		: $current_section_tipo | string
	* 	"context" 			: "update_component_data" | string
	* }
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_data_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {			

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



}//end class component_svg
