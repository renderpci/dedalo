<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_section_id_test extends BaseTestCase {



	public static $model		= 'component_section_id';
	public static $tipo			= 'test102';
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
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			gettype($result[0])==='integer',
			'expected first element type integer ' . PHP_EOL
				. gettype($result[0])
		);
		$this->assertTrue(
			$result[0]===$component->section_id,
			'expected value equals section_id ' . PHP_EOL
				. to_string($result[0])
		);
	}//end test_get_data



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		$data	= [1];
		$result	= $component->set_data($data);
		$test_data	= $component->get_data();
		// check result
		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);
		// check data
		$this->assertEquals(
			$old_data, $test_data,
			'expected old data : ' . PHP_EOL
			. to_string($test_data)
		);

		// null case
		// take account that this component is read only dont't save or set data
		// so the data is not changed
			$result		= $component->set_data(null);
			$test_data	= $component->get_data();
			$this->assertTrue(
				$test_data===$old_data,
				'expected old data : ' . PHP_EOL
					. to_string($test_data)
			);

		// restore data
		// take account that this component is read only dont't save or set data
		// so the data is not changed
			$result		= $component->set_data($old_data);
			$test_data	= $component->get_data();
			$this->assertTrue(
				json_encode($test_data)===json_encode($old_data),
				'expected old dato : ' . PHP_EOL
					. to_string($test_data)
			);
	}//end test_set_data



	/**
	* TEST_GET_GRID_VALUE
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object. Obtained type : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result->value===[1],
			'expected value array [1]. Obtained : ' . PHP_EOL
				. to_string($result->value) . PHP_EOL
				. 'result: ' . to_string($result)
		);
	}//end test_get_grid_value



	/**
	* TEST_GET_TOOLS
	* @return void
	*/
	public function test_get_tools() {

		$component = $this->build_component_instance();

		$result	= $component->get_tools();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result===[],
			'expected type object : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_tools



	/**
	* TEST_SEARCH_OPERATORS_INFO
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$result	= $component->search_operators_info();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected no empty result : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_search_operators_info



	/**
	* TEST_SET_DATA_EMPTY
	* @return void
	*/
	public function test_set_data_empty() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// set_data with null is a no-op for this read-only component
		$result = $component->set_data(null);

		$this->assertTrue(
			$result===true,
			'expected set_data(null) returns true'
		);

		$test_data = $component->get_data();
		$this->assertTrue(
			$test_data===$old_data,
			'expected data unchanged after set_data(null) : ' . PHP_EOL
				. to_string($test_data)
		);

		// set_data with empty array is also a no-op
		$result = $component->set_data([]);

		$this->assertTrue(
			$result===true,
			'expected set_data([]) returns true'
		);

		$test_data = $component->get_data();
		$this->assertTrue(
			$test_data===$old_data,
			'expected data unchanged after set_data([]) : ' . PHP_EOL
				. to_string($test_data)
		);
	}//end test_set_data_empty



	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$result = $component->save();

		$this->assertTrue(
			$result===true,
			'expected save returns true (no-op for read-only component)'
		);
	}//end test_save



	/**
	* TEST_GET_DATA_LANG
	* @return void
	*/
	public function test_get_data_lang() {

		$component = $this->build_component_instance();

		$result = $component->get_data_lang();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		// get_data_lang returns same as get_data (language-neutral component)
		$get_data = $component->get_data();
		$this->assertTrue(
			$result===$get_data,
			'expected get_data_lang equals get_data (language-neutral)'
		);
	}//end test_get_data_lang



	/**
	* TEST_IS_EMPTY
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		$data = $component->get_data();

		// is_empty requires a $data_item argument
		$result = $component->is_empty($data[0] ?? null);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean return type : ' . PHP_EOL
				. gettype($result)
		);

		// component_section_id data entries are raw integers, not objects with value property.
		// is_empty() returns true for non-object items by design (see component_common::is_empty).
		// This is a known caveat: section_id integers are considered "empty" by is_empty().
		if (!empty($data[0])) {
			$this->assertTrue(
				$result===true,
				'expected is_empty returns true for integer data_item (non-object, no value property)'
			);
		}

		// null data_item should return true
		$result_null = $component->is_empty(null);
		$this->assertTrue(
			$result_null===true,
			'expected is_empty returns true for null data_item'
		);
	}//end test_is_empty



	/**
	* TEST_IS_EMPTY_DATA
	* @return void
	*/
	public function test_is_empty_data() {

		$component = $this->build_component_instance();

		$data = $component->get_data();

		$result = $component->is_empty_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean return type : ' . PHP_EOL
				. gettype($result)
		);

		// component_section_id data entries are raw integers, not objects with value property.
		// is_empty_data() delegates to is_empty() which returns true for non-object items.
		// This is a known caveat: [1] is considered "empty" by is_empty_data().
		$this->assertTrue(
			$result===true,
			'expected is_empty_data returns true for integer data (non-object entries have no value property)'
		);

		// null data should be empty
		$result_null = $component->is_empty_data(null);
		$this->assertTrue(
			$result_null===true,
			'expected is_empty_data returns true for null data'
		);
	}//end test_is_empty_data



	/**
	* TEST_GET_IDENTIFIER
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected string return type : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected non-empty identifier'
		);
	}//end test_get_identifier



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* @return void
	*/
	public function test_component_instance_modes() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$lang			= DEDALO_DATA_NOLAN;

		foreach (['edit', 'list', 'search'] as $mode) {

			$component = component_common::get_instance(
				$model,
				$tipo,
				1,
				$mode,
				$lang,
				$section_tipo
			);

			$this->assertTrue(
				$component->mode===$mode,
				"expected mode {$mode} : " . to_string($component->mode)
			);

			$data = $component->get_data();
			$this->assertTrue(
				gettype($data)==='array',
				"expected array data for mode {$mode}"
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_GET_ORDER_PATH
	* @return void
	*/
	public function test_get_order_path() {

		$component = $this->build_component_instance();

		$result = $component->get_order_path(
			$component->get_tipo(),
			$component->get_section_tipo()
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected non-empty order path'
		);
		$this->assertTrue(
			isset($result[0]->column),
			'expected column property in order path'
		);
		$this->assertTrue(
			$result[0]->column==='section_id',
			'expected column name section_id : ' . to_string($result[0]->column)
		);
	}//end test_get_order_path



	/**
	* TEST_GET_DIFFUSION_DATA
	* @return void
	*/
	public function test_get_diffusion_data() {

		$component = $this->build_component_instance();

		$ddo = (object)[
			'id' => '1',
			'tipo' => 'test102'
		];

		$result = $component->get_diffusion_data($ddo);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			!empty($result),
			'expected non empty result : ' . PHP_EOL
				. to_string($result)
		);
		if (!empty($result)) {
			$this->assertTrue(
				gettype($result[0])==='object',
				'expected first element to be object : ' . PHP_EOL
					. gettype($result[0])
			);
		}
	}//end test_get_diffusion_data



}//end class component_section_id_test
