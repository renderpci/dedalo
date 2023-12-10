<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_media_common_test extends TestCase {



	/**
	 * Note that only static methods are checked here !
	 */



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in boostrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* TEST_get_media_components
	* @return void
	*/
	public function test_get_media_components() {

		$result = component_media_common::get_media_components();

		$this->assertTrue(
			is_array($result) ,
			'expected is_array = true '. to_string(is_array($result))
		);
	}//end test_get_media_components



	/**
	* TEST_move_zip_file
	* @return void
	*/
	public function test_move_zip_file() {

		$response = component_media_common::move_zip_file(
			'fake_tipo1',
			'fake_folder_path',
			'fake_file_name'
		);

		$this->assertTrue(
			$response->result===false ,
			'expected result = false '. to_string($response->result===false)
		);
	}//end test_move_zip_file



}//end class component_media_common_test
