<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_svg_test extends TestCase {
// final class component_svg_test {



	public static $model		= 'component_svg';
	public static $tipo			= 'test177';
	public static $section_tipo	= 'test3';



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

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



}//end class component_svg_test
