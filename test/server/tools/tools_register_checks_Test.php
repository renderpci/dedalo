<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TOOLS_REGISTER_CHECKS_TEST
* Covers the registration-time checks in tools_register::process_tool_directory():
* - class contract (file exists, class loads, extends tool_common)
* - minimum Dédalo version refusal
* - API_ACTIONS warning surfaced in the import report
* Uses disposable fixture tool directories in the system temp dir.
*/
final class tools_register_checks_test extends BaseTestCase {



	/** @var string[] fixture dirs to remove */
	private array $fixture_dirs = [];



	protected function tearDown(): void {
		foreach ($this->fixture_dirs as $dir) {
			array_map('unlink', glob($dir . '/*') ?: []);
			@rmdir($dir);
		}
		$this->fixture_dirs = [];
		parent::tearDown();
	}



	/**
	* Helper. Create a fixture tool directory.
	* @param string $name Tool/class/directory name (must be unique per test run)
	* @param ?string $class_body PHP class source or null to omit the class file
	* @param array $register_extra Extra authoring register.json keys
	* @return string Fixture directory path
	*/
	private function make_fixture(string $name, ?string $class_body, array $register_extra=[]) : string {

		$dir = sys_get_temp_dir() . '/dedalo_test_' . $name;
		@mkdir($dir, 0755, true);
		$this->fixture_dirs[] = $dir;

		$register = array_merge([
			'name'    => $name,
			'version' => '1.0.0',
			'label'   => ['lg-eng' => 'Fixture']
		], $register_extra);
		file_put_contents($dir . '/register.json', json_encode($register));

		if ($class_body !== null) {
			file_put_contents($dir . '/class.' . $name . '.php', $class_body);
		}

		return $dir;
	}



	/**
	* Helper. Invoke the private process_tool_directory()
	*/
	private function process(string $dir, string $basename) : object {
		$counter = 1000; // high base to avoid ontology tipo clashes with real imports
		return PHPUnitUtil::callMethod(new tools_register(), 'process_tool_directory', [$dir, $basename, &$counter]);
	}



	/**
	* TEST_VALID_FIXTURE_PASSES
	* @return void
	*/
	public function test_valid_fixture_passes() : void {

		$name = 'tool_test_checks_valid';
		$dir  = $this->make_fixture($name, "<?php class $name extends tool_common { public const API_ACTIONS = []; }");

		$result = $this->process($dir, $name);

		$this->assertFalse($result->skipped, 'expected valid fixture to pass: ' . json_encode($result->file_info->errors ?? null));
		$this->assertSame($name, $result->file_info->name);
		$this->assertSame('1.0.0', $result->file_info->version);
		$this->assertSame([], $result->file_info->warnings, 'expected no warnings');
	}//end test_valid_fixture_passes



	/**
	* TEST_MISSING_CLASS_FILE_REFUSED
	* @return void
	*/
	public function test_missing_class_file_refused() : void {

		$name = 'tool_test_checks_noclass';
		$dir  = $this->make_fixture($name, null);

		$result = $this->process($dir, $name);

		$this->assertTrue($result->skipped, 'expected skip on missing class file');
		$this->assertNotEmpty(
			array_filter($result->file_info->errors, fn($e) => str_contains($e, 'Missing tool class file')),
			'expected missing class file error, got: ' . json_encode($result->file_info->errors)
		);
	}//end test_missing_class_file_refused



	/**
	* TEST_NOT_EXTENDING_TOOL_COMMON_REFUSED
	* @return void
	*/
	public function test_not_extending_tool_common_refused() : void {

		$name = 'tool_test_checks_nosubclass';
		$dir  = $this->make_fixture($name, "<?php class $name { }");

		$result = $this->process($dir, $name);

		$this->assertTrue($result->skipped, 'expected skip when class does not extend tool_common');
		$this->assertNotEmpty(
			array_filter($result->file_info->errors, fn($e) => str_contains($e, 'must extend tool_common')),
			'expected subclass error, got: ' . json_encode($result->file_info->errors)
		);
	}//end test_not_extending_tool_common_refused



	/**
	* TEST_MIN_VERSION_REFUSED
	* @return void
	*/
	public function test_min_version_refused() : void {

		$name = 'tool_test_checks_minver';
		$dir  = $this->make_fixture(
			$name,
			"<?php class $name extends tool_common { public const API_ACTIONS = []; }",
			['dedalo_version_min' => '99.0.0']
		);

		$result = $this->process($dir, $name);

		$this->assertTrue($result->skipped, 'expected skip on unmet minimum version');
		$this->assertNotEmpty(
			array_filter($result->file_info->errors, fn($e) => str_contains($e, 'requires Dédalo >= 99.0.0')),
			'expected min version error, got: ' . json_encode($result->file_info->errors)
		);
	}//end test_min_version_refused



	/**
	* TEST_MISSING_API_ACTIONS_WARNS
	* @return void
	*/
	public function test_missing_api_actions_warns() : void {

		$name = 'tool_test_checks_noactions';
		$dir  = $this->make_fixture($name, "<?php class $name extends tool_common { }");

		$result = $this->process($dir, $name);

		$this->assertFalse($result->skipped, 'expected tool without API_ACTIONS to register (with warning)');
		$this->assertNotEmpty(
			array_filter($result->file_info->warnings, fn($w) => str_contains($w, 'API_ACTIONS')),
			'expected API_ACTIONS warning, got: ' . json_encode($result->file_info->warnings)
		);
	}//end test_missing_api_actions_warns



}//end class tools_register_checks_test
