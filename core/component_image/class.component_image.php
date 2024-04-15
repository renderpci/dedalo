<?php
declare(strict_types=1);
/**
* CLASS COMPONENT IMAGE
*
*/
class component_image extends component_media_common {



	/**
	* CLASS VARS
	*/
		// id . file name formatted as 'tipo'-'order_id' like dd732-1
		public $image_url;
		// external_source
		// public $external_source;
		// Default image dimensions (as showed in section edit)
		public $width	= 539;
		public $height	= 404;



	/**
	* __CONSTRUCT
	*/
	protected function __construct(string $tipo, $section_id, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null, bool $cache=true) {

		// common constructor. Creates the component as normally do with parent class
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);

		// fix component main properties
			if (!empty($this->section_id)) {

				// additional_path : set and fix current additional image path
					$this->external_source = $this->get_external_source();
			}
	}//end __construct



	/**
	* SAVE
	* Manages specific svg file creation and exec parent Save
	* @return int|null $result
	* 	section_id
	*/
	public function Save() : ?int {

		$dato = $this->get_dato();

		// create_svg_file from dato item temporal container
		if (!empty($dato)) {
			foreach ($dato as $dato_item) {
				if(isset($dato_item->svg_file_data)) {
					$this->create_svg_file($dato_item->svg_file_data);
					// remove property, its only temporal
					// unset($dato_item->svg_file_data);
				}
			}
		}

		$this->dato = $dato;

		$result = parent::Save();

		return $result;
	}//end Save



	/**
	* GET_IMAGE ID
	* By default it's built with the type of the current component_image and the order number, eg. 'dd20_rsc750_1'
	* It can be overwritten in properties with JSON ex. {"id": "dd851"} and will be read from the content of the referenced component
	* @return string|null $id
	*/
	public function get_id() : ?string {

		// already set
			if(isset($this->id) && !empty($this->id)) {
				return $this->id;
			}

		// case 1 external source
			$external_source = $this->get_external_source();
			$id = !empty($external_source)
				? pathinfo($external_source)['filename']
				: null;
			if(!empty($id)){
				$this->id = $id;
				return $id;
			}

		// case 2 referenced name : If is set properties "image_id" overwrite name with field ddx content
			$properties = $this->get_properties();
			if(isset($properties->image_id)){
				$component_tipo	= $properties->image_id;
				$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model,
					$component_tipo,
					$this->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$this->section_tipo,
					false
				);
				$valor	= trim($component->get_valor());
				$id		= (!empty($valor) && strlen($valor)>0)
					? $valor
					: null;
				if(!empty($id)){
					$this->id = $id;
					return $id;
				}
			}

		// fallback default
			if (empty($id)) {

				if (empty($this->section_id)) {
					debug_log(__METHOD__
						." Error. Invalid instance with empty section_id " .PHP_EOL
						.' tipo: ' . $this->tipo .PHP_EOL
						.' section_tipo: ' . $this->section_tipo .PHP_EOL
						.' model: ' . $this->model .PHP_EOL
						, logger::WARNING
					);
					$id = null;
				}else{
					$id = $this->get_identifier();
				}
			}

		// fix value
			$this->id = $id;


		return $id;
	}//end get_id



	/**
	* GET_AR_QUALITY
	* Get the list of defined image qualities in Dédalo config
	* @return array $ar_image_quality
	*/
	public function get_ar_quality() : array {

		$ar_image_quality = DEDALO_IMAGE_AR_QUALITY;

		return $ar_image_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* @return string $default_quality
	*/
	public function get_default_quality() : string {

		$default_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

		return $default_quality;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* @return string $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_MODIFIED_QUALITY
	* @return string $modified_quality
	*/
	public function get_modified_quality() : string {

		$modified_quality = DEDALO_IMAGE_QUALITY_RETOUCHED;

		return $modified_quality;
	}//end get_modified_quality



	/**
	* GET_EXTENSION
	* @return string $this->extension
	* 	Normally DEDALO_IMAGE_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_IMAGE_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	* 	Normally from DEDALO_IMAGE_EXTENSIONS_SUPPORTED from config
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_IMAGE_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* 	Get element dir from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_IMAGE_FOLDER;
	}//end get_folder



	/**
	* GET_EXTERNAL_SOURCE
	* Look current component properties to find the property 'external_source'
	* If found, the source path of current media will be get from a component_iri
	* @see rsc29 (component_image 'Image') properties
	* @return string|null $external_source
	* sample:
	* 	'rsc496' (component_iri)
	*/
	public function get_external_source() : ?string {

		$properties = $this->get_properties();
		if (isset($properties->external_source) && !empty($this->section_id)) {

			$component_tipo		= $properties->external_source;
			$component_model	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component			= component_common::get_instance(
				$component_model,
				$component_tipo,
				$this->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$this->section_tipo
			);

			$dato			= $component->get_dato();
			$first_value	= !empty($dato) && is_array($dato)
				? $dato[0]
				: null;

			// used to change the IRI of the image, don't use it as dataframe section
			// only control if the URI is internal or external.
			if(!empty($first_value->dataframe)){
				if(isset($first_value->iri) && !empty($first_value->iri)) {
					// external_source get from IRI
					$external_source = $first_value->iri;
				}
			}
		}//end if (isset($properties->external_source) && !empty($this->get_parent()) )


		return $external_source ?? null;
	}//end get_external_source



	/**
	* GET_ORIGINAL_UPLOADED_FILE
	* From component dato
	* @return string|null $original_quality
	*/
	public function get_original_uploaded_file() : ?string {

		$original_uploaded_file = null;

		$dato = $this->get_dato();
		if (isset($dato[0]) && isset($dato[0]->original_normalized_name)) {

			$original_quality	= $this->get_original_quality();

			// original file like 'memoria_oral_presentacion.mov'
			$original_uploaded_file	= $this->get_media_path_dir($original_quality) .'/'. $dato[0]->original_normalized_name;
		}

		return $original_uploaded_file;
	}//end get_original_uploaded_file



	/**
	* GET_MODIFIED_UPLOADED_FILE
	* From component dato
	* @return string|null $modified_quality
	*/
	public function get_modified_uploaded_file() : ?string {

		$modified_uploaded_file = null;

		$dato = $this->get_dato();
		if (isset($dato[0]) && isset($dato[0]->modified_normalized_name)) {

			$modified_quality	= $this->get_modified_quality();

			// original file like 'memoria_oral_presentacion.mov'
			$modified_uploaded_file	= $this->get_media_path_dir($modified_quality) .'/'. $dato[0]->modified_normalized_name;
		}

		return $modified_uploaded_file;
	}//end get_modified_uploaded_file



	/**
	* GET_TARGET_FILENAME
	* Upload needed
	* @return string $target_filename
	*/
	public function get_target_filename() : string {

		if($this->external_source) {

			$external_parts		= pathinfo($this->external_source);
			$target_filename	= $external_parts['basename'];

		}else{

			$target_filename = $this->id .'.'. $this->get_extension();
		}


		return $target_filename;
	}//end get_target_filename




	/**
	* CONVERT_QUALITY
	* Creates a version of source image file with target quality
	* using ImageMagick.
	* @param object $options
	* @return bool
	*/
	public function convert_quality(object $options) : bool {

		// options
			$source_quality	= $options->source_quality;
			$source_file	= $options->source_file;
			$target_quality	= $options->target_quality;

		// invalid targets check
			$original_quality = $this->get_original_quality();
			if ($target_quality===$original_quality) {
				debug_log(__METHOD__
					." Ignored wrong target quality [convert_quality]" .PHP_EOL
					.' source_file: ' . to_string($source_file) .PHP_EOL
					.' target_quality: ' . to_string($target_quality)
					, logger::ERROR
				);
				return false;
			}

		// source_quality files check and create it if they not are created before.
			// original_file check (normalized Dédalo original viewable). If not exist, create it
				$normalized_file = $this->get_media_filepath($source_quality); //  $this->get_original_file_path('original');

			// normalized_file . create if not already exist
				$normalized_file_exists = file_exists($normalized_file);
				if (!$normalized_file_exists) {

					$target_file = $normalized_file;

					$options = new stdClass();
						$options->source_file	= $source_file;
						$options->target_file	= $target_file;
						$options->quality		= 100;

					ImageMagick::convert($options);
				}
			// alternative_files . create if not already exist
				$alternative_extensions = $this->get_alternative_extensions();
				if(is_array($alternative_extensions)){

					$path = pathinfo($normalized_file);

					foreach ($alternative_extensions as $alternative_extension) {

						$alternative_target_file = $path['dirname'] . '/' .  $path['filename'] . '.' .$alternative_extension;
						if(!file_exists($alternative_target_file)){
							$alt_options = new stdClass();
								$alt_options->source_file	= $source_file;
								$alt_options->target_file	= $alternative_target_file;
								$alt_options->quality		= 100;

							ImageMagick::convert($alt_options);
						}
					}
				}

		// Image source
			$source_image			= $normalized_file;
			$image_dimensions		= $this->get_image_dimensions($normalized_file);

			$source_pixels_width	= $image_dimensions->width ?? null;
			$source_pixels_height	= $image_dimensions->height ?? null;

		// Image target
			$target_image			= $this->get_media_filepath($target_quality);
			$ar_target				= component_image::get_target_pixels_to_quality_conversion(
				$source_pixels_width,
				$source_pixels_height,
				$target_quality
			);
			$target_pixels_width	= $ar_target[0] ?? null;
			$target_pixels_height	= $ar_target[1] ?? null;

		// Target folder verify (EXISTS AND PERMISSIONS)
			$target_dir = $this->get_media_path_dir($target_quality) ;
			if( !is_dir($target_dir) ) {
				if(!mkdir($target_dir, 0775, true)) {
					// throw new Exception(" Error on read or create directory \"$target_quality\". Permission denied $target_dir (2)");
					debug_log(__METHOD__
						. " Error on read or create directory \"$target_quality\". Permission denied (2) " . PHP_EOL
						. ' target_quality: ' . $target_quality . PHP_EOL
						. ' target_dir: ' . $target_dir
						, logger::ERROR
					);
					return false;
				}
			}

		// Avoid enlarge images
			if ( ($source_pixels_width*$source_pixels_height)<($target_pixels_width*$target_pixels_height) ) {
				$target_pixels_width	= $source_pixels_width;
				$target_pixels_height	= $source_pixels_height;
			}

		// defaults when no value is available
			if($target_pixels_width<1)  $target_pixels_width  = 720;
			if($target_pixels_height<1) $target_pixels_height = 720;

		// convert options
			$options = new stdClass();
	 			$options->source_file = $source_image;
	 			$options->target_file = $target_image;

		// convert with ImageMagick command
	 		$thumb_quality = $this->get_thumb_quality();
			if ($target_quality===$thumb_quality) {
				$options->thumbnail = true;
			}else{
				$options->resize = $target_pixels_width.'x'.$target_pixels_height;
			}
			ImageMagick::convert($options);

		// alternative_extensions
			$alternative_extensions = $this->get_alternative_extensions();
			if (is_array($alternative_extensions)) {

				$source_path	= pathinfo($source_image);
				$target_path	= pathinfo($target_image);

				foreach ($alternative_extensions as $alternative_extension) {

					$source_image_file = $source_path['dirname'] . '/' .  $source_path['filename'] . '.' .$alternative_extension;
					$current_source_file = file_exists($source_image_file)
						? $source_image_file // his own extension file of the source quality
						: $source_file; // check the original quality

					$alt_options = new stdClass();
						$alt_options->source_file	= $current_source_file;
						$alt_options->target_file	= $target_path['dirname'] . '/' .  $target_path['filename'] . '.' .$alternative_extension;
						$alt_options->resize		= $target_pixels_width.'x'.$target_pixels_height;

					ImageMagick::convert($alt_options);
				}
			}

			// $flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height;
			// ImageMagick::process($source_image, $target_image, $flags);


		return true;
	}//end convert_quality



	/**
	* GENERATE_DEFAULT_QUALITY_FILE
	* Generates the default quality image from retouched or original file
	* @param bool $overwrite = true
	* @return bool
	*/
		// public function generate_default_quality_file(object $options) : bool {

		// 	// options
		// 		$overwrite	= $options->overwrite ?? true;
		// 		$from		= $options->from ?? null;

		// 	// from value switch
		// 	switch ($from) {

		// 		case 'original_real':
		// 			// source data (default quality is source)
		// 				$original_quality			= $this->get_original_quality();
		// 				$original_image_path		= $this->get_media_filepath($original_quality);
		// 				$path						= pathinfo($original_image_path);
		// 				$original_image_extension	= $this->get_original_extension(
		// 					true // bool exclude_converted
		// 				);
		// 				$original_image_path_real = $path['dirname'] . '/' .  $path['filename'] . '.' . $original_image_extension;
		// 				if (!file_exists($original_image_path_real)) {

		// 					// notification
		// 						debug_log(__METHOD__
		// 							. " Original image path excluding converted file does not exists. Trying with standard extension: " .DEDALO_IMAGE_EXTENSION . PHP_EOL
		// 							. ' original_image_path_real: ' . $original_image_path_real
		// 							, logger::WARNING
		// 						);

		// 					// second try with standard extension (normally jpg)
		// 						$original_image_extension	= $this->get_original_extension(
		// 							false // bool exclude_converted
		// 						);
		// 						$original_image_path_real = $path['dirname'] . '/' .  $path['filename'] . '.' . $original_image_extension;
		// 						if (!file_exists($original_image_path_real)) {
		// 							debug_log(__METHOD__
		// 								. " Original image path file does not exists ". PHP_EOL
		// 								. ' original_image_path_real: ' . $original_image_path_real
		// 								, logger::WARNING
		// 							);

		// 							return false;
		// 						}
		// 				}

		// 			// target data (target quality is thumb)
		// 				$default_quality	= $this->get_default_quality();
		// 				$image_default_path	= $this->get_media_filepath($default_quality);

		// 			// conversion
		// 				if ($overwrite===true) {

		// 					// original quality create
		// 						ImageMagick::convert((object)[
		// 							'source_file'	=> $original_image_path_real,
		// 							'target_file'	=> $original_image_path,
		// 							'quality'		=> 100
		// 						]);

		// 					// default quality create
		// 						ImageMagick::convert((object)[
		// 							'source_file'	=> $original_image_path,
		// 							'target_file'	=> $image_default_path
		// 						]);
		// 				}
		// 			break;

		// 		default:

		// 			$uploaded_modified_file = $this->get_modified_uploaded_file();
		// 			$uploaded_original_file = $this->get_original_uploaded_file();

		// 			$source_file = isset($uploaded_modified_file) && file_exists($uploaded_modified_file)
		// 				? $uploaded_modified_file
		// 				: (isset($uploaded_original_file) && file_exists($uploaded_original_file)
		// 					? $uploaded_original_file
		// 					: null);

		// 			if(!empty($source_file)){

		// 				// quality default
		// 					$default_quality	= $this->get_default_quality();
		// 					$image_default_path	= $this->get_media_filepath($default_quality);
		// 					// overwrite or create default quality image version
		// 					if ($overwrite===true || !file_exists($image_default_path)) {

		// 						return $this->convert_quality(
		// 							$source_file,
		// 							$default_quality
		// 						);
		// 					}
		// 			}else{
		// 				debug_log(__METHOD__
		// 					." Unable locate source_file. File does not exists:" . PHP_EOL
		// 					.' source_file: ' . $source_file
		// 					, logger::ERROR
		// 				);
		// 			}
		// 			break;

		// 			// // quality retouched
		// 			// 	if (defined('DEDALO_IMAGE_QUALITY_RETOUCHED') && DEDALO_IMAGE_QUALITY_RETOUCHED!==false) {
		// 			// 		# source data (modified is source)
		// 			// 		$original_image_path	= $this->get_media_filepath(DEDALO_IMAGE_QUALITY_RETOUCHED);
		// 			// 		$real_orig_quality		= DEDALO_IMAGE_QUALITY_RETOUCHED;	// Modified
		// 			// 	}

		// 			// // quality original
		// 			// 	if (!isset($original_image_path) || !file_exists($original_image_path)) {
		// 			// 		// source data (default quality is source
		// 			// 		$original_quality		= $this->get_original_quality();
		// 			// 		$original_image_path	= $this->get_media_filepath($original_quality);
		// 			// 		$real_orig_quality		= $original_quality; // Original
		// 			// 	}
		// 			// 	// check original file again
		// 			// 	if (!file_exists($original_image_path)) {
		// 			// 		debug_log(__METHOD__
		// 			// 			." Unable locate original_image. File does not exists:" . PHP_EOL
		// 			// 			.' original_image_path: ' . $original_image_path
		// 			// 			, logger::ERROR
		// 			// 		);
		// 			// 		return false;
		// 			// 	}

		// 			// // quality default
		// 			// 	$default_quality	= $this->get_default_quality();
		// 			// 	$image_default_path	= $this->get_media_filepath($default_quality);
		// 			// 	// overwrite or create default quality image version
		// 			// 	if ($overwrite===true || !file_exists($image_default_path)) {

		// 			// 		return $this->convert_quality(
		// 			// 			$real_orig_quality,
		// 			// 			$default_quality
		// 			// 		);
		// 			// 	}
		// 			// break;
		// 	}


		// 	return true;
		// }//end generate_default_quality_file



	/**
	* GENERATE_DEFAULT_FROM_ORIGINAL_REAL (! Integrated into generate_default_quality_file)
	* Creates default quality version from real original. That means
	* that myfile.tiff will be preferred over myfile.jpg from original folder
	* @param bool $overwrite = true
	* @return bool true
	*/
		// public function generate_default_from_original_real(bool $overwrite=true) : bool {

		// 	// source data (default quality is source)
		// 		$original_quality			= $this->get_original_quality();
		// 		$original_image_path		= $this->get_media_filepath($original_quality);
		// 		$path						= pathinfo($original_image_path);
		// 		$original_image_extension	= $this->get_original_extension(
		// 			true // bool exclude_converted
		// 		);
		// 		$original_image_path_real = $path['dirname'] . '/' .  $path['filename'] . '.' . $original_image_extension;
		// 		if (!file_exists($original_image_path_real)) {
		// 			debug_log(__METHOD__
		// 				. " Original image path file does not exists ". PHP_EOL
		// 				. ' original_image_path_real: ' . $original_image_path_real
		// 				, logger::WARNING
		// 			);
		// 			return false;
		// 		}

		// 	// target data (target quality is thumb)
		// 		$default_quality	= $this->get_default_quality();
		// 		$image_default_path	= $this->get_media_filepath($default_quality);

		// 	// conversion
		// 		if ($overwrite===true) {

		// 			// original quality create
		// 				ImageMagick::convert((object)[
		// 					'source_file'	=> $original_image_path_real,
		// 					'target_file'	=> $original_image_path,
		// 					'quality'		=> 100
		// 				]);

		// 			// default quality create
		// 				ImageMagick::convert((object)[
		// 					'source_file'	=> $original_image_path,
		// 					'target_file'	=> $image_default_path
		// 				]);
		// 		}


		// 	return true;
		// }//end generate_default_from_original_real



	/**
	* CREATE_THUMB
	* Called on save
	* @return object|null $result
	* 	URL	path of thumb file path OR null if default quality file does not exists
	*/
	public function create_thumb() : ?object {
		$start_time = start_time();

		// common data
			$id					= $this->get_id();
			$initial_media_path	= $this->get_initial_media_path();
			// $additional_path	= $this->get_additional_path();

		// quality default
			$quality_default	= $this->get_default_quality();
			$default_image_path	= $this->get_media_filepath($quality_default);

		// check default quality image
			if (!file_exists($default_image_path)) {
				debug_log(__METHOD__
					." Default image quality does not exists. Skip to create thumb. ". PHP_EOL
					.' id: ' . to_string($id)
					, logger::ERROR
				);
				return null;
			}

		// old thumb rename
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();

			$image_thumb_path	= $this->get_media_filepath($thumb_quality, $thumb_extension);
			$image_thumb_url	= $this->get_url(
				$thumb_quality,
				false,  // bool test_file
				false,  // bool absolute
				false // bool default_add
			);

		// thumb generate
			ImageMagick::dd_thumb(
				$default_image_path,
				$image_thumb_path,
			);

		// debug
			debug_log(__METHOD__
				." dd_thumb function called and executed in ". exec_time_unit($start_time,'ms').' ms'. PHP_EOL
				." Created thumb file: " . to_string($image_thumb_path)
				, logger::DEBUG
			);

		// result
			$result = (object)[
				'path'	=> $image_thumb_path,
				'url'	=> $image_thumb_url
			];


		return $result;
	}//end create_thumb




	/**
	* GET_IMAGE_PRINT_DIMENSIONS
	* @param string $quality
	* @return array $ar_info
	*/
	public function get_image_print_dimensions(string $quality) : array {

		$ar_info = $this->pixel_to_centimeters(
			$quality,
			DEDALO_IMAGE_PRINT_DPI // int dpi
		);

		return $ar_info;
	}//end get_image_print_dimensions



	/**
	* CONVERT_QUALITY_TO_MEGABYTES
	* @param string $quality
	* @return double $number
	* 	A float value
	*/
	public static function convert_quality_to_megabytes(string $quality) : float {

		// pastern : '1MB' | '1.5MB' | <1MB | >100MB

		// We removed the megabytes ('MB') text in the quality name
		$string = substr($quality, 0,-2);

		switch (true) {

			case ( strpos($string, '>')===0 ):
				# Sample: >100 will be 100
				$number = intval(substr($string,1)) + 1;
				break;

			case ( strpos($string, '<')===0 ):
				# Sample: <1 will be 1
				$number = floatval( substr($string,1) - 0.1 );
				break;

			default:
				# Default 1.5 will be 1.5
				$number = $string;
				break;
		}

		// Float value
		$number = floatval($number);


		return $number;
	}//end convert_quality_to_megabytes



	/**
	* REMOVE_COMPONENT_MEDIA_FILES (! Moved to media common)
	* "Remove" (rename and move files to deleted folder) all media file linked to current component (all quality versions)
	* Is triggered when section that contain media elements is deleted
	* @see section:remove_section_media_files
	* @param array $ar_quality = []
	* @return bool
	*/
		// public function remove_component_media_files(array $ar_quality=[]) : bool {

		// 	$date = date("Y-m-d_Hi");

		// 	// ar_quality
		// 		if (empty($ar_quality)) {
		// 			$ar_quality = $this->get_ar_quality();
		// 		}

		// 	// files remove
		// 		foreach ($ar_quality as $current_quality) {

		// 			// media_path is full path of file like '/www/dedalo/media_test/media_development/image/thumb/rsc29_rsc170_77.jpg'
		// 				$media_path = $this->get_media_filepath($current_quality);
		// 				if (!file_exists($media_path)) {
		// 					continue; // Skip
		// 				}

		// 			// delete dir
		// 				$folder_path_del = $this->get_target_dir($current_quality)  . '/deleted';
		// 				if( !is_dir($folder_path_del) ) {
		// 					if( !mkdir($folder_path_del, 0775, true) ) {
		// 						debug_log(__METHOD__
		// 							. " Error on read or create directory \"deleted\". Permission denied " . PHP_EOL
		// 							. ' folder_path_del: ' . $folder_path_del
		// 							, logger::ERROR
		// 						);
		// 						return false;
		// 					}
		// 				}

		// 			// move/rename file
		// 				$image_name			= $this->get_name();
		// 				$media_path_moved	= $folder_path_del . '/' . $image_name . '_deleted_' . $date . '.' . $this->get_extension();
		// 				if( !rename($media_path, $media_path_moved) ) {
		// 					debug_log(__METHOD__
		// 						. " Error on read or  move files to folder \"deleted\" [1]. Permission denied . The files are not deleted " . PHP_EOL
		// 						. ' media_path: ' . $media_path . PHP_EOL
		// 						. ' media_path_moved: ' . $media_path_moved
		// 						, logger::ERROR
		// 					);
		// 					return false;
		// 				}

		// 				debug_log(__METHOD__
		// 					." >>> Moved file $media_path to $media_path_moved " . PHP_EOL
		// 					.' media_path: ' . $media_path . PHP_EOL
		// 					.' media_path_moved: ' . $media_path_moved
		// 					, logger::DEBUG
		// 				);

		// 			// Move original files too (PNG,TIF,Etc.)
		// 			// NOTE : 'original files' are NOT 'original quality'. Are uploaded files with extension different to DEDALO_IMAGE_EXTENSION
		// 				$original_extension	= $this->get_original_extension(
		// 					true // bool exclude_converted
		// 				);
		// 				$path_parts				= pathinfo($media_path);
		// 				$original_file			= $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$original_extension;
		// 				$original_file_moved	= $folder_path_del.'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
		// 				if (file_exists($original_file)) {
		// 					if( !rename($original_file, $original_file_moved) ) {
		// 						debug_log(__METHOD__
		// 							. " Error on move files to folder \"deleted\" [2]. Permission denied . The files are not deleted " . PHP_EOL
		// 							. ' original_file: ' . $original_file . PHP_EOL
		// 							. ' original_file_moved: ' . $original_file_moved
		// 							, logger::DEBUG
		// 						);
		// 						return false;
		// 					}
		// 				}
		// 		}//end foreach

		// 	#
		// 	# Original image remove
		// 	# remove additional source images like 'original_image.tif'
		// 	# WORK IN PROGRESS !!

		// 	return true;
		// }//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES (! Moved to media common)
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	*/
		// public function restore_component_media_files() : bool {

		// 	// Image restore
		// 	$ar_quality = DEDALO_IMAGE_AR_QUALITY;
		// 	foreach ($ar_quality as $current_quality) {

		// 		# media_path
		// 		$media_path 	 = $this->get_media_filepath($current_quality);
		// 		$folder_path_del = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
		// 		$id 		 = $this->get_id();
		// 		if(SHOW_DEBUG===true) {
		// 			#dump($folder_path_del, "folder_path_del current_quality:$current_quality - get_id:$id");
		// 		}
		// 		$file_pattern 	= $folder_path_del .'/'.$id .'_*.'. $this->get_extension();
		// 		$ar_files 		= glob($file_pattern);
		// 		if(SHOW_DEBUG===true) {
		// 			#dump($ar_files, ' ar_files');#continue;
		// 		}
		// 		if (empty($ar_files)) {
		// 			debug_log(__METHOD__."  No files to restore were found for id:$id in quality:$current_quality. Nothing was restored for this quality ".to_string(), logger::DEBUG);
		// 			continue; // Skip
		// 		}
		// 		natsort($ar_files);	# sort the files from newest to oldest
		// 		$last_file_path = end($ar_files);
		// 		$new_file_path 	= $this->get_media_filepath($current_quality);
		// 		if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");


		// 		/* POR ACABAR
		// 		// Move original files too (PNG,TIF,Etc.)
		// 		// NOTE : 'original files' are NOT 'original quality'. Are uploaded files with extension different to DEDALO_IMAGE_EXTENSION
		// 		$original_extension = $this->get_original_extension( $current_quality );
		// 		$path_parts 		= pathinfo($media_path);
		// 		$original_file  	= $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$original_extension;
		// 		#$original_file_moved= $path_parts['dirname'].'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
		// 		$original_file_moved= $folder_path_del.'/'.$path_parts['filename'].'_deleted_'.$date.'.'.$original_extension;
		// 		if (file_exists($original_file)) {
		// 			if( !rename($original_file, $original_file_moved) ) {
		// 				#throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
		// 				trigger_error(" Error on move files to folder \"deleted\" [2]. Permission denied . The files are not deleted");
		// 			}
		// 		}
		// 		*/

		// 		debug_log(__METHOD__." Successful Moved file \n$last_file_path to \n$new_file_path ".to_string(), logger::DEBUG);
		// 	}//end foreach

		// 	return true;
		// }//end restore_component_media_files



	/**
	* IMAGE_VALUE_IN_TIME_MACHINE
	* @param string $image_value . Is valor_list of current image. We need replace path to enable view deleted image
	* @return
	*/
		// public static function image_value_in_time_machine( $image_value ) {

		// 	# Example of url: /dedalo4/media_test/media_development/image/thumb/rsc29_rsc170_33.jpg

		// 	preg_match("/src=\"(.+)\"/", $image_value, $output_array);
		// 	if(!isset($output_array[1])) return $image_value;
		// 	$image_url = $output_array[1];

		// 	$id = pathinfo($image_url,PATHINFO_FILENAME);
		// 		#dump($name, ' name ++ '.to_string());

		// 	$image_deleted = self::get_deleted_image( $quality=DEDALO_QUALITY_THUMB, $id );
		// 		#dump($image_deleted, ' image_deleted ++ '.to_string());

		// 	$ar_parts 		 = explode(DEDALO_MEDIA_PATH, $image_deleted);
		// 	if(!isset($ar_parts[1])) return $image_value;
		// 	$final_image_url = DEDALO_MEDIA_URL .$ar_parts[1];
		// 		#dump($final_image_url, ' final_image_url ++ '.to_string());

		// 	$final_image_value = str_replace($image_url, $final_image_url, $image_value);
		// 		#dump($final_image_value, ' final_image_value ++ '.to_string());

		// 	return (string)$final_image_value;
		// }//end image_value_in_time_machine



	/**
	* GET_DELETED_IMAGE
	* @param string $quality
	* @return string $last_file_path
	* 	null when no file found
	*/
	public function get_deleted_image(string $quality) : ?string {

		// media_path
			$media_path			= $this->get_media_filepath($quality);
			$folder_path_del	= pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $folder_path_del .'/'. $id .'_*.'. $this->get_extension();
			$ar_files			= glob($file_pattern);

		// no files found case
			if (empty($ar_files)) {
				debug_log(__METHOD__
					." No files were found for id: $id in quality: $quality"
					, logger::DEBUG
				);
				return null;
			}

		// select last file
			natsort($ar_files);	// sort the files from newest to oldest
			$last_file_path = end($ar_files);


		return $last_file_path;
	}//end get_deleted_image



	/**
	* BUILD_STANDARD_IMAGE_FORMAT
	* If uploaded file is not in Dedalo standard format (jpg), is converted, and original is conserved (like filename.tif)
	* Used in tool_upload post-processing file
	* @param string $uploaded_file_path
	* @return string|null $file_path
	*/
	public static function build_standard_image_format(string $uploaded_file_path) : ?string {

		$f_extension = strtolower(pathinfo($uploaded_file_path, PATHINFO_EXTENSION));
		if ($f_extension!==DEDALO_IMAGE_EXTENSION) {

			// Create new file path
			$new_file_path = substr($uploaded_file_path, 0, -(strlen($f_extension)) ) . DEDALO_IMAGE_EXTENSION;

			// Convert
			$options = new stdClass();
				$options->source_file	= $uploaded_file_path;
				$options->target_file	= $new_file_path;
				$options->quality		= 100;

			$result = ImageMagick::convert($options);
			if ($result===false) {
				debug_log(__METHOD__
					. " Error on build standard_image_format from non Dédalo extension " . PHP_EOL
					. ' f_extension: ' . $f_extension .PHP_EOL
					. ' DEDALO_IMAGE_EXTENSION: ' . DEDALO_IMAGE_EXTENSION .PHP_EOL
					. ' convert options: ' . to_string($options)
					, logger::ERROR
				);
				return null;
			}

			$file_path = $new_file_path;

		}else{

			// Unchanged path
			$file_path = $uploaded_file_path;
		}


		return $file_path;
	}//end build_standard_image_format



	/**
	* GET_ALTERNATIVE_EXTENSIONS
	* @return array|null $alternative_extensions
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = defined('DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS')
			? DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS
			: null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* PROCESS_UPLOADED_FILE
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object $file_data
	*	Data from trigger upload file
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// short vars
			$original_file_name			= $file_data->original_file_name;	// kike "my photo785.jpg"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/image/1.5MB/test175_test65_1.jpg"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.jpg"
			$original_normalized_name	= $full_file_name;

		// upload info. Update dato information about original or modified quality
			$original_quality = $this->get_original_quality();
			if ($this->quality===$original_quality) {
				// update upload file info
				$dato = $this->get_dato();
				$key = 0;
				if (!isset($dato[$key])) {
					$dato[$key] = new stdClass();
				}
				$dato[$key]->original_file_name			= $original_file_name;
				$dato[$key]->original_normalized_name	= $original_normalized_name;
				$dato[$key]->original_upload_date		= component_date::get_date_now();

				$this->set_dato($dato);
			}
			$modified_quality = $this->get_modified_quality();
			if ($this->quality===$modified_quality) {
				// update upload file info
				$dato = $this->get_dato();
				$key = 0;
				if (!isset($dato[$key]) || !is_object($dato[$key])) {
					$dato[$key] = new stdClass();
				}
				$dato[$key]->modified_file_name			= $original_file_name;
				$dato[$key]->modified_normalized_name	= $original_normalized_name;
				$dato[$key]->modified_upload_date		= component_date::get_date_now();

				$this->set_dato($dato);
			}

		// debug
			debug_log(__METHOD__
				. " process_uploaded_file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

			// Generate default_image_format : If uploaded file is not in Dedalo standard format (jpg), is converted,
			// and original file is conserved (like myfilename.tiff and myfilename.jpg)
				self::build_standard_image_format($full_file_path);

			// target_filename. Save original file name in a component_input_text if defined
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {
					$current_section_id			= $this->get_section_id();
					$target_section_tipo		= $this->get_section_tipo();
					$model_name_target_filename	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename,true);
					$component_target_filename	= component_common::get_instance(
						$model_name_target_filename,
						$properties->target_filename,
						$current_section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$target_section_tipo,
						false
					);
					$component_target_filename->set_dato( $original_file_name );
					$component_target_filename->Save();
				}

			// custom_postprocessing_image. postprocessing_image_script
				if (defined('POSTPROCESSING_IMAGE_SCRIPT')) {
					sleep(1);
					require( POSTPROCESSING_IMAGE_SCRIPT );
					$result = custom_postprocessing_image($this);
				}

			// original and retouched cases rewrites default and thumb files
				$original_quality	= $this->get_original_quality();
				$modified_quality	= $this->get_modified_quality();
				$overwrite_default = ($this->quality===$original_quality || $this->quality===$modified_quality);
				if ($overwrite_default===true) {

					// Generate default image quality from original if is needed
						$quality_default	= $this->get_default_quality();
						$default			= $this->build_version($quality_default, true, false);

						// debug
						debug_log(__METHOD__
							." SAVING COMPONENT IMAGE: generate_default_quality_file response: ".to_string($default)
							, logger::DEBUG
						);

					// debug
						debug_log(__METHOD__
							." SAVING COMPONENT IMAGE: create_thumb response: ".to_string($thumb)
							, logger::DEBUG
						);
				}

			// Generate thumb image quality from default always (if default exits)
				$thumb = $this->create_thumb();

			// save component dato
				// Note that save action don't change upload info properties,
				// but force updates every quality file info in property 'files_info
				$this->Save();

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

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
	* CREATE_DEFAULT_SVG_STRING_NODE
	* Generates the SVG code for default quality image and
	* If default quality image file does not exists, return null
	* (!) Note that svg file takes the default quality file (the working file) as reference for dimensions
	* @return string|null $svg_string_node
	*/
	public function create_default_svg_string_node() : ?string {

		// short vars
			$id						= $this->get_id();
			$source_quality			= $this->get_default_quality(); // DEDALO_IMAGE_QUALITY_DEFAULT;
			// $additional_path		= $this->get_additional_path();
			// $initial_media_path	= $this->get_initial_media_path();

		// default quality check file
			$file_path = $this->get_media_filepath($source_quality);
			if (!file_exists($file_path)) {
				debug_log(__METHOD__
					." Unable to create create_default_svg_string_node. Default quality file does not exists: ". PHP_EOL
					.' file_path: ' . $file_path,
					logger::ERROR
				);
				return null;
			}

		// string_node
			$image_url			= $this->get_media_url_dir($source_quality) .'/'. $id .'.'. $this->get_extension(); // relative path
			$image_dimensions	= $this->get_image_dimensions($file_path);
			$width				= $image_dimensions->width ?? null;
			$height				= $image_dimensions->height ?? null;

			$svg_string_node_pretty = '
				<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'.$width.'" height="'.$height.'" viewBox="0,0,'.$width.','.$height.'">
					 <g id="raster">
						 <image width="'.$width.'" height="'.$height.'" xlink:href="'.$image_url.'"/>
					 </g>
				</svg>
			';
			$svg_string_node = trim(preg_replace('/\t+/', '', $svg_string_node_pretty));


		return $svg_string_node;
	}//end create_default_svg_string_node



	/**
	* GET_SVG_FILE_PATH
	* @return string $file_path
	*/
	public function get_svg_file_path() {

		$id					= $this->get_id();
		$additional_path	= $this->get_additional_path();
		$initial_media_path	= $this->get_initial_media_path();
		$folder				= $this->get_folder();

		// media_path
		$media_path = DEDALO_MEDIA_PATH . $folder . $initial_media_path . '/svg' . $additional_path;

		// file_path
		$file_path = $media_path . '/' . $id . '.svg';

		return $file_path;
	}//end get_svg_file_path



	/**
	* CREATE_SVG_FILE
	* Writes the SVG code to disk as SVG file
	* @param string $svg_string_node
	* @return bool
	* 	On write fail return false, else true
	*/
	public function create_svg_file(string $svg_string_node) : bool {

		// paths
			$file_path	= $this->get_svg_file_path();
			$path_parts	= pathinfo($file_path);
			$media_path	= $path_parts['dirname'];

		// check target folder is accessible (EXISTS AND PERMISSIONS)
			if( !is_dir($media_path) ) {
				if( !mkdir($media_path, 0775,  true) ) {
					debug_log(__METHOD__
						." Failed to create directory for default SVG file in media_path: " . PHP_EOL
						.' media_path: ' . $media_path
						, logger::ERROR
					);
					return false;
				}
			}

		// write string_node to disk file
			if( !file_put_contents($file_path, $svg_string_node) ) {
				debug_log(__METHOD__
					." Failed to create file for default SVG file: " . PHP_EOL
					.' file_path: ' . $file_path
					, logger::ERROR
				);
				return false;
			}

		// debug
			debug_log(__METHOD__
				." Created svg file file_path: ".to_string($file_path)
				, logger::DEBUG
			);


		return true;
	}//end create_svg_file



	/**
	* GET_BASE_SVG_URL
	* Get the url of the component SVG file
	* @param bool $test_file = false
	* @param bool $absolute = false
	* @param bool $add_default = false
	* @return string|null $image_url
	*/
	public function get_base_svg_url(bool $test_file=false, bool $absolute=false, bool $add_default=false) : ?string {

		// short vars
			$id					= $this->get_id();
			$additional_path	= $this->get_additional_path();
			$initial_media_path	= $this->get_initial_media_path();
			$base_path			= DEDALO_IMAGE_FOLDER . $initial_media_path . '/svg' . $additional_path;

		// image_url. Default url
			$image_url = DEDALO_MEDIA_URL . $base_path . '/' . $id . '.svg';

		// test_file
			if($test_file===true) {

				$file = DEDALO_MEDIA_PATH . $base_path . '/' . $id . '.svg';
				if( !file_exists($file) ) {
					if ($add_default===false) {
						return null;
					}
					$image_url = DEDALO_CORE_URL . '/themes/default/0.svg';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$image_url = DEDALO_PROTOCOL . DEDALO_HOST . $image_url;
			}


		return $image_url;
	}//end get_base_svg_url



	/**
	* GET_FILE_CONTENT
	* Get the SVG data embedding the image data base64 encoded into
	* @param string $quality = DEDALO_IMAGE_QUALITY_DEFAULT
	* @return string|null $file_content
	*/
	public function get_file_content( string $quality=DEDALO_IMAGE_QUALITY_DEFAULT ) : ?string {

		// short vars
			$id					= $this->get_id();
			$additional_path	= $this->get_additional_path();
			$initial_media_path	= $this->get_initial_media_path();
			$additional_path	= $this->get_additional_path();

		// svg
			$svg_file_name	= $id .'.'. DEDALO_SVG_EXTENSION;
			$svg_file_path	= DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . $initial_media_path . '/' .DEDALO_SVG_EXTENSION . $additional_path . '/' . $svg_file_name;
			// svg data
			$svg_data		= file_get_contents($svg_file_path); // returns the read data or false on failure.
			if (empty($svg_data)) {
				debug_log(__METHOD__
					." Unable to read svg_file_path: ".to_string($svg_file_path)
					, logger::WARNING
				);
				return null;
			}

		// img
			$img_file_name	= $id .'.'. $this->get_extension();
			$img_file_path	= DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . $initial_media_path . '/' . $quality . $additional_path . '/' . $img_file_name;
			// img data
			$img_data		= file_get_contents($img_file_path); // returns the read data or false on failure.
			if (empty($img_data)) {
				debug_log(__METHOD__
					." Unable to read img_file_path: ".to_string($img_file_path)
					, logger::WARNING
				);
				return null;
			}
			// base64_encode image data
			$type	= pathinfo($img_file_path, PATHINFO_EXTENSION);
			$base64	= 'data:image/' . $type . ';base64,' . base64_encode($img_data);

		// file_content. Clean SVG code
			$file_content = preg_replace('/xlink:href=".*?.jpg"/', 'xlink:href="'.$base64.'"', $svg_data);


		return $file_content;
	}//end get_file_content



	/**
	* UPDATE_DATO_VERSION
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$dato_unchanged	= $options->dato_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_dato';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {

			case '6.0.1':
				// component instance
					$model		= RecordObj_dd::get_modelo_name_by_tipo($options->tipo, true);
					$component	= component_common::get_instance(
						$model,
						$options->tipo,
						$options->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$options->section_tipo,
						false
					);

				// run update cache (this action updates files info and saves)
					$component->regenerate_component();
					$new_dato = $component->get_dato();

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				break;

			case '6.0.0':
				$is_old_dato = (
					empty($dato_unchanged) || // v5 early case
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				// $is_old_dato = true; // force here
				if ($is_old_dato===true) {

					// create the component image
						$model		= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_image'
							$tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo,
							false
						);

					// get existing files data
						$file_id			= $component->get_name();
						$source_quality		= $component->get_original_quality();
						$additional_path	= $component->get_additional_path();
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension(); // 'jpg' fallback is expected

						$base_path	= DEDALO_IMAGE_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH   . $base_path . '/' . $file_id . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= DEDALO_IMAGE_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
								$file			= DEDALO_MEDIA_PATH   . $base_path . '/' . $file_id . '.' . $component->get_extension();
							}
							// try again
							if(!file_exists($file)) {
								// reset bad dato
								$response = new stdClass();
									$response->result	= 1;
									$response->new_dato	= null;
									$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string(null).".<br />";
								// $response = new stdClass();
								// 	$response->result	= 2;
								// 	$response->msg		= "[$reference_id] Current dato don't need update. No files found (original,default)<br />";	// to_string($dato_unchanged)."
								return $response;
							}

					// create the svg_file if not already exists
						$svg_file_path = $component->get_svg_file_path();
						if (!file_exists($svg_file_path)) {
							$svg_string_node = $component->create_default_svg_string_node();
							if (!empty($svg_string_node)) {
								$create_svg_file_result	= $component->create_svg_file($svg_string_node);
								if ($create_svg_file_result===false) {
									debug_log(__METHOD__
										." Error creating svg file form svg_string_node ".PHP_EOL
										.' svg_string_node: ' . json_encode($svg_string_node, JSON_PRETTY_PRINT)
										, logger::ERROR
									);
								}
							}
						}

					// source_file_upload_date
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= dd_date::get_dd_date_from_timestamp($upload_date_timestamp);
						$source_file_upload_date->time		= dd_date::convert_date_to_seconds($source_file_upload_date);
						$source_file_upload_date->timestamp	= $upload_date_timestamp;

					// get the source file name
						$source_file_name	= pathinfo($file)['basename'];
						// look for file name stored in another component data
						$properties			= $component->get_properties();
						if(isset($properties->target_filename)) {

							$original_name_tipo		= $properties->target_filename;
							$original_name_model	= RecordObj_dd::get_modelo_name_by_tipo($original_name_tipo,true);

							// create the component with the name of the original file
							$original_name_component = component_common::get_instance(
								$original_name_model,
								$original_name_tipo,
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								$section_tipo,
								false
							);
							$name_component_dato	= $original_name_component->get_dato();
							$source_file_name		= isset($name_component_dato[0]) ? $name_component_dato[0] : $name_component_dato;
						}
						// if the original name is empty we can try to get the original name from Previous Code
						if(empty($source_file_name)) {
							$previous_code_tipo			= 'rsc22';
							$previous_code_model		=  RecordObj_dd::get_modelo_name_by_tipo($previous_code_tipo,true);
							// create the component_input_text where name was saved
							$previous_code_component	= component_common::get_instance(
								$previous_code_model, // expected 'component_input_text'
								$previous_code_tipo, // rsc22
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								$section_tipo,
								false
							);
							$code_component_dato	= $previous_code_component->get_dato();
							$source_file_name		= isset($code_component_dato[0]) ? $code_component_dato[0] : $code_component_dato;
						}

					// lib_data
						$lib_data = null;

					// get files info
						$files_info	= [];
						$ar_quality = DEDALO_IMAGE_AR_QUALITY;
						foreach ($ar_quality as $current_quality) {
							if ($current_quality==='thumb') continue;
							// read file if exists to get file_info
							$file_info = $component->get_quality_file_info($current_quality);
							// add non empty quality files data
							if (!empty($file_info)) {
								// Note that source_quality could be original or default
								if ($current_quality===$source_quality) {
									$file_info->upload_info = (object)[
										'file_name'	=> $source_file_name ?? null,
										'date'		=> $source_file_upload_date ?? null,
										'user'		=> null // unknown here
									];
								}
								// add
								$files_info[] = $file_info;
							}
						}

					// create new dato
						$dato_item = (object)[
							'files_info'	=> $files_info,
							'lib_data'		=> $lib_data
						];

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						debug_log(__METHOD__
							." update_version new_dato ". PHP_EOL
							.' new_dato: ' . json_encode($new_dato, JSON_PRETTY_PRINT)
							, logger::DEBUG
						);

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					// clean vars
						unset($source_file_upload_date);
						unset($files_info);
						unset($lib_data);

				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version



	/**
	* ROTATE
	*	Rotates the given quality image file
	* @param string $degrees
	* 	0 to 360 (positive/negative)
	* @return string $result
	*
	*/
	public function rotate( $options) : ?string {

		$quality			= $options->quality ?? null;
		$extension			= $options->extension ?? null;
		$degrees			= $options->degrees;
		$rotation_mode		= $options->rotation_mode ?? 'right_angles'; // right_angles || free
		$background_color	= $options->background_color ?? null;
		$alpha				= $options->alpha ?? false;


		$alpha =($alpha && $extension === 'jpg')
			? false
			: $alpha;


		// get the source file path
		$source = $this->get_media_filepath($quality, $extension);

		// fallback target to source (overwrite file)
		$target = $source;

		$rotation_options = new stdClass();
			$rotation_options->source			= $source;
			$rotation_options->target			= $target;
			$rotation_options->degrees			= $degrees;
			$rotation_options->rotation_mode	= $rotation_mode;
			$rotation_options->background_color	= $background_color;
			$rotation_options->alpha			= $alpha;

		$command_result = ImageMagick::rotate($rotation_options);

		return $command_result;
	}//end rotate



	/**
	* BUILD_VERSION
	* Creates a new version using IMAGEMAGICK conversion using settings based on target quality
	* @param string $quality
	* @return object $response
	*/
	public function build_version(string $quality, bool $async=true, bool $save=true) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// source
			$uploaded_modified_file = $this->get_modified_uploaded_file();
			$uploaded_original_file = $this->get_original_uploaded_file();

			if (isset($uploaded_modified_file) && file_exists($uploaded_modified_file)) {
				$source_quality	= $this->get_modified_quality();
				$source_file	= $uploaded_modified_file;
			}else if(isset($uploaded_original_file) && file_exists($uploaded_original_file)) {
				$source_quality	= $this->get_original_quality();
				$source_file	= $uploaded_original_file;
			}else{
				$source_file	= null;
			}

		if(!empty($source_file)){

			$result = $this->convert_quality((object)[
				'source_quality'	=> $source_quality,
				'source_file'		=> $source_file,
				'target_quality'	=> $quality
			]);

		}else{

			$result = false;

			debug_log(__METHOD__
				." Unable locate source_file. File does not exists:" . PHP_EOL
				.' source_file: ' . $source_file
				, logger::ERROR
			);

			// response
				$response->result			= $result;
				$response->msg				= 'Unable locate source_file. File does not exists';
				$response->command_response	= null;

			return $response;
		}


		// svg file. Create file again
			$default_quality = $this->get_default_quality();
			if ($quality===$default_quality) {
				$svg_file_path = $this->get_svg_file_path();
				if (file_exists($svg_file_path)) {
					unlink($svg_file_path);
				}
				// If default quality file exists, svg_string_node will be generated, else null
				$svg_string_node = $this->create_default_svg_string_node();
				if (!empty($svg_string_node)) {
					// create the svg default file
					$this->create_svg_file($svg_string_node);
				}
			}


		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version. Generated image file',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $this->get_id(),
					'quality'			=> $quality,
					// 'source_quality'	=> $source_quality,
					'target_quality'	=> $quality
				]
			);

		// update component dato files info and save
			if ($save===true) {
				$this->Save();
			}

		// response
			$response->result			= $result;
			$response->msg				= 'Building file version in background';
			$response->command_response	= null;


		return $response;
	}//end build_version



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* Alias of component_medai_common method with some additions
	* @param array $ar_quality = []
	* @return bool
	*/
	public function remove_component_media_files(array $ar_quality=[]) : bool {

		$result = parent::remove_component_media_files($ar_quality);

		// delete svg file when quality is default_quality
			$default_quality = $this->get_default_quality();
			if (in_array($default_quality, $ar_quality)) {
				$svg_file = $this->get_svg_file_path();
				if (file_exists($svg_file)) {
					// delete existing file
					if (!unlink($svg_file)) {
						debug_log(__METHOD__
							. " Error on delete SVG file " . PHP_EOL
							. ' svg_file: ' . $svg_file
							, logger::ERROR
						);
						return false;
					}
				}
			}


		return $result;
	}//end remove_component_media_files



	/**
	* GET_MEDIA_ATTRIBUTES
	* Read file and get attributes using ffmpeg
	* @param string $file_path
	* @return array|null $media_attributes
	*/
	public function get_media_attributes(string $file_path) : ?array {

		$media_attributes = ImageMagick::get_media_attributes($file_path);

		return $media_attributes;
	}//end get_media_attributes



	/**
	* GET_IMAGE_DIMENSIONS
	* Calculate image size in pixels using PHP exif_read_data
	* File used to read data will be the quality received version,
	* usually default
	* @param string $file_path
	* @return object $image_dimensions
	* 	{
	* 		width: 1280
	* 		height: 1024
	* 	}
	*/
	public function get_image_dimensions(string $file_path) : object {

		$image_dimensions = new stdClass();

		// file path
			if($this->external_source) {

				$file_path = $this->external_source;

				return $image_dimensions;
			}

		// file do not exists case
			if ( !file_exists( $file_path )) {
				debug_log(__METHOD__
					." Error. Image file not found " . PHP_EOL
					. 'file_path: ' .$file_path . PHP_EOL
					. 'section_tipo: ' .$this->section_tipo . PHP_EOL
					. 'section_id: ' .$this->section_id . PHP_EOL
					, logger::ERROR
				);
				// debug
					// if(SHOW_DEBUG===true) {
					// 	dump(debug_backtrace(), ' debug_backtrace ++ '.to_string());
					// }
				return $image_dimensions;
			}

		try {

			// read file exif data with PHP
				// sample result data:
				// {
				//     "FileName": "rsc29_rsc170_49.jpg",
				//     "FileDateTime": 1551715486,
				//     "FileSize": 122953,
				//     "FileType": 2,
				//     "MimeType": "image/jpeg",
				//     "SectionsFound": "",
				//     "COMPUTED": {
				//         "html": "width=\"608\" height=\"862\"",
				//         "Height": 862,
				//         "Width": 608,
				//         "IsColor": 1
				//     }
				// }
				$exif = exif_read_data($file_path);
				if(!empty($exif['Orientation'])) {
					switch($exif['Orientation']) {
						case 8:// rotate 90
						case 6:// rotate 270 || -90
							$width 	= $exif['COMPUTED']['Height'];
							$height = $exif['COMPUTED']['Width'];
							break;
						case 1:	// rotate 0
						case 3: // rotate 180
						default:
							$width 	= $exif['COMPUTED']['Width'];
							$height = $exif['COMPUTED']['Height'];
							break;
					}
				}else{
					$width 	= $exif['COMPUTED']['Width'];
					$height = $exif['COMPUTED']['Height'];
				}
				// check valid values
				if(empty($width) || empty($height)) {
					debug_log(__METHOD__
						." Error. get_image_dimensions error 1 ". PHP_EOL
						.' filename: ' . $file_path . PHP_EOL
						.' exif: ' . to_string($exif)
						, logger::ERROR
					);
					return $image_dimensions;
				}

			// image_dimensions set value
				$image_dimensions->width	= $width;
				$image_dimensions->height	= $height;

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Error. get_image_dimensions error 2 " . PHP_EOL
				.' filename: ' . $file_path .PHP_EOL
				.' Caught exception: '.  $e->getMessage()
				, logger::ERROR
			);
		}


		return $image_dimensions;
	}//end get_image_dimensions



	/**
	* GET_TARGET_PIXELS_TO_QUALITY_CONVERSION
	* @param int|string|null $source_pixels_width
	* @param int|string|null $source_pixels_height
	* @param string $target_quality
	* @return array|null $result
	*/
	public static function get_target_pixels_to_quality_conversion(int|string|null $source_pixels_width, int|string|null $source_pixels_height, string $target_quality) : ?array {

		// check valid pixels
			if((int)$source_pixels_width===0 || (int)$source_pixels_height===0) {
				debug_log(__METHOD__
					." Invalid pixels received." .PHP_EOL
					.' source_pixels_width: ' . to_string($source_pixels_width) .PHP_EOL
					.' source_pixels_height: ' . to_string($source_pixels_height) .PHP_EOL
					.' target_quality: ' . to_string($target_quality) .PHP_EOL
					, logger::ERROR
				);
				return null;
			}

		// thumbs. To generate thumbs, the measurements are fixed
			$thumb_quality = defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';
			if($target_quality===$thumb_quality) {
				// Default 102x57
				$result = [
					DEDALO_IMAGE_THUMB_WIDTH,
					DEDALO_IMAGE_THUMB_HEIGHT
				];

		// others. Calculated
			}else{
				// ratio
					$source_ratio = (int)$source_pixels_width / (int)$source_pixels_height;
				// target megabytes
					$target_megabytes = component_image::convert_quality_to_megabytes($target_quality) * 350000;
				// calculate the short_axis.
					$short_axis = $target_megabytes / $source_ratio;
				// set the values for height and width.
				// if the image is a landscape the ratio will be positive: 1.33 otherwise (vertical) will be negative 0.75
					$height	= intval(sqrt($short_axis));
					$width	= round($height * $source_ratio);

				$result = [
					$width,
					$height
				];
			}

		return $result;
	}//end get_target_pixels_to_quality_conversion



	/**
	* PIXEL_TO_CENTIMETERS
	* @param string $quality
	* 	dir source of image
	* @param $dpi = DEDALO_IMAGE_PRINT_DPI
	*	resolution to convert E.g.: 72dpi or 300dpi
	* @return array $px2cm
	*/
	public function pixel_to_centimeters(string $quality, int $dpi=DEDALO_IMAGE_PRINT_DPI) : array {

		$image_path = $this->get_media_filepath($quality);

		$size = getimagesize($image_path);
		$x = $size[0];
		$y = $size[1];

		// Convert to centimeter
		$h = $x * 2.54 / $dpi;
		$l = $y * 2.54 / $dpi;

		// Format a number with grouped thousands
		$h = number_format($h, 2, ',', ' ');
		$l = number_format($l, 2, ',', ' ');

		$px2cm = [
			$h.'cm',
			$l.'cm'
		];

		return $px2cm;
	}//end pixel_to_centimeters



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-build and save its data
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// files check
			// create default quality file if not already exists
				$default_quality		= $this->get_default_quality();
				$image_default_filepath	= $this->get_media_filepath( $default_quality );
				if (!file_exists($image_default_filepath)) {
					// $this->generate_default_quality_file((object)[
					// 	'overwrite' => true
					// ]);
					$this->build_version($default_quality, true, false);
				}

			// svg file. Create file if not exists
				$svg_file_path = $this->get_svg_file_path();
				if (!file_exists($svg_file_path)) {
					// If default quality file exists, svg_string_node will be generated, else null
					$svg_string_node = $this->create_default_svg_string_node();
					if (!empty($svg_string_node)) {
						// create the svg default file
						$this->create_svg_file($svg_string_node);
					}
				}

		// common regenerate_component exec after specific actions (this action saves at the end)
			$result = parent::regenerate_component();


		return $result;
	}//end regenerate_component



}//end class component_image
