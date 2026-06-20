<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_PDF_EXTRACTOR_TEST
* Server-side coverage for the PDF content extractor tool.
*
* tool_pdf_extractor exposes a single API action — get_pdf_data — which shells
* out to the XPDF toolkit (pdftotext / pdftohtml) via component_pdf and requires
* a live record + binary, so its data-mutating/IO outcome is NOT asserted here.
* Coverage focuses on the fixture-free contract:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (every declared key is public static)
*   - tool_security::resolve_action allow/refuse for the allowlist
*   - dd_tools_api dispatch refusing an unlisted method (SEC-024 §9.2)
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_pdf_extractor_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_pdf_extractor(1, 'dd1324');

		$this->assertSame(
			'tool_pdf_extractor',
			get_class($tool),
			'expected get_class to be tool_pdf_extractor and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_pdf_extractor(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_pdf_extractor.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_pdf_extractor(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_pdf_extractor', $context->model, 'expected model is tool_pdf_extractor');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form value or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_pdf_extractor');
		foreach (tool_pdf_extractor::API_ACTIONS as $key => $value) {
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

		// reaching here means every declared action resolved
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_RESOLVE_ACTION_ALLOWS_LISTED_AND_REFUSES_UNKNOWN
	* tool_security::resolve_action allows the declared get_pdf_data action and
	* refuses a bogus name (SEC-024 fail-closed).
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_pdf_extractor', 'get_pdf_data');
		$this->assertTrue($ok->ok, 'expected listed get_pdf_data allowed');

		$ko = tool_security::resolve_action('tool_pdf_extractor', 'no_such_action');
		$this->assertFalse($ko->ok, 'expected unlisted method refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* dd_tools_api::tool_request must refuse a method not in the allowlist,
	* even one that exists on the parent tool_common (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_pdf_extractor',
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



}//end class tool_pdf_extractor_test
