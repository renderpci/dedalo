<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class dd_utils_api_Test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



	/**
	* TEST_GET_LOGIN_CONTEXT
	* @return void
	*/
	public function test_get_login_context(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_login_context",
			    "source": {
					"typo": "source",
			        "type": "login",
			        "action": null,
			        "model": "login",
			        "tipo": "dd229",
			        "section_tipo": "dd229",
			        "mode": "edit",
			        "view": null,
			        "lang": "lg-eng"
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='array',
			'expected result type is array'
		);
	}//end test_get_login_context



	/**
	* TEST_GET_INSTALL_CONTEXT
	* @return void
	*/
	public function test_get_install_context(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_install_context",
			    "source": {
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='array',
			'expected result type is array'
		);
	}//end test_get_install_context



	/**
	* TEST_dedalo_version
	* @return void
	*/
		// public function test_dedalo_version(): void {

		// 	$rqo = json_handler::decode('
		// 		{
		// 			"dd_api": "dd_utils_api",
		// 		    "action": "dedalo_version",
		// 		    "source": {
		// 		    }
		// 		}
		// 	');
		// 	$_ENV['DEDALO_ERRORS'] = []; // reset
		// 	$response = $rqo->dd_api::{$rqo->action}($rqo);
		// 		// dump($response, ' response ++ '.to_string());

		// 	$this->assertTrue(
		// 		empty($_ENV['DEDALO_ERRORS']),
		// 		'expected running without errors'
		// 	);

		// 	$this->assertTrue(
		// 		gettype($response->result)==='array',
		// 		'expected result type is array'
		// 	);
		// }//end test_dedalo_version




	/**
	* TEST_DATABASE_INFO
	* @return void
	*/
	public function test_database_info(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "database_info"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='object',
			'expected result type is object. type: ' . gettype($response->result)
		);
	}//end test_database_info



	/**
	* TEST_GET_SYSTEM_INFO
	* @return void
	*/
	public function test_get_system_info(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_system_info"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='object',
			'expected result type is object'
		);
	}//end test_get_system_info



	/**
	* TEST_MAKE_BACKUP
	* @return void
	*/
	public function XXX_test_make_backup(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "make_backup"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
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
				"dd_api": "dd_utils_api",
			    "action": "update_ontology"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
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
				"dd_api": "dd_utils_api",
			    "action": "structure_to_json",
			    "options": [
			        {
			            "name": "dedalo_prefix_tipos",
			            "value": "dd"
			        }
			    ]
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
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
				"dd_api": "dd_utils_api",
			    "action": "import_structure_from_json",
			    "options": ["dd"]
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		// $response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
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
				"dd_api": "dd_utils_api",
			    "action": "register_tools"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
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



	/**
	* TEST_convert_search_object_to_sql_query
	* @return void
	*/
	public function test_convert_search_object_to_sql_query(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "convert_search_object_to_sql_query",
			    "options" : {
				  "section_tipo": [
				    "test3"
				  ],
				  "filter": {
				    "$and": [
				      {
				        "q": [
				          "2"
				        ],
				        "q_operator": null,
				        "path": [
				          {
				            "name": "Id",
				            "model": "component_section_id",
				            "section_tipo": "test3",
				            "component_tipo": "test102"
				          }
				        ],
				        "type": "jsonb"
				      }
				    ]
				  },
				  "filter_by_locators": null,
				  "children_recursive": false
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean ' .gettype($response->result)
		);

		$this->assertTrue(
			gettype($response->rows)==='object',
			'expected rows type is object ' .gettype($response->rows)
		);

		$this->assertTrue(
			gettype($response->rows->ar_records)==='array',
			'expected rows->ar_records type is array ' .gettype($response->rows->ar_records)
		);
	}//end test_convert_search_object_to_sql_query




	/**
	* TEST_CHANGE_LANG
	* @return void
	*/
	public function test_change_lang(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "change_lang",
			    "options": {
			        "dedalo_data_lang": "lg-fra",
			        "dedalo_application_lang": "lg-fra"
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean ' .gettype($response->result)
		);

		$this->assertTrue(
			$response->result===true,
			'expected result true ' .json_encode($response->result)
		);
	}//end test_change_lang



	/**
	* TEST_LOGIN
	* @return void
	*/
	public function test_login(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "login",
			    "options": {
			        "username": "## fake Pepe ##",
			        "auth": "## fake auth ##"
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean ' .gettype($response->result)
		);

		$this->assertTrue(
			$response->result===false,
			'expected result false ' .json_encode($response->result)
		);
	}//end test_login



	/**
	* TEST_QUIT
	* @return void
	*/
	public function test_quit(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "quit",
			    "options": {

			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean ' .gettype($response->result)
		);

		$this->assertTrue(
			$response->result===true,
			'expected result true ' .json_encode($response->result)
		);
	}//end test_quit


	/**
	* TEST_UPDATE_LOCK_COMPONENTS_STATE
	* @return void
	*/
	public function test_update_lock_components_state(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "update_lock_components_state",
			    "options": {
			        "component_tipo": "test94",
			        "section_tipo": "test3",
			        "section_id": "1",
			        "action": "focus"
			    }
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='boolean',
			'expected result type is boolean'
		);

		$this->assertTrue(
			gettype($response->dato)==='array',
			'expected result type is array'
		);

		$this->assertTrue(
			gettype($response->in_use)==='boolean',
			'expected result type is boolean'
		);
	}//end test_update_lock_components_state



	/**
	* TEST_get_dedalo_files
	* @return void
	*/
	public function test_get_dedalo_files(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_dedalo_files"
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_ERRORS']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response->result)==='array',
			'expected result type is array ' .gettype($response->result)
		);

		$this->assertTrue(
			count($response->result)>0,
			'expected result more than 0 ' . count($response->result)
		);
	}//end test_get_dedalo_files



}//end class