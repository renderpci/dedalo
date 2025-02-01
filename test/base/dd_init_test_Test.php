<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_init_test_test extends TestCase {



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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_INCLUDE_FILE
	* @return void
	*/
	public function test_include_file() {

		// dd_init_test
			$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';


		$this->assertTrue(
			$init_response->result===true,
			'expected true for init_response->result' . PHP_EOL
				. to_string($init_response->result)
		);
	}//end test_include_file



}//end class dd_init_test_test
