<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_check_box_test extends BaseTestCase {



	public static $model		= 'component_check_box';
	public static $tipo			= 'test88';
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
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



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
	* TEST_get_datalist
	* @return void
	*/
	public function test_get_datalist() {

		$component = $this->build_component_instance();

		$result = $component->get_datalist();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_datalist



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_diffusion_value



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

		$expected = self::$tipo . '_' . self::$section_tipo . '_1';
		$this->assertTrue(
			$result===$expected,
			'expected identifier ' . $expected . ' : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_identifier



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

		// Relation components expect locators in data
		$data = [ 
			(object)[
				'section_id' => '2',
				'section_tipo' => 'test3',
				'tipo' => 'dd151',
				'from_component_tipo' => self::$tipo
			] 
		];
		$component->set_data($data);

		$result = $component->get_data();

		$this->assertTrue(
			count($result) === 1,
			'expected 1 element in data array'
		);

		$this->assertTrue(
			$result[0]->section_id === $data[0]->section_id,
			'expected section_id to match'
		);
	}//end test_set_data



}//end class component_check_box_test
