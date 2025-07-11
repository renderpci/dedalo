<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tools_register_test extends TestCase {



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

		$tool_diffusion = array_find($info_file_processed, function($el){
			return $el->name==='tool_diffusion';
		});

		$this->assertTrue(
			is_object($tool_diffusion),
			'expected found tool_diffusion object'
				.' and is : '.gettype($tool_diffusion)
		);

		if (is_object($tool_diffusion)) {

			$this->assertTrue(
				$tool_diffusion->dir==='/tool_diffusion',
				'expected tool_diffusion->dir is /tool_diffusion'
					.' and is : '.to_string($tool_diffusion->dir)
			);

			$this->assertTrue(
				$tool_diffusion->imported===true,
				'expected tool_diffusion->imported is true'
					.' and is : '.to_string($tool_diffusion->imported)
			);
		}
	}//end test_import_tools



	/**
	* TEST_GET_TOOL_DATA_BY_NAME
	* @return void
	*/
	public function test_get_tool_data_by_name() {

		$tool_data = tools_register::get_tool_data_by_name(
			'tool_lang',
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

		$tool_object = tools_register::create_simple_tool_object(
			'dd1324',
			1
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

		if (isset($all_config_tool_client[0])) {
			$this->assertTrue(
				!empty($all_config_tool_client[0]->name),
				'expected not empty tool name value '
			);
		}

		// check tool_propagate_component_data
		$found = array_find($all_config_tool_client, function($el) {
			return $el->name==='tool_propagate_component_data';
		});

		$this->assertTrue(
			gettype($found)==='object',
			'expected gettype found is object'
				.' and is : '.gettype($found)
		);

		if (is_object($found)) {

			// expected
			$expected = json_decode('{
				"name": "tool_propagate_component_data",
				"config": {
					"components_monovalue": {
						"value": [
							"component_3d",
							"component_av",
							"component_geolocation",
							"component_image",
							"component_json",
							"component_password",
							"component_pdf",
							"component_publication",
							"component_model",
							"component_section_id",
							"component_security_access",
							"component_select",
							"component_select_lang",
							"component_svg",
							"component_text_area"
						],
						"client": true
					}
				}
			}');

			$this->assertTrue(
				$found==$expected,
				'expected is different to found'
					.' found is : '.to_string($found) . PHP_EOL
					.' expected is : '.to_string($expected)
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



}//end class tools_register_Test
