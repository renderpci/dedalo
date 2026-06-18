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
}
