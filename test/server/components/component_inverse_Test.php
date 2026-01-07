<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_inverse_test extends BaseTestCase {



	public static $model		= 'component_inverse';
	public static $tipo			= 'test68';
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
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		// 1 - Get data
		$result	= $component->get_data();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		// 2 - Set sample data 
		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data_resolved($sample_data); // Inject as resolved data
	
		$result	= $component->get_data();
		
		$this->assertTrue(
			$result === $sample_data,
			'expected sample data : ' . PHP_EOL
				. to_string($sample_data)
		);

		// 3 - Clean data_resolved
		$component->data_resolved = null;
		$result	= $component->get_data();

		$this->assertTrue(
			$result[0]->section_id === '1',
			'expected section_id === 1 : ' . PHP_EOL
				. to_string($result)
		);		
	}//end test_get_data



	/**
	* TEST_get_grid_value
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



}//end class component_inverse_test
