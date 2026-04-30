<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_svg_test extends BaseTestCase {



	public static $model		= 'component_svg';
	public static $tipo			= 'test177';
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
			$result===DEDALO_SVG_AR_QUALITY,
			'expected DEDALO_SVG_AR_QUALITY ' . PHP_EOL
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
			$result===DEDALO_SVG_QUALITY_DEFAULT,
			'expected DEDALO_SVG_QUALITY_DEFAULT ' . PHP_EOL
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
			$result===DEDALO_SVG_QUALITY_ORIGINAL,
			'expected DEDALO_SVG_QUALITY_ORIGINAL ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_original_quality



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
			$result===DEDALO_SVG_EXTENSION,
			'expected DEDALO_SVG_EXTENSION ' . PHP_EOL
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
		$component->extension = DEDALO_SVG_EXTENSION;
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
			$result===DEDALO_SVG_EXTENSIONS_SUPPORTED,
			'expected DEDALO_SVG_EXTENSIONS_SUPPORTED ' . PHP_EOL
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
			$result===DEDALO_SVG_FOLDER,
			'expected DEDALO_SVG_FOLDER ' . PHP_EOL
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

		$result = $component->get_url();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_url



	/**
	* TEST_get_thumb_url
	* @return void
	*/
	public function test_get_thumb_url() {

		$component = $this->build_component_instance();

		$result = $component->get_thumb_url();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_thumb_url



	/**
	* TEST_get_file_content
	* @return void
	*/
	public function test_get_file_content() {

		$component = $this->build_component_instance();

		$result = $component->get_file_content();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_file_content



	/**
	* TEST_get_default_svg_url
	* @return void
	*/
	public function test_get_default_svg_url() {

		$component = $this->build_component_instance();

		$result = $component->get_default_svg_url();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_default_svg_url



	/**
	* TEST_get_url_from_locator
	* @return void
	*/
	public function test_get_url_from_locator() {

		$component = $this->build_component_instance();

		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id($component->section_id);
			$locator->set_component_tipo($component->tipo);

		$result = component_svg::get_url_from_locator($locator);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				strpos($result, 'http')!==0,
				'unexpected http protocol in relative URL : ' . PHP_EOL
					. to_string($result)
			);
		}
	}//end test_get_url_from_locator




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
			$result===($name.'.svg'),
			'expected ' .$name.'.svg'. PHP_EOL
				. $result
		);
	}//end test_get_target_filename



	/**
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

		$component = $this->build_component_instance();

		$target_quality	= 'web';
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
	* TEST_get_normalized_ar_quality
	* @return void
	*/
	public function test_get_normalized_ar_quality() {

		$component = $this->build_component_instance();

		$result = $component->get_normalized_ar_quality();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$default_quality = $component->get_default_quality();

		$this->assertTrue(
			in_array($default_quality, $result),
			'expected default quality in normalized array : ' . PHP_EOL
				. json_encode($result)
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
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			in_array('svg', $result),
			'expected svg in best extensions : ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_get_best_extensions



	/**
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();

		$result = $component->create_thumb();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_create_thumb



	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		// Test with null file_data
		$result = $component->process_uploaded_file(null);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result->result),
			'expected result property in response : ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			$result->result===false,
			'expected false result with null file_data : ' . PHP_EOL
				. json_encode($result)
		);

		// Test with valid file_data structure (but non-existent file)
		$file_data = new stdClass();
			$file_data->original_file_name = 'test.svg';
			$file_data->full_file_name = 'test177_test3_1.svg';
			$file_data->full_file_path = '/non/existent/path/test.svg';

		$result = $component->process_uploaded_file($file_data);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result->result===false,
			'expected false result with non-existent file : ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_process_uploaded_file



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = new stdClass();
			$options->update_version = [7, 0, 0];
			$options->data_unchanged = null;
			$options->reference_id = 'test3.1.test177';
			$options->tipo = 'test177';
			$options->section_id = '1';
			$options->section_tipo = 'test3';
			$options->context = 'update_component_data';

		$result = component_svg::update_data_version($options);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			isset($result->result),
			'expected result property in response : ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			isset($result->msg),
			'expected msg property in response : ' . PHP_EOL
				. json_encode($result)
		);
	}//end test_update_data_version



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



}//end class component_svg_test
