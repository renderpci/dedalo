<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* MEDIA_CONTROL_WIDGET_TEST
* area_maintenance media_control widget: get_value shape, registration,
* input validation and graceful engine-down behavior.
*
* Safety: the valid set_media_access_mode path writes the REAL
* config_core.php and media/.htaccess, so it is NOT exercised here (the
* test user is DEDALO_SUPERUSER and the write would land in the live dev
* config). Only the no-write validation path is covered. The engine call
* is forced against a dead socket (diffusion_api_client::$endpoint_override)
* so no real marker store is touched.
*/
final class media_control_widget_Test extends BaseTestCase {

	public static $model = 'media_control';



	protected function setUp(): void {
		parent::setUp();
		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}
		require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/media_control/class.media_control.php';
	}

	protected function tearDown(): void {
		diffusion_api_client::$endpoint_override = null;
		parent::tearDown();
	}



	/**
	* TEST_WIDGET_IS_REGISTERED
	* The widget must appear in area_maintenance::get_ar_widgets() (the
	* whitelist consulted by dd_area_maintenance_api::widget_request).
	*/
	public function test_widget_is_registered(): void {

		$area_maintenance	= area_common::get_instance('area_maintenance', DEDALO_AREA_MAINTENANCE_TIPO, 'list');
		$ar_widgets			= $area_maintenance->get_ar_widgets();
		$widget_ids			= array_map(fn($widget) => $widget->id, $ar_widgets);

		$this->assertContains('media_control', $widget_ids, 'media_control must be registered in get_ar_widgets');
	}//end test_widget_is_registered



	/**
	* TEST_GET_VALUE_SHAPE
	* get_value returns the full status object even when the diffusion
	* engine is unreachable (engine block degrades gracefully).
	*/
	public function test_get_value_shape(): void {

		// force engine-down: status must not depend on a live engine
		diffusion_api_client::$endpoint_override = '/tmp/no_such_diffusion_engine.sock';

		$response = media_control::get_value();

		$this->assertIsObject($response->result, 'get_value result must be an object: ' . to_string($response->msg));
		$result = $response->result;

		// configuration block
		$this->assertContains($result->mode, [false, 'private', 'publication'], 'mode must be false|private|publication');
		$this->assertIsString($result->mode_source);
		$this->assertSame(media_protection::COOKIE_NAME, $result->cookie_name);
		$this->assertIsArray($result->public_qualities);
		$this->assertIsArray($result->default_public_qualities);
		$this->assertIsString($result->media_path);

		// htaccess block
		$this->assertIsBool($result->htaccess->exists);

		// markers block
		$this->assertIsBool($result->markers->base_exists);

		// engine block: unreachable but well-formed
		$this->assertFalse($result->engine->reachable, 'engine must report unreachable with dead socket');
		$this->assertNotEmpty($result->engine->msg);

		// permissions
		$this->assertTrue($result->is_root, 'test user is DEDALO_SUPERUSER');
	}//end test_get_value_shape



	/**
	* TEST_SET_MEDIA_ACCESS_MODE_VALIDATION
	* Invalid values are refused BEFORE any config write.
	*/
	public function test_set_media_access_mode_validation(): void {

		foreach (['bogus', '', 'PUBLICATION', 'on', null] as $invalid_value) {
			$response = media_control::set_media_access_mode((object)[
				'value' => $invalid_value
			]);
			$this->assertFalse($response->result, 'invalid value must be refused: ' . to_string($invalid_value));
			$this->assertNotEmpty($response->errors);
		}
	}//end test_set_media_access_mode_validation



	/**
	* TEST_REBUILD_GRACEFUL_ENGINE_DOWN
	* rebuild_media_index degrades to result:false when the engine is
	* unreachable (no exception, no partial state).
	*/
	public function test_rebuild_graceful_engine_down(): void {

		diffusion_test_helper_require_diffusion_or_skip($this);

		// force engine-down
		diffusion_api_client::$endpoint_override = '/tmp/no_such_diffusion_engine.sock';

		$response = media_control::rebuild_media_index(new stdClass());

		$this->assertFalse((bool)($response->result ?? false), 'rebuild must fail gracefully with engine down');
		$this->assertNotEmpty($response->msg);
	}//end test_rebuild_graceful_engine_down



	/**
	* TEST_API_ACTIONS_ALLOWLIST
	* SEC-044: the widget declares its dispatchable methods.
	*/
	public function test_api_actions_allowlist(): void {

		$this->assertSame(
			['get_value','set_media_access_mode','rebuild_media_index'],
			media_control::API_ACTIONS
		);
	}//end test_api_actions_allowlist
}//end class media_control_widget_Test



/**
* Helper: skip when the install lacks a usable diffusion ontology
* (rebuild resolves targets from the ontology before calling the engine).
*/
function diffusion_test_helper_require_diffusion_or_skip($test_case): void {
	require_once dirname(__DIR__) . '/diffusion/class.diffusion_test_helper.php';
	diffusion_test_helper::require_diffusion_ontology($test_case);
}
