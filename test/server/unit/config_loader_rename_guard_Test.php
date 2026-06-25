<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

/**
* Guards the config.php → bootstrap.php rename: every in-repo BOOT entry point must include
* config/bootstrap.php, never config/config.php. A regression (someone re-adding a config/config.php
* boot include) becomes a CI failure. Only the legacy-config readers — which read the file literally
* named config.php — are allowed to mention it in an include/require.
*/
final class config_loader_rename_guard_Test extends TestCase {

	/** Files allowed to include/require config/config.php (legacy readers / v6 helper). */
	private const ALLOW = [
		'install/boot_diff_run.php',                       // reads the LEGACY config for the boot diff
		'diffusion/migration/helpers/run_v6_diffusion.php', // points at the v6 tree's config.php
	];

	public function test_no_stray_config_config_php_boot_includes() : void {
		$repo = dirname(__DIR__, 3);
		$offenders = [];
		$rii = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator($repo, FilesystemIterator::SKIP_DOTS)
		);
		foreach ($rii as $f) {
			if ($f->getExtension() !== 'php') {
				continue;
			}
			$path = $f->getPathname();
			if (preg_match('#/(vendor|node_modules|\.git)/#', $path)) {
				continue;
			}
			$rel = ltrim(str_replace($repo, '', $path), '/');
			if (in_array($rel, self::ALLOW, true)) {
				continue;
			}
			$lines = file($path);
			if ($lines === false) {
				continue;
			}
			foreach ($lines as $line) {
				if (strpos($line, 'config/config.php') === false) {
					continue;
				}
				$trim = ltrim($line);
				if ($trim === '' || $trim[0] === '*' || str_starts_with($trim, '/*')
					|| str_starts_with($trim, '//') || str_starts_with($trim, '#')) {
					continue; // comment / docblock line — not an include
				}
				if (preg_match('/\b(include|include_once|require|require_once)\b/', $line)) {
					$offenders[] = $rel;
					break;
				}
			}
		}
		$this->assertSame(
			[],
			$offenders,
			"Boot includes must point at config/bootstrap.php, not config/config.php:\n" . implode("\n", $offenders)
		);
	}

	public function test_bootstrap_boots_and_emits_root_path() : void {
		$repo = dirname(__DIR__, 3);
		$this->assertFileExists($repo . '/config/bootstrap.php');
		// Smoke test: booting the renamed loader in a clean subprocess must still emit a core
		// boot constant (the unit suite itself does not boot the app, so we shell out).
		$code = 'require ' . var_export($repo . '/config/bootstrap.php', true) . '; exit(defined("DEDALO_ROOT_PATH") ? 0 : 1);';
		$cmd  = escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1';
		exec($cmd, $out, $exit);
		$this->assertSame(0, $exit, "booting config/bootstrap.php should define DEDALO_ROOT_PATH:\n" . implode("\n", $out));
	}
}
