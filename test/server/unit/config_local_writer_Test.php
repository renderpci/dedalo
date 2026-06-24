<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_local_writer.php';

final class config_local_writer_Test extends TestCase {

	private string $tmp;

	protected function setUp() : void {
		$this->tmp = sys_get_temp_dir() . '/dd_cfg_test_' . getmypid() . '_' . uniqid();
		@mkdir($this->tmp, 0700, true);
	}

	protected function tearDown() : void {
		foreach (glob($this->tmp . '/.install_backups/*') ?: [] as $f) { @unlink($f); }
		@rmdir($this->tmp . '/.install_backups');
		foreach (glob($this->tmp . '/*') ?: [] as $f) {
			if (is_dir($f)) {
				@chmod($f, 0700);
				@rmdir($f);
			} else {
				@unlink($f);
			}
		}
		@rmdir($this->tmp);
	}

	public function test_round_trip_writes_requireable_array() : void {
		$target = $this->tmp . '/config.local.php';
		$r = config_local_writer::set_values(['areas.deny' => ['dd137', 'rsc1']], $target);
		$this->assertTrue($r->result, $r->msg);
		$this->assertFileExists($target);
		$loaded = require $target;
		$this->assertIsArray($loaded);
		$this->assertSame(['dd137', 'rsc1'], $loaded['areas.deny']);
	}

	public function test_preserves_unrelated_keys() : void {
		$target = $this->tmp . '/config.local.php';
		file_put_contents($target, "<?php return ['identity.timezone' => 'Europe/Madrid'];\n");
		$r = config_local_writer::set_values(['areas.deny' => []], $target);
		$this->assertTrue($r->result, $r->msg);
		$loaded = require $target;
		$this->assertSame('Europe/Madrid', $loaded['identity.timezone']);
		$this->assertSame([], $loaded['areas.deny']);
	}

	public function test_corrupt_existing_file_is_tolerated() : void {
		$target = $this->tmp . '/config.local.php';
		file_put_contents($target, "<?php @@@ this is not valid php");
		$r = config_local_writer::set_values(['areas.deny' => ['dd137']], $target);
		$this->assertTrue($r->result, $r->msg);
		$loaded = require $target;
		$this->assertSame(['dd137'], $loaded['areas.deny']);
	}

	public function test_noncreatable_parent_dir_returns_false() : void {
		$target = '/dev/null/dedalo_cannot/config.local.php'; // /dev/null is a file, not a dir; path cannot be created cross-platform
		$r = config_local_writer::set_values(['areas.deny' => []], $target);
		$this->assertFalse($r->result);
	}

	public function test_dir_is_writable_probe_returns_false_when_dir_not_writable() : void {
		if (function_exists('posix_getuid') && posix_getuid() === 0) {
			$this->markTestSkipped('chmod write-protection is bypassed as root');
		}

		$readonly_dir = $this->tmp . '/readonly_subdir';
		@mkdir($readonly_dir, 0700);
		$target = $readonly_dir . '/config.local.php';

		// Make directory read-only (no write permission)
		@chmod($readonly_dir, 0500);

		$r = config_local_writer::set_values(['areas.deny' => []], $target);
		$this->assertFalse($r->result);

		// Restore directory to writable state for cleanup
		@chmod($readonly_dir, 0700);
	}
}
