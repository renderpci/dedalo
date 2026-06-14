<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_CACHES_TEST
* Covers the tool cache consolidation:
* - tools_register::invalidate_all_tool_caches() clears every layer
* - tool_common::get_config_value() per-key precedence (dd996 -> dd1633 -> default)
* - tool_common::get_user_tools() returns tool objects carrying tool_config
*   (regression for the dropped-clone bug)
*/
final class tool_caches_test extends BaseTestCase {



	/**
	* Helper. Read a static property value via reflection (works for protected)
	*/
	private function get_static(string $class, string $property) : mixed {
		$ref = new ReflectionProperty($class, $property);
		$ref->setAccessible(true);
		return $ref->getValue();
	}



	/**
	* Helper. Set a static property value via reflection (works for protected)
	*/
	private function set_static(string $class, string $property, mixed $value) : void {
		$ref = new ReflectionProperty($class, $property);
		$ref->setAccessible(true);
		$ref->setValue(null, $value);
	}



	/**
	* TEST_INVALIDATE_ALL_TOOL_CACHES
	* Warm every cache layer, invalidate, assert all layers are empty
	* @return void
	*/
	public function test_invalidate_all_tool_caches() : void {

		// warm layers
			$registered	= tool_common::get_all_registered_tools();
			$user_tools	= tool_common::get_user_tools(TEST_USER_ID);
			$all_config	= tools_register::get_all_config();
			$config		= tool_common::get_config('tool_export');
			$client		= tools_register::get_all_config_tool_client();
			// the diffusion section map is invalidated together with the tool
			// caches (import_tools rewrites the tool tld). Best-effort warm: only
			// writes a file when a diffusion domain exists.
			diffusion_utils::get_section_diffusion_map();

			$this->assertNotEmpty($registered, 'expected registered tools (install must have tools imported)');

		// invalidate
			$result = tools_register::invalidate_all_tool_caches();
			$this->assertTrue($result, 'expected invalidate_all_tool_caches to return true');

		// in-memory statics are empty
			$this->assertEmpty($this->get_static('tool_common', 'all_registered_tools_cache'), 'all_registered_tools_cache not cleared');
			$this->assertEmpty($this->get_static('tool_common', 'active_tools_cache'), 'active_tools_cache not cleared');
			$this->assertSame([], $this->get_static('tool_common', 'cache_config_tool'), 'cache_config_tool not cleared');
			$this->assertSame([], tool_common::$user_tools_cache, 'user_tools_cache not cleared');
			$this->assertEmpty($this->get_static('tools_register', 'all_config_cache'), 'all_config_cache not cleared');
			$this->assertEmpty($this->get_static('tools_register', 'all_default_config_cache'), 'all_default_config_cache not cleared');
			$this->assertEmpty($this->get_static('tools_register', 'all_config_tool_client_cache'), 'all_config_tool_client_cache not cleared');
			$this->assertEmpty($this->get_static('tools_register', 'all_default_config_tool_client_cache'), 'all_default_config_tool_client_cache not cleared');
			$this->assertSame([], common::$cache_get_tools, 'cache_get_tools not cleared');
			$this->assertSame([], common::$cache_buttons_tools, 'cache_buttons_tools not cleared');

		// shared file caches are gone
			$base_path = DEDALO_CACHE_MANAGER['files_path'] ?? null;
			$this->assertNotEmpty($base_path, 'expected cache files path');

			$shared_files = [
				tool_common::get_all_registered_tools_cache_name(),
				tools_register::get_config_list_cache_name(DEDALO_REGISTER_TOOLS_SECTION_TIPO),
				tools_register::get_config_list_cache_name(DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO),
				diffusion_utils::get_section_diffusion_map_cache_name()
			];
			foreach ($shared_files as $file_name) {
				$this->assertFileDoesNotExist($base_path .'/'. $file_name, "shared cache file not deleted: $file_name");
			}

		// per-user file caches are gone
			$pattern	= $base_path . '/' . DEDALO_ENTITY . '_*_cache_user_tools.php';
			$leftover	= glob($pattern);
			$this->assertSame([], $leftover===false ? [] : $leftover, 'per-user tool cache files not deleted');
	}//end test_invalidate_all_tool_caches



	/**
	* TEST_GET_CONFIG_VALUE_PRECEDENCE
	* Per-key resolution: dd996 user config -> dd1324 default config -> $default.
	* Caches are injected via reflection so the test is deterministic and DB-independent.
	* @return void
	*/
	public function test_get_config_value_precedence() : void {

		// fixture: user config (dd996) defines only key_a; defaults (dd1324) define key_a and key_b
			$user_config = [
				'tool_test_fixture' => [
					'config' => (object)[
						'key_a' => (object)['value' => 'user_a', 'client' => true]
					]
				]
			];
			$default_config = [
				'tool_test_fixture' => [
					'config' => (object)[
						'key_a' => (object)['value' => 'default_a'],
						'key_b' => 'default_b'
					]
				]
			];

			$this->set_static('tools_register', 'all_config_cache', $user_config);
			$this->set_static('tools_register', 'all_default_config_cache', $default_config);

		try {
			// key in both: user wins
				$this->assertSame('user_a', tool_common::get_config_value('tool_test_fixture', 'key_a'), 'expected dd996 value to win');
			// key only in defaults: default config wins (plain value, no ->value wrapper)
				$this->assertSame('default_b', tool_common::get_config_value('tool_test_fixture', 'key_b'), 'expected dd1324 default value');
			// key nowhere: fallback
				$sentinel = 'fallback_sentinel';
				$this->assertSame($sentinel, tool_common::get_config_value('tool_test_fixture', 'key_c', $sentinel), 'expected given default');
			// unknown tool: fallback
				$this->assertNull(tool_common::get_config_value('tool_unknown_fixture', 'key_a'), 'expected null for unknown tool');
		} finally {
			// restore clean state for subsequent tests
			tools_register::invalidate_all_tool_caches();
		}
	}//end test_get_config_value_precedence



	/**
	* TEST_GET_USER_TOOLS_CARRIES_TOOL_CONFIG
	* Regression: get_user_tools() cloned each tool and set tool_config on the
	* clone without writing it back, silently dropping the property.
	* @return void
	*/
	public function test_get_user_tools_carries_tool_config() : void {

		// clean start: ignore any pre-fix cache file
			tools_register::invalidate_all_tool_caches();

		$user_tools = tool_common::get_user_tools(TEST_USER_ID);
		$this->assertNotEmpty($user_tools, 'expected user tools for superuser');

		foreach ($user_tools as $tool) {
			$this->assertTrue(
				property_exists($tool, 'tool_config'),
				'expected tool_config property on tool: ' . ($tool->name ?? '?')
			);
		}

		// returned objects must be clones, not the shared registry objects
			$registered = tool_common::get_all_registered_tools();
			$registered_by_name = array_column($registered, null, 'name');
			foreach ($user_tools as $tool) {
				if (isset($registered_by_name[$tool->name])) {
					$this->assertNotSame(
						$registered_by_name[$tool->name],
						$tool,
						'expected cloned tool object, got shared registry instance: ' . $tool->name
					);
				}
			}
	}//end test_get_user_tools_carries_tool_config



}//end class tool_caches_test
