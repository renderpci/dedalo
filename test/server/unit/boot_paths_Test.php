<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';

final class boot_paths_Test extends TestCase {

	public function test_web_resolution() : void {
		$r = boot_paths::resolve(
			'/srv/dedalo/config',
			['HTTP_HOST' => 'example.org', 'HTTPS' => 'on', 'REQUEST_URI' => '/dedalo/core/api/v1/json/'],
			'fpm-fcgi'
		);
		$this->assertSame('/srv/dedalo', $r['paths.root']);        // dirname(config_dir)
		$this->assertSame('/dedalo', $r['paths.root_web']);        // '/' . first REQUEST_URI segment
		$this->assertSame('example.org', $r['paths.host']);
		$this->assertSame('https://', $r['paths.protocol']);
	}

	public function test_cli_resolution() : void {
		$r = boot_paths::resolve('/srv/dedalo/config', [], 'cli');
		$this->assertSame('/srv/dedalo', $r['paths.root']);
		$this->assertSame('/dedalo', $r['paths.root_web']);        // CLI default
		$this->assertSame('localhost', $r['paths.host']);          // CLI default
		$this->assertSame('http://', $r['paths.protocol']);        // no HTTPS
	}

	public function test_http_when_https_absent_or_off() : void {
		$off = boot_paths::resolve('/x/config', ['HTTP_HOST' => 'h', 'HTTPS' => 'off', 'REQUEST_URI' => '/d/x'], 'fpm-fcgi');
		$this->assertSame('http://', $off['paths.protocol']);
		$this->assertSame('/d', $off['paths.root_web']);
	}

	public function test_missing_host_is_empty_string_on_web() : void {
		$r = boot_paths::resolve('/x/config', ['REQUEST_URI' => '/d/x'], 'fpm-fcgi');
		$this->assertSame('', $r['paths.host']);  // $_SERVER['HTTP_HOST'] ?? '' (v6 line 33)
	}

	public function test_root_web_from_script_location_single_segment() : void {
		// SCRIPT_* present → derive from install location, not the first URI segment
		$r = boot_paths::resolve(
			'/srv/dedalo/config',
			[
				'HTTP_HOST'       => 'h',
				'REQUEST_URI'     => '/dedalo/core/api/v1/json/',
				'SCRIPT_NAME'     => '/dedalo/core/api/v1/json/index.php',
				'SCRIPT_FILENAME' => '/srv/dedalo/core/api/v1/json/index.php',
			],
			'fpm-fcgi'
		);
		$this->assertSame('/dedalo', $r['paths.root_web']);
	}

	public function test_root_web_for_multi_segment_mount_keeps_full_path() : void {
		// the old first-segment heuristic returned '/apps' (dropping /dedalo) → broken URLs
		$r = boot_paths::resolve(
			'/srv/apps/dedalo/config',
			[
				'HTTP_HOST'       => 'h',
				'REQUEST_URI'     => '/apps/dedalo/core/index.php',
				'SCRIPT_NAME'     => '/apps/dedalo/core/index.php',
				'SCRIPT_FILENAME' => '/srv/apps/dedalo/core/index.php',
			],
			'fpm-fcgi'
		);
		$this->assertSame('/apps/dedalo', $r['paths.root_web']); // not the old '/apps'
	}

	public function test_root_web_for_root_mounted_install_is_empty_no_double_slash() : void {
		// the old heuristic gave '/' → core_url '//core'; now '' → core_url '/core'
		$r = boot_paths::resolve(
			'/var/www/html/config',
			[
				'HTTP_HOST'       => 'h',
				'REQUEST_URI'     => '/core/index.php',
				'SCRIPT_NAME'     => '/core/index.php',
				'SCRIPT_FILENAME' => '/var/www/html/core/index.php',
			],
			'fpm-fcgi'
		);
		$this->assertSame('', $r['paths.root_web']);
	}

	public function test_root_web_falls_back_to_first_segment_without_script_vars() : void {
		// no SCRIPT_* (legacy behavior preserved)
		$r = boot_paths::resolve('/srv/dedalo/config', ['HTTP_HOST' => 'h', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('/dedalo', $r['paths.root_web']);
	}

	public function test_root_web_no_spurious_prefix_match_on_sibling_dir() : void {
		// install root /srv/dedalo must NOT match a sibling /srv/dedalo2 → fall back, don't mis-derive
		$r = boot_paths::resolve(
			'/srv/dedalo/config',
			[
				'HTTP_HOST'       => 'h',
				'REQUEST_URI'     => '/dedalo2/index.php',
				'SCRIPT_NAME'     => '/dedalo2/index.php',
				'SCRIPT_FILENAME' => '/srv/dedalo2/index.php',
			],
			'fpm-fcgi'
		);
		$this->assertSame('/dedalo2', $r['paths.root_web']); // fallback to first segment, not '/dedalo'
	}
}
