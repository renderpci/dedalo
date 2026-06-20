<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_paths.php';

final class boot_paths_proxy_Test extends TestCase {

	public function test_https_via_direct_server_flag() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTPS' => 'on', 'HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('https://', $p['paths.protocol']);
	}

	public function test_https_via_forwarded_proto_behind_proxy() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('https://', $p['paths.protocol']);
	}

	public function test_plain_http_when_neither_present() : void {
		$p = boot_paths::resolve('/srv/dedalo/config', ['HTTP_HOST' => 'x', 'REQUEST_URI' => '/dedalo/x'], 'fpm-fcgi');
		$this->assertSame('http://', $p['paths.protocol']);
	}
}
