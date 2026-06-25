<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_ONTOLOGY_PARSER_TEST
* Server-side coverage for the developer-only ontology parser tool.
*
* tool_ontology_parser exposes three callable API actions (get_ontologies,
* export_ontologies, regenerate_ontologies), each gated by assert_developer()
* and listed in the API_ACTIONS allowlist. The deeper bodies of those methods
* hit the ontology table, the dd_ontology rebuilder and on-disk JSON export
* (ontology_data_io), so this suite does NOT assert their data outcomes.
* Coverage here focuses on the fixture-free, deterministic contract:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (every declared key is public static)
*   - tool_security::resolve_action allowing listed / refusing unknown actions
*   - dd_tools_api dispatch refusing an unlisted method (SEC-024 §9.2)
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_ontology_parser_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_ontology_parser(1, 'dd1324');

		$this->assertSame(
			'tool_ontology_parser',
			get_class($tool),
			'expected get_class to be tool_ontology_parser and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_ontology_parser(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_ontology_parser.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_ontology_parser(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_ontology_parser', $context->model, 'expected model is tool_ontology_parser');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form key or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_ontology_parser');
		foreach (tool_ontology_parser::API_ACTIONS as $key => $value) {
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
	* SEC-024 (§9.2): a listed action resolves ok; a bogus name is refused.
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_ontology_parser', 'get_ontologies');
		$this->assertTrue($ok->ok, 'expected listed action get_ontologies allowed');

		$ko = tool_security::resolve_action('tool_ontology_parser', 'not_a_real_action');
		$this->assertFalse($ko->ok, 'expected unknown action refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* Integration through the dd_tools_api dispatch surface: a method NOT in the
	* allowlist must be refused with an unauthorized_method error (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_ontology_parser',
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



}//end class tool_ontology_parser_test
