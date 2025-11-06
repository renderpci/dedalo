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
			$dd_init_test_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';

		$this->assertTrue(
			$dd_init_test_response->result===true,
			'expected true for dd_init_test_response->result' . PHP_EOL
			 . ' dd_init_test_response->result: ' .  to_string($dd_init_test_response->result)
			 . ' dd_init_test_response: ' .  to_string($dd_init_test_response)
		);
	}//end test_include_file



}//end class dd_init_test_test
