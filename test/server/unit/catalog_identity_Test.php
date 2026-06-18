<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_identity_Test extends TestCase {

	/** @return array<string,config_key> by path */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/identity.php' as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	public function test_keys_present_with_correct_scope() : void {
		$by = $this->load();
		$expect = [
			'identity.salt_string'        => [config_scope::SECRET,  'DEDALO_SALT_STRING'],
			'identity.timezone'           => [config_scope::STATIC,  'DEDALO_TIMEZONE'],
			'identity.locale'             => [config_scope::STATIC,  'DEDALO_LOCALE'],
			'identity.date_order'         => [config_scope::STATIC,  'DEDALO_DATE_ORDER'],
			'identity.entity'             => [config_scope::STATIC,  'DEDALO_ENTITY'],
			'identity.entity_label'       => [config_scope::DERIVED, 'DEDALO_ENTITY_LABEL'],
			'identity.entity_id'          => [config_scope::STATIC,  'DEDALO_ENTITY_ID'],
			'identity.development_server' => [config_scope::STATIC,  'DEVELOPMENT_SERVER'],
			'identity.encryption_mode'    => [config_scope::STATIC,  'ENCRYPTION_MODE'],
		];
		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame($scope, $by[$path]->scope, "scope of $path");
			$this->assertSame($const, $by[$path]->const, "const of $path");
		}
	}

	public function test_spot_check_defaults_match_sample() : void {
		$by = $this->load();
		$this->assertSame('Europe/Madrid', $by['identity.timezone']->default);
		$this->assertSame('dmy', $by['identity.date_order']->default);
		$this->assertFalse($by['identity.development_server']->default);
		$this->assertSame(0, $by['identity.entity_id']->default);
		$this->assertSame('es-ES',          $by['identity.locale']->default);
		$this->assertSame('my_entity_name', $by['identity.entity']->default);
		$this->assertSame('openssl',        $by['identity.encryption_mode']->default);
	}

	public function test_entity_label_derives_from_entity() : void {
		$by = $this->load();
		$fn = $by['identity.entity_label']->derived;
		$this->assertSame('museo_x', $fn(['identity.entity' => 'museo_x']));
	}
}
