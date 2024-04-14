<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



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
	}//end test_import_structure_from_json



}//end class
