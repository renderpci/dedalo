<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	require_once 'data.php';
	require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class dd_date_test extends TestCase {



	/**
	* TEST__construct
	* @return void
	*/
	public function test__construct() {

		// empty value case
			$dd_date = new dd_date();
			$this->assertTrue(
				is_object($dd_date),
				'expected true, but received is: ' . to_string( is_object($dd_date) )
			);

		// with value case
			$ar_test = [
				'year',
				'month',
				'day',
				'hour',
				'minute',
				'second',
				'ms'
			];
			foreach ($ar_test as $property) {

				// zero
					$options = (object)[
						$property => 0
					];
					$dd_date = new dd_date($options);
					$value = call_user_func([$dd_date, 'get_'.$property]);
					$this->assertTrue(
						$value===0,
						'expected true, but received is: ' . to_string( $value===0 )
					);
				// null
					$options = (object)[
						$property => null
					];
					$dd_date = new dd_date($options);
					$value = call_user_func([$dd_date, 'get_'.$property]);
					$this->assertTrue(
						$value===null,
						'expected true, but received is: ' . to_string( $value===null )
					);
				// one
					$options = (object)[
						$property => 1
					];
					$dd_date = new dd_date($options);
					$value = call_user_func([$dd_date, 'get_'.$property]);
					$this->assertTrue(
						$value===1,
						'expected true, but received is: ' . to_string( $value===1 )
					);
			}

		// invalid property
			$property = 'patata';
			$options = (object)[
				$property => 9
			];
			$dd_date = new dd_date($options);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid month
			$dd_date = new dd_date();
			$result = $dd_date->set_month(13, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid day
			$dd_date = new dd_date();
			$result = $dd_date->set_day(32, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid hour
			$dd_date = new dd_date();
			$result = $dd_date->set_hour(24, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid minute
			$dd_date = new dd_date();
			$result = $dd_date->set_minute(60, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid second
			$dd_date = new dd_date();
			$result = $dd_date->set_second(60, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);

		// invalid ms
			$dd_date = new dd_date();
			$result = $dd_date->set_ms(1000, true);
			$this->assertTrue(
				$result===false,
				'expected true, but received is: ' . to_string( $result===false )
			);
			$this->assertTrue(
				!empty($dd_date->errors),
				'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			);


			// $this->assertTrue(
			// 	!empty($dd_date->errors),
			// 	'expected true, but received is: ' . to_string( !empty($dd_date->errors) )
			// );


		// $this->assertTrue(
		// 	empty($_ENV['DEDALO_LAST_ERROR']),
		// 	'expected running without errors'
		// );
	}//end test__construct



	/**
	* TEST_get_dd_timestamp
	* @return void
	*/
	public function test_get_dd_timestamp() {

		$dd_date = new dd_date();

		$dd_date->set_year(2023, true);
		$dd_date->set_month(07, true);
		$dd_date->set_day(12, true);

		$dd_timestamp = $dd_date->get_dd_timestamp();

		$test = $dd_timestamp==='2023-07-12 00:00:00';
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$dd_date->set_hour(13, true);
		$dd_date->set_minute(01, true);
		$dd_date->set_second(33, true);


		$dd_timestamp = $dd_date->get_dd_timestamp();
		$test = $dd_timestamp==='2023-07-12 13:01:33';
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$dd_date->set_ms(873, true);
		$dd_timestamp = $dd_date->get_dd_timestamp("Y-m-d H:i:s u", true);

		$test = $dd_timestamp==='2023-07-12 13:01:33 873';
		$this->assertTrue(
			$test,
			'expected true (2023-07-12 13:01:33 873), but received is: ' . to_string( $test )
		);
	}//end test_get_dd_timestamp



	/**
	* TEST_get_dd_date_from_timestamp
	* @return void
	*/
	public function test_get_dd_date_from_timestamp() {

		$timestamp = '2023-07-12 13:01:33';

		$dd_date = dd_date::get_dd_date_from_timestamp($timestamp);

		$test = $dd_date->get_year()===2023;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$test = $dd_date->get_month()===7;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$test = $dd_date->get_day()===12;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$test = $dd_date->get_hour()===13;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$test = $dd_date->get_minute()===1;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);

		$test = $dd_date->get_second()===33;
		$this->assertTrue(
			$test,
			'expected true, but received is: ' . to_string( $test )
		);
	}//end test_get_dd_date_from_timestamp



	/**
	* TEST_convert_date_to_seconds
	* @return void
	*/
	public function test_convert_date_to_seconds() {

		$timestamp	= '2023-07-12 13:01:33';
		$dd_date	= dd_date::get_dd_date_from_timestamp($timestamp);
		$seconds	= dd_date::convert_date_to_seconds($dd_date);

		$test = $seconds===65037906093;
		$this->assertTrue(
			$test,
			'expected true (65037906093), but received is: ' . to_string( $test )
		);
	}//end test_convert_date_to_seconds



	/**
	* TEST_get_unix_timestamp
	* @return void
	*/
	public function test_get_unix_timestamp() {

		$timestamp	= '2023-07-12 13:01:33';
		$dd_date	= dd_date::get_dd_date_from_timestamp($timestamp);

		$unix_timestamp = $dd_date->get_unix_timestamp();

		$test = $unix_timestamp===1689159693;
		$this->assertTrue(
			$test,
			'expected true (1689159693), but received is: ' . to_string( $test )
		);
	}//end test_get_unix_timestamp



}//end class dd_date_test