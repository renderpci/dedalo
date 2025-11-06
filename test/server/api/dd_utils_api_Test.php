<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_utils_api_Test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		// 	$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		// 	$response = $rqo->dd_api::{$rqo->action}($rqo);
		// 		// dump($response, ' response ++ '.to_string());

		// 	$this->assertTrue(
		// 		empty($_ENV['DEDALO_LAST_ERROR']),
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
		// public function test_database_info(): void {

		// 	$rqo = json_handler::decode('
		// 		{
		// 			"dd_api": "dd_utils_api",
		// 		    "action": "database_info"
		// 		}
		// 	');
		// 	$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		// 	$response = $rqo->dd_api::{$rqo->action}($rqo);
		// 		// dump($response, ' response ++ '.to_string());

		// 	$this->assertTrue(
		// 		empty($_ENV['DEDALO_LAST_ERROR']),
		// 		'expected running without errors'
		// 	);

		// 	$this->assertTrue(
		// 		gettype($response->result)==='object',
		// 		'expected result type is object. type: ' . gettype($response->result)
		// 	);
		// }//end test_database_info



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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertTrue(
			gettype($response->result)==='object',
			'expected result type is object'
		);
	}//end test_get_system_info



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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors.' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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
