<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	// require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	// require_once 'data.php';
	// require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class tools_register_Test extends TestCase {



	/**
	* TEST_IMPORT_TOOLS
	* @return void
	*/
	public function test_import_tools() {

		$tools = tools_register::import_tools();

		$this->assertTrue(
			gettype($tools)==='array',
			'expected gettype tools is array'
				.' and is : '.gettype($tools)
		);
		$this->assertTrue(
			!empty($tools),
			'expected no empty $tools'
		);
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
	* TEST_get_all_default_config
	* @return void
	*/
	public function test_get_all_default_config() {

		$all_default_config = tools_register::get_all_default_config();
	dump($all_default_config, ' all_default_config ++ '.to_string());

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



}//end class tools_register_Test
