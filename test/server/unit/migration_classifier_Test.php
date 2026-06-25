<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_destination.php';
require_once dirname(__DIR__, 3) . '/install/class.constant_map.php';
require_once dirname(__DIR__, 3) . '/install/class.migration_classifier.php';

final class migration_classifier_Test extends TestCase {

	private function catalog() : array {
		return [
			new config_key('a.secret',  'DD_SECRET',  'string', null, config_scope::SECRET),
			new config_key('a.state',   'DD_STATE',   'string', null, config_scope::STATE),
			new config_key('a.static',  'DD_STATIC',  'int',    1,    config_scope::STATIC),
			new config_key('a.derived', 'DD_DERIVED', 'string', null, config_scope::DERIVED,
				config_merge::REPLACE, static fn(array $r) : string => 'd'),
			new config_key('a.request', 'DD_REQUEST', 'string', null, config_scope::REQUEST),
		];
	}

	private function rec(mixed $value = 'x', string $kind = 'literal') : array {
		return ['value' => $value, 'raw' => (string) $value, 'kind' => $kind, 'file' => 'f', 'line' => 1];
	}

	public function test_routes_known_constants_by_catalog_scope() : void {
		$records = [
			'DD_SECRET'  => $this->rec('s'),
			'DD_STATE'   => $this->rec('st'),
			'DD_STATIC'  => $this->rec(7),
			'DD_DERIVED' => $this->rec('d', 'runtime'),
			'DD_REQUEST' => $this->rec('lg', 'runtime'),
		];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(migration_destination::ENV,    $out['DD_SECRET']['destination']);
		$this->assertSame(migration_destination::STATE,  $out['DD_STATE']['destination']);
		$this->assertSame(migration_destination::CONFIG, $out['DD_STATIC']['destination']);
		$this->assertSame(migration_destination::DROP,   $out['DD_DERIVED']['destination']);
		$this->assertSame(migration_destination::DROP,   $out['DD_REQUEST']['destination']);
	}

	public function test_unknown_secret_goes_to_env() : void {
		$records = [
			'GEONAMES_ACCOUNT_USERNAME' => $this->rec('joe'),
			'DEDALO_RECOVERY_KEY'       => $this->rec('abc'),
			'MY_API_TOKEN'              => $this->rec('t'),       // substring match
			'CUSTOM_PASSWORD_X'         => $this->rec('p'),       // substring match
		];
		$out = migration_classifier::classify($records, $this->catalog());
		foreach (array_keys($records) as $name) {
			$this->assertSame(migration_destination::ENV, $out[$name]['destination'], "$name must route to ENV");
		}
	}

	public function test_unknown_non_secret_is_passthrough_and_keeps_record() : void {
		$records = ['DEDALO_PATATA' => $this->rec('potato'), 'DEDALO_CORS' => $this->rec('*')];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(migration_destination::PASSTHROUGH, $out['DEDALO_PATATA']['destination']);
		$this->assertSame(migration_destination::PASSTHROUGH, $out['DEDALO_CORS']['destination']);
		$this->assertSame('potato', $out['DEDALO_PATATA']['record']['value']);
	}

	public function test_scope_is_reported_for_known_and_null_for_unknown() : void {
		$records = ['DD_SECRET' => $this->rec('s'), 'DEDALO_PATATA' => $this->rec('p')];
		$out = migration_classifier::classify($records, $this->catalog());
		$this->assertSame(config_scope::SECRET, $out['DD_SECRET']['scope']);
		$this->assertNull($out['DEDALO_PATATA']['scope']);
	}
}
