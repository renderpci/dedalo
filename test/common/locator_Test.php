<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class locator_test extends TestCase {



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct() {

		// empty
		$result = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		// basic
		$result = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$eq = json_encode($result)=='{"section_tipo":"test3","section_id":"1"}';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test___construct



	/**
	* TEST_set_paginated_key
	* @return void
	*/
	public function test_set_paginated_key() {

		$locator = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$result = $locator->set_paginated_key(
			0
		);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $locator->paginated_key===0;
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_set_paginated_key



	/**
	* TEST_set_label
	* @return void
	*/
	public function test_set_label() {

		$locator = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$result = $locator->set_label(
			'Random label'
		);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = !isset($locator->label);
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_set_label



	/**
	* TEST_set_type
	* @return void
	*/
	public function test_set_type() {

		$locator = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$value = 'dd96';

		$result = $locator->set_type(
			$value
		);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $locator->type===$value;
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_set_type



	/**
	* TEST_set_section_top_tipo
	* @return void
	*/
	public function test_set_section_top_tipo() {

		$locator = new locator(
			(object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 1
			]
		);

		$value = 'test3';

		$result = $locator->set_section_top_tipo(
			$value
		);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $locator->section_top_tipo===$value;
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_set_section_top_tipo





}//end class locator_test
