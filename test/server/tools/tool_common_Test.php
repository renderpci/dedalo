<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_common_test extends BaseTestCase {



	public $tool;



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
	* TEST___CONSTRUCT
	* @return void
	*/
	public function test___construct() {

		$tool = new tool_lang(1, 'dd1324');

		$this->assertTrue(
			get_class($tool)==='tool_lang',
			'expected get_called_class is tool_lang'
				.' and is : '.get_class($tool)
		);

		$this->tool = $tool;
	}//end test___construct



	/**
	* TEST_GET_JSON
	* @return void
	*/
	public function test_get_json() {

		$this->tool = new tool_lang(1, 'dd1324');
		$json = $this->tool->get_json((object)[
			'get_context'	=> true,
			'get_data'		=> true
		]);

		$this->assertTrue(
			gettype($json)==='object',
			'expected type is object'
				.' and is : '.gettype($json)
		);

		$this->assertTrue(
			gettype($json->context)==='array',
			'expected type is array'
				.' and is : '.gettype($json->context)
		);

		$this->assertTrue(
			!isset($json->data),
			'expected was not set json->data'
		);
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* @return void
	*/
	public function test_get_structure_context() {

		$this->tool	= new tool_lang(1, 'dd1324');
		$context	= $this->tool->get_structure_context();

		$this->assertIsObject($context, 'expected type is object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_lang', $context->model, 'expected model is tool_lang');
	}//end test_get_structure_context



	/**
	* TEST_GET_STRUCTURE_CONTEXT_SIMPLE
	* @return void
	*/
	public function test_get_structure_context_simple() {

		$this->tool	= new tool_lang(1, 'dd1324');
		$context	= $this->tool->get_structure_context_simple();

		$this->assertIsObject($context, 'expected type is object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
	}//end test_get_structure_context_simple



	/**
	* TEST_CREATE_TOOL_SIMPLE_CONTEXT
	* @return void
	*/
	public function test_create_tool_simple_context() {

		// Mock tool object
		$tool_object = (object)[
			'name' => 'tool_test',
			'label' => [(object)['lang'=>DEDALO_APPLICATION_LANG, 'value'=>'Test Tool']],
			'developer' => [],
			'section_tipo' => 'dd123',
			'properties' => (object)[],
			'show_in_inspector' => true,
			'show_in_component' => false
		];

		$context = tool_common::create_tool_simple_context($tool_object);

		$this->assertTrue(
			$context instanceof dd_object,
			'expected instance of dd_object'
		);

		$this->assertTrue(
			$context->name === 'tool_test',
			'expected name tool_test'
		);
	}//end test_create_tool_simple_context



	/**
	* TEST_GET_ALL_REGISTERED_TOOLS
	* @return void
	*/
	public function test_get_all_registered_tools() {

		$all_registered_tools = tool_common::get_all_registered_tools();

		$this->assertIsArray($all_registered_tools, 'expected type is array');

		if (empty($all_registered_tools)) {
			$this->markTestSkipped('No tools found in database');
			return;
		}

		// Find first tool with a valid name
		$valid_tool = null;
		foreach ($all_registered_tools as $tool) {
			if (isset($tool->name) && is_string($tool->name) && !empty($tool->name)) {
				$valid_tool = $tool;
				break;
			}
		}

		if ($valid_tool === null) {
			$this->markTestSkipped('No tools with valid name found in database');
			return;
		}

		$this->assertIsString($valid_tool->name, 'expected type is string');
		$this->assertNotEmpty($valid_tool->name, 'expected name value is not empty');
	}//end test_get_all_registered_tools



	/**
	* TEST_GET_ACTIVE_TOOLS
	* @return void
	*/
	public function test_get_active_tools() {

		$active_tools = tool_common::get_active_tools();

		$this->assertTrue(
			($active_tools instanceof db_result) || ($active_tools === false),
			'expected instance of db_result or false'
		);

		if ($active_tools === false || $active_tools->row_count() === 0) {
			$this->markTestSkipped('No active tools found in database');
		}
	}//end test_get_active_tools



	/**
	* TEST_GET_ACTIVE_TOOL_NAMES
	* @return void
	*/
	public function test_get_active_tool_names() {

		$tool_names = tool_common::get_active_tool_names();

		$this->assertIsArray($tool_names, 'expected type array');

		if (empty($tool_names)) {
			$this->markTestSkipped('No active tool names found');
		}
	}//end test_get_active_tool_names



	/**
	* TEST_GET_CONFIG
	* @return void
	*/
	public function test_get_config() {

		$tool_config = tool_common::get_config(
			'tool_lang'
		);

		$this->assertTrue(
			is_array($tool_config) || $tool_config===null,
			'expected type is array or null'
				.' and is : '.gettype($tool_config)
		);

		if ($tool_config!==null) {
			$this->assertTrue(
				array_key_exists('config', $tool_config),
				'expected config key exists'
			);
		}
	}//end test_get_config



	/**
	* TEST_READ_FILES
	* @return void
	*/
	public function test_read_files() {

		$files = tool_common::read_files(
			DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT,
			['jpg']
		);

		$this->assertIsArray($files, 'expected type is array');

		if (empty($files)) {
			$this->markTestSkipped('No files found in media path');
			return;
		}

		if (isset($files[0])) {
			$this->assertStringContainsString('.jpg', $files[0], 'expected jpg extension in first file');
		}
	}//end test_read_files



	/**
	* TEST_READ_CSV_FILE_AS_ARRAY
	* Reads a CSV file and converts it to array, testing encoding and delimiter handling
	* @return void
	*/
	public function test_read_csv_file_as_array() {

		$csv_string = '"section_id";"dd200";"dd199";"dd197";"dd201";"dd271";"dd1223";"dd1224";"dd1225";"dd591";"dd593";"dd594";"dd595";"dd596";"dd599"
		"1";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd200""}]";"{""lg-nolan"":[{""start"":{""day"":24,""hour"":19,""time"":64905044917,""year"":2019,""month"":5,""minute"":8,""second"":37}}]}";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd197""}]";"{""lg-nolan"":[{""start"":{""day"":6,""hour"":14,""time"":64914186253,""year"":2019,""month"":9,""minute"":24,""second"":13}}]}";"{""lg-nolan"":[{""start"":{""day"":24,""hour"":19,""time"":64905045160,""year"":2019,""month"":5,""minute"":12,""second"":40}}]}";"{""lg-nolan"":[{""start"":{""day"":6,""hour"":22,""time"":65026709603,""year"":2023,""month"":3,""minute"":53,""second"":23}}]}";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd1224""}]";"[{""type"":""dd151"",""section_id"":""1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd1225""}]";"";"[{""type"":""dd151"",""section_id"":""1"",""section_tipo"":""dd64"",""from_component_tipo"":""dd593""}]";"{""lg-nolan"":[""page""]}";"";"{""lg-nolan"":""{\""id\"":\""page\"",\""template\"":\""page\"",\""table\"":\""ts_web\"",\""detail\"":[{\""type\"":\""title\"",\""colname\"":\""titulo\""},{\""type\"":\""abstract\"",\""colname\"":\""entradilla\""},{\""type\"":\""body\"",\""colname\"":\""cuerpo\""},{\""type\"":\""image\"",\""colname\"":\""imagen\"",\""target\"":{\""table\"":\""imagen\"",\""colname\"":\""image\""}},{\""type\"":\""address\"",\""colname\"":\""direccion\""},{\""type\"":\""telf\"",\""colname\"":\""telf\""},{\""type\"":\""email\"",\""colname\"":\""email\""}]}""}";"[{""type"":""dd675"",""section_id"":""1"",""section_tipo"":""dd153"",""from_component_tipo"":""dd599""}]"
		"2";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd200""}]";"{""lg-nolan"":[{""start"":{""day"":24,""hour"":19,""time"":64905044999,""year"":2019,""month"":5,""minute"":9,""second"":59}}]}";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd197""}]";"{""lg-nolan"":[{""start"":{""day"":24,""hour"":19,""time"":64905047417,""year"":2019,""month"":5,""minute"":50,""second"":17}}]}";"{""lg-nolan"":[{""start"":{""day"":24,""hour"":19,""time"":64905045192,""year"":2019,""month"":5,""minute"":13,""second"":12}}]}";"{""lg-nolan"":[{""start"":{""day"":6,""hour"":22,""time"":65026709603,""year"":2023,""month"":3,""minute"":53,""second"":23}}]}";"[{""type"":""dd151"",""section_id"":""-1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd1224""}]";"[{""type"":""dd151"",""section_id"":""1"",""section_tipo"":""dd128"",""from_component_tipo"":""dd1225""}]";"";"[{""type"":""dd151"",""section_id"":""1"",""section_tipo"":""dd64"",""from_component_tipo"":""dd593""}]";"{""lg-nolan"":[""main_home""]}";"";"{""lg-nolan"":""{\""id\"":\""main_home\"",\""template\"":\""main_home\"",\""table\"":\""ts_web\"",\""detail\"":[{\""type\"":\""title\"",\""colname\"":\""titulo\""},{\""type\"":\""abstract\"",\""colname\"":\""entradilla\""},{\""type\"":\""body\"",\""colname\"":\""cuerpo\""},{\""type\"":\""image\"",\""colname\"":\""imagen\"",\""target\"":{\""table\"":\""imagen\"",\""colname\"":\""image\""}}]}""}";"[{""type"":""dd675"",""section_id"":""1"",""section_tipo"":""dd153"",""from_component_tipo"":""dd599""}]"
		';

		$directory = DEDALO_UPLOAD_TMP_DIR . '/test';
		if (!is_dir($directory)) {
			mkdir($directory, 0750, true);
		}
		$file_test_csv = $directory . '/exported_templates-web_-1-dd477.csv';

		$put = file_put_contents($file_test_csv, $csv_string);

		$csv_file_as_array = tool_common::read_csv_file_as_array($file_test_csv);

		// Cleanup
		if (file_exists($file_test_csv)) {
			unlink($file_test_csv);
		}

		$this->assertIsArray($csv_file_as_array, 'expected type is array');

		if (isset($csv_file_as_array[0])) {
			$this->assertIsArray($csv_file_as_array[0], 'expected type is array');
			if (isset($csv_file_as_array[0][1])) {
				$this->assertEquals('dd200', $csv_file_as_array[0][1], 'expected dd200 in first row');
			}
		}
	}//end test_read_csv_file_as_array



	/**
	* TEST_GET_USER_TOOLS
	* Tests tool retrieval for superuser and regular users
	* @return void
	*/
	public function test_get_user_tools() {

		// 1. Test Superuser (DEDALO_SUPERUSER = -1)
		$user_id = (int)DEDALO_SUPERUSER;
		$user_tools = tool_common::get_user_tools($user_id);

		if (empty($user_tools)) {
			$this->markTestSkipped('No tools available for superuser. Check database.');
			return;
		}

		$this->assertIsArray($user_tools);
		$this->assertNotEmpty($user_tools, 'expected superuser tools not empty');

		if (isset($user_tools[0])) {
			$tool = $user_tools[0];
			$this->assertObjectHasProperty('name', $tool);
			$this->assertObjectHasProperty('tool_config', $tool);
		}


		// 2. Test a regular/admin user (ID 1)
		$admin_user_id = 1;
		$admin_tools = tool_common::get_user_tools($admin_user_id);
		$this->assertIsArray($admin_tools);

	}//end test_get_user_tools



	/**
	* TEST_GET_STRUCTURE_CONTEXT_EXCEPTION
	* Verify that calling get_structure_context on the base class throws an exception
	* @return void
	*/
	public function test_get_structure_context_exception() {
		$this->expectException(Exception::class);
		$this->expectExceptionMessage('Error. Tool name is wrong');

		// Using a mock or a partial to bypass protected constructor if needed,
		// but tool_common constructor is public.
		$base_tool = new tool_common(null, 'dd1324');
		$base_tool->get_structure_context();
	}//end test_get_structure_context_exception



	/**
	* TEST_READ_FILES_EDGE_CASES
	* Tests edge cases for file reading: non-existent directory and empty extensions
	* @return void
	*/
	public function test_read_files_edge_cases() {

		// 1. Non-existent directory
		$files = tool_common::read_files('/non/existent/path/at/all/12345');
		$this->assertIsArray($files);
		$this->assertEmpty($files, 'expected empty array for non-existent dir');

		// 2. Empty extensions list
		$files = tool_common::read_files(DEDALO_MEDIA_PATH, []);
		$this->assertIsArray($files);
		$this->assertEmpty($files, 'expected empty array for empty extensions list');
	}//end test_read_files_edge_cases



	/**
	* TEST_READ_CSV_FILE_AS_ARRAY_NON_EXISTENT
	* @return void
	*/
	public function test_read_csv_file_as_array_non_existent() {
		$data = tool_common::read_csv_file_as_array('/tmp/file_that_does_not_exist_99.csv');
		$this->assertIsArray($data);
		$this->assertEmpty($data);
	}//end test_read_csv_file_as_array_non_existent



	/**
	* TEST_GET_USER_TOOLS_INVALID_IDS
	* @return void
	*/
	public function test_get_user_tools_invalid_ids() {

		// 1. User ID 0 (Should be strictly empty as per code)
		$tools = tool_common::get_user_tools(0);
		$this->assertEmpty($tools, 'expected empty tools for user 0');

		// 2. Negative User ID or non-existent large ID
		// Should return only "always_active" tools if any, but not profile-specific tools.
		// Note: DEDALO_SUPERUSER is -1, so we use -2 as an invalid ID.
		$user_id = -2;
		$tools = tool_common::get_user_tools($user_id);
		$this->assertIsArray($tools);

		if (!empty($tools)) {
			foreach ($tools as $tool) {
				$is_always_active = (isset($tool->always_active) && $tool->always_active === true);
				$this->assertTrue(
					$is_always_active,
					'expected only always_active tools for invalid user ID. Tool: ' . ($tool->name ?? 'unknown')
				);
			}
		}
	}//end test_get_user_tools_invalid_ids



	/**
	* TEST_GET_CONFIG_UNKNOWN_TOOL
	* @return void
	*/
	public function test_get_config_unknown_tool() {
		$config = tool_common::get_config('non_existent_tool_name_xyz');
		$this->assertNull($config, 'expected null config for unknown tool');

		$config_empty = tool_common::get_config('');
		$this->assertNull($config_empty, 'expected null config for empty tool name');
	}//end test_get_config_unknown_tool



	/**
	* TEST_CREATE_TOOL_SIMPLE_CONTEXT_MINIMAL
	* @return void
	*/
	public function test_create_tool_simple_context_minimal() {
		// Minimum required properties
		$tool_object = (object)[
			'name' => 'minimal_tool'
		];

		$context = tool_common::create_tool_simple_context($tool_object);
		$this->assertInstanceOf(dd_object::class, $context);
		$this->assertEquals('minimal_tool', $context->name);
	}//end test_create_tool_simple_context_minimal



}//end class tool_common_test
