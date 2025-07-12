<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class lang_test extends TestCase {



	/**
	* TEST_resolve (PRIVATE)
	* @return void
	*/
		// public function test_resolve() {

		// 	$result = lang::resolve(
		// 		'lg-spa'
		// 	);

		// 	$this->assertTrue(
		// 		gettype($result)==='object' || gettype($result)==='NULL',
		// 		'expected type object|null : ' . PHP_EOL
		// 			. gettype($result)
		// 	);

		// 	$eq = $result->section_id=='17344';
		// 	$this->assertTrue(
		// 		$eq,
		// 		'expected true : ' . PHP_EOL
		// 			. to_string($result) . PHP_EOL
		// 			. to_string($eq)
		// 	);
		// }//end test_resolve



	/**
	* TEST_get_section_id_from_code
	* @return void
	*/
	public function test_get_section_id_from_code() {

		$result = lang::get_section_id_from_code(
			'lg-spa'
		);

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type integer|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result===17344;
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_section_id_from_code



	/**
	* TEST_get_lang_locator_from_code
	* @return void
	*/
	public function test_get_lang_locator_from_code() {

		$result = lang::get_lang_locator_from_code(
			'lg-spa'
		);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$eq = json_encode($result)==='{"section_tipo":"lg1","section_id":"17344"}';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_lang_locator_from_code



	/**
	* TEST_get_name_from_code
	* @return void
	*/
	public function test_get_name_from_code() {

		$result = lang::get_name_from_code(
			'lg-spa', // code
			'lg-eng' // lang resolution
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='Spanish';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_name_from_code



	/**
	* TEST_get_lang_name_by_locator
	* @return void
	*/
	public function test_get_lang_name_by_locator() {

		$locator = json_decode('{"section_tipo":"lg1","section_id":"17344"}');

		$result = lang::get_lang_name_by_locator(
			$locator,
			'lg-eng' // lang resolution
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='Spanish';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_lang_name_by_locator



	/**
	* TEST_get_code_from_locator
	* @return void
	*/
	public function test_get_code_from_locator() {

		$locator = json_decode('{"section_tipo":"lg1","section_id":"17344"}');

		$result = lang::get_code_from_locator(
			$locator
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='lg-spa';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_code_from_locator



	/**
	* TEST_get_lang_code_from_alpha2
	* @return void
	*/
	public function test_get_lang_code_from_alpha2() {

		$result = lang::get_lang_code_from_alpha2(
			'es'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='lg-spa';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_lang_code_from_alpha2



	/**
	* TEST_get_alpha2_from_code
	* @return void
	*/
	public function test_get_alpha2_from_code() {

		$result = lang::get_alpha2_from_code(
			'lg-spa'
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='es';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_alpha2_from_code



	/**
	* TEST_get_locale_from_code
	* @return void
	*/
	public function test_get_locale_from_code() {

		$result = lang::get_locale_from_code(
			'lg-spa'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='es-ES';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_locale_from_code



}//end class lang_test
