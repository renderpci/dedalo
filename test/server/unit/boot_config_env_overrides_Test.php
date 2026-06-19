<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__, 3) . '/core/base/boot/class.boot_config_phases.php';

final class boot_config_env_overrides_Test extends TestCase {

	private string $dir;

	protected function setUp() : void {
		parent::setUp();
		env_loader::reset();
		$this->dir = dirname(__FILE__) . '/fixtures';
		if (!is_dir($this->dir)) { mkdir($this->dir, 0755, true); }
	}
	protected function tearDown() : void {
		env_loader::reset();
		@unlink($this->dir . '/eo.env');
		@unlink($this->dir . '/eo.env.host');
	}

	/** @return config_key[] */
	private function catalog() : array {
		return [
			new config_key('db.host',     'DD_EO_HOST',   'string', 'localhost', config_scope::STATIC),
			new config_key('feat.flag',   'DD_EO_FLAG',   'bool',   false,       config_scope::STATIC),
			new config_key('lim.n',       'DD_EO_N',      'int',    10,          config_scope::STATIC),
			new config_key('db.pass',     'DD_EO_SECRET', 'string', null,        config_scope::SECRET),
		];
	}

	public function test_static_keys_mapped_typed_host_wins_secret_excluded() : void {
		file_put_contents($this->dir . '/eo.env',      "DD_EO_HOST=base-host\nDD_EO_N=20\nDD_EO_SECRET=topsecret\n");
		file_put_contents($this->dir . '/eo.env.host', "DD_EO_HOST=host-wins\nDD_EO_FLAG=true\n");
		chmod($this->dir . '/eo.env', 0600);
		chmod($this->dir . '/eo.env.host', 0600);

		env_loader::load($this->dir . '/eo.env');       // shared base
		env_loader::load($this->dir . '/eo.env.host');  // host override — loaded last, wins

		$ov = boot_config_phases::env_overrides($this->catalog());

		$this->assertSame('host-wins', $ov['db.host']);   // .env.host overrides .env
		$this->assertSame(20, $ov['lim.n']);              // int cast, from base .env
		$this->assertTrue($ov['feat.flag']);              // bool cast, from host .env
		$this->assertArrayNotHasKey('db.pass', $ov);      // SECRET excluded (the secret/state phase emits it)
	}

	public function test_empty_when_env_defines_no_static_settings() : void {
		// secrets-only / no .env loaded → no override layer (existing installs are unaffected)
		$this->assertSame([], boot_config_phases::env_overrides($this->catalog()));
	}

	public function test_literal_null_value_becomes_php_null() : void {
		// .env can't carry a real null (e.g. a socket DB port) → the literal `null` means PHP null,
		// regardless of the key's declared type
		file_put_contents($this->dir . '/eo.env', "DD_EO_HOST=null\nDD_EO_N=null\n");
		chmod($this->dir . '/eo.env', 0600);
		env_loader::load($this->dir . '/eo.env');

		$ov = boot_config_phases::env_overrides($this->catalog());

		$this->assertNull($ov['db.host']); // string key
		$this->assertNull($ov['lim.n']);   // int key — null, not (int)'null' = 0
	}
}
