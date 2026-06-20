<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.compat_shim.php';

final class compat_shim_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_emit_records_static_and_derived_constants() : void {
		$flat = config_compiler::resolve($this->catalog(), []);
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $this->catalog(), $spy);

		$this->assertSame(222, $recorded['DEDALO_IMAGE_THUMB_WIDTH']);                       // STATIC
		$this->assertSame('/dedalo/core/media_engine/img.php', $recorded['DEDALO_IMAGE_FILE_URL']); // DERIVED
	}

	public function test_emit_excludes_request_and_secret_constants() : void {
		// even if a request/secret value somehow appears in the flat map, the shim must not emit it
		$flat = config_compiler::resolve($this->catalog(), []);
		$flat['lang.application_lang'] = 'lg-eng'; // pretend it leaked into the map
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $this->catalog(), $spy);

		$this->assertArrayNotHasKey('DEDALO_APPLICATION_LANG', $recorded); // REQUEST scope excluded
		$this->assertArrayNotHasKey('DEDALO_PASSWORD_CONN', $recorded);    // SECRET not in resolved map
	}

	public function test_default_definer_guards_already_defined() : void {
		// use a unique throwaway constant so we never pollute real DEDALO_* names
		if (!defined('DD_SHIM_TEST_CONST')) {
			define('DD_SHIM_TEST_CONST', 'original');
		}
		$catalog = [new config_key(path: 'x.test', const: 'DD_SHIM_TEST_CONST', type: 'string')];
		$flat = ['x.test' => 'changed'];
		// default definer: must NOT redefine an already-defined constant (no error, value unchanged)
		compat_shim::emit($flat, $catalog);
		$this->assertSame('original', constant('DD_SHIM_TEST_CONST'));
	}

	public function test_emit_skips_keys_with_null_const() : void {
		$catalog = [new config_key(path: 'areas.deny', const: null, type: 'list', default: [])];
		$flat = ['areas.deny' => ['dd137']];
		$recorded = [];
		$spy = static function (string $name, mixed $value) use (&$recorded) : void {
			$recorded[$name] = $value;
		};
		compat_shim::emit($flat, $catalog, $spy);
		$this->assertSame([], $recorded);
	}
}
