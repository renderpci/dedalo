<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config.php';

final class config_Test extends TestCase {

	protected function setUp() : void {
		parent::setUp();
		config::reset();
	}

	protected function tearDown() : void {
		config::reset();
	}

	public function test_boot_then_get() : void {
		config::boot(['media.image.thumb_width' => 222, 'paths.core_url' => '/dedalo/core']);
		$this->assertSame(222, config::i()->get('media.image.thumb_width'));
		$this->assertSame(222, config::i()->int('media.image.thumb_width'));
		$this->assertSame('/dedalo/core', config('paths.core_url'));
	}

	public function test_missing_key_without_default_throws() : void {
		config::boot([]);
		$this->expectException(\RuntimeException::class);
		config::i()->get('nope.missing');
	}

	public function test_missing_key_with_default_returns_default() : void {
		config::boot([]);
		$this->assertSame('fallback', config::i()->get('nope.missing', 'fallback'));
		$this->assertSame('fallback', config('nope.missing', 'fallback'));
		$this->assertFalse(config::i()->has('nope.missing'));
	}

	public function test_typed_accessors() : void {
		config::boot(['a.flag' => '1', 'a.list' => ['x', 'y'], 'a.name' => 'dedalo']);
		$this->assertTrue(config::i()->bool('a.flag'));
		$this->assertSame(['x', 'y'], config::i()->list('a.list'));
		$this->assertSame('dedalo', config::i()->str('a.name'));
	}

	public function test_i_throws_when_not_booted() : void {
		config::reset();
		$this->expectException(\RuntimeException::class);
		config::i();
	}
}
