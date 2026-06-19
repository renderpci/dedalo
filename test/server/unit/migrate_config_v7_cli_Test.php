<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class migrate_config_v7_cli_Test extends TestCase {

	private string $sandbox;
	private string $script;

	protected function setUp() : void {
		parent::setUp();
		$this->script = dirname(__DIR__, 3) . '/install/migrate_config_v7.php';
		$this->sandbox = sys_get_temp_dir() . '/mcli_' . getmypid() . '_' . substr(md5(uniqid('', true)), 0, 6);
		@mkdir($this->sandbox . '/config', 0755, true);
		// a minimal legacy config to migrate
		file_put_contents($this->sandbox . '/config/config.php', "<?php\ndefine('DEDALO_ENTITY', 'sbx');\ndefine('DEDALO_PATATA', 'potato');\n");
	}

	private function run_cli(array $args) : array {
		$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($this->script);
		foreach ($args as $a) { $cmd .= ' ' . escapeshellarg($a); }
		$cmd .= ' 2>&1';
		exec($cmd, $out, $code);
		return [implode("\n", $out), $code];
	}

	private function common() : array {
		return [
			'--config-dir=' . $this->sandbox . '/config',
			'--private-dir=' . $this->sandbox . '/private',
			'--bun-env=' . $this->sandbox . '/bun.env',
			'--target-config-dir=' . $this->sandbox . '/config',
			'--backup-base=' . $this->sandbox . '/backups',
		];
	}

	public function test_dry_run_prints_plan_and_writes_nothing() : void {
		[$out, $code] = $this->run_cli(array_merge(['--dry-run'], $this->common()));
		$this->assertSame(0, $code, $out);
		$this->assertStringContainsString('DEDALO_PATATA', $out);
		$this->assertFileDoesNotExist($this->sandbox . '/private/.env');
		$this->assertFileDoesNotExist($this->sandbox . '/private/passthrough.php');
	}

	public function test_commit_refused_without_yes() : void {
		[$out, $code] = $this->run_cli($this->common()); // no --dry-run, no --yes
		$this->assertSame(1, $code);
		$this->assertStringContainsString('--yes', $out);
		$this->assertFileDoesNotExist($this->sandbox . '/private/passthrough.php');
	}

	public function test_yes_commits_artifacts() : void {
		[$out, $code] = $this->run_cli(array_merge(['--yes'], $this->common()));
		$this->assertSame(0, $code, $out);
		$this->assertFileExists($this->sandbox . '/private/passthrough.php');
		$this->assertStringContainsString("define('DEDALO_PATATA', 'potato')", file_get_contents($this->sandbox . '/private/passthrough.php'));
	}
}
