<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once dirname(dirname(__FILE__)) . '/diffusion/class.diffusion_test_helper.php';

/**
* DD_DIFFUSION_API_TEST
* Tests the PHP half of the diffusion publish pipeline and the auxiliary
* API actions. Ontology-guarded: skips cleanly on databases without a
* usable diffusion ontology (e.g. an outdated install dump).
*/
final class dd_diffusion_api_Test extends BaseTestCase {

	public static $model = 'dd_diffusion_api';

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
	}



	/**
	* TEST_VALIDATE_ACTION
	* validate() checks the diffusion ontology configuration against the
	* virtual tree and reports per-element findings.
	*/
	public function test_validate_action(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		// single element validation
		$response = dd_diffusion_api::validate((object)[
			'action'	=> 'validate',
			'options'	=> (object)['diffusion_element_tipo' => $config->element_tipo]
		]);

		$this->assertTrue($response->result, 'validate() failed: ' . to_string($response->msg));
		$this->assertIsArray($response->data);
		$this->assertCount(1, $response->data);

		$element_report = $response->data[0];
		$this->assertSame($config->element_tipo, $element_report->element_tipo);
		$this->assertIsArray($element_report->checks);

		$check_names = array_map(fn($c) => $c->check, $element_report->checks);
		$this->assertContains('element_resolvable', $check_names);
		$this->assertContains('diffusion_type', $check_names);
		$this->assertContains('target_sections', $check_names);
		$this->assertContains('database', $check_names, 'SQL element must be checked for database');

		// the guarded element is usable: its core checks must pass
		foreach ($element_report->checks as $check) {
			if (in_array($check->check, ['element_resolvable','diffusion_type','target_sections'])) {
				$this->assertTrue($check->result, "Check '{$check->check}' failed for usable element: {$check->msg}");
			}
		}

		// full domain validation returns one report per element
		$response_all = dd_diffusion_api::validate((object)['action' => 'validate']);
		$this->assertTrue($response_all->result);
		$this->assertGreaterThanOrEqual(1, count($response_all->data));
	}//end test_validate_action



	/**
	* TEST_RETRY_PENDING_DELETIONS_COUNT
	*/
	public function test_retry_pending_deletions_count(): void {

		diffusion_test_helper::require_activity_action_ontology($this);

		$response = dd_diffusion_api::retry_pending_deletions((object)[
			'action'	=> 'retry_pending_deletions',
			'options'	=> (object)['count_only' => true]
		]);

		$this->assertNotEmpty($response->result, 'count_only request failed: ' . to_string($response->msg));
		$this->assertIsInt($response->result->pending);
		$this->assertGreaterThanOrEqual(0, $response->result->pending);
	}//end test_retry_pending_deletions_count



	/**
	* TEST_GET_DIFFUSION_INFO
	*/
	public function test_get_diffusion_info(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$response = dd_diffusion_api::get_diffusion_info((object)[
			'action'	=> 'get_diffusion_info',
			'options'	=> (object)['section_tipo' => $config->section_tipo]
		]);

		$this->assertNotEmpty($response->result, 'get_diffusion_info failed: ' . to_string($response->msg));
		$this->assertIsArray($response->result->section_diffusion_nodes);
		$this->assertNotEmpty($response->result->section_diffusion_nodes, 'Section with diffusion returned no nodes');
		$this->assertIsInt($response->result->resolve_levels);
	}//end test_get_diffusion_info



	/**
	* TEST_DIFFUSE_PIPELINE
	* The PHP half of the publish pipeline: search + chain resolution +
	* datum assembly. Asserts the response carries the canonical wire shape
	* (no Bun involved). Uses an existing record of the guarded section.
	*/
	public function test_diffuse_pipeline(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		// find one existing record of the guarded section
		$conn	= DBi::_getConnection();
		$table	= common::get_matrix_table_from_tipo($config->section_tipo) ?? 'matrix';
		$result	= pg_query_params(
			$conn,
			'SELECT section_id FROM "' . $table . '" WHERE section_tipo = $1 ORDER BY section_id ASC LIMIT 1',
			[$config->section_tipo]
		);
		$row = pg_fetch_object($result);
		if (empty($row)) {
			$this->markTestSkipped("No records exist in section {$config->section_tipo} to diffuse");
		}
		$section_id = (int)$row->section_id;

		// the diffusion node (table) of the section for the guarded element
		$diffusion_tipo = diffusion_utils::get_table_tipo($config->element_tipo, $config->section_tipo);
		$this->assertNotEmpty($diffusion_tipo, 'No diffusion table tipo resolved');

		// minimal SQO restricted to the chosen record
		$locator = new locator();
			$locator->set_section_tipo($config->section_tipo);
			$locator->set_section_id($section_id);

		$rqo = (object)[
			'action'	=> 'diffuse',
			'source'	=> (object)['type' => 'diffuse'],
			'sqo'		=> (object)[
				'section_tipo'			=> [$config->section_tipo],
				'filter_by_locators'	=> [$locator],
				'limit'					=> 1
			],
			'options'	=> (object)[
				'diffusion_tipo'			=> $diffusion_tipo,
				'diffusion_element_tipo'	=> $config->element_tipo,
				'levels'					=> 1
			]
		];

		$response = dd_diffusion_api::diffuse($rqo);

		$this->assertTrue($response->result, 'diffuse() failed: ' . to_string($response->msg));
		$this->assertIsArray($response->langs);
		$this->assertNotEmpty($response->main_lang);
		$this->assertIsArray($response->main);
		$this->assertIsArray($response->datum);
		$this->assertNotEmpty($response->datum, 'diffuse() produced no datum');

		// canonical datum_group container + wire key order
		$datum = $response->datum[0];
		$this->assertInstanceOf(diffusion_datum::class, $datum);
		$keys = array_keys((array)json_decode(json_encode($datum)));
		$this->assertSame(
			['diffusion_tipo','section_tipo','term','model','parent','context','data'],
			$keys,
			'datum_group wire key order changed'
		);

		// context fields carry the column definitions
		$this->assertNotEmpty($datum->get_context());
		$context_field = $datum->get_context()[0];
		foreach (['term','tipo','model','parent','parser','columns'] as $key) {
			$this->assertObjectHasProperty($key, $context_field, "context field missing '$key'");
		}

		// the requested record is in the datum data
		$data = $datum->get_data();
		$this->assertNotEmpty($data, 'datum data is empty');
		$ids = array_map(fn($r) => (int)$r->section_id, $data);
		$this->assertContains($section_id, $ids, 'Requested record missing from datum');
	}//end test_diffuse_pipeline



}//end class dd_diffusion_api_Test
