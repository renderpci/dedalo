<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_lang_test extends BaseTestCase {

	public $tool;

	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID;

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
			'expected class is tool_lang'
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
	}//end test_get_json

	/**
	* TEST_AUTOMATIC_TRANSLATION_VALIDATION
	* @return void
	*/
	public function test_automatic_translation_validation() {

		// Test with missing config/translator
		$options = (object)[
			'source_lang'	=> 'lg-spa',
			'target_lang'	=> 'lg-eng',
			'translator'	=> 'invalid_translator'
		];

		$response = tool_lang::automatic_translation($options);

		$this->assertFalse(
			$response->result,
			'expected result false for invalid translator config'
		);

		$this->assertStringContainsString(
			'Translator config URI is not defined',
			$response->msg,
			'expected error message contains URI not defined'
		);
	}//end test_automatic_translation_validation

	/**
	* TEST_AUTOMATIC_TRANSLATION_GOOGLE_NOT_IMPLEMENTED
	* @return void
	*/
	public function test_automatic_translation_google_not_implemented() {

		// We need to mock or ensure a config exists for 'google_translation' to reach that branch
		// But since we can't easily inject config into the static call without DB changes,
		// we skip full integration test of translation unless we have a specific test environment.

		$this->markTestSkipped('Skipping full translation test as it requires DB config for translators');
	}//end test_automatic_translation_google_not_implemented

}
