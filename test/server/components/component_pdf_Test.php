<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
// PHPUnit classes
use PHPUnit\Framework\TestCase;

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
	}//end test_get_folder

	/**
	* TEST_get_best_extensions
	* @return void
	*/
	public function test_get_best_extensions() {

		$component = $this->build_component_instance();
		$result = $component->get_best_extensions();

		$this->assertIsArray($result);
	}//end test_get_best_extensions

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

	/**
	* TEST_create_thumb
	* @return void
	*/
	public function test_create_thumb() {

		$component = $this->build_component_instance();
		$result = $component->create_thumb();

		$this->assertIsBool($result);
	}//end test_create_thumb

	/**
	* TEST_process_uploaded_file
	* @return void
	*/
	public function test_process_uploaded_file() {

		$component = $this->build_component_instance();
		$response = $component->process_uploaded_file((object)['empty' => true]);

		$this->assertIsObject($response);
		$this->assertIsBool($response->result);
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

}//end class component_pdf_test
