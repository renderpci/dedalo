<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_image_test extends BaseTestCase {



	public static $model		= 'component_image';
	public static $tipo			= 'test99';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/**
	* TEST_get_ar_quality
	* @return void
	*/
	public function test_get_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_AR_QUALITY,
			'expected DEDALO_IMAGE_AR_QUALITY ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_ar_quality



	/**
	* TEST_get_default_quality
	* @return void
	*/
	public function test_get_default_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_default_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_QUALITY_DEFAULT,
			'expected DEDALO_IMAGE_QUALITY_DEFAULT ' . PHP_EOL
				. $result
		);
	}//end test_get_default_quality



	/**
	* TEST_get_original_quality
	* @return void
	*/
	public function test_get_original_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_original_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_QUALITY_ORIGINAL,
			'expected DEDALO_IMAGE_QUALITY_ORIGINAL ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_original_quality



	/**
	* TEST_get_modified_quality
	* @return void
	*/
	public function test_get_modified_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_modified_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_QUALITY_RETOUCHED,
			'expected DEDALO_IMAGE_QUALITY_RETOUCHED ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_modified_quality



	/**
	* TEST_get_uploaded_file
	* @return void
	*/
	public function test_get_uploaded_file() {

		$component = $this->build_component_instance();

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		// original_quality
			$result = $component->get_uploaded_file(
				$component->get_original_quality()
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				strpos($result, '/'.DEDALO_IMAGE_QUALITY_ORIGINAL.'/')!==false,
				'expected type contains original quality: ' . DEDALO_IMAGE_QUALITY_ORIGINAL
			);

		// modified_quality
			$result = $component->get_uploaded_file(
				$component->get_modified_quality()
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				strpos($result, '/'.DEDALO_IMAGE_QUALITY_RETOUCHED.'/')!==false,
				'expected type contains modified quality: ' . DEDALO_IMAGE_QUALITY_RETOUCHED
			);
	}//end test_get_uploaded_file



	/**
	* TEST_get_modified_uploaded_file
	* @return void
	*/
	public function test_get_modified_uploaded_file() {

		$component = $this->build_component_instance();

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		$result = $component->get_modified_uploaded_file();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string or NULL : ' . PHP_EOL
				. gettype($result)
		);
		if ($result) {
			$this->assertTrue(
				strpos($result, '/'.DEDALO_IMAGE_QUALITY_RETOUCHED.'/')!==false,
				'expected type contains modified quality: ' . DEDALO_IMAGE_QUALITY_RETOUCHED
			);
		}
	}//end test_get_modified_uploaded_file



	/**
	* TEST_get_extension
	* @return void
	*/
	public function test_get_extension() {

		$component = $this->build_component_instance();

		$result = $component->get_extension();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_EXTENSION,
			'expected DEDALO_IMAGE_EXTENSION ' . PHP_EOL
				. json_encode($result)
		);

		// set custom value
		$component->extension = 'kyt';

		$result = $component->get_extension();

		$this->assertTrue(
			$result==='kyt',
			'expected kyt ' . PHP_EOL
				. json_encode($result)
		);

		// restore extension
		$component->extension = DEDALO_IMAGE_EXTENSION;
	}//end test_get_extension



	/**
	* TEST_get_allowed_extensions
	* @return void
	*/
	public function test_get_allowed_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_allowed_extensions();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_EXTENSIONS_SUPPORTED,
			'expected DEDALO_IMAGE_EXTENSIONS_SUPPORTED ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_allowed_extensions



	/**
	* TEST_get_folder
	* @return void
	*/
	public function test_get_folder() {

		$component = $this->build_component_instance();

		$result = $component->get_folder();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_IMAGE_FOLDER,
			'expected DEDALO_IMAGE_FOLDER ' . PHP_EOL
				. json_encode($result)
		);

		$original_folder = $component->get_folder();

		// set custom

		$component->folder = '/atke';

		$result = $component->get_folder();

		$this->assertTrue(
			$result==='/atke',
			'expected /atke ' . PHP_EOL
				. json_encode($result)
		);

		// restore
		$component->folder = $original_folder;
	}//end test_get_folder



	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		$component = $this->build_component_instance();

		// default
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				false, // test_file
				false, // absolute
				false // default_add
			);

			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
				'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
					. $result
			);

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);
			// expected sample
			// /media/image/1.5MB/test99_test3_1.jpg

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, DEDALO_IMAGE_QUALITY_DEFAULT)!==false,
					'expected contains ' .DEDALO_IMAGE_QUALITY_DEFAULT. PHP_EOL
						. $result
				);
			}

		// test_file
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

		// absolute
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				false, // test_file
				true, // absolute
				false // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, DEDALO_PROTOCOL . DEDALO_HOST)!==false,
					'expected contains ' .DEDALO_PROTOCOL . DEDALO_HOST. PHP_EOL
						. $result
				);
			}

		// default_add
			$model			= self::$model;
			$tipo			= self::$tipo;
			$section_tipo	= self::$section_tipo;
			$mode			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;

			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				9999999,
				$mode,
				$lang,
				$section_tipo
			);
			$result = $component->get_url(
				DEDALO_IMAGE_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				true // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
			if (!empty($result)) {
				$this->assertTrue(
					$result===DEDALO_ROOT_WEB . '/core/themes/default/0.jpg',
					'expected '.DEDALO_ROOT_WEB.'/core/themes/default/0.jpg : ' . PHP_EOL
						. $result
				);
			}
	}//end test_get_url



	/**
	* TEST_get_external_source
	* @return void
	*/
	public function test_get_external_source() {

		$component = $this->build_component_instance();

		$result = $component->get_external_source();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===null,
			'expected null ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_external_source



	/**
	* TEST_get_thumb_quality
	* @return void
	*/
	public function test_get_thumb_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_thumb_quality();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===DEDALO_QUALITY_THUMB,
			'expected DEDALO_QUALITY_THUMB ' . PHP_EOL
				. $result
		);
	}//end test_get_thumb_quality



	/**
	* TEST_get_target_filename
	* @return void
	*/
	public function test_get_target_filename() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

		$component = $this->build_component_instance();

		$result = $component->get_target_filename();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$name = $tipo.'_'.$section_tipo.'_'.$section_id;

		$this->assertTrue(
			$result===($name.'.jpg'),
			'expected ' .$name.'.jpg'. PHP_EOL
				. $result
		);
	}//end test_get_target_filename



	/**
	* TEST_convert_quality
	* @return void
	*/
	public function test_convert_quality() {

		$component = $this->build_component_instance();

		$original_quality	= $component->get_original_quality();
		$source_file		= $component->get_media_filepath($original_quality);
		$target_quality		= '6MB';
		$result				= $component->convert_quality((object)[
			'source_quality'	=> $original_quality,
			'source_file'		=> $source_file,
			'target_quality'	=> $target_quality

		]);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$media_filepath = $component->get_media_filepath($target_quality);

		$this->assertTrue(
			file_exists($media_filepath),
			'expected  file_exists '. PHP_EOL
				. $media_filepath
		);
	}//end test_convert_quality



	/**
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();

		$result = $component->create_thumb();

		if (!is_null($result)) {

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_create_thumb



	/**
	* TEST_get_normalized_ar_quality
	* @return void
	*/
	public function test_get_normalized_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_normalized_ar_quality();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
		$this->assertTrue(
			count($result) === 3,
			'expected 3 elements'
		);
	}//end test_get_normalized_ar_quality



	/**
	* TEST_get_best_extensions
	* @return void
	*/
	public function test_get_best_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_best_extensions();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
	}//end test_get_best_extensions



	/**
	* TEST_get_alternative_extensions
	* @return void
	*/
	public function test_get_alternative_extensions() {

		$component = $this->build_component_instance();

		$result = $component->get_alternative_extensions();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected array or null'
		);
	}//end test_get_alternative_extensions



	/**
	* TEST_get_target_pixels_to_quality_conversion
	* @return void
	*/
	public function test_get_target_pixels_to_quality_conversion() {

		$result = component_image::get_target_pixels_to_quality_conversion(1000, 1000, 'thumb');

		$this->assertTrue(
			is_array($result),
			'expected array'
		);

		$result = component_image::get_target_pixels_to_quality_conversion(1000, 1000, DEDALO_IMAGE_QUALITY_ORIGINAL);

		$this->assertTrue(
			$result[0] === 1000,
			'expected original width'
		);
	}//end test_get_target_pixels_to_quality_conversion



	/**
	* TEST_get_base_svg_url
	* @return void
	*/
	public function test_get_base_svg_url() {

		$component = $this->build_component_instance();

		$result = $component->get_base_svg_url();

		$this->assertTrue(
			is_string($result),
			'expected string'
		);
	}//end test_get_base_svg_url



	/**
	* TEST_get_svg_file_path
	* @return void
	*/
	public function test_get_svg_file_path() {

		$component = $this->build_component_instance();

		$result = $component->get_svg_file_path();

		$this->assertTrue(
			is_string($result),
			'expected string'
		);
	}//end test_get_svg_file_path



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)['update_version' => [1,0,0]];
		$result = component_image::update_data_version($options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_pixel_to_centimeters
	* @return void
	*/
	public function test_pixel_to_centimeters() {

		$this->user_login();

		$component = $this->build_component_instance();
		$quality = $component->get_default_quality();

		// Ensure file exists for getimagesize
		$path = $component->get_media_filepath($quality);
		if (file_exists($path)) {
			$result = $component->pixel_to_centimeters($quality);

			$this->assertTrue(
				is_array($result),
				'expected array'
			);
		}
	}//end test_pixel_to_centimeters



	/**
	* TEST_create_default_svg_string_node
	* @return void
	*/
	public function test_create_default_svg_string_node() {

		$component = $this->build_component_instance();
		$quality = $component->get_default_quality();

		$path = $component->get_media_filepath($quality);
		if (file_exists($path)) {
			$result = $component->create_default_svg_string_node();

			$this->assertTrue(
				is_string($result) || is_null($result),
				'expected string or null'
			);
		}
	}//end test_create_default_svg_string_node



	/**
	* TEST_get_image_print_dimensions
	* @return void
	*/
	public function test_get_image_print_dimensions() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->get_image_print_dimensions($quality);

		// sample
		// [
		//     "8,67cm",
		//     "8,67cm"
		// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result[0]),
			'expected !empty($result[0]) : ' . PHP_EOL
				. empty($result[0])
		);
		$this->assertTrue(
			!empty($result[1]),
			'expected !empty($result[1]) : ' . PHP_EOL
				. empty($result[1])
		);
	}//end test_get_image_print_dimensions



	/**
	* TEST_convert_quality_to_megabytes
	* @return void
	*/
	public function test_convert_quality_to_megabytes() {

		$component = $this->build_component_instance();

		$quality = $component->get_default_quality();

		$result = $component->convert_quality_to_megabytes($quality);

		$this->assertTrue(
			gettype($result)==='double',
			'expected type double : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_convert_quality_to_megabytes



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result = $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		$result = $component->get_data();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		// restore original data
		$component->set_data($original_data);
	}//end test_set_data



	/**
	* TEST_set_data_empty
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		$component->set_data([]);

		$result = $component->get_data();

		$this->assertTrue(
			$result===null || $result===[],
			'expected null or empty array : ' . PHP_EOL
				. json_encode($result)
		);

		// restore original data
		$component->set_data($original_data);
	}//end test_set_data_empty



	/**
	* TEST_save_and_reload
	* @return void
	*/
	public function test_save_and_reload() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		$saved = $component->save();

		$this->assertTrue(
			$saved===true,
			'expected save true : ' . PHP_EOL
				. json_encode($saved)
		);

		// reload
		$component2 = component_common::get_instance(
			self::$model,
			self::$tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		$reloaded_data = $component2->get_data();

		$this->assertTrue(
			gettype($reloaded_data)==='array',
			'expected type array after reload : ' . PHP_EOL
				. gettype($reloaded_data)
		);

		// restore original data
		$component->set_data($original_data);
		$component->save();
	}//end test_save_and_reload



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// is_empty_data: array-level check
			$result = $component->is_empty_data(
				$component->get_data()
			);
			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

		// is_empty with single data_item (media components have files_info not value)
			$data = $component->get_data();
			if (!empty($data) && isset($data[0])) {
				$result = $component->is_empty($data[0]);
				// media component data items have files_info not value, so is_empty returns true by design
				$this->assertTrue(
					gettype($result)==='boolean',
					'expected type boolean for is_empty(item) : ' . PHP_EOL
						. gettype($result)
				);
			}
	}//end test_is_empty



	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_identifier



	/**
	* TEST_component_instance_modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$lang			= DEDALO_DATA_NOLAN;

		// edit mode
			$component_edit = component_common::get_instance(
				$model, $tipo, $section_id, 'edit', $lang, $section_tipo
			);
			$this->assertTrue(
				$component_edit->mode==='edit',
				'expected mode edit'
			);

		// list mode
			$component_list = component_common::get_instance(
				$model, $tipo, $section_id, 'list', $lang, $section_tipo
			);
			$this->assertTrue(
				$component_list->mode==='list',
				'expected mode list'
			);

		// search mode
			$component_search = component_common::get_instance(
				$model, $tipo, $section_id, 'search', $lang, $section_tipo
			);
			$this->assertTrue(
				$component_search->mode==='search',
				'expected mode search'
			);
	}//end test_component_instance_modes



	/**
	* TEST_quality_file_exist_all_qualities
	* @return void
	*/
	public function test_quality_file_exist_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {
			$result = $component->quality_file_exist($quality);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_quality_file_exist_all_qualities



	/**
	* TEST_get_media_filepath_all_qualities
	* @return void
	*/
	public function test_get_media_filepath_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {
			$result = $component->get_media_filepath($quality);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, $quality)!==false,
				'expected contains quality ' . $quality . ' : ' . PHP_EOL
					. $result
			);
		}
	}//end test_get_media_filepath_all_qualities



	/**
	* TEST_get_url_all_qualities
	* @return void
	*/
	public function test_get_url_all_qualities() {

		$component = $this->build_component_instance();

		$ar_quality = $component->get_ar_quality();

		foreach ($ar_quality as $quality) {
			$result = $component->get_url($quality, false, false, false);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string for quality ' . $quality . ' : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, $quality)!==false,
				'expected contains quality ' . $quality . ' : ' . PHP_EOL
					. $result
			);
		}
	}//end test_get_url_all_qualities



	/**
	* TEST_delete_normalized_files
	* @return void
	*/
	public function test_delete_normalized_files() {

		$component = $this->build_component_instance();

		$original_quality	= $component->get_original_quality();
		$default_quality	= $component->get_default_quality();

		// backup files before deletion
			$ar_quality = [$original_quality, $default_quality];
			$backup_files = [];
			foreach ($ar_quality as $quality) {
				$filepath = $component->get_media_filepath($quality);
				if (file_exists($filepath)) {
					$backup_files[$quality] = $filepath . '.bak_test';
					copy($filepath, $backup_files[$quality]);
				}
			}

		$result = $component->delete_normalized_files($ar_quality);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// restore backup files
			foreach ($backup_files as $quality => $backup_path) {
				$original_path = $component->get_media_filepath($quality);
				if (file_exists($backup_path)) {
					rename($backup_path, $original_path);
				}
			}

		// regenerate to restore deleted files
			$component->regenerate_component();
	}//end test_delete_normalized_files



	/**
	* TEST_build_version
	* @return void
	*/
	public function test_build_version() {

		$component = $this->build_component_instance();

		$default_quality = $component->get_default_quality();

		$result = $component->build_version($default_quality, false, false);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result->result),
			'expected result property'
		);
	}//end test_build_version



	/**
	* TEST_process_uploaded_file_empty_data
	* @return void
	*/
	public function test_process_uploaded_file_empty_data() {

		$component = $this->build_component_instance();

		// null file_data: handled by empty check, returns result=false
			$result = $component->process_uploaded_file(null);
			$this->assertTrue(
				$result->result===false,
				'expected result false for null file_data'
			);

		// incomplete file_data (missing full_file_path): TypeError on file_exists(null)
			$file_data = (object)[
				'original_file_name'	=> 'test.jpg',
				'full_file_name'		=> 'test.jpg'
				// missing full_file_path
			];
			$exception_caught = false;
			try {
				$result = $component->process_uploaded_file($file_data);
			} catch (TypeError $e) {
				$exception_caught = true;
			}
			$this->assertTrue(
				$exception_caught,
				'expected TypeError for incomplete file_data (missing full_file_path)'
			);

		// non-existent file path
			$file_data = (object)[
				'original_file_name'	=> 'test.jpg',
				'full_file_name'		=> 'test.jpg',
				'full_file_path'		=> '/non/existent/path/test.jpg'
			];
			$result = $component->process_uploaded_file($file_data);
			$this->assertTrue(
				$result->result===false,
				'expected result false for non-existent file path'
			);
	}//end test_process_uploaded_file_empty_data



	/**
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

		$component = $this->build_component_instance();

		$target_quality	= '6MB';
		$result			= $component->set_quality(
			$target_quality
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true value : true ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			$component->quality===$target_quality,
			'expected  component quality '. $target_quality . PHP_EOL
				. $result
		);

		// invalid value
			$target_quality	= 'invalid value!';
			$result			= $component->set_quality(
				$target_quality
			);

			$this->assertTrue(
				$result===false,
				'expected false value : ' . PHP_EOL
					. to_string($result)
			);

			$this->assertTrue(
				$component->quality!==$target_quality,
				'expected  component quality distinct of '. $target_quality . PHP_EOL
					. $result
			);
	}//end test_set_quality



	/**
	* TEST_get_id_extended
	* @return void
	*/
	public function test_get_id_extended() {

		$component = $this->build_component_instance();

		// 1 - Default ID
		$result = $component->get_id();
		$this->assertTrue(is_string($result));

		// 2 - ID from properties (image_id)
		// We'd need a real component to test this fully, but we can mock properties
		$component->properties = (object)['image_id' => self::$tipo];
		// This will call get_instance for test99 on the same section_id
		// If test99 is the same component it might work if it has data

		$result = $component->get_id();
		$this->assertTrue(is_string($result));
	}//end test_get_id_extended



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$component = $this->build_component_instance();

		$result = $component->regenerate_component();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_regenerate_component



}//end class component_image_test
