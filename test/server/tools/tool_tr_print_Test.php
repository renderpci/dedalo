<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_TR_PRINT_TEST
* Server-side coverage for the transcription print tool.
*
* tool_tr_print exposes NO remotely callable API actions (empty API_ACTIONS
* allowlist, SEC-024 §9.2). Its public static helpers (build_pseudo_vtt,
* clean_vtt_text, format_text_for_tool) are internal utilities with non-rqo
* signatures and must not be reachable through dd_tools_api::tool_request.
* Coverage here therefore focuses on:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (empty, and every declared key is public static)
*   - dd_tools_api dispatch refusing any action against the empty allowlist
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_tr_print_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_tr_print(1, 'dd1324');

		$this->assertSame(
			'tool_tr_print',
			get_class($tool),
			'expected get_class to be tool_tr_print and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_tr_print(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_tr_print.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_tr_print(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_tr_print', $context->model, 'expected model is tool_tr_print');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_IS_EMPTY
	* tool_tr_print exposes no server-side callable methods.
	* @return void
	*/
	public function test_api_actions_is_empty() : void {

		$this->assertIsArray(tool_tr_print::API_ACTIONS, 'expected API_ACTIONS to be an array');
		$this->assertSame([], tool_tr_print::API_ACTIONS, 'expected empty API_ACTIONS allowlist');
	}//end test_api_actions_is_empty



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form key or map-form key) must
	* resolve to a public static method on the tool class. Vacuously true for the
	* empty allowlist, but kept as the canonical assertion replicated per tool.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_tr_print');
		foreach (tool_tr_print::API_ACTIONS as $key => $value) {
			// list form: the action is the value; map form: the action is the key
			$method_name = is_int($key) ? $value : $key;
			$this->assertTrue(
				$reflection->hasMethod($method_name),
				"expected method {$method_name} to exist"
			);
			$method = $reflection->getMethod($method_name);
			$this->assertTrue($method->isPublic(), "expected {$method_name} public");
			$this->assertTrue($method->isStatic(), "expected {$method_name} static");
		}

		// reaching here with an empty allowlist is success
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_TOOL_REQUEST_REFUSES_ACTION
	* With an empty allowlist, dd_tools_api::tool_request must refuse any method,
	* even one that exists on the parent tool_common (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_action() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_tr_print',
				'action'	=> 'get_json'
			],
			'options'	=> new stdClass()
		];

		$response = dd_tools_api::tool_request($rqo);

		$this->assertFalse($response->result, 'expected refused request');
		$this->assertContains(
			'unauthorized_method',
			$response->errors,
			'expected unauthorized_method error'
		);
	}//end test_tool_request_refuses_action



}//end class tool_tr_print_test
