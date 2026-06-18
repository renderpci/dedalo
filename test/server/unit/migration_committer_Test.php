<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/install/class.migration_committer.php';

final class migration_committer_Test extends TestCase {

	private string $sandbox;

	protected function setUp() : void {
		parent::setUp();
		$this->sandbox = sys_get_temp_dir() . '/mc_' . getmypid() . '_' . substr(md5(__FILE__), 0, 6);
		@mkdir($this->sandbox, 0755, true);
	}
	protected function tearDown() : void {
		array_map('unlink', glob($this->sandbox . '/**/*') ?: []);
		// best-effort cleanup; temp dir
	}

	public function test_writes_new_files_atomically_and_chmods_env() : void {
		$targets = [
			'env_php' => $this->sandbox . '/private/.env',
			'config'  => $this->sandbox . '/config/local/config.php',
		];
		$artifacts = [
			'env_php' => "# secrets\nDEDALO_SALT_STRING=abc\n",
			'config'  => "<?php declare(strict_types=1);\nreturn ['db.host' => 'h'];\n",
		];
		$report = migration_committer::commit($artifacts, $targets, $this->sandbox . '/backup');

		$this->assertSame('written', $report['env_php']);
		$this->assertSame('written', $report['config']);
		$this->assertStringContainsString('DEDALO_SALT_STRING=abc', file_get_contents($targets['env_php']));
		$this->assertSame('0600', substr(sprintf('%o', fileperms($targets['env_php'])), -4));
	}

	public function test_backs_up_existing_target_before_overwriting() : void {
		$target = $this->sandbox . '/config/state.php';
		@mkdir(dirname($target), 0755, true);
		file_put_contents($target, "<?php return ['old' => 1];\n");

		$report = migration_committer::commit(
			['state' => "<?php return ['new' => 2];\n"],
			['state' => $target],
			$this->sandbox . '/backup'
		);

		$this->assertSame('written+backed-up', $report['state']);
		$this->assertStringContainsString("'new' => 2", file_get_contents($target));
		$backups = glob($this->sandbox . '/backup/*state.php*');
		$this->assertNotEmpty($backups, 'a backup of the prior state.php must exist');
		$this->assertStringContainsString("'old' => 1", file_get_contents($backups[0]));
	}

	public function test_skips_empty_or_header_only_artifacts() : void {
		$target = $this->sandbox . '/config/local/passthrough.php';
		$report = migration_committer::commit(
			['passthrough' => "<?php declare(strict_types=1);\n\n// nothing\n"],
			['passthrough' => $target],
			$this->sandbox . '/backup'
		);
		$this->assertSame('skipped-empty', $report['passthrough']);
		$this->assertFileDoesNotExist($target);
	}
}
