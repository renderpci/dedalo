<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_radio_button_test extends BaseTestCase {

	public static $model		= 'component_radio_button';
	public static $tipo			= 'test87';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_radio_button|null
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
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() {

		$component = $this->build_component_instance();

		$result = $component->get_sortable();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_sortable



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			is_array($result) || is_null($result),
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

		$old_data = $component->get_data();

		$data	= null;
		$result	= $component->set_data($data);

		$this->assertTrue(
			is_bool($result),
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		// null case
			$this->assertTrue(
				$component->get_data()===null,
				'expected null : ' . PHP_EOL
					. to_string($component->get_data())
			);

		// object case
			$locator_data = [
				"type" => "dd151",
				"section_id" => "1",
				"section_tipo" => "dd64",
				"from_component_tipo" => self::$tipo
			];
			$locator = (object)$locator_data;
			
			$data	= [$locator];
			$result	= $component->set_data($data);
			
			$this->assertTrue(
				count($component->get_data()) === 1,
				'expected 1 element in data array'
			);

		// restore data
			$result	= $component->set_data($old_data);

			$this->assertEquals(
				json_encode($old_data),
				json_encode($component->get_data()),
				'expected old data'
			);
	}//end test_set_data



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result = $component->get_grid_value();

		$this->assertInstanceOf(
			'dd_grid_cell_object',
			$result,
			'expected instance of dd_grid_cell_object'
		);
	}//end test_get_grid_value


	/**
	* TEST_get_list_of_values
	* @return void
	*/
	public function test_get_list_of_values() {

		$component = $this->build_component_instance();

		$result = $component->get_list_of_values(DEDALO_DATA_LANG);

		$this->assertTrue(
			is_object($result),
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_list_of_values



	/**
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			is_string($result),
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$expected = self::$tipo . '_' . self::$section_tipo . '_1';
		$this->assertTrue(
			$result===$expected,
			'expected identifier ' . $expected . ' : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



	/**
	* TEST_test_equal_properties
	* @return void
	*/
	public function test_test_equal_properties() {

		$component = $this->build_component_instance();

		$expected = ['section_tipo','section_id','type','from_component_tipo'];
		
		$this->assertEquals(
			$expected,
			$component->test_equal_properties,
			'expected test_equal_properties mismatch'
		);
	}//end test_test_equal_properties



}//end class component_radio_button_test
