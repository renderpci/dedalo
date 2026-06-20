<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_IMPORT_ZOTERO_TEST
* Server-side coverage for the Zotero bibliographic-import tool.
*
* tool_import_zotero exposes exactly one callable API action ('import_files'),
* which creates/overwrites publication records and is fully DB/filesystem backed;
* it is therefore NOT exercised end-to-end here. Coverage focuses on the
* fixture-free contract every tool shares plus the pure Zotero transformers:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (every declared key is public static)
*   - SEC-024 dispatch gate: listed action resolves, unknown/unlisted refused
*   - pure-logic transformers (zotero_page_to_first_page / zotero_name_to_name)
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_import_zotero_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_import_zotero(1, 'dd1324');

		$this->assertSame(
			'tool_import_zotero',
			get_class($tool),
			'expected get_class to be tool_import_zotero and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_import_zotero(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_import_zotero.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_import_zotero(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_import_zotero', $context->model, 'expected model is tool_import_zotero');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form key or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_import_zotero');
		foreach (tool_import_zotero::API_ACTIONS as $key => $value) {
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

		// reaching here is success (allowlist is non-empty for this tool)
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_RESOLVE_ACTION_ALLOWS_LISTED_AND_REFUSES_UNKNOWN
	* The single listed action ('import_files') resolves ok; a bogus name fails.
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_import_zotero', 'import_files');
		$this->assertTrue($ok->ok, 'expected listed method import_files allowed');

		$ko = tool_security::resolve_action('tool_import_zotero', 'not_a_real_action');
		$this->assertFalse($ko->ok, 'expected unknown method refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* A method NOT in the allowlist (a real internal helper) must be refused by
	* the dd_tools_api dispatch surface (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_import_zotero',
				'action'	=> 'get_section_id_from_code'
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



	/**
	* TEST_ZOTERO_PAGE_TO_FIRST_PAGE
	* Pure transformer: normalises a Zotero page field to an int >= 1.
	* Empty -> 1, "27-40" -> 27, non-numeric/plain -> 1.
	* @return void
	*/
	public function test_zotero_page_to_first_page() : void {

		$this->assertSame(1, tool_import_zotero::zotero_page_to_first_page(''), 'empty -> 1');
		$this->assertSame(1, tool_import_zotero::zotero_page_to_first_page(null), 'null -> 1');
		$this->assertSame(27, tool_import_zotero::zotero_page_to_first_page('27-40'), 'range -> first segment');
		$this->assertSame(1, tool_import_zotero::zotero_page_to_first_page('abc'), 'non-numeric -> 1');
	}//end test_zotero_page_to_first_page



	/**
	* TEST_ZOTERO_NAME_TO_NAME
	* Pure transformer: converts Zotero name objects to flat name strings.
	* Personal names -> "Given Family"; literal -> verbatim; 'string' joins with ", ".
	* @return void
	*/
	public function test_zotero_name_to_name() : void {

		$names = [
			(object)['given' => 'Jane', 'family' => 'Smith'],
			(object)['literal' => 'Some Organisation']
		];

		// array form (used by import_files)
			$ar_name = tool_import_zotero::zotero_name_to_name($names, 'array');
			$this->assertIsArray($ar_name, 'expected array return for array mode');
			$this->assertSame('Jane Smith', $ar_name[0], 'expected given + family joined');
			$this->assertSame('Some Organisation', $ar_name[1], 'expected literal verbatim');

		// string form (comma-joined scalar)
			$str = tool_import_zotero::zotero_name_to_name($names, 'string');
			$this->assertSame('Jane Smith, Some Organisation', $str, 'expected comma-joined names');
	}//end test_zotero_name_to_name



}//end class tool_import_zotero_test
