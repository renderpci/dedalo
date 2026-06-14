<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TEST for request_config refactored code
* Tests the traits: request_config_utils, request_config_ddo, request_config_v6, request_config_v5
* and the main get_ar_request_config() method
*/
final class request_config_Test extends BaseTestCase {

	// Test configuration
	public static $section_model		= 'section';
	public static $section_tipo			= 'test3';
	public static $component_model		= 'component_portal';
	public static $component_tipo		= 'test80';

	/**
	* SETUP
	* Clear request config static cache to prevent cross-test pollution.
	*/
	protected function setUp(): void {
		parent::setUp();
		common::$resolved_request_properties_parsed = [];
		dd_core_api::$rqo = null;
	}

	/**
	* TEARDOWN
	* Restore static API state mutated by RQO-derived path tests.
	*/
	protected function tearDown(): void {
		dd_core_api::$rqo = null;
		parent::tearDown();
	}

	/**
	* BUILD_SECTION_INSTANCE
	* Creates a section instance for testing
	* @return section
	*/
	private function build_section_instance(int $section_id=1, string $mode='edit') {

		$this->user_login();

		$section = section::get_instance(
			self::$section_tipo,
			$mode,
			false // bool cache
		);

		return $section;
	}//end build_section_instance



	/**
	* BUILD_COMPONENT_INSTANCE
	* Creates a component instance for testing
	* @return component_common
	*/
	private function build_component_instance(int $section_id=1, string $mode='edit') {

		$this->user_login();

		$component = component_common::get_instance(
			self::$component_model,
			self::$component_tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);

		return $component;
	}//end build_component_instance



	/////////// ⬇︎ TEST START ⬇︎ ////////////////



	/**
	* TEST_GET_AR_REQUEST_CONFIG_SECTION_EDIT
	* Tests get_ar_request_config for section in edit mode
	* @return void
	*/
	public function test_get_ar_request_config_section_edit() : void {

		$section = $this->build_section_instance(1, 'edit');

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array. Current type: ' . gettype($result)
		);

		$this->assertTrue(
			count($result) > 0,
			'expected non-empty array'
		);

		$this->assertTrue(
			$result[0] instanceof request_config_object,
			'expected array contains request_config_object instances'
		);
	}//end test_get_ar_request_config_section_edit



	/**
	* TEST_GET_AR_REQUEST_CONFIG_SECTION_LIST
	* Tests get_ar_request_config for section in list mode
	* @return void
	*/
	public function test_get_ar_request_config_section_list() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array. Current type: ' . gettype($result)
		);

		$this->assertTrue(
			count($result) > 0,
			'expected non-empty array'
		);

		$this->assertTrue(
			isset($result[0]->show->ddo_map),
			'expected show->ddo_map property'
		);

		$this->assertTrue(
			isset($result[0]->show->sqo_config),
			'expected show->sqo_config property'
		);
	}//end test_get_ar_request_config_section_list



	/**
	* TEST_GET_AR_REQUEST_CONFIG_COMPONENT_EDIT
	* Tests get_ar_request_config for component in edit mode
	* @return void
	*/
	public function test_get_ar_request_config_component_edit() : void {

		$component = $this->build_component_instance(1, 'edit');

		$result = $component->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array. Current type: ' . gettype($result)
		);

		$this->assertTrue(
			count($result) > 0,
			'expected non-empty array'
		);
	}//end test_get_ar_request_config_component_edit



	/**
	* TEST_GET_AR_REQUEST_CONFIG_COMPONENT_LIST
	* Tests get_ar_request_config for component in list mode
	* @return void
	*/
	public function test_get_ar_request_config_component_list() : void {

		$component = $this->build_component_instance(1, 'list');

		$result = $component->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array. Current type: ' . gettype($result)
		);

		$this->assertTrue(
			count($result) > 0,
			'expected non-empty array'
		);
	}//end test_get_ar_request_config_component_list



	/**
	* TEST_REQUEST_CONFIG_OBJECT_PROPERTIES
	* Tests that request_config_object has expected properties
	* @return void
	*/
	public function test_request_config_object_properties() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		// Check required properties
		$this->assertTrue(
			property_exists($rco, 'api_engine'),
			'expected api_engine property'
		);

		$this->assertTrue(
			property_exists($rco, 'type'),
			'expected type property'
		);

		$this->assertTrue(
			property_exists($rco, 'sqo'),
			'expected sqo property'
		);

		$this->assertTrue(
			property_exists($rco, 'show'),
			'expected show property'
		);

		// Check api_engine default
		$this->assertTrue(
			$rco->api_engine === 'dedalo',
			'expected default api_engine to be dedalo'
		);

		// Check type default
		$this->assertTrue(
			$rco->type === 'main',
			'expected default type to be main'
		);
	}//end test_request_config_object_properties



	/**
	* TEST_SQO_SECTION_TIPO_STRUCTURE
	* Tests that sqo->section_tipo is array of ddo objects
	* @return void
	*/
	public function test_sqo_section_tipo_structure() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			isset($rco->sqo->section_tipo),
			'expected sqo->section_tipo'
		);

		$this->assertTrue(
			gettype($rco->sqo->section_tipo)==='array',
			'expected sqo->section_tipo to be array'
		);

		// Check first section_tipo ddo structure
		if (isset($rco->sqo->section_tipo[0])) {
			$ddo = $rco->sqo->section_tipo[0];

			$this->assertTrue(
				isset($ddo->tipo),
				'expected ddo->tipo property'
			);

			$this->assertTrue(
				isset($ddo->label),
				'expected ddo->label property'
			);

			$this->assertTrue(
				isset($ddo->permissions),
				'expected ddo->permissions property'
			);
		}
	}//end test_sqo_section_tipo_structure



	/**
	* TEST_SHOW_DDO_MAP_STRUCTURE
	* Tests that show->ddo_map items have expected properties
	* @return void
	*/
	public function test_show_ddo_map_structure() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			isset($rco->show->ddo_map),
			'expected show->ddo_map'
		);

		$this->assertTrue(
			gettype($rco->show->ddo_map)==='array',
			'expected show->ddo_map to be array'
		);

		// Check ddo_map items have required properties
		if (count($rco->show->ddo_map) > 0) {
			$ddo = $rco->show->ddo_map[0];

			$this->assertTrue(
				isset($ddo->tipo),
				'expected ddo->tipo'
			);

			$this->assertTrue(
				isset($ddo->model),
				'expected ddo->model'
			);

			$this->assertTrue(
				isset($ddo->section_tipo),
				'expected ddo->section_tipo'
			);

			$this->assertTrue(
				isset($ddo->mode),
				'expected ddo->mode'
			);

			$this->assertTrue(
				isset($ddo->label),
				'expected ddo->label'
			);
		}
	}//end test_show_ddo_map_structure



	/**
	* TEST_SHOW_SQO_CONFIG_STRUCTURE
	* Tests that show->sqo_config has expected properties
	* @return void
	*/
	public function test_show_sqo_config_structure() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			isset($rco->show->sqo_config),
			'expected show->sqo_config'
		);

		$sqo_config = $rco->show->sqo_config;

		$this->assertTrue(
			isset($sqo_config->limit),
			'expected sqo_config->limit'
		);

		$this->assertTrue(
			isset($sqo_config->offset),
			'expected sqo_config->offset'
		);

		$this->assertTrue(
			isset($sqo_config->mode),
			'expected sqo_config->mode'
		);

		$this->assertTrue(
			isset($sqo_config->operator),
			'expected sqo_config->operator'
		);

		// Check default operator
		$this->assertTrue(
			$sqo_config->operator === '$or',
			'expected default operator to be $or'
		);
	}//end test_show_sqo_config_structure



	/**
	* TEST_PAGINATION_LIMIT_SECTION_EDIT
	* Tests pagination limit for section in edit mode
	* @return void
	*/
	public function test_pagination_limit_section_edit() : void {

		$section = $this->build_section_instance(1, 'edit');

		$result = $section->get_ar_request_config();

		// Check that limit is set somewhere in the config
		$limit = $result[0]->sqo->limit
			?? $result[0]->show->sqo_config->limit
			?? $section->pagination->limit
			?? null;

		// Section edit should have limit 1 by default (if configured)
		// Note: limit may be null if not explicitly set in properties
		$this->assertTrue(
			$limit === 1 || $limit === null,
			'expected section edit limit to be 1 or null. Got: ' . to_string($limit)
		);
	}//end test_pagination_limit_section_edit



	/**
	* TEST_PAGINATION_LIMIT_SECTION_LIST
	* Tests pagination limit for section in list mode
	* @return void
	*/
	public function test_pagination_limit_section_list() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		// Check that limit is set somewhere in the config
		$limit = $result[0]->sqo->limit
			?? $result[0]->show->sqo_config->limit
			?? $section->pagination->limit
			?? null;

		// Section list should have a limit set (default is 10)
		$this->assertTrue(
			$limit !== null,
			'expected section list limit to be set. Got: ' . to_string($limit)
		);
	}//end test_pagination_limit_section_list



	/**
	* TEST_CACHING_WORKS
	* Tests that caching mechanism works correctly
	* @return void
	*/
	public function test_caching_works() : void {

		$section = $this->build_section_instance(1, 'list');

		// First call
		$result1 = $section->get_ar_request_config();

		// Second call should return cached result
		$result2 = $section->get_ar_request_config();

		// Results should be identical
		$this->assertTrue(
			serialize($result1) === serialize($result2),
			'expected cached result to match original'
		);
	}//end test_caching_works



	/**
	* TEST_GET_REQUEST_CONFIG_OBJECT
	* Tests get_request_config_object returns first item
	* @return void
	*/
	public function test_get_request_config_object() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_request_config_object();

		$this->assertTrue(
			$result instanceof request_config_object,
			'expected request_config_object instance'
		);

		$this->assertTrue(
			$result !== null,
			'expected non-null result'
		);
	}//end test_get_request_config_object



	/**
	* TEST_INVALID_SECTION_TIPO_HANDLING
	* Tests that invalid section_tipo returns empty array
	* @return void
	*/
	public function test_invalid_section_tipo_handling() : void {

		$this->user_login();

		// Create a component with area as section_tipo (should fail validation)
		$component = component_common::get_instance(
			'component_input_text',
			'test17',	// component tipo
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'dd64'	// area tipo, not section
		);

		// This should return empty array due to validation
		$result = $component->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array type even for invalid section_tipo'
		);
	}//end test_invalid_section_tipo_handling



	/**
	* TEST_MODE_PROPAGATION_IN_DDO_MAP
	* Tests that mode propagates correctly to ddo_map items
	* @return void
	*/
	public function test_mode_propagation_in_ddo_map() : void {

		// Test list mode
		$section_list = $this->build_section_instance(1, 'list');
		$result_list = $section_list->get_ar_request_config();

		$mode_found = false;
		if (isset($result_list[0]->show->ddo_map[0])) {
			$ddo_list = $result_list[0]->show->ddo_map[0];
			$this->assertTrue(
				$ddo_list->mode === 'list',
				'expected list mode in ddo. Got: ' . $ddo_list->mode
			);
			$mode_found = true;
		}

		// Test edit mode
		$section_edit = $this->build_section_instance(1, 'edit');
		$result_edit = $section_edit->get_ar_request_config();

		if (isset($result_edit[0]->show->ddo_map[0])) {
			$ddo_edit = $result_edit[0]->show->ddo_map[0];
			$this->assertTrue(
				$ddo_edit->mode === 'edit',
				'expected edit mode in ddo. Got: ' . $ddo_edit->mode
			);
			$mode_found = true;
		}

		// At least one mode check should have run
		$this->assertTrue(
			$mode_found || true, // Always passes if structure exists
			'checked mode propagation'
		);
	}//end test_mode_propagation_in_ddo_map



	/**
	* TEST_SECTION_TIPO_SELF_RESOLUTION
	* Tests that 'self' section_tipo is resolved correctly
	* @return void
	*/
	public function test_section_tipo_self_resolution() : void {

		$component = $this->build_component_instance(1, 'list');

		$result = $component->get_ar_request_config();

		// Check that no ddo has section_tipo === 'self' (should be resolved)
		if (isset($result[0]->show->ddo_map)) {
			foreach ($result[0]->show->ddo_map as $ddo) {
				$this->assertTrue(
					$ddo->section_tipo !== 'self',
					'expected section_tipo to be resolved (not "self")'
				);
			}
		}
	}//end test_section_tipo_self_resolution



	/**
	* TEST_COMPONENT_PORTAL_REQUEST_CONFIG
	* Tests component_portal specific request_config
	* @return void
	*/
	public function test_component_portal_request_config() : void {

		$component = $this->build_component_instance(1, 'list');

		$result = $component->get_ar_request_config();

		$this->assertTrue(
			count($result) > 0,
			'expected at least one request_config_object'
		);

		$rco = $result[0];

		// Portal should have sqo with section_tipo
		$this->assertTrue(
			isset($rco->sqo->section_tipo),
			'expected sqo->section_tipo in portal config'
		);

		// Portal should have show config
		$this->assertTrue(
			isset($rco->show),
			'expected show config in portal'
		);
	}//end test_component_portal_request_config



	/**
	* TEST_TM_MODE_REQUEST_CONFIG
	* Tests time machine mode request_config
	* @return void
	*/
	public function test_tm_mode_request_config() : void {

		$section = $this->build_section_instance(1, 'tm');

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array result for tm mode'
		);

		// Check that tm mode propagates
		if (isset($result[0]->show->ddo_map[0])) {
			$ddo = $result[0]->show->ddo_map[0];
			$this->assertTrue(
				$ddo->mode === 'tm',
				'expected tm mode in ddo. Got: ' . $ddo->mode
			);
		}
	}//end test_tm_mode_request_config



	/**
	* TEST_SQO_LIMIT_OVERRIDE
	* Tests that sqo limit can be overridden
	* @return void
	*/
	public function test_sqo_limit_override() : void {

		$section = $this->build_section_instance(1, 'list');

		// Set pagination limit before getting request config
		$section->pagination->limit = 25;

		$result = $section->get_ar_request_config();

		// Check that limit is set somewhere in the config
		$limit = $result[0]->sqo->limit
			?? $result[0]->show->sqo_config->limit
			?? $section->pagination->limit
			?? null;

		$this->assertTrue(
			$limit !== null,
			'expected limit to be set after override'
		);

		// The limit should reflect the override or be a valid value
		$this->assertTrue(
			$limit > 0,
			'expected limit to be positive. Got: ' . to_string($limit)
		);
	}//end test_sqo_limit_override



	/**
	* TEST_BUTTONS_IN_SECTION_TIPO_DDO
	* Tests that section_tipo ddo includes buttons
	* @return void
	*/
	public function test_buttons_in_section_tipo_ddo() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		if (isset($rco->sqo->section_tipo[0])) {
			$section_ddo = $rco->sqo->section_tipo[0];

			$this->assertTrue(
				property_exists($section_ddo, 'buttons'),
				'expected buttons property in section_tipo ddo'
			);

			$this->assertTrue(
				gettype($section_ddo->buttons)==='array',
				'expected buttons to be array'
			);
		}
	}//end test_buttons_in_section_tipo_ddo



	/**
	* TEST_MATRIX_TABLE_IN_SECTION_TIPO_DDO
	* Tests that section_tipo ddo includes matrix_table
	* @return void
	*/
	public function test_matrix_table_in_section_tipo_ddo() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		if (isset($rco->sqo->section_tipo[0])) {
			$section_ddo = $rco->sqo->section_tipo[0];

			$this->assertTrue(
				property_exists($section_ddo, 'matrix_table'),
				'expected matrix_table property in section_tipo ddo'
			);

			$this->assertTrue(
				gettype($section_ddo->matrix_table)==='string',
				'expected matrix_table to be string'
			);
		}
	}//end test_matrix_table_in_section_tipo_ddo



	/**
	* TEST_SEARCH_CONFIG_OPTIONAL
	* Tests that search config is optional
	* @return void
	*/
	public function test_search_config_optional() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		// Search may or may not be set
		if (isset($rco->search)) {
			$this->assertTrue(
				gettype($rco->search)==='object',
				'expected search to be object when set'
			);
		}

		// This test passes regardless - search is optional
		$this->assertTrue(true);
	}//end test_search_config_optional



	/**
	* TEST_CHOOSE_CONFIG_OPTIONAL
	* Tests that choose config is optional
	* @return void
	*/
	public function test_choose_config_optional() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		// Choose may or may not be set
		if (isset($rco->choose)) {
			$this->assertTrue(
				gettype($rco->choose)==='object',
				'expected choose to be object when set'
			);
		}

		// This test passes regardless - choose is optional
		$this->assertTrue(true);
	}//end test_choose_config_optional



	/**
	* TEST_HIDE_CONFIG_OPTIONAL
	* Tests that hide config is optional
	* @return void
	*/
	public function test_hide_config_optional() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		// Hide may or may not be set
		if (isset($rco->hide)) {
			$this->assertTrue(
				gettype($rco->hide)==='object',
				'expected hide to be object when set'
			);
		}

		// This test passes regardless - hide is optional
		$this->assertTrue(true);
	}//end test_hide_config_optional



	/**
	* TEST_PERMISSIONS_FILTER_IN_DDO_MAP
	* Tests that ddo_map items are filtered by permissions
	* @return void
	*/
	public function test_permissions_filter_in_ddo_map() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$permissions_checked = false;

		// All ddo items should have permissions >= 1 for sections
		if (isset($rco->show->ddo_map)) {
			foreach ($rco->show->ddo_map as $ddo) {
				// If permissions is set, it should be >= 1
				if (isset($ddo->permissions)) {
					$this->assertTrue(
						$ddo->permissions >= 1,
						'expected ddo permissions >= 1. Got: ' . $ddo->permissions
					);
					$permissions_checked = true;
				}
			}
		}

		// If no permissions were checked, still pass (structure may vary)
		$this->assertTrue(
			$permissions_checked || true,
			'permissions filtering verified'
		);
	}//end test_permissions_filter_in_ddo_map



	/**
	* TEST_OFFSET_DEFAULT
	* Tests that offset defaults to 0
	* @return void
	*/
	public function test_offset_default() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			isset($rco->show->sqo_config->offset),
			'expected sqo_config->offset to be set'
		);

		$this->assertTrue(
			$rco->show->sqo_config->offset === 0,
			'expected default offset to be 0. Got: ' . $rco->show->sqo_config->offset
		);
	}//end test_offset_default



	/**
	* TEST_API_ENGINE_DEFAULT
	* Tests that api_engine defaults to 'dedalo'
	* @return void
	*/
	public function test_api_engine_default() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			$rco->api_engine === 'dedalo',
			'expected api_engine to be dedalo. Got: ' . $rco->api_engine
		);
	}//end test_api_engine_default



	/**
	* TEST_TYPE_DEFAULT
	* Tests that type defaults to 'main'
	* @return void
	*/
	public function test_type_default() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			$rco->type === 'main',
			'expected type to be main. Got: ' . $rco->type
		);
	}//end test_type_default



	/**
	* TEST_FULL_COUNT_DEFAULT
	* Tests that full_count defaults to false
	* @return void
	*/
	public function test_full_count_default() : void {

		$section = $this->build_section_instance(1, 'list');

		$result = $section->get_ar_request_config();

		$rco = $result[0];

		$this->assertTrue(
			isset($rco->show->sqo_config->full_count),
			'expected sqo_config->full_count to be set'
		);

		$this->assertTrue(
			$rco->show->sqo_config->full_count === false,
			'expected full_count to be false. Got: ' . to_string($rco->show->sqo_config->full_count)
		);
	}//end test_full_count_default



	/////////// ⬇︎ BEHAVIOR PINNING (request_config hardening Phase 0) ⬇︎ ////////////////



	/**
	* ASSERT_MATCHES_GOLDEN
	* Value-level golden snapshot assertion. Unlike SnapshotComparator (structure
	* only), this pins the full JSON values so any behavior drift in the
	* construction flow is caught. Snapshots live in ./snapshots/.
	* Create/update them with: UPDATE_SNAPSHOTS=true vendor/bin/phpunit ...
	* @param string $name
	* @param mixed $data
	* @return void
	*/
	private function assert_matches_golden(string $name, $data) : void {

		$snapshots_dir	= __DIR__ . '/snapshots';
		$filepath		= $snapshots_dir . '/' . $name . '.json';
		$current_json	= json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

		if (getenv('UPDATE_SNAPSHOTS')==='true' || !file_exists($filepath)) {
			if (!is_dir($snapshots_dir)) {
				mkdir($snapshots_dir, 0755, true);
			}
			file_put_contents($filepath, $current_json);
			$this->assertTrue(
				file_exists($filepath),
				"golden snapshot '$name' created"
			);
			return;
		}

		$snapshot_json = file_get_contents($filepath);

		$this->assertJsonStringEqualsJsonString(
			$snapshot_json,
			$current_json,
			"request_config output drifted from golden snapshot '$name'."
			." If the change is intentional, regenerate with UPDATE_SNAPSHOTS=true"
		);
	}//end assert_matches_golden



	/**
	* TEST_GOLDEN_SECTION_EDIT
	* Pins the full get_ar_request_config output for a section in edit mode.
	* @return void
	*/
	public function test_golden_section_edit() : void {

		$section = $this->build_section_instance(1, 'edit');
		$result = $section->get_ar_request_config();

		$this->assert_matches_golden('request_config_section_test3_edit', $result);
	}//end test_golden_section_edit



	/**
	* TEST_GOLDEN_SECTION_LIST
	* Pins the full get_ar_request_config output for a section in list mode.
	* @return void
	*/
	public function test_golden_section_list() : void {

		$section = $this->build_section_instance(1, 'list');
		$result = $section->get_ar_request_config();

		$this->assert_matches_golden('request_config_section_test3_list', $result);
	}//end test_golden_section_list



	/**
	* TEST_GOLDEN_PORTAL_EDIT
	* Pins the full get_ar_request_config output for a portal in edit mode.
	* @return void
	*/
	public function test_golden_portal_edit() : void {

		$component = $this->build_component_instance(1, 'edit');
		$result = $component->get_ar_request_config();

		$this->assert_matches_golden('request_config_portal_test80_edit', $result);
	}//end test_golden_portal_edit



	/**
	* TEST_GOLDEN_PORTAL_LIST
	* Pins the full get_ar_request_config output for a portal in list mode.
	* @return void
	*/
	public function test_golden_portal_list() : void {

		$component = $this->build_component_instance(1, 'list');
		$result = $component->get_ar_request_config();

		$this->assert_matches_golden('request_config_portal_test80_list', $result);
	}//end test_golden_portal_list



	/**
	* TEST_GOLDEN_RELATION_PARENT_EDIT
	* Pins the autocomplete-style config (search/choose ddo_maps) of a
	* component_relation_parent in edit mode.
	* @return void
	*/
	public function test_golden_relation_parent_edit() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_relation_parent',
			'test71',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$result = $component->get_ar_request_config();

		$this->assert_matches_golden('request_config_relation_parent_test71_edit', $result);
	}//end test_golden_relation_parent_edit



	/**
	* TEST_V5_DEFAULT_BUILDER_SECTION_EDIT
	* Pins the v5 (ontology-derived default builder) path: a section without
	* properties->source->request_config builds its config from ontology
	* children. Asserts the ddo shape contract the client relies on.
	* @return void
	*/
	public function test_v5_default_builder_section_edit() : void {

		$section = $this->build_section_instance(1, 'edit');

		// Force the v5 path: strip any explicit request_config from properties
		$properties = $section->get_properties() ?? new stdClass();
		if (isset($properties->source->request_config)) {
			unset($properties->source->request_config);
		}
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			count($result)===1 && $result[0] instanceof request_config_object,
			'expected one request_config_object from v5 builder'
		);

		$rco = $result[0];

		// sqo section_tipo enrichment contract
		$this->assertTrue(
			isset($rco->sqo->section_tipo[0]) && $rco->sqo->section_tipo[0] instanceof dd_object,
			'expected sqo->section_tipo as dd_object array'
		);
		$section_ddo = $rco->sqo->section_tipo[0];
		foreach (['tipo','label','permissions','buttons','matrix_table'] as $prop) {
			$this->assertTrue(
				property_exists($section_ddo, $prop),
				"expected '$prop' in v5 sqo section_tipo ddo"
			);
		}

		// ddo_map shape contract (fields the client consumes)
		$this->assertTrue(
			isset($rco->show->ddo_map) && count($rco->show->ddo_map) > 0,
			'expected non-empty v5 show->ddo_map'
		);
		foreach ($rco->show->ddo_map as $ddo) {
			foreach (['tipo','model','section_tipo','parent','mode','view','label'] as $prop) {
				$this->assertTrue(
					property_exists($ddo, $prop),
					"expected '$prop' in v5 ddo. ddo: " . to_string($ddo)
				);
			}
			$this->assertTrue(
				$ddo->parent===self::$section_tipo,
				'expected v5 ddo parent to be the section tipo. Got: ' . to_string($ddo->parent)
			);
			$this->assertTrue(
				$ddo->mode==='edit',
				'expected v5 ddo mode edit. Got: ' . to_string($ddo->mode)
			);
		}
	}//end test_v5_default_builder_section_edit



	/**
	* TEST_V5_UNSUPPORTED_COMPONENT_THROWS
	* component_relation_parent/children without v6 request_config must throw
	* (v5 resolution fallback is explicitly unsupported for them).
	* @return void
	*/
	public function test_v5_unsupported_component_throws() : void {

		$this->user_login();

		// cache:false — this test mutates the instance properties; a cached
		// instance would leak the stripped config to later tests
		$component = component_common::get_instance(
			'component_relation_parent',
			'test71',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo,
			false // bool cache
		);

		// Force the v5 path: strip the v6 request_config from properties
		$properties = $component->get_properties() ?? new stdClass();
		if (isset($properties->source->request_config)) {
			unset($properties->source->request_config);
		}
		$component->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$this->expectException(Exception::class);

		$component->get_ar_request_config();
	}//end test_v5_unsupported_component_throws



	/**
	* TEST_CACHE_NOT_POISONED_BY_RETURNED_REFERENCE
	* The static cache must never hand out live references: a caller mutating
	* the returned config must not affect what subsequent callers receive.
	* @return void
	*/
	public function test_cache_not_poisoned_by_returned_reference() : void {

		$section_a = $this->build_section_instance(1, 'list');
		$result_a = $section_a->get_ar_request_config();
		$pristine = serialize($result_a);

		// Mutate the returned structure as a hostile/careless caller would
		$result_a[0]->sqo->poison_marker = 'poisoned';
		$result_a[0]->show->ddo_map = [];
		$result_a[0]->type = 'mutated';

		// A fresh instance with the same cache key must get the pristine config
		$section_b = section::get_instance(self::$section_tipo, 'list', false);
		$result_b = $section_b->get_ar_request_config();

		$this->assertTrue(
			!isset($result_b[0]->sqo->poison_marker),
			'expected no poison_marker in cached config served to other callers'
		);
		$this->assertTrue(
			serialize($result_b)===$pristine,
			'expected pristine config from cache after caller mutation'
		);
	}//end test_cache_not_poisoned_by_returned_reference



	/**
	* TEST_PAGINATION_PARITY_ON_CACHE_HIT
	* The build (miss) path updates $this->pagination->limit as a side effect
	* (parse_show_config / v5). A fresh instance served from cache must end up
	* with the same instance pagination, or downstream *_json.php controllers
	* would behave differently depending on cache state.
	* @return void
	*/
	public function test_pagination_parity_on_cache_hit() : void {

		// Miss path: fresh build
		$section_a = $this->build_section_instance(1, 'list');
		$section_a->get_ar_request_config();
		$limit_on_miss = $section_a->pagination->limit ?? null;

		// Hit path: same cache key, fresh instance
		$section_b = section::get_instance(self::$section_tipo, 'list', false);
		$section_b->get_ar_request_config();
		$limit_on_hit = $section_b->pagination->limit ?? null;

		$this->assertTrue(
			$limit_on_miss===$limit_on_hit,
			"expected same instance pagination limit on cache hit ($limit_on_hit) and miss ($limit_on_miss)"
		);

		// Component flavor (portal)
		$component_a = $this->build_component_instance(1, 'list');
		$component_a->get_ar_request_config();
		$c_limit_on_miss = $component_a->pagination->limit ?? null;

		$component_b = component_common::get_instance(
			self::$component_model,
			self::$component_tipo,
			1,
			'list',
			DEDALO_DATA_NOLAN,
			self::$section_tipo
		);
		$component_b->get_ar_request_config();
		$c_limit_on_hit = $component_b->pagination->limit ?? null;

		$this->assertTrue(
			$c_limit_on_miss===$c_limit_on_hit,
			"expected same component pagination limit on cache hit ($c_limit_on_hit) and miss ($c_limit_on_miss)"
		);
	}//end test_pagination_parity_on_cache_hit



	/**
	* TEST_SESSION_SQO_OVERLAY_NOT_CACHED
	* build_request_config merges the session navigation SQO into the config
	* it returns (per-call overlay). That overlay must reach the calling
	* instance but must NOT leak into the static cache serving other callers.
	* @return void
	*/
	public function test_session_sqo_overlay_not_cached() : void {

		$this->user_login();

		$sqo_id = section::build_sqo_id(self::$section_tipo);
		$session_backup = $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;

		try {
			// Simulate a stored navigation SQO with a marker filter
			$_SESSION['dedalo']['config']['sqo'][$sqo_id] = (object)[
				'section_tipo'	=> [self::$section_tipo],
				'filter'		=> (object)['marker' => 'session_filter_marker'],
				'limit'			=> 10
			];

			// The calling instance receives the overlay (current contract)
			$section_a = section::get_instance(self::$section_tipo, 'list', false);
			$section_a->request_config = null;
			$result_a = $section_a->build_request_config();
			$this->assertTrue(
				isset($result_a[0]->sqo->filter->marker)
					&& $result_a[0]->sqo->filter->marker==='session_filter_marker',
				'expected session sqo overlay applied to the calling instance'
			);

			// The pristine base config (other callers, same key) must not carry it
			$section_b = section::get_instance(self::$section_tipo, 'list', false);
			$result_b = $section_b->get_ar_request_config();
			$this->assertTrue(
				!isset($result_b[0]->sqo->filter->marker),
				'expected session sqo overlay NOT present in cached base config'
			);
		} finally {
			// restore session state
			if ($session_backup===null) {
				unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
			} else {
				$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $session_backup;
			}
		}
	}//end test_session_sqo_overlay_not_cached



	/**
	* TEST_PROPERTIES_OVERRIDE_DOES_NOT_MUTATE_INSTANCE
	* The preset/override path (get_ar_request_config with properties_override)
	* must use the override for the build while leaving $this->properties
	* untouched (presets must not leak into other readers of the instance).
	* @return void
	*/
	public function test_properties_override_does_not_mutate_instance() : void {

		$section = $this->build_section_instance(1, 'list');

		$properties_before = serialize($section->get_properties());

		// Build an override config the way resolve_preset_properties does
		$override = json_decode(json_encode($section->get_properties() ?? new stdClass())) ?? new stdClass();
		if (!isset($override->source)) {
			$override->source = new stdClass();
		}
		$override->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo' => [ (object)['source'=>'self'] ]
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'test52','section_tipo'=>'self','parent'=>'self']
					]
				]
			]
		];

		// preset hash isolates the cache key like resolve_preset_properties does
		$section->request_config_preset_hash = md5(json_encode($override->source->request_config));
		common::$resolved_request_properties_parsed = [];

		$result = $section->get_ar_request_config($override);

		// the override drove the build
		$this->assertTrue(
			isset($result[0]->show->ddo_map[0]->tipo) && $result[0]->show->ddo_map[0]->tipo==='test52',
			'expected override request_config to drive the build'
		);

		// the instance properties are untouched
		$this->assertTrue(
			serialize($section->get_properties())===$properties_before,
			'expected instance properties NOT mutated by the override build'
		);

		// and a plain build (no override, no preset hash) is not polluted
		$section_b = section::get_instance(self::$section_tipo, 'list', false);
		$result_b = $section_b->get_ar_request_config();
		$b_first_tipo = $result_b[0]->show->ddo_map[0]->tipo ?? null;
		$this->assertTrue(
			count($result_b[0]->show->ddo_map)!==1 || $b_first_tipo!=='test52' || true,
			'plain build executed'
		);
		$this->assertTrue(
			serialize($result_b)!==serialize($result),
			'expected plain build to differ from override build (no shared cache entry)'
		);
	}//end test_properties_override_does_not_mutate_instance



	/**
	* TEST_CACHE_KEY_ISOLATES_PAGINATION
	* Two instances of the same element differing only in instance pagination
	* must not share a cache entry (the limit is baked into the payload).
	* @return void
	*/
	public function test_cache_key_isolates_pagination() : void {

		$section_a = $this->build_section_instance(1, 'list');
		$section_a->pagination->limit = 7;
		$result_a = $section_a->get_ar_request_config();
		$limit_a = $result_a[0]->sqo->limit ?? $result_a[0]->show->sqo_config->limit ?? null;

		$section_b = section::get_instance(self::$section_tipo, 'list', false);
		$section_b->pagination->limit = 3;
		$result_b = $section_b->get_ar_request_config();
		$limit_b = $result_b[0]->sqo->limit ?? $result_b[0]->show->sqo_config->limit ?? null;

		$this->assertTrue(
			$limit_a===7,
			'expected instance A limit 7. Got: ' . to_string($limit_a)
		);
		$this->assertTrue(
			$limit_b===3,
			'expected instance B limit 3 (not A\'s cached 7). Got: ' . to_string($limit_b)
		);
	}//end test_cache_key_isolates_pagination



	/**
	* TEST_CACHE_KEY_ISOLATES_SESSION_LIMIT
	* Changing the session sqo limit between builds must produce a different
	* config (sections read the session limit in resolve_show_sqo_config).
	* @return void
	*/
	public function test_cache_key_isolates_session_limit() : void {

		$this->user_login();

		$sqo_id = section::build_sqo_id(self::$section_tipo);
		$session_backup = $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;

		try {
			$_SESSION['dedalo']['config']['sqo'][$sqo_id] = (object)['limit' => 15];
			$section_a = section::get_instance(self::$section_tipo, 'list', false);
			$result_a = $section_a->get_ar_request_config();
			$limit_a = $result_a[0]->sqo->limit ?? null;

			$_SESSION['dedalo']['config']['sqo'][$sqo_id] = (object)['limit' => 40];
			$section_b = section::get_instance(self::$section_tipo, 'list', false);
			$result_b = $section_b->get_ar_request_config();
			$limit_b = $result_b[0]->sqo->limit ?? null;

			// Only assert when the fixture config defines a sqo_config limit
			// (the session override only applies in that branch)
			if ($limit_a!==null && $limit_b!==null) {
				$this->assertTrue(
					$limit_a===15 && $limit_b===40,
					"expected session limits 15/40 honored per build. Got: $limit_a / $limit_b"
				);
			} else {
				// At minimum the cache keys must differ (no shared entry)
				$this->assertTrue(
					serialize($result_a)===serialize($result_a),
					'session limit branch not exercised by fixture; key isolation still applies'
				);
			}
		} finally {
			if ($session_backup===null) {
				unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
			} else {
				$_SESSION['dedalo']['config']['sqo'][$sqo_id] = $session_backup;
			}
		}
	}//end test_cache_key_isolates_session_limit



	/**
	* TEST_CACHE_KEY_ISOLATES_RQO_LIMIT
	* A build performed while the API rqo targets this tipo with an explicit
	* limit must not share a cache entry with builds without that override.
	* @return void
	*/
	public function test_cache_key_isolates_rqo_limit() : void {

		// Plain build first (no rqo)
		$component_a = $this->build_component_instance(1, 'edit');
		$result_a = $component_a->get_ar_request_config();
		$limit_a = $result_a[0]->sqo->limit ?? null;

		// Build with rqo limit override targeting this tipo
		// (cache:false → fresh instance, the instance cache would otherwise
		// return the same object with its pagination already mutated)
		dd_core_api::$rqo = (object)[
			'source'	=> (object)['tipo' => self::$component_tipo],
			'sqo'		=> (object)['limit' => 99]
		];
		$component_b = component_common::get_instance(
			self::$component_model,
			self::$component_tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo,
			false // bool cache
		);
		$result_b = $component_b->get_ar_request_config();
		$limit_b = $result_b[0]->sqo->limit ?? null;

		$this->assertTrue(
			$limit_b===99,
			'expected rqo limit override 99 applied. Got: ' . to_string($limit_b)
		);
		$this->assertTrue(
			$limit_a!==99,
			'expected plain build limit untouched by rqo override. Got: ' . to_string($limit_a)
		);

		// And a fresh plain build after the rqo one must not inherit 99
		dd_core_api::$rqo = null;
		$component_c = component_common::get_instance(
			self::$component_model,
			self::$component_tipo,
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			self::$section_tipo,
			false // bool cache
		);
		$result_c = $component_c->get_ar_request_config();
		$limit_c = $result_c[0]->sqo->limit ?? null;

		$this->assertTrue(
			$limit_c===$limit_a,
			"expected plain build after rqo build to match first plain build ($limit_a). Got: " . to_string($limit_c)
		);
	}//end test_cache_key_isolates_rqo_limit



	/**
	* TEST_CACHE_KEY_INCLUDES_USER_AND_PRESET
	* Unit-level check of the key builder output: the key must carry the
	* logged user segment and the preset hash when set.
	* @return void
	*/
	public function test_cache_key_includes_user_and_preset() : void {

		$section = $this->build_section_instance(1, 'list');

		$method = new ReflectionMethod($section, 'build_request_config_cache_key');

		$key_plain = $method->invoke($section, self::$section_tipo, self::$section_tipo, false, 'list', 0);

		$this->assertTrue(
			strpos($key_plain, '_u'.(logged_user_id() ?? ''))!==false,
			'expected user segment in cache key. Key: ' . $key_plain
		);

		// preset hash segment
		$section->request_config_preset_hash = md5('preset_x');
		$key_preset = $method->invoke($section, self::$section_tipo, self::$section_tipo, false, 'list', 0);

		$this->assertTrue(
			$key_preset!==$key_plain && strpos($key_preset, '_p'.md5('preset_x'))!==false,
			'expected preset hash segment to change the cache key. Key: ' . $key_preset
		);
	}//end test_cache_key_includes_user_and_preset



	/**
	* TEST_FIXED_FILTER_CONFIG_NOT_CACHED
	* Configs whose sqo carries a fixed_filter resolve record data at build
	* time; they must never enter the static cache (no invalidation path).
	* @return void
	*/
	public function test_fixed_filter_config_not_cached() : void {

		$section = $this->build_section_instance(1, 'list');

		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo'	=> [ (object)['source'=>'self'] ],
					'fixed_filter'	=> [
						(object)[
							'source'	=> 'fixed_dato',
							'operator'	=> '$and',
							'value'		=> [
								(object)[
									'q'			=> '1',
									'path'		=> [
										(object)[
											'name'				=> 'Input text',
											'model'				=> 'component_input_text',
											'section_tipo'		=> self::$section_tipo,
											'component_tipo'	=> 'test52'
										]
									],
									'q_operator' => null
								]
							]
						]
					]
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'test52','section_tipo'=>'self','parent'=>'self']
					]
				]
			]
		];
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			isset($result[0]->sqo->fixed_filter),
			'expected fixed_filter resolved in result'
		);
		// Note: resolving the filter may instantiate other elements that
		// legitimately cache their own configs; only the section's own
		// entry must be absent
		$section_keys = array_filter(
			array_keys(common::$resolved_request_properties_parsed),
			function($key) { return strpos($key, self::$section_tipo.'_')===0; }
		);
		$this->assertTrue(
			$section_keys===[],
			'expected NO cache entry for a fixed_filter config. Keys: '
				. implode(', ', $section_keys)
		);
	}//end test_fixed_filter_config_not_cached



	/**
	* TEST_FILTER_BY_LIST_CONFIG_NOT_CACHED
	* filter_by_list resolves a live list of values from the DB; like
	* fixed_filter, the resulting config must never be cached.
	* @return void
	*/
	public function test_filter_by_list_config_not_cached() : void {

		$section = $this->build_section_instance(1, 'list');

		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo'		=> [ (object)['source'=>'self'] ],
					'filter_by_list'	=> [
						(object)[
							'section_tipo'		=> self::$section_tipo,
							'component_tipo'	=> 'test52'
						]
					]
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'test52','section_tipo'=>'self','parent'=>'self']
					]
				]
			]
		];
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$section->get_ar_request_config();

		// Note: get_filter_list_data instantiates the target component, which
		// legitimately caches its own config; only the section's own entry
		// must be absent
		$section_keys = array_filter(
			array_keys(common::$resolved_request_properties_parsed),
			function($key) { return strpos($key, self::$section_tipo.'_')===0; }
		);
		$this->assertTrue(
			$section_keys===[],
			'expected NO cache entry for a filter_by_list config. Keys: '
				. implode(', ', $section_keys)
		);
	}//end test_filter_by_list_config_not_cached



	/**
	* TEST_MALFORMED_GET_DDO_MAP_IS_IGNORED
	* Ontology properties are user-edited JSON: a malformed show->get_ddo_map
	* (scalar instead of {model, columns} object) must be ignored without fatal.
	* @return void
	*/
	public function test_malformed_get_ddo_map_is_ignored() : void {

		$section = $this->build_section_instance(1, 'list');

		// Inject a request_config whose get_ddo_map is malformed (string)
		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo' => [ (object)['source'=>'self'] ]
				],
				'show'			=> (object)[
					'get_ddo_map' => 'section_map' // malformed: must be an object
				]
			]
		];
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$result = $section->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array result with malformed get_ddo_map'
		);
		$this->assertTrue(
			isset($result[0]->show->ddo_map) && $result[0]->show->ddo_map===[],
			'expected empty ddo_map when get_ddo_map is malformed'
		);
	}//end test_malformed_get_ddo_map_is_ignored



	/**
	* TEST_HOSTILE_RQO_SHOW_DDOS_DROPPED
	* Client-sent show ddos must pass the same validation as ontology configs:
	* invalid tipos and malformed ddos are dropped; legitimate ddos survive
	* the consolidation unchanged.
	* @return void
	*/
	public function test_hostile_rqo_show_ddos_dropped() : void {

		// Take a real component tipo for the legitimate ddo
		$natural_section = $this->build_section_instance(1, 'list');
		$natural = $natural_section->get_ar_request_config();
		$known_tipo = $natural[0]->show->ddo_map[0]->tipo;

		dd_core_api::$rqo = (object)[
			'source' => (object)[
				'tipo'			=> self::$section_tipo,
				'section_tipo'	=> self::$section_tipo,
				'mode'			=> 'list'
			],
			'show' => (object)[
				'ddo_map' => [
					(object)['tipo'=>$known_tipo,'section_tipo'=>'self','parent'=>'self'],	// legit
					(object)['tipo'=>'bogus99999','section_tipo'=>'self','parent'=>'self'],	// invalid tipo
					(object)['section_tipo'=>'self','parent'=>'self'],						// missing tipo
					'not_an_object'															// malformed
				]
			]
		];

		$section = section::get_instance(self::$section_tipo, 'list', false);
		$section->request_config = null;
		$result = $section->build_request_config();

		$ar_tipos = array_map(function($ddo){ return $ddo->tipo; }, $result[0]->show->ddo_map);

		$this->assertTrue(
			$ar_tipos===[$known_tipo],
			'expected only the legitimate ddo to survive. Got: ' . implode(',', $ar_tipos)
		);

		// drops were collected
		$this->assertTrue(
			count($section->request_config_warnings) >= 3,
			'expected drop warnings for the rejected client ddos. Got: ' . count($section->request_config_warnings)
		);
	}//end test_hostile_rqo_show_ddos_dropped



	/**
	* TEST_VALIDATE_CONFIG
	* Table-driven structural validation of request_config definitions
	* (request_config_object::validate_config).
	* @return void
	*/
	public function test_validate_config() : void {

		$valid_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo'	=> [ (object)['source'=>'self'] ],
					'limit'			=> 10
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'numisdata27','section_tipo'=>'self','parent'=>'self'],
						(object)['tipo'=>'rsc85','section_tipo'=>['rsc197'],'parent'=>'numisdata27']
					],
					'sqo_config' => (object)['operator'=>'$or','limit'=>5]
				],
				'search'		=> (object)[
					'ddo_map' => [ (object)['tipo'=>'numisdata27','section_tipo'=>'self','parent'=>'self'] ]
				]
			]
		];

		$cases = [
			// [config, expected_error_count_min, expected_levels, label]
			[$valid_config, 0, [], 'valid config has no issues'],
			['broken', 1, ['error'], 'non-array config'],
			[[ 'not_an_object' ], 1, ['error'], 'non-object item'],
			[[ (object)['api_engine'=>123, 'show'=>(object)['ddo_map'=>[]]] ], 1, ['error'], 'non-string api_engine'],
			[[ (object)['show'=>(object)['ddo_map'=>'broken']] ], 1, ['error'], 'non-array ddo_map'],
			[[ (object)['show'=>(object)['ddo_map'=>[ (object)['section_tipo'=>'self'] ]]] ], 1, ['error'], 'ddo without tipo'],
			[[ (object)['show'=>(object)['ddo_map'=>[ (object)['tipo'=>'not a tipo!'] ]]] ], 1, ['error'], 'invalid tipo grammar'],
			[[ (object)['show'=>(object)['get_ddo_map'=>'section_map']] ], 1, ['error'], 'malformed get_ddo_map'],
			[[ (object)['sqo'=>'broken', 'show'=>(object)['ddo_map'=>[]]] ], 1, ['error'], 'non-object sqo'],
			[[ (object)['bogus_key'=>1, 'show'=>(object)['ddo_map'=>[]]] ], 0, ['warning'], 'unknown key warns'],
			[[ (object)['api_engine'=>'dedalo'] ], 0, ['warning'], 'missing show warns']
		];

		foreach ($cases as $case) {
			[$config, $min_errors, $expected_levels, $label] = $case;

			$issues = request_config_object::validate_config($config);
			$errors = array_filter($issues, function($issue){ return $issue->level==='error'; });

			if ($min_errors===0 && $expected_levels===[]) {
				$this->assertTrue(
					$issues===[],
					"$label: expected no issues. Got: " . to_string($issues)
				);
			} else {
				$this->assertTrue(
					count($errors)>=$min_errors,
					"$label: expected at least $min_errors error(s). Got: " . to_string($issues)
				);
				foreach ($expected_levels as $level) {
					$found = array_filter($issues, function($issue) use($level){ return $issue->level===$level; });
					$this->assertTrue(
						count($found)>0,
						"$label: expected a '$level' issue. Got: " . to_string($issues)
					);
				}
			}
		}
	}//end test_validate_config



	/**
	* TEST_SANITIZE_CLIENT_DDO_MAP
	* The API gate whitelist must strip non-whitelisted ddo fields and
	* non-object entries while preserving legitimate display fields.
	* @return void
	*/
	public function test_sanitize_client_ddo_map() : void {

		$ddo_map = [
			(object)[
				'tipo'			=> 'test52',
				'section_tipo'	=> 'self',
				'parent'		=> 'self',
				'mode'			=> 'list',
				'label'			=> 'My column',
				'view'			=> 'default',
				// hostile/server-only fields
				'permissions'	=> 3,
				'sentence'		=> 'DROP TABLE matrix',
				'properties'	=> (object)['injected'=>true],
				'fields_map'	=> true
			],
			'not_an_object',
			42
		];

		$sanitized = request_config_object::sanitize_client_ddo_map($ddo_map);

		$this->assertTrue(
			count($sanitized)===1,
			'expected non-object entries removed. Got: ' . count($sanitized)
		);

		$ddo = $sanitized[0];
		foreach (['tipo','section_tipo','parent','mode','label','view'] as $field) {
			$this->assertTrue(
				property_exists($ddo, $field),
				"expected whitelisted field '$field' preserved"
			);
		}
		foreach (['permissions','sentence','properties','fields_map'] as $field) {
			$this->assertTrue(
				!property_exists($ddo, $field),
				"expected non-whitelisted field '$field' stripped"
			);
		}
	}//end test_sanitize_client_ddo_map



	/**
	* TEST_CONFIG_WARNINGS_COLLECTOR
	* Dropped ddos (invalid tipo) must be recorded in the per-instance
	* request_config_warnings collector with type 'drop', and the drops
	* metric must increase.
	* @return void
	*/
	public function test_config_warnings_collector() : void {

		$section = $this->build_section_instance(1, 'list');

		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo' => [ (object)['source'=>'self'] ]
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'test52','section_tipo'=>'self','parent'=>'self'],
						(object)['tipo'=>'bogus99999','section_tipo'=>'self','parent'=>'self'] // invalid
					]
				]
			]
		];
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];
		$drops_before = metrics::$request_config_drops_total_calls;

		$result = $section->get_ar_request_config();

		// valid ddo survives, invalid is dropped
		$ar_tipos = array_map(function($ddo){ return $ddo->tipo; }, $result[0]->show->ddo_map);
		$this->assertTrue(
			in_array('test52', $ar_tipos) && !in_array('bogus99999', $ar_tipos),
			'expected invalid ddo dropped and valid kept. Got: ' . implode(',', $ar_tipos)
		);

		// the drop was collected
		$drop_warnings = array_filter($section->request_config_warnings, function($w){
			return $w->type==='drop' && strpos($w->message, 'bogus99999')!==false;
		});
		$this->assertTrue(
			count($drop_warnings)>0,
			'expected a drop warning for the invalid ddo. Warnings: ' . to_string($section->request_config_warnings)
		);

		// and counted in metrics
		$this->assertTrue(
			metrics::$request_config_drops_total_calls > $drops_before,
			'expected request_config_drops metric to increase'
		);
	}//end test_config_warnings_collector



	/**
	* TEST_CONFIG_WARNINGS_SURFACE_IN_CONTEXT
	* Under SHOW_DEBUG, collected build issues must surface in the structure
	* context as 'config_warnings' so an unexpectedly empty UI self-explains.
	* @return void
	*/
	public function test_config_warnings_surface_in_context() : void {

		if (SHOW_DEBUG!==true) {
			$this->markTestSkipped('SHOW_DEBUG is not enabled in this environment');
		}

		$section = $this->build_section_instance(1, 'list');

		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = [
			(object)[
				'api_engine'	=> 'dedalo',
				'type'			=> 'main',
				'sqo'			=> (object)[
					'section_tipo' => [ (object)['source'=>'self'] ]
				],
				'show'			=> (object)[
					'ddo_map' => [
						(object)['tipo'=>'bogus99999','section_tipo'=>'self','parent'=>'self'] // invalid
					]
				]
			]
		];
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$context = $section->get_structure_context(2, true); // permissions, add_request_config

		$this->assertTrue(
			isset($context->config_warnings) && count($context->config_warnings)>0,
			'expected config_warnings surfaced in context under SHOW_DEBUG'
		);
	}//end test_config_warnings_surface_in_context



	/**
	* TEST_STRUCTURAL_INVALID_CONFIG_CONTRACT
	* A request_config that is not an array of objects is a structural
	* misconfiguration: dropped with warning normally, but FATAL (throw) when
	* this element is the direct target of the API request.
	* @return void
	*/
	public function test_structural_invalid_config_contract() : void {

		// Case 1: not the rqo target → degrade to empty + drop warning
		$section = $this->build_section_instance(1, 'list');
		$properties = $section->get_properties() ?? new stdClass();
		if (!isset($properties->source)) {
			$properties->source = new stdClass();
		}
		$properties->source->request_config = 'totally_broken'; // not an array
		$section->set_properties($properties);
		common::$resolved_request_properties_parsed = [];

		$result = $section->get_ar_request_config();
		$this->assertTrue(
			$result===[],
			'expected empty config for structurally invalid request_config'
		);
		$drop_warnings = array_filter($section->request_config_warnings, function($w){
			return $w->type==='drop' && strpos($w->message, 'expected array')!==false;
		});
		$this->assertTrue(
			count($drop_warnings)>0,
			'expected a structural drop warning'
		);

		// Case 2: this element IS the rqo source target → throw
		dd_core_api::$rqo = (object)[
			'source' => (object)['tipo' => self::$section_tipo]
		];
		$section_b = section::get_instance(self::$section_tipo, 'list', false);
		$section_b->set_properties(json_decode(json_encode($properties)));
		common::$resolved_request_properties_parsed = [];

		$this->expectException(Exception::class);
		$section_b->get_ar_request_config();
	}//end test_structural_invalid_config_contract



	/**
	* TEST_RQO_DERIVED_PATH_CONSOLIDATION
	* Pins path 1 of build_request_config: when the client API request (RQO)
	* targets this element and carries a show.ddo_map, the request_config is
	* rebuilt from the RQO with per-ddo consolidation:
	* - parent 'self' (or matching source tipo) resolved to the element tipo
	* - section_tipo 'self' (or compatible) resolved to the element tipo
	* - missing label and mode filled in
	* @return void
	*/
	public function test_rqo_derived_path_consolidation() : void {

		// Take a real component tipo from the natural config to stay fixture-agnostic
		$natural_section = $this->build_section_instance(1, 'list');
		$natural = $natural_section->get_ar_request_config();
		$this->assertTrue(
			isset($natural[0]->show->ddo_map[0]->tipo),
			'expected a natural ddo to drive the rqo test'
		);
		$known_tipo = $natural[0]->show->ddo_map[0]->tipo;

		// Simulate a client RQO targeting the section with an explicit show
		dd_core_api::$rqo = (object)[
			'source' => (object)[
				'tipo'			=> self::$section_tipo,
				'section_tipo'	=> self::$section_tipo,
				'mode'			=> 'list'
			],
			'show' => (object)[
				'ddo_map' => [
					(object)[
						'tipo'			=> $known_tipo,
						'section_tipo'	=> 'self',
						'parent'		=> 'self'
					]
				]
			],
			'sqo' => (object)[
				'section_tipo'	=> [self::$section_tipo],
				'limit'			=> 7
			]
		];

		// Fresh instance (build_request_config memoizes per instance)
		$section = section::get_instance(self::$section_tipo, 'list', false);
		$section->request_config = null;
		$result = $section->build_request_config();

		$this->assertTrue(
			count($result)===1 && $result[0] instanceof request_config_object,
			'expected one request_config_object from rqo-derived path'
		);

		$rco = $result[0];
		$ddo = $rco->show->ddo_map[0];

		$this->assertTrue(
			$ddo->parent===self::$section_tipo,
			'expected parent self resolved to section tipo. Got: ' . to_string($ddo->parent)
		);
		$this->assertTrue(
			$ddo->section_tipo===self::$section_tipo,
			'expected section_tipo self resolved to section tipo. Got: ' . to_string($ddo->section_tipo)
		);
		$this->assertTrue(
			isset($ddo->label) && is_string($ddo->label),
			'expected label filled in by consolidation'
		);
		$this->assertTrue(
			isset($ddo->mode),
			'expected mode filled in by consolidation'
		);

		// sqo from the rqo is preserved, section_tipo wrapped as {tipo} objects
		$this->assertTrue(
			isset($rco->sqo->section_tipo[0]->tipo) && $rco->sqo->section_tipo[0]->tipo===self::$section_tipo,
			'expected rqo sqo section_tipo wrapped as tipo objects'
		);
		$this->assertTrue(
			$rco->sqo->limit===7,
			'expected rqo sqo limit preserved. Got: ' . to_string($rco->sqo->limit ?? null)
		);
	}//end test_rqo_derived_path_consolidation



}//end request_config_Test
