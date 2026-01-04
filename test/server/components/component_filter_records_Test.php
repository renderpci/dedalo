<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_filter_records_test extends BaseTestCase {



	public static $model		= 'component_filter_records';
	public static $tipo			= 'test69';
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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result	= $component->get_data();

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

		$this->user_login();

		$component = $this->build_component_instance();

		$old_dato = $component->get_data();

		$dato	= null;
		$result	= $component->set_data($dato);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$component->get_data()===NULL,
			'expected NULL : ' . PHP_EOL
				. to_string($component->get_data())
		);

		// restore dato
		$result	= $component->set_data($old_dato);

		$this->assertTrue(
			json_encode($component->get_data())===json_encode($old_dato),
			'expected [] : ' . PHP_EOL
				. to_string($component->get_data())
		);
	}//end test_set_data



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

		if (!empty($result)) {
			$this->assertTrue(
				is_object($result[0]),
				'expected object'
			);
			$this->assertTrue(
				property_exists($result[0], 'tipo') && property_exists($result[0], 'label'),
				'expected tipo and label properties'
			);
		}
	}//end test_get_datalist



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertTrue(
			get_class($result)==='dd_grid_cell_object',
			'expected dd_grid_cell_object'
		);
	}//end test_get_grid_value



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
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$request_options = (object)[
			'update_version' => [1,0,0]
		];

		$result = component_filter_records::update_data_version($request_options);

		$this->assertTrue(
			is_object($result),
			'expected object'
		);
	}//end test_update_data_version



	/**
	* TEST_save
	* @return void
	*/
	public function test_save() {

		$this->user_login();

		$component = $this->build_component_instance();

		$result = $component->save();

		$this->assertTrue(
			$result,
			'expected true on save'
		);
	}//end test_save



}//end class component_filter_records_test
