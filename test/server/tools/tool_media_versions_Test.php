<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_MEDIA_VERSIONS_TEST
* Server-side coverage for the media-version management tool.
*
* tool_media_versions is a media gateway: every API action ultimately reads or
* mutates files on disk via the resolved media component (FFmpeg / ImageMagick /
* Ghostscript), which needs a live record, the filesystem and external binaries.
* Coverage here therefore stays at the contract layer and never exercises the
* delegated media work:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (every declared key is public static)
*   - SEC-024 dispatch: resolve_action allows the listed actions and refuses
*     unknown ones, and dd_tools_api refuses any unlisted method.
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_media_versions_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_media_versions(1, 'dd1324');

		$this->assertSame(
			'tool_media_versions',
			get_class($tool),
			'expected get_class to be tool_media_versions and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_media_versions(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_media_versions.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_media_versions(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_media_versions', $context->model, 'expected model is tool_media_versions');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form value or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_media_versions');
		foreach (tool_media_versions::API_ACTIONS as $key => $value) {
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

		// reaching here means every declared action is public static
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_RESOLVE_ACTION_ALLOWS_LISTED_AND_REFUSES_UNKNOWN
	* SEC-024: resolve_action allows a real listed action and fails closed on a
	* bogus name.
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_media_versions', 'get_files_info');
		$this->assertTrue($ok->ok, 'expected listed method get_files_info allowed');

		$ko = tool_security::resolve_action('tool_media_versions', 'method_that_is_not_listed');
		$this->assertFalse($ko->ok, 'expected unlisted method refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* Integration through the dd_tools_api dispatch surface: a method that is NOT
	* in the allowlist (e.g. the inherited get_json) must be refused (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_media_versions',
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
	}//end test_tool_request_refuses_unlisted_method



}//end class tool_media_versions_test
