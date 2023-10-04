<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	// require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class dd_area_maintenance_api_Test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



	/**
	* TEST_MAKE_BACKUP
	* @return void
	*/
	public function XXX_test_make_backup(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_area_maintenance_api",
			    "action": "make_backup"
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='object',
			'expected result type is object ' . gettype($response->result)
		);

		$this->assertTrue(
			gettype($response->result->result)==='boolean',
			'expected result type is boolean. ' . gettype($response->result->result)
		);
	}//end test_make_backup




	/**
	* TEST_UPDATE_ONTOLOGY
	* @return void
	*/
	public function XXX_test_update_ontology(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_area_maintenance_api",
			    "action": "update_ontology"
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='object',
			'expected result type is object'
		);
	}//end test_update_ontology



	/**
	* TEST_STRUCTURE_TO_JSON
	* @return void
	*/
	public function test_structure_to_json(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_area_maintenance_api",
			    "action": "structure_to_json",
			    "options": [
			        {
			            "name": "dedalo_prefix_tipos",
			            "value": "dd"
			        }
			    ]
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean'
		);
	}//end test_structure_to_json



	/**
	* TEST_import_structure_from_json
	* @return void
	*/
	public function XXX_test_import_structure_from_json(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_area_maintenance_api",
			    "action": "import_structure_from_json",
			    "options": ["dd"]
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		// $response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean'
		);
	}//end test_import_structure_from_json



	/**
	* TEST_REGISTER_TOOLS
	* @return void
	*/
	public function test_register_tools(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_area_maintenance_api",
			    "action": "register_tools"
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			gettype($response->result)==='array',
			'expected result type is array ' .gettype($response->result)
		);

		$this->assertTrue(
			count($response->result)>0,
			'expected result is not empty '
		);
	}//end test_register_tools



}//end class
