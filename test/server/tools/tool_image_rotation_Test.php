<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_IMAGE_ROTATION_TEST
* Server-side coverage for the image rotation / crop tool.
*
* tool_image_rotation exposes a single callable API action (`apply_rotation`)
* that mutates on-disk image derivatives via ImageMagick. The action itself is
* DB- and binary-backed, so it is NOT invoked here; coverage focuses on the
* fixture-free contracts every tool shares:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS allowlist (every declared entry is public static)
*   - SEC-024 dispatch: tool_security::resolve_action allow/refuse, and
*     dd_tools_api::tool_request refusing an unlisted method
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_image_rotation_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_image_rotation(1, 'dd1324');

		$this->assertSame(
			'tool_image_rotation',
			get_class($tool),
			'expected get_class to be tool_image_rotation and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_image_rotation(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_image_rotation.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_image_rotation(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_image_rotation', $context->model, 'expected model is tool_image_rotation');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form value or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_image_rotation');
		foreach (tool_image_rotation::API_ACTIONS as $key => $value) {
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

		// reaching here is success
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_RESOLVE_ACTION_ALLOWS_LISTED_AND_REFUSES_UNKNOWN
	* SEC-024: resolve_action accepts a listed action and refuses a bogus one.
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_image_rotation', 'apply_rotation');
		$this->assertTrue($ok->ok, 'expected listed method apply_rotation allowed');

		$ko = tool_security::resolve_action('tool_image_rotation', 'not_a_real_action');
		$this->assertFalse($ko->ok, 'expected unlisted method refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* Integration through the dd_tools_api dispatch surface: a method NOT in the
	* allowlist must be refused (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_image_rotation',
				'action'	=> 'method_that_is_not_listed'
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
	}//end test_tool_request_refuses_unlisted_method



}//end class tool_image_rotation_test
