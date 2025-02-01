<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class label_test extends TestCase {



	/**
	* TEST_get_ar_label
	* @return void
	*/
	public function test_get_ar_label() {

		$result = label::get_ar_label();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);

		$eq = isset($result['salir']);
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_ar_label



	/**
	* TEST_get_label
	* @return void
	*/
	public function test_get_label() {

		$result = label::get_label(
			'salir'
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		if (DEDALO_DATA_LANG==='lg-eng') {

			$eq = $result==='Quit';
			$this->assertTrue(
				$eq,
				'expected true : ' . PHP_EOL
					. to_string($result) . PHP_EOL
					. to_string($eq)
			);
		}
	}//end test_get_label



	/**
	* TEST_get_var_from_label
	* @return void
	*/
	public function test_get_var_from_label() {

		switch (DEDALO_DATA_LANG) {
			case 'lg-spa':
				$name = 'Salir';
				break;

			case 'lg-eng':
			default:
				$name = 'Quit';
				break;
		}

		$result = label::get_var_from_label(
			$name
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='salir';
		$this->assertTrue(
			$eq,
			'expected true $result===\'salir\' : ' . PHP_EOL
				. 'result: ' . to_string($result) . PHP_EOL
				. 'compare: ' . to_string('salir') . PHP_EOL
				. 'eq: ' . to_string($eq)
		);
	}//end test_get_var_from_label



	/**
	* TEST_set_static_label_vars (PROTECTED)
	* @return void
	*/
		// public function test_set_static_label_vars() {

		// 	$result = label::set_static_label_vars(
		// 		DEDALO_APPLICATION_LANG
		// 	);

		// 		dump($result, ' result ++ '.to_string());

		// 	$this->assertTrue(
		// 		gettype($result)==='array' ,
		// 		'expected type array : ' . PHP_EOL
		// 			. gettype($result)
		// 	);
		// }//end test_set_static_label_vars



	/**
	* TEST_get_terminoID_from_label
	* @return void
	*/
	public function test_get_terminoID_from_label() {

		$result = label::get_terminoID_from_label(
			'salir'
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$eq = $result==='dd387';
		$this->assertTrue(
			$eq,
			'expected true : ' . PHP_EOL
				. to_string($result) . PHP_EOL
				. to_string($eq)
		);
	}//end test_get_terminoID_from_label



}//end class label_test
