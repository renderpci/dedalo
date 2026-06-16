<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* DIFFUSION_SERVER_CONTROL_WIDGET_TEST
* area_maintenance diffusion_server_control widget: registration, API_ACTIONS
* allowlist, get_value shape (graceful when the Bun engine is down) and the
* supervisor-command lifecycle path.
*
* Safety: lifecycle methods shell out to the deployment-configured supervisor
* command (DEDALO_DIFFUSION_SERVICE_CMD). The real constant is NEVER exercised
* here — tests force diffusion_server_control::$service_cmd_override to either ''
* (not-configured path, no exec) or a harmless `echo` command (success path).
* The engine status call is forced against a dead socket
* (diffusion_api_client::$endpoint_override) so no live engine is touched.
*/
final class diffusion_server_control_widget_Test extends BaseTestCase {

	public static $model = 'diffusion_server_control';



	protected function setUp(): void {
		parent::setUp();
		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}
		require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/diffusion_server_control/class.diffusion_server_control.php';
	}

	protected function tearDown(): void {
		diffusion_api_client::$endpoint_override			= null;
		diffusion_server_control::$service_cmd_override		= null;
		parent::tearDown();
	}



	/**
	* TEST_WIDGET_IS_REGISTERED
	* The widget must appear in area_maintenance::get_ar_widgets() (the
	* authoritative enumeration) under the diffusion category.
	*/
	public function test_widget_is_registered(): void {

		$area_maintenance	= area_common::get_instance('area_maintenance', DEDALO_AREA_MAINTENANCE_TIPO, 'list');
		$ar_widgets			= $area_maintenance->get_ar_widgets();
		$widget				= current(array_filter($ar_widgets, fn($w) => $w->id==='diffusion_server_control'));

		$this->assertNotFalse($widget, 'diffusion_server_control must be registered in get_ar_widgets');
		$this->assertSame('diffusion', $widget->category, 'widget must belong to the diffusion category');
	}//end test_widget_is_registered



	/**
	* TEST_WIDGET_ID_IN_LIGHTWEIGHT_LIST
	* The widget id must also be in the lightweight allowlist consulted by
	* dd_area_maintenance_api::widget_request (drift guard keeps both in sync).
	*/
	public function test_widget_id_in_lightweight_list(): void {

		$area_maintenance = area_common::get_instance('area_maintenance', DEDALO_AREA_MAINTENANCE_TIPO, 'list');

		$this->assertContains('diffusion_server_control', $area_maintenance->get_ar_widget_ids());
	}//end test_widget_id_in_lightweight_list



	/**
	* TEST_API_ACTIONS_ALLOWLIST
	* SEC-044: the widget declares exactly its dispatchable methods.
	*/
	public function test_api_actions_allowlist(): void {

		$this->assertSame(
			[
				'get_value',
				'start_server',
				'stop_server',
				'restart_server',
				'cancel_process',
				'retry_pending_deletions'
			],
			diffusion_server_control::API_ACTIONS
		);
	}//end test_api_actions_allowlist



	/**
	* TEST_GET_VALUE_SHAPE
	* get_value returns the full status object even when the Bun engine is
	* unreachable (server block degrades gracefully, never throws).
	*/
	public function test_get_value_shape(): void {

		// force engine-down: status must not depend on a live engine
		diffusion_api_client::$endpoint_override = '/tmp/no_such_diffusion_engine.sock';

		$response = diffusion_server_control::get_value();

		$this->assertIsObject($response->result, 'get_value result must be an object: ' . to_string($response->msg));
		$result = $response->result;

		// server block: unreachable but well-formed
		$this->assertIsObject($result->server);
		$this->assertFalse($result->server->reachable, 'server must report unreachable with dead socket');
		$this->assertNotEmpty($result->server->msg);

		// health checks present (null when down) and processes is always an array
		$this->assertObjectHasProperty('checks', $result->server);
		$this->assertIsArray($result->processes, 'processes must be an array (empty when engine down)');

		// config diagnostics block
		$this->assertIsObject($result->config);
		$this->assertIsBool($result->config->service_cmd_configured);
		$this->assertIsBool($result->config->internal_token_configured);
		$this->assertIsString($result->config->endpoint_in_use);

		// permissions: test user is DEDALO_SUPERUSER → admin
		$this->assertTrue($result->is_admin, 'test user is DEDALO_SUPERUSER');
	}//end test_get_value_shape



	/**
	* TEST_LIFECYCLE_NOT_CONFIGURED
	* With no service command configured, lifecycle actions refuse cleanly
	* (result:false, explanatory msg) and run NO shell command.
	*/
	public function test_lifecycle_not_configured(): void {

		diffusion_server_control::$service_cmd_override = ''; // force not-configured

		foreach (['start_server','stop_server','restart_server'] as $method) {
			$response = diffusion_server_control::{$method}(new stdClass());
			$this->assertFalse($response->result, "$method must refuse when service command is not configured");
			$this->assertNotEmpty($response->errors);
			$this->assertStringContainsStringIgnoringCase('not configured', $response->msg);
		}
	}//end test_lifecycle_not_configured



	/**
	* TEST_LIFECYCLE_RUNS_COMMAND
	* With a harmless echo command configured, each lifecycle action substitutes
	* the correct %action% keyword and reports success + captured output.
	*/
	public function test_lifecycle_runs_command(): void {

		diffusion_server_control::$service_cmd_override = 'echo dd_done:%action%';

		$cases = [
			'start_server'		=> 'start',
			'stop_server'		=> 'stop',
			'restart_server'	=> 'restart'
		];
		foreach ($cases as $method => $keyword) {
			$response = diffusion_server_control::{$method}(new stdClass());
			$this->assertTrue($response->result, "$method must succeed (exit 0) with echo command: " . to_string($response->msg));
			$this->assertSame($keyword, $response->action);
			$this->assertStringContainsString('dd_done:' . $keyword, $response->output);
		}
	}//end test_lifecycle_runs_command



	/**
	* TEST_RUN_SERVICE_COMMAND_REJECTS_INVALID_ACTION
	* Defense-in-depth: the private runner only accepts start|stop|restart, so a
	* future caller cannot push an arbitrary keyword into the command template.
	*/
	public function test_run_service_command_rejects_invalid_action(): void {

		diffusion_server_control::$service_cmd_override = 'echo should_not_run:%action%';

		$method = new ReflectionMethod('diffusion_server_control', 'run_service_command');

		$response = $method->invoke(null, 'restart; rm -rf /'); // not in the allowlist
		$this->assertFalse($response->result, 'invalid action keyword must be refused');
		$this->assertNotEmpty($response->errors);
	}//end test_run_service_command_rejects_invalid_action
}//end class diffusion_server_control_widget_Test
