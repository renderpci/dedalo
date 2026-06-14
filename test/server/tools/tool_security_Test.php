<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



// Fixture classes for API_ACTIONS resolution
	class tool_security_fixture_list extends tool_common {
		public const API_ACTIONS = ['allowed_action', 'other_action'];
	}
	class tool_security_fixture_map extends tool_common {
		public const API_ACTIONS = [
			'gated_action'   => ['permission' => 'tipo', 'min_level' => 2],
			'ungated_action' => null
		];
	}
	class tool_security_fixture_none extends tool_common {
		// intentionally no API_ACTIONS
	}



/**
* TOOL_SECURITY_TEST
* Covers SEC-024 enforcement:
* - resolve_action: list form, map form, missing constant (fail closed by default)
* - assert_action_permission: fail-closed on missing option fields
* - dd_tools_api::tool_request integration: unlisted method refused
*/
final class tool_security_test extends BaseTestCase {



	/**
	* TEST_RESOLVE_ACTION_LIST_FORM
	* @return void
	*/
	public function test_resolve_action_list_form() : void {

		$ok = tool_security::resolve_action('tool_security_fixture_list', 'allowed_action');
		$this->assertTrue($ok->ok, 'expected listed method allowed');
		$this->assertNull($ok->spec, 'expected no spec in list form');

		$ko = tool_security::resolve_action('tool_security_fixture_list', 'not_listed');
		$this->assertFalse($ko->ok, 'expected unlisted method refused');
	}//end test_resolve_action_list_form



	/**
	* TEST_RESOLVE_ACTION_MAP_FORM
	* @return void
	*/
	public function test_resolve_action_map_form() : void {

		$gated = tool_security::resolve_action('tool_security_fixture_map', 'gated_action');
		$this->assertTrue($gated->ok, 'expected map key allowed');
		$this->assertSame(['permission' => 'tipo', 'min_level' => 2], $gated->spec, 'expected declarative spec');

		$ungated = tool_security::resolve_action('tool_security_fixture_map', 'ungated_action');
		$this->assertTrue($ungated->ok, 'expected null-spec key allowed');
		$this->assertNull($ungated->spec, 'expected null spec');

		$ko = tool_security::resolve_action('tool_security_fixture_map', 'absent_action');
		$this->assertFalse($ko->ok, 'expected absent map key refused');
	}//end test_resolve_action_map_form



	/**
	* TEST_RESOLVE_ACTION_MISSING_CONSTANT
	* Default (flag undefined or true): fail closed
	* @return void
	*/
	public function test_resolve_action_missing_constant() : void {

		if (defined('TOOLS_REQUIRE_API_ACTIONS') && TOOLS_REQUIRE_API_ACTIONS === false) {
			$this->markTestSkipped('Install defines TOOLS_REQUIRE_API_ACTIONS=false (legacy mode)');
		}

		$result = tool_security::resolve_action('tool_security_fixture_none', 'any_method');
		$this->assertFalse($result->ok, 'expected fail-closed for class without API_ACTIONS');
	}//end test_resolve_action_missing_constant



	/**
	* TEST_ASSERT_FAIL_CLOSED_ON_MISSING_FIELDS
	* @return void
	*/
	public function test_assert_fail_closed_on_missing_fields() : void {

		// section spec, no section_tipo
			try {
				tool_security::assert_action_permission(
					['permission' => 'section', 'min_level' => 2],
					new stdClass(),
					__METHOD__
				);
				$this->fail('expected permission_exception for missing section_tipo');
			} catch (permission_exception $e) {
				$this->assertStringContainsString('section_tipo', $e->getMessage());
			}

		// record spec, non-numeric section_id
			try {
				tool_security::assert_action_permission(
					['permission' => 'record'],
					(object)['section_tipo' => 'oh1', 'section_id' => 'not-a-number'],
					__METHOD__
				);
				$this->fail('expected permission_exception for non-numeric section_id');
			} catch (permission_exception $e) {
				$this->assertStringContainsString('section_id', $e->getMessage());
			}

		// invalid spec type
			try {
				tool_security::assert_action_permission(
					['permission' => 'bogus_type'],
					(object)['section_tipo' => 'oh1'],
					__METHOD__
				);
				$this->fail('expected permission_exception for invalid permission type');
			} catch (permission_exception $e) {
				$this->assertStringContainsString('Invalid API_ACTIONS permission spec', $e->getMessage());
			}

		// null spec: no gate, no exception
			tool_security::assert_action_permission(null, new stdClass(), __METHOD__);
			$this->assertTrue(true);
	}//end test_assert_fail_closed_on_missing_fields



	/**
	* TEST_ASSERT_PASSES_FOR_SUPERUSER
	* BaseTestCase grants the test user write permission on test sections
	* @return void
	*/
	public function test_assert_passes_for_superuser() : void {

		tool_security::assert_action_permission(
			['permission' => 'section', 'min_level' => 2],
			(object)['section_tipo' => 'oh1'],
			__METHOD__
		);
		$this->assertTrue(true, 'expected no exception for authorized section');
	}//end test_assert_passes_for_superuser



	/**
	* TEST_TOOL_REQUEST_REFUSES_UNLISTED_METHOD
	* Integration through the dd_tools_api dispatch surface
	* @return void
	*/
	public function test_tool_request_refuses_unlisted_method() : void {

		$rqo = (object)[
			'dd_api'  => 'dd_tools_api',
			'action'  => 'tool_request',
			'source'  => (object)[
				'model'  => 'tool_export',
				'action' => 'method_that_is_not_listed'
			],
			'options' => new stdClass()
		];

		$response = dd_tools_api::tool_request($rqo);

		$this->assertFalse($response->result, 'expected refused request');
		$this->assertContains('unauthorized_method', $response->errors, 'expected unauthorized_method error');
	}//end test_tool_request_refuses_unlisted_method



	/**
	* TEST_TOOL_REQUEST_DECLARATIVE_GATE_FAIL_CLOSED
	* tool_time_machine::apply_value declares a 'tipo' gate; calling it
	* without section_tipo/tipo must throw permission_exception BEFORE
	* the method body runs (dd_manager converts it for real clients).
	* @return void
	*/
	public function test_tool_request_declarative_gate_fail_closed() : void {

		$rqo = (object)[
			'dd_api'  => 'dd_tools_api',
			'action'  => 'tool_request',
			'source'  => (object)[
				'model'  => 'tool_time_machine',
				'action' => 'apply_value'
			],
			'options' => new stdClass() // no section_tipo/tipo
		];

		$this->expectException(permission_exception::class);
		dd_tools_api::tool_request($rqo);
	}//end test_tool_request_declarative_gate_fail_closed



}//end class tool_security_test
