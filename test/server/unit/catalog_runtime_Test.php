<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_runtime_Test extends TestCase {

	/** @return array<string,config_key> */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/runtime.php' as $k) { $by[$k->path] = $k; }
		return $by;
	}

	public function test_keys_present_with_correct_scope() : void {
		$by = $this->load();
		$expect = [
			'runtime.session_handler'  => [config_scope::STATIC, 'DEDALO_SESSION_HANDLER'],
			'runtime.session_save_path'=> [config_scope::STATIC, 'DEDALO_SESSION_SAVE_PATH'],
			'runtime.cache_manager'    => [config_scope::DERIVED, 'DEDALO_CACHE_MANAGER'],
			'runtime.show_debug'       => [config_scope::USER,   'SHOW_DEBUG'],
			'runtime.show_developer'   => [config_scope::USER,   'SHOW_DEVELOPER'],
			'runtime.logger_level'     => [config_scope::USER,   'LOGGER_LEVEL'],
			'runtime.backup_on_login'  => [config_scope::STATIC, 'DEDALO_BACKUP_ON_LOGIN'],
			'runtime.backup_time_range'=> [config_scope::STATIC, 'DEDALO_BACKUP_TIME_RANGE'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_cache_manager_derives_files_path_from_sessions() : void {
		$by  = $this->load();
		$key = $by['runtime.cache_manager'];
		$this->assertSame(config_scope::DERIVED, $key->scope);
		$this->assertInstanceOf(\Closure::class, $key->derived);
		$this->assertSame(
			['manager' => 'files', 'files_path' => '/srv/sessions'],
			($key->derived)(['paths.sessions_path' => '/srv/sessions'])
		);
	}

	public function test_user_keys_have_no_default() : void {
		$by = $this->load();
		foreach (['runtime.show_debug', 'runtime.show_developer', 'runtime.logger_level'] as $p) {
			$this->assertNull($by[$p]->default, "USER key $p must have no default");
		}
	}

	public function test_backup_defaults() : void {
		$by = $this->load();
		$this->assertTrue($by['runtime.backup_on_login']->default);
		$this->assertSame(8, $by['runtime.backup_time_range']->default);
		$this->assertSame('files', $by['runtime.session_handler']->default);
		$this->assertSame('', $by['runtime.session_save_path']->default);
	}
}
