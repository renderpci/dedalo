<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOL_PATHS_TEST
* Covers multi-root tool resolution (DEDALO_ADDITIONAL_TOOLS / tool_paths):
* - default (no constant): single primary root, behavior identical to before
* - per-tool resolution, class file and URL building
* - confinement: paths outside the roots are not resolvable
* Note: get_roots() reads the constant once (static memo per process), so the
* multi-root scenarios are exercised through the public per-tool API with the
* default single-root configuration plus direct unit checks.
*/
final class tool_paths_test extends BaseTestCase {



	/**
	* TEST_DEFAULT_SINGLE_ROOT
	* Without DEDALO_ADDITIONAL_TOOLS the roots set degenerates to the
	* primary in-repo root with its canonical path and URL.
	* @return void
	*/
	public function test_default_single_root() : void {

		$roots = tool_paths::get_roots();

		$this->assertNotEmpty($roots);
		$this->assertSame(realpath(DEDALO_TOOLS_PATH), $roots[0]->path, 'primary root must be index 0');
		$this->assertSame(rtrim(DEDALO_TOOLS_URL, '/'), $roots[0]->url);

		if (!defined('DEDALO_ADDITIONAL_TOOLS')) {
			$this->assertCount(1, $roots, 'no constant -> single root');
		}
	}//end test_default_single_root



	/**
	* TEST_RESOLVE_TOOL_ROOT
	* @return void
	*/
	public function test_resolve_tool_root() : void {

		// existing in-repo tool resolves to the primary root
			$root = tool_paths::resolve_tool_root('tool_export');
			$this->assertNotNull($root);
			$this->assertSame(realpath(DEDALO_TOOLS_PATH), $root->path);

		// nonexistent tool resolves to null
			$this->assertNull( tool_paths::resolve_tool_root('tool_nonexistent_xyz') );
	}//end test_resolve_tool_root



	/**
	* TEST_GET_TOOL_CLASS_FILE
	* @return void
	*/
	public function test_get_tool_class_file() : void {

		$class_file = tool_paths::get_tool_class_file('tool_export');
		$this->assertSame(
			realpath(DEDALO_TOOLS_PATH) . '/tool_export/class.tool_export.php',
			$class_file
		);
		$this->assertFileExists($class_file);

		// confinement: a resolved class file always lives under a known root
			$real = realpath($class_file);
			$confined = false;
			foreach (tool_paths::get_roots() as $root) {
				if (str_starts_with($real, $root->path . DIRECTORY_SEPARATOR)) {
					$confined = true;
					break;
				}
			}
			$this->assertTrue($confined);

		// nonexistent tool: null (no path fabrication)
			$this->assertNull( tool_paths::get_tool_class_file('tool_nonexistent_xyz') );
	}//end test_get_tool_class_file



	/**
	* TEST_GET_TOOL_URL
	* @return void
	*/
	public function test_get_tool_url() : void {

		$this->assertSame(
			rtrim(DEDALO_TOOLS_URL, '/') . '/tool_export',
			tool_paths::get_tool_url('tool_export')
		);

		// unknown tool falls back to the primary URL (historical behavior)
			$this->assertSame(
				rtrim(DEDALO_TOOLS_URL, '/') . '/tool_nonexistent_xyz',
				tool_paths::get_tool_url('tool_nonexistent_xyz')
			);
	}//end test_get_tool_url



	/**
	* TEST_ADDITIONAL_TOOLS_URL_MAP
	* Without additional roots the client map is empty: the browser keeps
	* its historical URL building for every tool.
	* @return void
	*/
	public function test_additional_tools_url_map() : void {

		$map = tool_paths::get_additional_tools_url_map();
		$this->assertIsObject($map);

		if (!defined('DEDALO_ADDITIONAL_TOOLS')) {
			$this->assertSame([], (array)$map);
		}

		// never leak filesystem paths
			foreach ((array)$map as $url) {
				$this->assertStringNotContainsString(DIRECTORY_SEPARATOR === '/' ? realpath(DEDALO_TOOLS_PATH) : '\\', $url);
			}
	}//end test_additional_tools_url_map



	/**
	* TEST_DISPATCH_USES_TOOL_PATHS
	* dd_tools_api::tool_request keeps working against the multi-root
	* resolution (regression for the confinement rewrite).
	* @return void
	*/
	public function test_dispatch_uses_tool_paths() : void {

		$rqo = (object)[
			'dd_api'  => 'dd_tools_api',
			'action'  => 'tool_request',
			'source'  => (object)[
				'model'  => 'tool_export',
				'action' => 'unlisted_method_for_confinement_check'
			],
			'options' => new stdClass()
		];

		$response = dd_tools_api::tool_request($rqo);

		// the request passes path confinement (class file resolved + confined)
		// and is then refused at the API_ACTIONS gate — proving the multi-root
		// resolution path works end to end
		$this->assertContains('unauthorized_method', $response->errors);
		$this->assertNotContains('Tool path confinement failed', $response->errors);
	}//end test_dispatch_uses_tool_paths



}//end class tool_paths_test
