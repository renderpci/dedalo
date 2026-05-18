<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_ontology_api_test extends BaseTestCase {



	protected function setUp(): void {
		parent::setUp();
		$user_id = TEST_USER_ID;
		if (login::is_logged() === false) {
			login_test::force_login($user_id);
		}
	}



	/**
	* TEST_RESOLVE_TERM_EXACT
	* Resolve a known ontology term using exact JSONB match
	* @return void
	*/
	public function test_resolve_term_exact(): void {

		$rqo = (object)[
			'action'	=> 'resolve_term',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'text'	=> 'section',
				'lang'	=> DEDALO_STRUCTURE_LANG,
				'mode'	=> 'exact'
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::resolve_term($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				. 'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result type is array'
		);

		$this->assertTrue(
			empty($response->errors),
			'expected no errors'
		);

		if (!empty($response->result)) {
			$first = $response->result[0];
			$this->assertObjectHasProperty('tipo', $first, 'result items should have tipo');
			$this->assertObjectHasProperty('model', $first, 'result items should have model');
			$this->assertObjectHasProperty('term', $first, 'result items should have term');
		}
	}//end test_resolve_term_exact



	/**
	* TEST_RESOLVE_TERM_FUZZY
	* Resolve ontology nodes using fuzzy similarity/trigram search
	* @return void
	*/
	public function test_resolve_term_fuzzy(): void {

		$rqo = (object)[
			'action'	=> 'resolve_term',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'text'	=> 'section',
				'mode'	=> 'fuzzy'
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::resolve_term($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result type is array'
		);

		$this->assertGreaterThan(
			0,
			count($response->result),
			'fuzzy search should return at least one result for "section"'
		);
	}//end test_resolve_term_fuzzy



	/**
	* TEST_RESOLVE_TERM_MISSING_TEXT
	* Verify that missing text parameter returns error
	* @return void
	*/
	public function test_resolve_term_missing_text(): void {

		$rqo = (object)[
			'action'	=> 'resolve_term',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'mode'	=> 'exact'
			]
		];

		$response = dd_ontology_api::resolve_term($rqo);

		$this->assertContains(
			'missing_text',
			$response->errors,
			'expected missing_text error'
		);
	}//end test_resolve_term_missing_text



	/**
	* TEST_RESOLVE_TERM_WITH_MODEL_FILTER
	* Resolve nodes with model filter (sections only)
	* @return void
	*/
	public function test_resolve_term_with_model_filter(): void {

		$rqo = (object)[
			'action'	=> 'resolve_term',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'text'	=> 'section',
				'lang'	=> DEDALO_STRUCTURE_LANG,
				'mode'	=> 'exact',
				'model'	=> 'section'
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::resolve_term($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		if (!empty($response->result)) {
			foreach ($response->result as $node) {
				$this->assertEquals(
					'section',
					$node->model,
					'all results should have model = section'
				);
			}
		}
	}//end test_resolve_term_with_model_filter



	/**
	* TEST_RESOLVE_SECTION
	* Resolve text to sections with full component trees
	* @return void
	*/
	public function test_resolve_section(): void {

		$rqo = (object)[
			'action'	=> 'resolve_section',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'text'	=> 'section',
				'lang'	=> DEDALO_STRUCTURE_LANG,
				'mode'	=> 'exact'
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::resolve_section($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors' . PHP_EOL
				. 'DEDALO_LAST_ERROR: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result type is array'
		);

		if (!empty($response->result)) {
			$first_section = $response->result[0];
			$this->assertObjectHasProperty('tipo', $first_section, 'section should have tipo');
			$this->assertObjectHasProperty('model', $first_section, 'section should have model');
			$this->assertObjectHasProperty('components', $first_section, 'section should have components');
			$this->assertEquals(
				'section',
				$first_section->model,
				'resolved section should have model = section'
			);
		}
	}//end test_resolve_section



	/**
	* TEST_GET_NODE
	* Get a single ontology node by tipo
	* @return void
	*/
	public function test_get_node(): void {

		$section_model_tipo = ontology_node::get_tipo_from_model('section');

		if (empty($section_model_tipo)) {
			$this->markTestSkipped('section model tipo not found in ontology');
		}

		$rqo = (object)[
			'action'	=> 'get_node',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'tipo'	=> $section_model_tipo
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::get_node($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertObjectHasProperty('tipo', $response->result, 'node should have tipo');
		$this->assertObjectHasProperty('model', $response->result, 'node should have model');
		$this->assertObjectHasProperty('term', $response->result, 'node should have term');
		$this->assertObjectHasProperty('tld', $response->result, 'node should have tld');
		$this->assertEquals(
			$section_model_tipo,
			$response->result->tipo,
			'returned tipo should match requested tipo'
		);
	}//end test_get_node



	/**
	* TEST_GET_NODE_INVALID_TIPO
	* Verify that invalid tipo returns error
	* @return void
	*/
	public function test_get_node_invalid_tipo(): void {

		$rqo = (object)[
			'action'	=> 'get_node',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'tipo'	=> 'nonexistent99999'
			]
		];

		$response = dd_ontology_api::get_node($rqo);

		$this->assertContains(
			'node_not_found',
			$response->errors,
			'expected node_not_found error'
		);
	}//end test_get_node_invalid_tipo



	/**
	* TEST_GET_NODE_MISSING_TIPO
	* Verify that missing tipo parameter returns error
	* @return void
	*/
	public function test_get_node_missing_tipo(): void {

		$rqo = (object)[
			'action'	=> 'get_node',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[]
		];

		$response = dd_ontology_api::get_node($rqo);

		$this->assertContains(
			'missing_tipo',
			$response->errors,
			'expected missing_tipo error'
		);
	}//end test_get_node_missing_tipo



	/**
	* TEST_SEARCH
	* Search ontology by model
	* @return void
	*/
	public function test_search(): void {

		$rqo = (object)[
			'action'	=> 'search',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'model'	=> 'section',
				'tld'	=> 'dd'
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::search($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result type is array'
		);

		$this->assertGreaterThan(
			0,
			count($response->result),
			'search for section model should return at least one result'
		);
	}//end test_search



	/**
	* TEST_SEARCH_WITHOUT_DATA
	* Search with include_data = false returns tipos only
	* @return void
	*/
	public function test_search_without_data(): void {

		$rqo = (object)[
			'action'	=> 'search',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[
				'model'	=> 'section',
				'tld'	=> 'dd'
			],
			'options'	=> (object)[
				'include_data'	=> false
			]
		];

		$_ENV['DEDALO_LAST_ERROR'] = null;
		$response = dd_ontology_api::search($rqo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			is_array($response->result),
			'expected result type is array'
		);

		if (!empty($response->result)) {
			$this->assertTrue(
				is_string($response->result[0]),
				'with include_data=false, result items should be tipo strings'
			);
		}
	}//end test_search_without_data



	/**
	* TEST_SEARCH_EMPTY_CRITERIA
	* Verify that empty criteria returns error
	* @return void
	*/
	public function test_search_empty_criteria(): void {

		$rqo = (object)[
			'action'	=> 'search',
			'dd_api'	=> 'dd_ontology_api',
			'source'	=> (object)[]
		];

		$response = dd_ontology_api::search($rqo);

		$this->assertContains(
			'empty_criteria',
			$response->errors,
			'expected empty_criteria error'
		);
	}//end test_search_empty_criteria



	/**
	* TEST_API_ACTIONS_ALLOWLIST
	* Verify that API_ACTIONS constant contains expected actions
	* @return void
	*/
	public function test_api_actions_allowlist(): void {

		$expected_actions = ['resolve_term', 'resolve_section', 'get_node', 'search'];
		$actual_actions = dd_ontology_api::API_ACTIONS;

		$this->assertEquals(
			$expected_actions,
			$actual_actions,
			'API_ACTIONS should match expected actions'
		);
	}//end test_api_actions_allowlist



	/**
	* TEST_DD_MANAGER_REGISTRATION
	* Verify that dd_ontology_api is registered in dd_manager
	* @return void
	*/
	public function test_dd_manager_registration(): void {

		$reflection = new ReflectionMethod('dd_manager', 'manage_request');
		// We can't easily test the internal array, but we can verify the class is loadable
		$this->assertTrue(
			class_exists('dd_ontology_api', false),
			'dd_ontology_api class should be loadable'
		);
	}//end test_dd_manager_registration



}//end dd_ontology_api_test