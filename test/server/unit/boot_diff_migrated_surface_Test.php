<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class boot_diff_migrated_surface_Test extends TestCase {

	private string $sb;
	private string $script;

	protected function setUp() : void {
		parent::setUp();
		$this->script = dirname(__DIR__, 3) . '/install/boot_diff_migrated_surface.php';
		$this->sb = sys_get_temp_dir() . '/bdms_' . getmypid() . '_' . substr(md5(uniqid('', true)), 0, 6);
		@mkdir($this->sb . '/private', 0755, true);
		@mkdir($this->sb . '/config/local', 0755, true);

		// migrated artifacts
		file_put_contents($this->sb . '/private/.env', "DD_M_SECRET=migpw\n");
		chmod($this->sb . '/private/.env', 0600); // env_loader refuses group/world-writable
		file_put_contents($this->sb . '/config/local/config.php', "<?php declare(strict_types=1);\nreturn array ( 'db.host' => 'pg.mig.org' );\n");
		file_put_contents($this->sb . '/config/state.php', "<?php declare(strict_types=1);\nreturn array ( 'state.info' => 'mig-fingerprint' );\n");
		file_put_contents($this->sb . '/config/local/passthrough.php', "<?php declare(strict_types=1);\nif (!defined('DD_M_PATATA')) { define('DD_M_PATATA', 'potato'); }\n");

		// fixture catalog — NO requires: boot_diff_migrated_surface.php loads config_key/
		// config_scope/config_merge BEFORE require-ing this file, so the symbols exist.
		file_put_contents($this->sb . '/catalog.php', <<<'PHP'
		<?php declare(strict_types=1);
		return [
			new config_key('db.host',     'DD_M_HOST',   'string', 'localhost', config_scope::STATIC),
			new config_key('db.password', 'DD_M_SECRET', 'string', null, config_scope::SECRET),
			new config_key('state.info',  'DD_M_STATE',  'string', null, config_scope::STATE),
		];
		PHP);
		// a fixture subsystem file (stands in for version.inc/dd_tipos)
		file_put_contents($this->sb . '/subsys.php', "<?php if (!defined('DD_M_TIPO')) define('DD_M_TIPO', 'dd1');\n");
	}

	protected function tearDown() : void {
		if (is_dir($this->sb)) {
			$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($this->sb, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
			foreach ($it as $f) { $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
			@rmdir($this->sb);
		}
	}

	public function test_migrated_surface_reflects_env_state_override_and_passthrough() : void {
		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($this->script)
			. ' ' . escapeshellarg('--staging=' . $this->sb)
			. ' ' . escapeshellarg('--catalog=' . $this->sb . '/catalog.php')
			. ' ' . escapeshellarg('--subsystem=' . $this->sb . '/subsys.php')
			. ' 2>&1';
		$surface = json_decode((string) shell_exec($cmd), true);

		$this->assertIsArray($surface, 'script must print a JSON surface');
		$this->assertSame('migpw', $surface['DD_M_SECRET']);          // SECRET from migrated .env
		$this->assertSame('pg.mig.org', $surface['DD_M_HOST']);       // STATIC override from migrated local config
		$this->assertSame('mig-fingerprint', $surface['DD_M_STATE']); // STATE from migrated state.php
		$this->assertSame('potato', $surface['DD_M_PATATA']);         // passthrough preserved
		$this->assertSame('dd1', $surface['DD_M_TIPO']);              // subsystem include
	}
}
