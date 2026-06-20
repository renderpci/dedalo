<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_IMPORT_RDF_TEST
* Server-side coverage for the RDF import tool.
*
* tool_import_rdf fetches external RDF graphs (via the sweetrdf/easyrdf composer
* package) and maps their data into Dédalo component records. It exposes a single
* callable API action (get_rdf_data); every other public-static method is an
* internal helper not reachable through dd_tools_api (SEC-024 §9.2).
*
* Coverage here focuses on the fixture-free, dependency-light contract:
*   - construct + dd_object context shape (get_json / get_structure_context)
*   - the API_ACTIONS contract (non-empty list form; each entry public static)
*   - tool_security::resolve_action allows the listed action, refuses unknown
*   - dd_tools_api dispatch refusing an unlisted method
*   - process_data_map pure-logic unit (no DB / network / filesystem)
*
* Follows the golden patterns in tool_qr_Test.php and tool_security_Test.php.
*/
final class tool_import_rdf_test extends BaseTestCase {



	/**
	* TEST___CONSTRUCT
	* Instantiating the tool yields the concrete class (get_called_class wiring).
	* @return void
	*/
	public function test___construct() : void {

		$tool = new tool_import_rdf(1, 'dd1324');

		$this->assertSame(
			'tool_import_rdf',
			get_class($tool),
			'expected get_class to be tool_import_rdf and is : '.get_class($tool)
		);
	}//end test___construct



	/**
	* TEST_GET_JSON
	* The tool's JSON envelope is { context: array }.
	* @return void
	*/
	public function test_get_json() : void {

		$tool = new tool_import_rdf(1, 'dd1324');
		$json = $tool->get_json((object)[
			'get_context'	=> true
		]);

		$this->assertIsObject($json, 'expected json to be object');
		$this->assertIsArray($json->context, 'expected json->context to be array');
	}//end test_get_json



	/**
	* TEST_GET_STRUCTURE_CONTEXT
	* The dd_object context is a 'ddo' typed object for model tool_import_rdf.
	* @return void
	*/
	public function test_get_structure_context() : void {

		$tool		= new tool_import_rdf(1, 'dd1324');
		$context	= $tool->get_structure_context();

		$this->assertIsObject($context, 'expected context to be object');
		$this->assertEquals('ddo', $context->typo, 'expected typo is ddo');
		$this->assertEquals('tool_import_rdf', $context->model, 'expected model is tool_import_rdf');
	}//end test_get_structure_context



	/**
	* TEST_API_ACTIONS_ARE_PUBLIC_STATIC
	* Contract: every declared API_ACTION (list-form key or map-form key) must
	* resolve to a public static method on the tool class.
	* @return void
	*/
	public function test_api_actions_are_public_static() : void {

		$reflection = new ReflectionClass('tool_import_rdf');
		foreach (tool_import_rdf::API_ACTIONS as $key => $value) {
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

		// reaching here means every listed action is public static
		$this->assertTrue(true);
	}//end test_api_actions_are_public_static



	/**
	* TEST_RESOLVE_ACTION_ALLOWS_LISTED_AND_REFUSES_UNKNOWN
	* SEC-024: the single listed action (get_rdf_data) resolves ok; a bogus
	* action name is refused (fail closed).
	* @return void
	*/
	public function test_resolve_action_allows_listed_and_refuses_unknown() : void {

		$ok = tool_security::resolve_action('tool_import_rdf', 'get_rdf_data');
		$this->assertTrue($ok->ok, 'expected listed action get_rdf_data allowed');

		$ko = tool_security::resolve_action('tool_import_rdf', 'get_resource_match');
		$this->assertFalse($ko->ok, 'expected unlisted internal helper refused');
	}//end test_resolve_action_allows_listed_and_refuses_unknown



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* Integration through the dd_tools_api dispatch surface: a public-static
	* internal helper that is NOT in the allowlist must be refused (SEC-024 §9.2).
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'	=> 'dd_tools_api',
			'action'	=> 'tool_request',
			'source'	=> (object)[
				'model'		=> 'tool_import_rdf',
				'action'	=> 'get_resource_match'
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
	* TEST_PROCESS_DATA_MAP
	* Pure-logic unit: process_data_map iterates a substring-keyed lookup table
	* and returns the first matching replacement value, or false when no key
	* substring is found in the source. No DB / network / filesystem involved.
	* @return void
	*/
	public function test_process_data_map() : void {

		$data_map = (object)[
			'nomisma.org/id'	=> 'numisdata:Hoard',
			'geonames.org'		=> 'place'
		];

		// first matching substring wins
		$this->assertSame(
			'numisdata:Hoard',
			tool_import_rdf::process_data_map('http://nomisma.org/id/123', $data_map),
			'expected first matching substring replacement'
		);

		$this->assertSame(
			'place',
			tool_import_rdf::process_data_map('http://geonames.org/456', $data_map),
			'expected geonames replacement'
		);

		// no key substring present → false
		$this->assertFalse(
			tool_import_rdf::process_data_map('http://example.com/789', $data_map),
			'expected false when no key matches'
		);
	}//end test_process_data_map



}//end class tool_import_rdf_test
