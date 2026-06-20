<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.config_auto_migrate.php';

/**
* Scenario coverage for the transparent v7-pre-flip → .env config migration (config_auto_migrate):
* detection, the carry-through of DEDALO_INSTALL_STATUS, quarantine + shim, the G2 silent-secret
* refusal, and idempotency. Uses a sandbox config-dir/private-dir against the REAL catalog.
*/
final class config_auto_migrate_Test extends TestCase {

	private string $repo;
	private string $sandbox;

	protected function setUp() : void {
		parent::setUp();
		$this->repo    = dirname(__DIR__, 3);
		$this->sandbox = sys_get_temp_dir() . '/cam_' . getmypid() . '_' . substr(md5(uniqid('', true)), 0, 6);
		@mkdir($this->sandbox . '/config', 0755, true);
	}

	protected function tearDown() : void {
		$this->rmrf($this->sandbox);
		parent::tearDown();
	}

	private function rmrf(string $dir) : void {
		if (!is_dir($dir)) {
			return;
		}
		$it = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
			RecursiveIteratorIterator::CHILD_FIRST
		);
		foreach ($it as $f) {
			$f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
		}
		@rmdir($dir);
	}

	/** Write a realistic legacy (pre-flip) config: an installed box with a static DB password. */
	private function write_legacy() : void {
		$cfg = $this->sandbox . '/config';
		file_put_contents($cfg . '/config.php',      "<?php\ndefine('DEDALO_ENTITY', 'sbx');\ndefine('DEDALO_PATATA', 'potato');\n");
		file_put_contents($cfg . '/config_db.php',   "<?php\ndefine('DEDALO_PASSWORD_CONN', 'pgpass123');\n");
		file_put_contents($cfg . '/config_core.php', "<?php\ndefine('DEDALO_INSTALL_STATUS', 'installed');\n");
	}

	private function migrate() : array {
		return config_auto_migrate::run(
			$this->repo,
			$this->sandbox . '/config',
			$this->sandbox . '/private',
			$this->sandbox . '/bun.env',
			$this->sandbox . '/backups'
		);
	}

	public function test_needed_true_on_preflip_box() : void {
		$this->write_legacy();
		$this->assertTrue(config_auto_migrate::needed($this->sandbox . '/config', $this->sandbox . '/private'));
	}

	public function test_needed_false_on_fresh_download() : void {
		$this->assertFalse(config_auto_migrate::needed($this->sandbox . '/config', $this->sandbox . '/private'));
	}

	public function test_needed_false_when_sentinel_present() : void {
		$this->write_legacy();
		@mkdir($this->sandbox . '/private', 0700, true);
		file_put_contents($this->sandbox . '/private/.migration.json', '{}');
		$this->assertFalse(config_auto_migrate::needed($this->sandbox . '/config', $this->sandbox . '/private'));
	}

	public function test_run_migrates_carries_install_status_quarantines_and_shims() : void {
		$this->write_legacy();
		$this->migrate();

		$priv = $this->sandbox . '/private';
		$cfg  = $this->sandbox . '/config';

		// secrets relocated into ../private/.env
		$this->assertFileExists($priv . '/.env');
		$this->assertStringContainsString('DEDALO_PASSWORD_CONN', file_get_contents($priv . '/.env'));

		// DEDALO_INSTALL_STATUS carried VERBATIM into state.php → wizard stays off
		$this->assertFileExists($priv . '/state.php');
		$state = require $priv . '/state.php';
		$this->assertSame('installed', $state['state.install_status'] ?? null);

		// completion sentinel written
		$this->assertFileExists($priv . '/.migration.json');

		// legacy secret files quarantined OUT of the web root; shim left in their place
		$this->assertFileDoesNotExist($cfg . '/config_core.php');
		$this->assertFileDoesNotExist($cfg . '/config_db.php');
		$this->assertStringContainsString("require __DIR__ . '/bootstrap.php'", file_get_contents($cfg . '/config.php'));
		$this->assertNotEmpty(glob($this->sandbox . '/backups/*/*/config_core.php.legacy'));
	}

	public function test_run_refuses_on_dynamic_secret_and_writes_nothing() : void {
		$cfg = $this->sandbox . '/config';
		file_put_contents($cfg . '/config.php',      "<?php\ndefine('DEDALO_ENTITY', 'sbx');\n");
		file_put_contents($cfg . '/config_db.php',   "<?php\ndefine('DEDALO_PASSWORD_CONN', \$_SERVER['DB_PW'] ?? '');\n");
		file_put_contents($cfg . '/config_core.php', "<?php\ndefine('DEDALO_INSTALL_STATUS', 'installed');\n");

		try {
			$this->migrate();
			$this->fail('expected config_migrate_blocked for a dynamic secret');
		} catch (config_migrate_blocked $e) {
			$this->assertStringContainsString('DEDALO_PASSWORD_CONN', $e->getMessage());
		}
		// G2 refuses BEFORE committing: no artifacts, no sentinel, legacy untouched
		$this->assertFileDoesNotExist($this->sandbox . '/private/.env');
		$this->assertFileDoesNotExist($this->sandbox . '/private/.migration.json');
		$this->assertFileExists($cfg . '/config_db.php');
	}

	public function test_run_is_idempotent_after_sentinel() : void {
		$this->write_legacy();
		$this->migrate();
		// second run short-circuits on the sentinel: returns empty, throws nothing
		$this->assertSame([], $this->migrate());
	}
}
