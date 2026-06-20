<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_validator.php';

final class migration_validator_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('db.host',     'DD_V_HOST',    'string', 'localhost', config_scope::STATIC),
			new config_key('db.password', 'DD_V_SECRET',  'string', null, config_scope::SECRET),
			new config_key('lang.app',    'DD_V_LANG',    'string', null, config_scope::REQUEST),
			new config_key('paths.host',  'DD_V_WEBHOST', 'string', '', config_scope::DERIVED_REQUEST),
		];
	}

	public function test_faithful_when_migrated_reproduces_old_minus_request_user() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_V_LANG' => 'lg-eng', 'DD_PATATA' => 'potato'];
		$migrated = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_PATATA' => 'potato']; // DD_V_LANG legitimately absent
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertTrue($r['faithful']);
		$this->assertSame([], $r['missing']);
		$this->assertSame([], $r['value_mismatches']);
		$this->assertSame(['DD_V_LANG'], $r['excluded_absent_ok']);
	}

	public function test_missing_non_excluded_constant_is_unfaithful() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_PATATA' => 'potato'];
		$migrated = ['DD_V_HOST' => 'h']; // DD_PATATA (passthrough, not REQUEST/USER) dropped
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertFalse($r['faithful']);
		$this->assertSame(['DD_PATATA'], $r['missing']);
	}

	public function test_value_mismatch_is_unfaithful_but_derived_request_is_reported_not_fatal() : void {
		$old = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 's', 'DD_V_WEBHOST' => 'real-web'];
		$migrated = ['DD_V_HOST' => 'h', 'DD_V_SECRET' => 'WRONG', 'DD_V_WEBHOST' => 'localhost'];
		$r = migration_validator::validate($old, $migrated, $this->catalog());
		$this->assertFalse($r['faithful']);                       // secret value differs
		$this->assertSame(['DD_V_SECRET'], $r['value_mismatches']);
		$this->assertSame(['DD_V_WEBHOST'], $r['derived_request_diffs']); // reported, non-fatal
	}
}
