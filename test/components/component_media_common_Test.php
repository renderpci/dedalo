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



final class component_media_common_test extends TestCase {



	/**
	 * Note that only static methods are checked here !
	 */



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
