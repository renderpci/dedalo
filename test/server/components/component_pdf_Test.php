<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_pdf_test extends BaseTestCase {



	public static $model		= 'component_pdf';
	public static $tipo			= 'test85';
	public static $section_id	= 1;
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_pdf
	*/
	private function build_component_instance() : component_pdf {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= self::$section_id;
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

	/////////// ⬇︎ test start ⬇︎ ////////////////

	// CREATE / CONFIG GETTERS

	/**
	* TEST_get_ar_quality
	* @return void
	*/
	public function test_get_ar_quality() {

		$component = $this->build_component_instance();
		$result = $component->get_ar_quality();

		$this->assertIsArray($result);
		$this->assertEquals(DEDALO_PDF_AR_QUALITY, $result);
	}//end test_get_ar_quality

	/**
	* TEST_get_default_quality
	* @return void
	*/
	public function test_get_default_quality() {

		$component = $this->build_component_instance();
		$result = $component->get_default_quality();

		$this->assertIsString($result);
		$this->assertEquals(DEDALO_PDF_QUALITY_DEFAULT, $result);
	}//end test_get_default_quality

	/**
	* TEST_get_original_quality
	* @return void
	*/
	public function test_get_original_quality() {

		$component = $this->build_component_instance();
		$result = $component->get_original_quality();

		$this->assertIsString($result);
		$this->assertEquals(DEDALO_PDF_QUALITY_ORIGINAL, $result);
	}//end test_get_original_quality

	/**
	* TEST_get_normalized_ar_quality
	* @return void
	*/
	public function test_get_normalized_ar_quality() {

		$component = $this->build_component_instance();
		$result = $component->get_normalized_ar_quality();

		$this->assertIsArray($result);
		$this->assertTrue(count($result) >= 1, 'expected at least 1 element');
	}//end test_get_normalized_ar_quality

	/**
	* TEST_get_extension
	* @return void
	*/
	public function test_get_extension() {

		$component = $this->build_component_instance();
		$result = $component->get_extension();

		$this->assertIsString($result);
		$this->assertEquals(DEDALO_PDF_EXTENSION, $result);

		// set custom value
		$component->extension = 'doc';
		$result = $component->get_extension();
		$this->assertTrue($result==='doc', 'expected doc : ' . $result);

		// restore
		$component->extension = DEDALO_PDF_EXTENSION;
	}//end test_get_extension

	/**
	* TEST_get_allowed_extensions
	* @return void
	*/
	public function test_get_allowed_extensions() {

		$component = $this->build_component_instance();
		$result = $component->get_allowed_extensions();

		$this->assertIsArray($result);
		$this->assertEquals(DEDALO_PDF_EXTENSIONS_SUPPORTED, $result);
	}//end test_get_allowed_extensions

	/**
	* TEST_get_folder
	* @return void
	*/
	public function test_get_folder() {

		$component = $this->build_component_instance();
		$result = $component->get_folder();

		$this->assertIsString($result);
		$this->assertEquals(DEDALO_PDF_FOLDER, $result);

		$original_folder = $component->get_folder();

		// set custom
		$component->folder = '/custom_pdf';
		$result = $component->get_folder();
		$this->assertTrue($result==='/custom_pdf', 'expected /custom_pdf : ' . $result);

		// restore
		$component->folder = $original_folder;
	}//end test_get_folder

	/**
	* TEST_get_best_extensions
	* @return void
	*/
	public function test_get_best_extensions() {

		$component = $this->build_component_instance();
		$result = $component->get_best_extensions();

		$this->assertIsArray($result);
		$this->assertTrue(in_array('pdf', $result), 'expected pdf in best extensions');
	}//end test_get_best_extensions

	/**
	* TEST_get_alternative_extensions
	* @return void
	*/
	public function test_get_alternative_extensions() {

		$component = $this->build_component_instance();
		$result = $component->get_alternative_extensions();

		$this->assertTrue(is_array($result) || is_null($result));
	}//end test_get_alternative_extensions

	/**
	* TEST_get_thumb_quality
	* @return void
	*/
	public function test_get_thumb_quality() {

		$component = $this->build_component_instance();
		$result = $component->get_thumb_quality();

		$this->assertIsString($result);
		$this->assertEquals(DEDALO_QUALITY_THUMB, $result);
	}//end test_get_thumb_quality

	/**
	* TEST_get_target_filename
	* @return void
	*/
	public function test_get_target_filename() {

		$component = $this->build_component_instance();
		$result = $component->get_target_filename();

		$this->assertIsString($result);

		$name = self::$tipo . '_' . self::$section_tipo . '_' . self::$section_id;
		$this->assertTrue(
			strpos($result, $name)!==false,
			'expected contains ' . $name . ' : ' . $result
		);
	}//end test_get_target_filename

	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();
		$result = $component->get_grid_value();

		$this->assertIsObject($result);
	}//end test_get_grid_value

	/**
	* TEST_get_related_component_text_area_tipo
	* @return void
	*/
	public function test_get_related_component_text_area_tipo() {

		$component = $this->build_component_instance();
		$result = $component->get_related_component_text_area_tipo();

		$this->assertIsArray($result);
	}//end test_get_related_component_text_area_tipo

	// DATA LIFECYCLE: get, set, add, change, remove, save, reload

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
	* TEST_set_data_sample
	* @return void
	*/
	public function test_set_data_sample() {

		$component = $this->build_component_instance();
		$sample_data = $this->get_sample_data(self::$model);

		$this->assertNotEmpty($sample_data);

		$result = $component->set_data($sample_data);
		$this->assertTrue($result);

		$this->assertEquals($sample_data, $component->get_data());
	}//end test_set_data_sample

	/**
	* TEST_add_data
	* Add a new data entry to the component
	* @return void
	*/
	public function test_add_data() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		// set sample data as base
			$sample_data = $this->get_sample_data(self::$model);
			$component->set_data($sample_data);

		// add new entry
			$new_entry = json_decode('
			{
				"files_info": [
				  {
					"quality": "original",
					"extension": "pdf",
					"file_name": "test85_test3_2.pdf",
					"file_path": "/pdf/original/0/test85_test3_2.pdf",
					"file_size": 999999,
					"file_time": {
					  "day": 1,
					  "hour": 0,
					  "time": 65000000000,
					  "year": 2024,
					  "month": 1,
					  "minute": 0,
					  "second": 0
					},
					"file_exist": true
				  }
				],
				"original_file_name": "added_test.pdf",
				"original_upload_date": {
				  "day": 1,
				  "hour": 0,
				  "time": 65000000000,
				  "year": 2024,
				  "month": 1,
				  "minute": 0,
				  "second": 0
				},
				"original_normalized_name": "test85_test3_2.pdf",
				"id": 2
			}
			');

			$current_data = $component->get_data();
			$current_data[] = $new_entry;
			$component->set_data($current_data);

			$result = $component->get_data();
			$this->assertTrue(
				count($result) > count($sample_data),
				'expected more entries after add : ' . count($result) . ' vs ' . count($sample_data)
			);

		// restore original data
		$component->set_data($original_data);
	}//end test_add_data

	/**
	* TEST_change_data
	* Modify existing data entry
	* @return void
	*/
	public function test_change_data() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		// set sample data
			$sample_data = $this->get_sample_data(self::$model);
			$component->set_data($sample_data);

		// change original_file_name of first entry
			$current_data = $component->get_data();
			if (!empty($current_data) && isset($current_data[0])) {
				$current_data[0]->original_file_name = 'changed_test_file.pdf';
				$component->set_data($current_data);

				$result = $component->get_data();
				$this->assertTrue(
					isset($result[0]->original_file_name) && $result[0]->original_file_name==='changed_test_file.pdf',
					'expected changed_test_file.pdf : ' . ($result[0]->original_file_name ?? 'null')
				);
			}

		// restore original data
		$component->set_data($original_data);
	}//end test_change_data

	/**
	* TEST_remove_data
	* Remove a data entry from the component
	* @return void
	*/
	public function test_remove_data() {

		$component = $this->build_component_instance();

		// backup original data
			$original_data = $component->get_data();

		// set sample data
			$sample_data = $this->get_sample_data(self::$model);
			$component->set_data($sample_data);

		// remove last entry
			$current_data = $component->get_data() ?? [];
			if (count($current_data) > 0) {
				array_pop($current_data);
				$component->set_data($current_data);

				$result = $component->get_data() ?? [];
				$this->assertTrue(
					count($result) < count($sample_data),
					'expected fewer entries after remove'
				);
			}

		// restore original data
		$component->set_data($original_data);
	}//end test_remove_data

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
			self::$section_id,
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

		// is_empty with single data_item
			$data = $component->get_data();
			if (!empty($data) && isset($data[0])) {
				$result = $component->is_empty($data[0]);
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

	// MODES

	/**
	* TEST_component_instance_modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= self::$section_id;
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

	// URL / FILE PATH / QUALITY OPERATIONS

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
				strpos($result, '/'.DEDALO_PDF_QUALITY_ORIGINAL.'/')!==false,
				'expected contains original quality: ' . DEDALO_PDF_QUALITY_ORIGINAL
			);

		// default_quality
			$result = $component->get_uploaded_file(
				$component->get_default_quality()
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);
	}//end test_get_uploaded_file

	/**
	* TEST_get_url
	* @return void
	*/
	public function test_get_url() {

		$component = $this->build_component_instance();

		// default quality
			$result = $component->get_url(
				DEDALO_PDF_QUALITY_DEFAULT,
				false, // test_file
				false, // absolute
				false  // default_add
			);

			$this->assertTrue(
				gettype($result)==='string',
				'expected type string : ' . PHP_EOL
					. gettype($result)
			);

			$this->assertTrue(
				strpos($result, DEDALO_PDF_QUALITY_DEFAULT)!==false,
				'expected contains ' . DEDALO_PDF_QUALITY_DEFAULT . PHP_EOL
					. $result
			);

		// test_file
			$result = $component->get_url(
				DEDALO_PDF_QUALITY_DEFAULT,
				true, // test_file
				false, // absolute
				false  // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

		// absolute
			$result = $component->get_url(
				DEDALO_PDF_QUALITY_DEFAULT,
				false, // test_file
				true,  // absolute
				false  // default_add
			);

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL',
				'expected type string|null : ' . PHP_EOL
					. gettype($result)
			);

			if (!empty($result)) {
				$this->assertTrue(
					strpos($result, DEDALO_PROTOCOL . DEDALO_HOST)!==false,
					'expected contains ' . DEDALO_PROTOCOL . DEDALO_HOST . PHP_EOL
						. $result
				);
			}
	}//end test_get_url

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
	* TEST_set_quality
	* @return void
	*/
	public function test_set_quality() {

		$component = $this->build_component_instance();

		$target_quality	= DEDALO_PDF_QUALITY_DEFAULT;
		$result			= $component->set_quality($target_quality);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true value : ' . PHP_EOL
				. json_encode($result)
		);

		$this->assertTrue(
			$component->quality===$target_quality,
			'expected component quality ' . $target_quality . PHP_EOL
				. $component->quality
		);

		// invalid value
			$target_quality	= 'invalid_value!';
			$result			= $component->set_quality($target_quality);

			$this->assertTrue(
				$result===false,
				'expected false value : ' . PHP_EOL
					. to_string($result)
			);

			$this->assertTrue(
				$component->quality!==$target_quality,
				'expected component quality distinct of ' . $target_quality
			);
	}//end test_set_quality

	// FILE OPERATIONS

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
	* TEST_delete_normalized_files
	* @return void
	*/
	public function test_delete_normalized_files() {

		$component = $this->build_component_instance();

		// backup files before deletion
			$ar_quality = $component->get_normalized_ar_quality();
			$backup_files = [];
			foreach ($ar_quality as $quality) {
				$filepath = $component->get_media_filepath($quality);
				if (file_exists($filepath)) {
					$backup_files[$quality] = $filepath . '.bak_test';
					copy($filepath, $backup_files[$quality]);
				}
			}

		$result = $component->delete_normalized_files();

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
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();

		// null file_data: returns result=false
			$result = $component->process_uploaded_file(null);
			$this->assertTrue(
				$result->result===false,
				'expected result false for null file_data'
			);

		// incomplete file_data (missing full_file_path)
			$file_data = (object)[
				'original_file_name'	=> 'test.pdf',
				'full_file_name'		=> 'test.pdf'
				// missing full_file_path
			];
			$result = $component->process_uploaded_file($file_data);
			$this->assertTrue(
				$result->result===false,
				'expected result false for incomplete file_data (missing full_file_path)'
			);

		// non-existent file path
			$file_data = (object)[
				'original_file_name'	=> 'test.pdf',
				'full_file_name'		=> 'test.pdf',
				'full_file_path'		=> '/non/existent/path/test.pdf'
			];
			$result = $component->process_uploaded_file($file_data);
			$this->assertTrue(
				$result->result===false,
				'expected result false for non-existent file path'
			);
	}//end test_process_uploaded_file

	/**
	* TEST_rename_old_files
	* @return void
	*/
	public function test_rename_old_files() {

		$component = $this->build_component_instance();
		$response = $component->rename_old_files('old_name', 'folder_path');

		$this->assertIsObject($response);
		$this->assertIsBool($response->result);
	}//end test_rename_old_files

	// STATIC / UTILITY METHODS

	/**
	* TEST_valid_utf8
	* @return void
	*/
	public function test_valid_utf8() {

		$this->assertTrue(component_pdf::valid_utf8('Simple string'));
		$this->assertTrue(component_pdf::valid_utf8('Niño €'));
		$this->assertFalse(component_pdf::valid_utf8("\x80"));
	}//end test_valid_utf8

	/**
	* TEST_utf8_clean
	* @return void
	*/
	public function test_utf8_clean() {

		$string = 'Test string';
		$this->assertEquals($string, component_pdf::utf8_clean($string));
	}//end test_utf8_clean

	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = (object)[
			'update_version' => [9, 9, 9],
			'data_unchanged' => null
		];
		$response = component_pdf::update_data_version($options);

		$this->assertIsObject($response);
		$this->assertEquals(0, $response->result);
	}//end test_update_data_version

}//end class component_pdf_test
