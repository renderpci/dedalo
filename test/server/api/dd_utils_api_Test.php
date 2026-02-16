<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_utils_api_Test extends BaseTestCase {



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

		$this->user_login();

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "convert_search_object_to_sql_query",
			    "options" : {
				  "section_tipo": [
				    "test3"
				  ],
				  "limit": 1,
				  "offset": 0
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

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
			gettype($response->db_data)==='object',
			'expected db_data type is object ' .gettype($response->db_data)
		);
	}//end test_convert_search_object_to_sql_query



	/**
	* TEST_CHANGE_LANG
	* @return void
	*/
	public function test_change_lang(): void {

		$this->user_login();

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
	* TEST_INSTALL
	* @return void
	*/
	public function test_install(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "install",
			    "options" : {
				  "action": "invalid_action"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertFalse(
			$response->result,
			'expected result false for invalid action'
		);
	}//end test_install



	/**
	* TEST_LIST_UPLOADED_FILES
	* @return void
	*/
	public function test_list_uploaded_files(): void {

		$this->user_login();

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "list_uploaded_files",
			    "options" : {
				  "key_dir": "test_dir"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result is array'
		);
	}//end test_list_uploaded_files



	/**
	* TEST_DELETE_UPLOADED_FILE
	* @return void
	*/
	public function test_delete_uploaded_file(): void {

		$this->user_login();

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "delete_uploaded_file",
			    "options" : {
				  "file_name": "non_existent_file.txt",
				  "key_dir": "test_dir"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertTrue(
			$response->result,
			'expected result true (even if file doesn\'t exist, it currently returns true after loop)'
		);
	}//end test_delete_uploaded_file



	/**
	* TEST_GET_SERVER_READY_STATUS
	* @return void
	*/
	public function test_get_server_ready_status(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_server_ready_status",
			    "options" : {
				  "check": "ontology_server"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertIsBool(
			$response->result,
			'expected result is boolean'
		);
	}//end test_get_server_ready_status



	/**
	* TEST_GET_ONTOLOGY_UPDATE_INFO
	* @return void
	*/
	public function test_get_ontology_update_info(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_ontology_update_info",
			    "options" : {
				  "version": "1.0",
				  "code": "test_code"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertIsObject(
			$response,
			'expected response is object'
		);
	}//end test_get_ontology_update_info



	/**
	* TEST_GET_CODE_UPDATE_INFO
	* @return void
	*/
	public function test_get_code_update_info(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_code_update_info",
			    "options" : {
				  "version": "1.0.0",
				  "code": "test_code"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertIsObject(
			$response,
			'expected response is object'
		);
	}//end test_get_code_update_info



	/**
	* TEST_STOP_PROCESS
	* @return void
	*/
	public function test_stop_process(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "stop_process",
			    "options" : {
				  "pid": 999999
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				.'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertIsBool(
			$response->result,
			'expected result is boolean'
		);
	}//end test_stop_process



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



	/**
	* TEST_convert_search_object_to_sql_query_unauthorized
	* @return void
	*/
	public function test_convert_search_object_to_sql_query_unauthorized(): void {

		// logout first to be sure
		login_test::logout(TEST_USER_ID);

		// login as a likely non-admin user (id 999999)
		login_test::force_login(999999);

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "convert_search_object_to_sql_query",
			    "options" : {
				  "section_tipo": ["test3"]
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertFalse(
			$response->result,
			'expected result false for non-admin user'
		);
		$this->assertStringContainsString(
			'Invalid user',
			$response->msg,
			'expected error message about invalid user'
		);

		// Revert to admin user for subsequent tests
		login_test::logout(999999);
		$this->user_login();
	}



	/**
	* TEST_CHANGE_LANG_EMPTY_OPTIONS
	* @return void
	*/
	public function test_change_lang_empty_options(): void {

		$this->user_login();

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "change_lang",
			    "options": {}
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertTrue(
			$response->result,
			'expected result true even with empty options'
		);
	}



	/**
	* TEST_GET_SERVER_READY_STATUS_INVALID
	* @return void
	*/
	public function test_get_server_ready_status_invalid(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_server_ready_status",
			    "options" : {
				  "check": "invalid_check"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertFalse(
			$response->result,
			'expected result false for invalid check'
		);
	}



	/**
	* TEST_GET_ONTOLOGY_UPDATE_INFO_INVALID_VERSION
	* @return void
	*/
	public function test_get_ontology_update_info_invalid_version(): void {

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "get_ontology_update_info",
			    "options" : {
				  "version": "bad_version",
				  "code": "test_code"
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = $rqo->dd_api::{$rqo->action}($rqo);

		$this->assertFalse(
			$response->result,
			'expected result false'
		);

		if (!defined('IS_AN_ONTOLOGY_SERVER') || IS_AN_ONTOLOGY_SERVER === false) {
			$this->assertStringContainsString('Server is not an ontology server', $response->msg);
		} else {
			$this->assertStringContainsString('Invalid version number', $response->msg);
		}
	}



	/**
	* TEST_JOIN_CHUNKED_FILES_UPLOADED_MISSING
	* @return void
	*/
	public function test_join_chunked_files_uploaded_missing(): void {

		$this->user_login();

		$rqo = json_handler::decode('
			{
				"dd_api": "dd_utils_api",
			    "action": "join_chunked_files_uploaded",
			    "options" : {
				  "file_data": {
				  	"name": "test.txt",
				  	"key_dir": "test_join"
				  },
				  "files_chunked": [
				  	"non_existent_chunk.blob"
				  ]
			    }
			}
		');
		$_ENV['DEDALO_LAST_ERROR'] = null;

		// Use error suppression because dd_utils_api calls file_get_contents on non-existent file
		$response = @$rqo->dd_api::{$rqo->action}($rqo);

		$this->assertFalse(
			$response->result,
			'expected result false for missing chunks'
		);
	}



}//end class
