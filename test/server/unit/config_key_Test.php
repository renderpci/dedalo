<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class config_key_Test extends TestCase {

	public function test_minimal_key_defaults() : void {
		$k = new config_key(path: 'media.image.thumb_width', const: 'DEDALO_IMAGE_THUMB_WIDTH', type: 'int', default: 222);
		$this->assertSame('media.image.thumb_width', $k->path);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $k->const);
		$this->assertSame('int', $k->type);
		$this->assertSame(222, $k->default);
		$this->assertSame(config_scope::STATIC, $k->scope);
		$this->assertSame(config_merge::REPLACE, $k->merge);
		$this->assertNull($k->derived);
		$this->assertSame('', $k->doc);
	}

	public function test_const_can_be_null_for_new_world_keys() : void {
		$k = new config_key(path: 'areas.deny', const: null, type: 'list', default: []);
		$this->assertNull($k->const);
	}

	public function test_scope_and_merge_overrides() : void {
		$k = new config_key(
			path: 'media.magick_config', const: 'MAGICK_CONFIG', type: 'map',
			default: ['a' => 1], scope: config_scope::STATIC, merge: config_merge::DEEP
		);
		$this->assertSame(config_merge::DEEP, $k->merge);
	}

	public function test_derived_closure_is_stored() : void {
		$fn = static fn(array $r) : string => $r['paths.core_url'] . '/x';
		$k = new config_key(path: 'media.image.file_url', const: 'DEDALO_IMAGE_FILE_URL', type: 'string', scope: config_scope::DERIVED, derived: $fn);
		$this->assertSame(config_scope::DERIVED, $k->scope);
		$this->assertInstanceOf(\Closure::class, $k->derived);
	}

	public function test_scope_enum_has_all_cases() : void {
		$names = array_map(static fn(config_scope $c) : string => $c->name, config_scope::cases());
		sort($names);
		$this->assertSame(
			['DERIVED', 'DERIVED_REQUEST', 'PASSTHROUGH', 'REQUEST', 'SECRET', 'STATE', 'STATIC', 'USER'],
			$names
		);
	}
}
