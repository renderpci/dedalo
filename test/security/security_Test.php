<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class security_test extends TestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* TEST___construct
	* @return void
	*/
	public function test___construct() : void {

		// security instance
		$result = new security();

		$this->assertTrue(
			gettype($result)==='object',
			'expected object'. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test___construct



	/**
	* TEST_get_security_permissions
	* @return void
	*/
	public function test_get_security_permissions() : void {

		// oh21
			$parent_tipo	= 'oh1';
			$tipo			= 'oh21'; // component_select 'Quality'

			// security static function
			$result = security::get_security_permissions(
				$parent_tipo,
				$tipo
			);

			$this->assertTrue(
				gettype($result)==='integer',
				'expected integer'. PHP_EOL
				.' result: ' . gettype($result)
			);

			$eq = ($result===2);
			$this->assertTrue(
				$eq===true,
				'expected equal 2 in result '. PHP_EOL
				.' result: ' . json_encode($result)
			);

		// oh219999 (fake tipo)
			$parent_tipo	= 'oh1';
			$tipo			= 'oh219999'; // component_select 'Quality'

			// security static function
			$result = security::get_security_permissions(
				$parent_tipo,
				$tipo
			);

			$this->assertTrue(
				gettype($result)==='integer',
				'expected integer'. PHP_EOL
				.' result: ' . gettype($result)
			);

			$eq = ($result===0);
			$this->assertTrue(
				$eq===true,
				'expected equal 0 in result '. PHP_EOL
				.' result: ' . json_encode($result)
			);


		// oh21 (fake section_tipo)
			$parent_tipo	= 'oh199999999';
			$tipo			= 'oh21'; // component_select 'Quality'

			// security static function
			$result = security::get_security_permissions(
				$parent_tipo,
				$tipo
			);

			$this->assertTrue(
				gettype($result)==='integer',
				'expected integer'. PHP_EOL
				.' result: ' . gettype($result)
			);

			$eq = ($result===0);
			$this->assertTrue(
				$eq===true,
				'expected equal 0 in result '. PHP_EOL
				.' result: ' . json_encode($result)
			);
	}//end test_get_security_permissions



	/**
	* TEST_get_user_security_access
	* @return void
	*/
	public function test_get_user_security_access() : void {

		// expected component_security_access instance
		$result = security::get_user_security_access(
			1
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected object'. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_user_security_access



	/**
	* TEST_get_user_profile
	* @return void
	*/
	public function test_get_user_profile() : void {

		// expected object locator
		$result = security::get_user_profile(
			1
		);

		// sample result
			// {
			//     "type": "dd151",
			//     "section_id": "1",
			//     "section_tipo": "dd234",
			//     "from_component_tipo": "dd1725"
			// }

		$this->assertTrue(
			gettype($result)==='object',
			'expected object'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$eq = ($result->type==='dd151');
		$this->assertTrue(
			$eq===true,
			'expected equal dd151 in result '. PHP_EOL
			.' result: ' . json_encode($result->type)
		);

		$eq = ($result->section_tipo==='dd234');
		$this->assertTrue(
			$eq===true,
			'expected equal dd234 in result '. PHP_EOL
			.' result: ' . json_encode($result->section_tipo)
		);

		$eq = ($result->from_component_tipo==='dd1725');
		$this->assertTrue(
			$eq===true,
			'expected equal dd1725 in result '. PHP_EOL
			.' result: ' . json_encode($result->from_component_tipo)
		);
	}//end test_get_user_profile



	/**
	* TEST_clean_cache
	* @return void
	*/
	public function test_clean_cache() : void {

		$a = security::$permissions_table_cache;

		$this->assertTrue(
			!empty($a),
			'expected a is !empty'. PHP_EOL
			.' result: ' . to_string($a)
		);

		// expected bool
		$result = security::clean_cache();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$b = security::$permissions_table_cache;

		$this->assertTrue(
			$b===null,
			'expected b is null'. PHP_EOL
			.' result: ' . to_string($b)
		);
	}//end test_clean_cache



	/**
	* TEST_reset_permissions_table
	* @return void
	*/
	public function test_reset_permissions_table() : void {

		// expected bool
		$result = security::reset_permissions_table();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$a = security::$permissions_table_cache;

		$this->assertTrue(
			!empty($a),
			'expected a is !empty'. PHP_EOL
			.' result: ' . to_string($a)
		);
	}//end test_reset_permissions_table



	/**
	* TEST_get_ar_authorized_areas_for_user
	* @return void
	*/
	public function test_get_ar_authorized_areas_for_user() : void {

		// expected array of objects
		$result = security::get_ar_authorized_areas_for_user();

		// sample result
			// [
			//     {
			//         "tipo": "test38",
			//         "value": 2
			//     },
			//     {
			//         "tipo": "test189",
			//         "value": 2
			//     },
			//     {
			//         "tipo": "test183",
			//         "value": 2
			//     },
			//     ...
			// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected array'. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_ar_authorized_areas_for_user



	/**
	* TEST_is_global_admin
	* @return void
	*/
	public function test_is_global_admin() : void {

		// expected bool
		$result = security::is_global_admin(1);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true'. PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_is_global_admin



	/**
	* TEST_is_developer
	* @return void
	*/
	public function test_is_developer() : void {

		// expected bool
		$result = security::is_developer(1);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected true'. PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_is_developer



	/**
	* TEST_get_section_new_permissions
	* @return void
	*/
	public function test_get_section_new_permissions() : void {

		// result
		$result = security::get_section_new_permissions('oh1');

		$this->assertTrue(
			gettype($result)==='integer',
			'expected integer'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===2,
			'expected 2'. PHP_EOL
			.' result: ' . to_string($result)
		);
	}//end test_get_section_new_permissions



}//end class security_test
