<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* SEC_SESSION_TEST
* Regression coverage for the SEC-008 (CSRF) and §9.1b
* (BACKGROUND_RUNNABLE) hardening.
*
* Run: vendor/bin/phpunit test/server/api/SEC_session_Test.php
*/
final class SEC_session_test extends BaseTestCase {

	/**
	* SEC-008: a non-bootstrap action with no CSRF token is rejected with the
	* canonical `csrf_failed` error and a fresh token in the response.
	*/
	public function test_csrf_missing_token_rejects() : void {

		$this->user_login();

		// strip any token leftover from previous tests
		unset($_SERVER['HTTP_X_DEDALO_CSRF_TOKEN']);

		$rqo = (object)[
			'action' => 'read', // not in CSRF_EXEMPT_ACTIONS
			'dd_api' => 'dd_core_api',
			'source' => (object)[
				'tipo'         => 'test3',
				'section_tipo' => 'test3',
				'lang'         => DEDALO_DATA_NOLAN,
			],
			'sqo' => (object)[
				'section_tipo' => ['test3'],
				'limit'        => 1,
			],
		];

		$manager  = new dd_manager();
		$response = $manager->manage_request($rqo);

		$this->assertFalse($response->result, 'CSRF gate must reject the request');
		$this->assertContains('csrf_failed', $response->errors, 'errors[] must contain csrf_failed');
		$this->assertNotEmpty($response->csrf_token ?? '', 'response must echo a fresh CSRF token for the retry');
	}

	/**
	* SEC-008: a request carrying the correct token via the
	* `X-Dedalo-Csrf-Token` HTTP header is accepted (no `csrf_failed`).
	*/
	public function test_csrf_header_token_accepts() : void {

		$this->user_login();

		// mint and echo back the per-session token
		$token = bin2hex(random_bytes(32));
		$_SESSION['dedalo']['csrf_token']         = $token;
		$_SERVER['HTTP_X_DEDALO_CSRF_TOKEN']      = $token;

		$rqo = (object)[
			'action' => 'read',
			'dd_api' => 'dd_core_api',
			'source' => (object)[
				'tipo'         => 'test3',
				'section_tipo' => 'test3',
				'lang'         => DEDALO_DATA_NOLAN,
			],
			'sqo' => (object)[
				'section_tipo' => ['test3'],
				'limit'        => 1,
			],
		];

		$manager  = new dd_manager();
		$response = $manager->manage_request($rqo);

		$this->assertNotContains('csrf_failed', $response->errors ?? [], 'header-token request must pass CSRF gate');
	}

	/**
	* SEC-008 multipart fallback: when the HTTP header is not set, the
	* server must accept a token supplied as a FormData field, which the
	* JSON entrypoint maps to `$rqo->options->csrf_token`.
	*/
	public function test_csrf_form_field_token_accepts() : void {

		$this->user_login();

		$token = bin2hex(random_bytes(32));
		$_SESSION['dedalo']['csrf_token'] = $token;
		unset($_SERVER['HTTP_X_DEDALO_CSRF_TOKEN']);

		$rqo = (object)[
			'action' => 'read',
			'dd_api' => 'dd_core_api',
			'source' => (object)[
				'tipo'         => 'test3',
				'section_tipo' => 'test3',
				'lang'         => DEDALO_DATA_NOLAN,
			],
			'sqo' => (object)[
				'section_tipo' => ['test3'],
				'limit'        => 1,
			],
			'options' => (object)[
				'csrf_token' => $token, // simulates FormData field
			],
		];

		$manager  = new dd_manager();
		$response = $manager->manage_request($rqo);

		$this->assertNotContains('csrf_failed', $response->errors ?? [], 'form-field token must satisfy the CSRF gate');
	}

	/**
	* §9.1b: the `BACKGROUND_RUNNABLE` allowlist on `area_maintenance`
	* must include the JS-confirmed CLI callers and exclude unrelated
	* helpers (e.g. `register_tools` runs synchronously, never via
	* process_runner).
	*/
	public function test_background_runnable_area_maintenance_allowlist() : void {

		$this->assertTrue(
			defined('area_maintenance::BACKGROUND_RUNNABLE'),
			'area_maintenance must declare BACKGROUND_RUNNABLE'
		);

		$allow = area_maintenance::BACKGROUND_RUNNABLE;

		$expected_present = [
			'build_install_version',
			'update_data_version',
			'long_process_stream',
			'move_tld',
			'move_to_portal',
			'move_to_table',
			'move_lang',
			'move_locator',
		];
		foreach ($expected_present as $method) {
			$this->assertContains($method, $allow, "$method must be CLI-callable");
		}

		$expected_absent = [
			'register_tools',
			'set_maintenance_mode',
			'set_recovery_mode',
			'set_notification',
			'create_test_record',
			'create_db_extensions',
			'exec_db_maintenance',
		];
		foreach ($expected_absent as $method) {
			$this->assertNotContains($method, $allow, "$method must NOT be CLI-callable");
		}
	}

	/**
	* §9.1b: tool classes whose JS callers pass `background_running:true`
	* declare `BACKGROUND_RUNNABLE` mirroring the actual background action.
	*/
	public function test_background_runnable_tools_allowlist() : void {

		$expected = [
			'tool_propagate_component_data' => ['propagate_component_data'],
			'tool_update_cache'             => ['update_cache'],
			'tool_import_files'             => ['import_files'],
			'tool_import_dedalo_csv'        => ['import_files'],
		];

		foreach ($expected as $class => $methods) {
			$this->assertTrue(
				defined($class . '::BACKGROUND_RUNNABLE'),
				"$class must declare BACKGROUND_RUNNABLE"
			);
			$allow = constant($class . '::BACKGROUND_RUNNABLE');
			foreach ($methods as $m) {
				$this->assertContains($m, $allow, "$class::$m must be CLI-callable");
			}
			// Sanity: the allowlist must not silently allow every API_ACTIONS
			// entry — it is a strict subset of intentionally-CLI methods.
			if (defined($class . '::API_ACTIONS')) {
				$api_actions = constant($class . '::API_ACTIONS');
				$this->assertLessThanOrEqual(
					count($api_actions),
					count($allow),
					"$class::BACKGROUND_RUNNABLE must be a subset of API_ACTIONS"
				);
			}
		}
	}
}
