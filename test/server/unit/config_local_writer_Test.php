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
		foreach (glob($this->tmp . '/*') ?: [] as $f) { @unlink($f); }
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

	public function test_non_writable_dir_returns_false() : void {
		$target = '/proc/nonexistent_dir_dedalo/config.local.php'; // unwritable on macOS/Linux CI
		$r = config_local_writer::set_values(['areas.deny' => []], $target);
		$this->assertFalse($r->result);
	}
}
