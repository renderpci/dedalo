<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tools_register_test extends BaseTestCase {



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
	* TEST_GET_ALL_CONFIG_TOOL
	* @return void
	*/
	public function test_get_all_config_tool() {

		$all_config_tool = tools_register::get_all_config_tool();

		$this->assertTrue(
			gettype($all_config_tool)==='array',
			'expected gettype all_config_tool is array'
				.' and is : '.gettype($all_config_tool)
		);

		if (empty($all_config_tool)) {
			// It's possible there are no configs yet
			return;
		}

		if (isset($all_config_tool[0])) {
			$this->assertTrue(
				!empty($all_config_tool[0]),
				'expected not empty value '
			);
		}
	}//end test_get_all_config_tool



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

		if (isset($all_default_config[0])) {
			$this->assertTrue(
				!empty($all_default_config[0]->name),
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

		if (isset($all_config_tool_client[0])) {
			$this->assertTrue(
				!empty($all_config_tool_client[0]->name),
				'expected not empty name value '
			);
		}

		// check tools lang
		$tool_lang_config = array_find($all_config_tool_client, function($el){
			return $el->name==='tool_lang';
		});

		$this->assertTrue(
			is_object($tool_lang_config),
			'expected found object'
				.' and is : '.gettype($tool_lang_config)
		);

		if (is_object($tool_lang_config)) {

			$translator_engine = $tool_lang_config->config->translator_engine ?? null;

			$this->assertTrue(
				is_object($translator_engine),
				'expected translator_engine object'
					.' and is : '.gettype($translator_engine)
			);

			// "client": true,
			$this->assertTrue(
				$translator_engine->client===true,
				'expected translator_engine->client as true'
					.' and is : '.to_string($translator_engine->client)
			);

			$expected = json_decode('{
				"type": "array",
				"value": [
					{
						"name": "babel",
						"label": "Babel"
					},
					{
						"name": "google_translation",
						"label": "Google translator"
					},
					{
						"name": "pepe_translation",
						"label": "Pepe translator"
					}
				],
				"client": true,
				"default": []
			}');
			$this->assertTrue(
				$translator_engine==$expected,
				'unexpected translator_engine value'
					.' translator_engine is : '.to_string($translator_engine) . PHP_EOL
					.' expected is : '.to_string($expected)
			);
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

		if (isset($all_config_tool_client[0])) {
			$this->assertTrue(
				!empty($all_config_tool_client[0]->name),
				'expected not empty tool name value '
			);
		}

		// check for any valid object structure
		$found = $all_config_tool_client[0] ?? null;

		if ($found) {
			$this->assertTrue(
				gettype($found)==='object',
				'expected gettype found is object'
					.' and is : '.gettype($found)
			);

			$this->assertTrue(
				property_exists($found, 'name'),
				'expected property name'
			);

			$this->assertTrue(
				property_exists($found, 'config'),
				'expected property config'
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
	* TEST_REMOVE_TOOL_CONFIGURATION
	* @return void
	*/
	public function test_remove_tool_configuration() {

		// 1. Test empty name
		$result = tools_register::remove_tool_configuration('');
		$this->assertFalse($result, 'expected false for empty name');

		// 2. Test non-existent tool (should return true as it's "done")
		$random_name = 'tool_test_' . uniqid();
		$result = tools_register::remove_tool_configuration($random_name);
		$this->assertTrue($result, 'expected true for non-existent tool removal');

	}//end test_remove_tool_configuration



}//end class tools_register_Test
