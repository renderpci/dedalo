<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.config_caster.php';

final class config_caster_Test extends TestCase {

	public function test_null_marker_becomes_real_null_for_every_type() : void {
		// .env can't carry a real null; the literal `null` marker means PHP null regardless of type
		$this->assertNull(config_caster::cast('null', 'string'));
		$this->assertNull(config_caster::cast('null', 'int'));
		$this->assertNull(config_caster::cast('null', 'bool'));
		$this->assertNull(config_caster::cast('null', 'list'));
		$this->assertNull(config_caster::cast('  NULL ', 'string')); // trimmed + case-insensitive
	}

	public function test_int_cast() : void {
		$this->assertSame(5432, config_caster::cast('5432', 'int'));
		$this->assertSame(0,    config_caster::cast('not-a-number', 'int'));
	}

	public function test_bool_cast_is_trimmed_and_case_insensitive() : void {
		foreach (['1', 'true', 'TRUE', 'yes', 'on', ' true '] as $truthy) {
			$this->assertTrue(config_caster::cast($truthy, 'bool'), "[$truthy] should be true");
		}
		foreach (['0', 'false', 'no', 'off', '', 'anything'] as $falsy) {
			$this->assertFalse(config_caster::cast($falsy, 'bool'), "[$falsy] should be false");
		}
	}

	public function test_list_and_map_json_decode() : void {
		$this->assertSame(['a', 'b'],        config_caster::cast('["a","b"]', 'list'));
		$this->assertSame(['srv' => 'tok'],  config_caster::cast('{"srv":"tok"}', 'map'));
	}

	public function test_malformed_json_yields_empty_array() : void {
		$this->assertSame([], config_caster::cast('{not json', 'list'));
		$this->assertSame([], config_caster::cast('', 'map'));
	}

	public function test_string_is_verbatim() : void {
		$this->assertSame('p@ss"w0rd', config_caster::cast('p@ss"w0rd', 'string'));
		$this->assertSame('localhost', config_caster::cast('localhost', 'string'));
	}
}
