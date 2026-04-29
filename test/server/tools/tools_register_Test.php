<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tools_register_test extends BaseTestCase {



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



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_IMPORT_TOOLS
	* @return void
	*/
	public function test_import_tools() {

		$info_file_processed = tools_register::import_tools();

		$this->assertTrue(
			gettype($info_file_processed)==='array',
			'expected gettype tools is array'
				.' and is : '.gettype($info_file_processed)
		);
		$this->assertTrue(
			!empty($info_file_processed),
			'expected no empty $tools'
		);

		// Find any successfully imported tool
		$imported_tool = array_find($info_file_processed, function($el){
			return isset($el->imported) && $el->imported === true;
		});

		if ($imported_tool) {
			$this->assertTrue(
				is_object($imported_tool),
				'expected imported_tool object'
			);

			$this->assertTrue(
				!empty($imported_tool->name),
				'expected imported_tool->name is not empty'
			);

			$this->assertTrue(
				$imported_tool->imported===true,
				'expected imported_tool->imported is true'
			);
		} else {
			// If no tool is imported, we can't test specific tool properties,
			// but if the array is not empty it might just be they were already imported or had errors.
			// However, if array matches "no empty", we are good on the basic test.
			// warning:
			$this->markTestSkipped('No successfully imported tools found to verify details.');
		}
	}//end test_import_tools



	/**
	* TEST_GET_TOOL_DATA_BY_NAME
	* @return void
	*/
	public function test_get_tool_data_by_name() {

		// Ensure tools are imported
		$info_file_processed = tools_register::import_tools();
		$imported_tool = array_find($info_file_processed, function($el){
			return isset($el->imported) && $el->imported === true;
		});

		if (!$imported_tool) {
			$this->markTestSkipped('No tools available (imported) to test get_tool_data_by_name');
		}

		$tool_data = tools_register::get_tool_data_by_name(
			$imported_tool->name,
			'dd1324'
		);

		$this->assertTrue(
			gettype($tool_data)==='object',
			'expected gettype tool_data is object'
				.' and is : '.gettype($tool_data)
		);
	}//end test_get_tool_data_by_name



	/**
	* TEST_CREATE_SIMPLE_TOOL_OBJECT
	* @return void
	*/
	public function test_create_simple_tool_object() {

		// Helper to find a valid section_id
		$info_file_processed = tools_register::import_tools();
		$imported_tool = array_find($info_file_processed, function($el){
			return isset($el->imported) && $el->imported === true && !empty($el->section_id);
		});

		if (!$imported_tool) {
			$this->markTestSkipped('No tools available to test create_simple_tool_object');
		}

		$tool_object = tools_register::create_simple_tool_object(
			'dd1324',
			$imported_tool->section_id
		);

		$this->assertTrue(
			gettype($tool_object)==='object',
			'expected gettype tool_object is object'
				.' and is : '.gettype($tool_object)
		);
		$this->assertTrue(
			!empty($tool_object->name),
			'expected tool_object->name is not empty'
		);
	}//end test_create_simple_tool_object



	/**
	* TEST_GET_ALL_CONFIG
	* @return void
	*/
	public function test_get_all_config() {

		$all_config = tools_register::get_all_config();

		$this->assertTrue(
			gettype($all_config)==='array',
			'expected gettype all_config is array'
				.' and is : '.gettype($all_config)
		);

		if (empty($all_config)) {
			// It's possible there are no configs yet
			return;
		}

		if (!empty($all_config)) {
			$first_key = array_key_first($all_config);
			$this->assertTrue(
				!empty($all_config[$first_key]),
				'expected not empty value '
			);
		}
	}//end test_get_all_config



	/**
	* TEST_GET_ALL_DEFAULT_CONFIG
	* @return void
	*/
	public function test_get_all_default_config() {

		$all_default_config = tools_register::get_all_default_config();

		$this->assertTrue(
			gettype($all_default_config)==='array',
			'expected gettype all_default_config is array'
				.' and is : '.gettype($all_default_config)
		);

		if (!empty($all_default_config)) {
			$first_key = array_key_first($all_default_config);
			$this->assertTrue(
				!empty($first_key),
				'expected not empty name value '
			);
		}
	}//end test_get_all_default_config



	/**
	* TEST_GET_ALL_CONFIG_TOOL_CLIENT
	* @return void
	*/
	public function test_get_all_config_tool_client() {

		$all_config_tool_client = tools_register::get_all_config_tool_client();

		$this->assertTrue(
			gettype($all_config_tool_client)==='array',
			'expected gettype all_config_tool_client is array'
				.' and is : '.gettype($all_config_tool_client)
		);

		if (!empty($all_config_tool_client)) {
			$first_key = array_key_first($all_config_tool_client);
			$this->assertTrue(
				!empty($first_key),
				'expected not empty name value '
			);
		}

		// check tools transcription (guaranteed to have dd1633 in registry)
		$all_default_config_tool_client = tools_register::get_all_default_config_tool_client();
		$tool_trans_config = $all_default_config_tool_client['tool_transcription'] ?? null;

		$this->assertTrue(
			is_object($tool_trans_config),
			'expected tool_transcription in default client configs'
		);

		if (is_array($tool_trans_config)) {

			$transcriber_engine = $tool_trans_config['config']->transcriber_engine ?? null;

			$this->assertTrue(
				is_object($transcriber_engine),
				'expected transcriber_engine object'
			);

			$this->assertTrue(
				$transcriber_engine->client===true,
				'expected transcriber_engine->client as true'
			);

			$this->assertIsArray($transcriber_engine->value);
			$this->assertGreaterThanOrEqual(1, count($transcriber_engine->value));
		}
	}//end test_get_all_config_tool_client



	/**
	* TEST_GET_ALL_DEFAULT_CONFIG_TOOL_CLIENT
	* @return void
	*/
	public function test_get_all_default_config_tool_client() {

		$all_config_tool_client = tools_register::get_all_default_config_tool_client();

		$this->assertTrue(
			gettype($all_config_tool_client)==='array',
			'expected gettype all_config_tool_client is array'
				.' and is : '.gettype($all_config_tool_client)
		);

		if (empty($all_config_tool_client)) {
			$this->markTestSkipped('No default config tools client found');
		}

		if (!empty($all_config_tool_client)) {
			$first_key = array_key_first($all_config_tool_client);
			$this->assertTrue(
				!empty($first_key),
				'expected not empty tool name value '
			);
		}

		// check for any valid array structure
		$found = $all_config_tool_client[array_key_first($all_config_tool_client)] ?? null;

		if ($found) {
			$this->assertTrue(
				gettype($found)==='array',
				'expected gettype found is array'
					.' and is : '.gettype($found)
			);

			$this->assertTrue(
				array_key_exists('config', $found),
				'expected key config'
			);
		}
	}//end test_get_all_default_config_tool_client



	/**
	* TEST_clean_cache
	* @return void
	*/
	public function test_clean_cache() {

		$result = tools_register::clean_cache();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected gettype result is boolean'
				.' and is : '.gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected result true'
				.' and is : '.to_string($result)
		);

		$file_name		= tools_register::get_cache_user_tools_file_name(); //	like 'cache_user_tools.json'
		$base_path		= DEDALO_CACHE_MANAGER['files_path'];
		$file_path		= $base_path .'/'. $file_name;
		$file_exists	= (file_exists($file_path));

		$this->assertTrue(
			$file_exists===false,
			'expected file_exists result false'
				.' and is : '.to_string($file_exists)
		);
	}//end test_clean_cache



	/**
	* TEST_GET_TOOLS_FILES_LIST
	* @return void
	*/
	public function test_get_tools_files_list() {
		$files_list = tools_register::get_tools_files_list();

		$this->assertTrue(
			is_array($files_list),
			'expected files_list is array'
		);

		if (!empty($files_list)) {
			$first_item = $files_list[0];
			$this->assertTrue(
				is_object($first_item),
				'expected item is object'
			);
			$this->assertTrue(
				property_exists($first_item, 'name'),
				'expected property name'
			);
			$this->assertTrue(
				property_exists($first_item, 'version'),
				'expected property version'
			);
		}
	}//end test_get_tools_files_list


	/**
	* TEST_RENUMERATE_TERM_ID
	* @return void
	*/
	public function test_renumerate_term_id() {
		$counter = 0;
		$ontology = [
			(object)['tipo' => 'old1', 'parent' => 'root'],
			(object)['tipo' => 'old2', 'parent' => 'old1'],
			(object)['tipo' => 'old3', 'parent' => 'root']
		];

		$new_ontology = tools_register::renumerate_term_id($ontology, $counter);

		$this->assertTrue(
			count($new_ontology) === 3,
			'expected 3 items'
		);

		// Check IDs are renumbered
		$this->assertEquals('tool1', $new_ontology[0]->tipo);
		$this->assertEquals('tool2', $new_ontology[1]->tipo);
		$this->assertEquals('tool3', $new_ontology[2]->tipo);

		// Check parents are updated
		// old2 parent was old1, so new tool2 parent should be tool1
		$this->assertEquals('tool1', $new_ontology[1]->parent);

		// Check counter updated
		$this->assertEquals(3, $counter);
	}//end test_renumerate_term_id



	/**
	* TEST_RENUMERATE_TERM_ID_EDGE_CASES
	* @return void
	*/
	public function test_renumerate_term_id_edge_cases() {
		$counter = 10;

		// 1. Empty array
		$result = tools_register::renumerate_term_id([], $counter);
		$this->assertEmpty($result);
		$this->assertEquals(10, $counter);

		// 2. Item without tipo (should be skipped)
		$ontology = [
			(object)['name' => 'no_tipo']
		];
		$result = tools_register::renumerate_term_id($ontology, $counter);
		$this->assertEquals(10, $counter);
		$this->assertObjectNotHasProperty('tipo', $result[0]);
	}//end test_renumerate_term_id_edge_cases



	/**
	* TEST_GET_CACHE_USER_TOOLS_FILE_NAME
	* @return void
	*/
	public function test_get_cache_user_tools_file_name() {
		$filename = tools_register::get_cache_user_tools_file_name();

		$this->assertTrue(
			is_string($filename),
			'expected string filename'
		);
		$this->assertTrue(
			!empty($filename),
			'expected not empty filename'
		);
		$this->assertEquals(
			'cache_user_tools.php',
			$filename,
			'expected specific filename'
		);
	}//end test_get_cache_user_tools_file_name



	/**
	* TEST_CREATE_AND_REMOVE_TOOL_CONFIGURATION
	* @return void
	*/
	public function test_create_and_remove_tool_configuration() {

		$tool_name = 'tool_test_unit_' . uniqid();

		// 1. Try to create config for non-existent tool in registry
		// This should fail as it needs a base from dd1324
		$result = tools_register::create_tool_config($tool_name);
		$this->assertFalse($result, 'expected false for non-registered tool config creation');

		// 2. Test actual creation logic using an existing tool in registry
		$info_file_processed = tools_register::import_tools();

		// Try to find tool_lang as it's guaranteed to have dd999 in its register.json
		$tool_to_test = array_find($info_file_processed, function($el){
			return isset($el->imported) && $el->imported === true && $el->name === 'tool_lang';
		});

		// Fallback to any tool with configuration in registry if tool_lang is not found
		if (!$tool_to_test) {
			foreach ($info_file_processed as $el) {
				if (empty($el->imported) || empty($el->name)) continue;
				$reg_record = tools_register::get_tool_data_by_name($el->name, 'dd1324');
				if ($reg_record) {
					$config = tools_register::get_tool_data_by_name($el->name, 'dd1324');
					// We check if it has the configuration component (dd999)
					$m = ontology_node::get_model_by_tipo('dd999', true);
					$col = section_record_data::get_column_name($m);
					if (!empty($config->{$col}->dd999)) {
						$tool_to_test = $el;
						break;
					}
				}
			}
		}

		if ($tool_to_test) {
			$name = $tool_to_test->name;

			// Ensure it's clean first
			tools_register::remove_tool_configuration($name);

			// Create
			$result = tools_register::create_tool_config($name);
			$this->assertTrue($result, "expected true for tool config creation of '$name'");

			// Verify it exists in config section
			$config_data = tools_register::get_tool_data_by_name($name, 'dd996');
			$this->assertNotNull($config_data, "expected config data found in dd996 for '$name'");

			// Remove
			$result_remove = tools_register::remove_tool_configuration($name);
			$this->assertTrue($result_remove, "expected true for tool config removal of '$name'");

			// Verify it's gone
			$config_data_after = tools_register::get_tool_data_by_name($name, 'dd996');
			$this->assertNull($config_data_after, "expected config data NOT found after removal of '$name'");
		} else {
			$this->markTestSkipped('No registered tools with default configuration found to test creation.');
		}

		// 3. Edge cases for remove
		$this->assertFalse(tools_register::remove_tool_configuration(''), 'expected false for empty name');
		$this->assertTrue(tools_register::remove_tool_configuration('non_existent_tool_xyz'), 'expected true for non-existent tool');

	}//end test_create_and_remove_tool_configuration



}//end class tools_register_Test
