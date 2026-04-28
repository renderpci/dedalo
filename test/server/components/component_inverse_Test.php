<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_inverse_test extends BaseTestCase {



	public static $model		= 'component_inverse';
	public static $tipo		= 'test68';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return component_inverse
	*/
	private function build_component_instance( string $mode='edit' ) {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
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
	* TEST_GET_DATA
	* Data is calculated on the fly from inverse references, not stored in DB
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		// 1 - Get data returns ?array
		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array or null : ' . PHP_EOL
				. gettype($result)
		);

		// 2 - Inject sample data via data_resolved
		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data_resolved($sample_data);

		$result	= $component->get_data();

		$this->assertTrue(
			$result === $sample_data,
			'expected sample data : ' . PHP_EOL
				. to_string($sample_data)
		);

		// 3 - Clean data_resolved and get real inverse references
		$component->data_resolved = null;
		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array or null after clearing resolved : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_data



	/**
	* TEST_SAVE
	* Save is a no-op for component_inverse (it does not store data)
	* @return void
	*/
	public function test_save() {

		$component = $this->build_component_instance();

		$result = $component->save();

		$this->assertTrue(
			$result===true,
			'expected save to return true (no-op) : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_save



	/**
	* TEST_GET_GRID_VALUE
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$result	= $component->get_grid_value();

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);
		if (!empty($result) && !empty($result->value)) {
			$this->assertTrue(
				gettype($result->value[0])==='object',
				'expected type object : ' . PHP_EOL
					. gettype($result->value[0])
			);
		}
	}//end test_get_grid_value



	/**
	* TEST_COMPONENT_INSTANCE_MODES
	* Verify component can be instantiated in edit, list, and search modes
	* @return void
	*/
	public function test_component_instance_modes() {

		$modes = ['edit', 'list', 'search'];

		foreach ($modes as $mode) {

			$component = $this->build_component_instance($mode);

			$this->assertTrue(
				get_class($component)==='component_inverse',
				"expected class component_inverse for mode $mode : " . PHP_EOL
					. get_class($component)
			);

			$this->assertTrue(
				$component->get_mode()===$mode,
				"expected mode $mode : " . PHP_EOL
					. $component->get_mode()
			);

			// get_data should work in all modes
			$result = $component->get_data();
			$this->assertTrue(
				gettype($result)==='array' || gettype($result)==='NULL',
				"expected type array or null for mode $mode : " . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_component_instance_modes



	/**
	* TEST_IS_EMPTY
	* Uses is_empty_data() for array-level check
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// array-level check
		$data = $component->get_data();

		$result = $component->is_empty_data($data);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected is_empty_data to return boolean : ' . PHP_EOL
				. gettype($result)
		);

		// single item check with null
		$result_null = $component->is_empty(null);

		$this->assertTrue(
			$result_null===true,
			'expected is_empty(null) to return true'
		);
	}//end test_is_empty



	/**
	* TEST_GET_IDENTIFIER
	* @return void
	*/
	public function test_get_identifier() {

		$component = $this->build_component_instance();

		$result = $component->get_identifier();

		$this->assertTrue(
			gettype($result)==='string',
			'expected get_identifier to return string : ' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			strlen($result) > 0,
			'expected non-empty identifier'
		);
	}//end test_get_identifier



}//end class component_inverse_test
