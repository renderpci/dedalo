<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once DEDALO_ROOT_PATH . '/core/area_maintenance/widgets/update_code/class.update_code.php';

final class update_code_test extends BaseTestCase {
	public static $model = 'update_code';

	protected function setUp(): void {
		parent::setUp();
	}

	public function test_check_remote_server() {
		$server = new stdClass();
		$server->url = 'https://master.dedalo.dev/dedalo/core/api/v1/json/';
		$response = update_code::check_remote_server($server);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
		$this->assertObjectHasProperty('errors', $response);
	}

	public function test_get_value() {
		$response = update_code::get_value();

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
	}

	public function test_update_code() {
		$options = new stdClass();
		$options->file = new stdClass();
		$options->file->url = 'http://invalid.url/nonexistent.zip';
		$options->update_mode = 'incremental';
		$options->info = null;

		$response = update_code::update_code($options);

		$this->assertIsObject($response);
		$this->assertFalse($response->result); // Should fail cleanly with nonexistent url
		$this->assertObjectHasProperty('errors', $response);
	}

	public function test_update_incremental() {
		$options = new stdClass();
		$options->source = '/invalid/source/dir';
		$options->target = '/invalid/target/dir';

		$response = update_code::update_incremental($options);

		$this->assertIsObject($response);
		$this->assertFalse($response->result); // Rsync of invalid directory should fail
	}

	public function test_update_clean() {
		$options = new stdClass();
		$options->source = '/invalid/source/dir';
		$options->target = '/invalid/target/dir';
		$options->info = new stdClass();

		$response = update_code::update_clean($options);

		$this->assertIsObject($response);
		$this->assertFalse($response->result); // Should fail executing bad paths
	}

	public function test_build_version_from_git_master() {
		$options = new stdClass();
		$options->branch = 'invalid_branch_name';

		$response = update_code::build_version_from_git_master($options);

		$this->assertIsObject($response);
		$this->assertFalse($response->result); // Should fail with invalid git branch
	}

	public function test_get_code_path() {
		$version = [6, 4, 0];
		$path = update_code::get_code_path($version);

		$this->assertTrue(is_string($path) || $path === false);
	}

	public function test_set_code_path() {
		$path = update_code::set_code_path();

		$this->assertTrue(is_string($path) || $path === false);
	}

	public function test_get_file_version() {
		$version = [6, 4, 0];
		$file_version = update_code::get_file_version($version);

		$this->assertEquals('6.4.0_dedalo', $file_version);
	}

	public function test_set_development_path() {
		$path = update_code::set_development_path();

		$this->assertTrue(is_string($path) || $path === false);
	}

	public function test_get_code_url() {
		$version = [6, 4, 0];
		$url = update_code::get_code_url($version);

		$this->assertTrue(is_string($url) || $url === false);
	}

	public function test_get_code_update_info() {
		$client_version = [6, 4, 0];
		$response = update_code::get_code_update_info($client_version);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('msg', $response);
	}
}
