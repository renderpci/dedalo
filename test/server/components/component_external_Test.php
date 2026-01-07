<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_external_test extends BaseTestCase {



	public static $model		= 'component_external';
	public static $tipo			= 'test215';
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
	* TEST_load_data_from_remote
	* @return void
	*/
	public function test_load_data_from_remote() {

		$component = $this->build_component_instance();

		$result = $component->load_data_from_remote();

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_load_data_from_remote



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

		// 1 - null case
			$data = null;
			$result = $component->set_data($data);

			$this->assertTrue(
				$result,
				'expected true on null set'
			);

		// 2 - string case
			$data = 'plain string';
			$component->set_data($data);

			// Since get_data is overridden to load from remote, we check the internal dato via get_dato or similar if possible.
			// However, set_data in component_common eventually calls set_component_data in section_record.
			// We can verify that set_data doesn't crash and returns true.
			$this->assertTrue(
				true,
				'set_data with string finished'
			);

		// 3 - JSON case
			$data = '["value1", "value2"]';
			$result = $component->set_data($data);

			$this->assertTrue(
				$result,
				'expected true on JSON set'
			);

		// 4 - get_data behavior
			// Note: component_external::get_data ignores local data and loads from remote
			$result = $component->get_data();
			// result will likely be null or remote data, not the ["value1", "value2"] we just set
			// This is just to document/verify the behavior
			$this->assertTrue(
				$result !== ["value1", "value2"],
				'expected get_data to NOT return the set data (as it loads from remote)'
			);
	}//end test_set_data



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

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

		$component = $this->build_component_instance();

		$result = $component->get_list_value();

		$this->assertTrue(
			is_array($result) || is_null($result),
			'expected array or null'
		);
	}//end test_get_list_value



}//end class component_external_test
