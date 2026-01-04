<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_filter_master_test extends BaseTestCase {



	public static $model		= 'component_filter_master';
	public static $tipo			= 'test70';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return object
	*/
	private function build_component_instance() : object {

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
	* TEST_Save
	* @return void
	*/
	public function test_save() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result	= $component->save();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_save



	/**
	* TEST_propagate_filter
	* @return void
	*/
	public function test_propagate_filter() {

		$component = $this->build_component_instance();

		$result	= $component->propagate_filter();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_propagate_filter



	/**
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result = $component->get_datalist();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
	}//end test_get_datalist



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected array or null'
		);
	}//end test_get_list_value



	/**
	* TEST_get_ar_target_section_tipo
	* @return void
	*/
	public function test_get_ar_target_section_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_target_section_tipo();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
	}//end test_get_ar_target_section_tipo



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_filter_master::update_data_version($request_options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$this->user_login();

		$component = $this->build_component_instance();

		// 1 - Null case
			$data = null;
			$result = $component->set_data($data);

			$this->assertTrue(
				$result,
				'expected true on null set'
			);

		// 2 - Array of locators
			$locator = new locator();
				$locator->set_section_tipo('dd153');
				$locator->set_section_id(1);
			$data = [$locator];

			$result = $component->set_data($data);

			$this->assertTrue(
				$result,
				'expected true on locator array set'
			);
	}//end test_set_data


	
}//end class component_filter_master_test
