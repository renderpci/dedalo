<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';

final class config_compiler_Test extends TestCase {

	/** @return config_key[] */
	private function catalog() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_resolve_defaults_only() : void {
		$r = config_compiler::resolve($this->catalog(), []);
		$this->assertSame(222, $r['media.image.thumb_width']);
		$this->assertSame('/dedalo/core', $r['paths.core_url']);
		// derived computed from default core_url
		$this->assertSame('/dedalo/core/media_engine/img.php', $r['media.image.file_url']);
		// non-compilable scopes excluded
		$this->assertArrayNotHasKey('lang.application_lang', $r);  // REQUEST
		$this->assertArrayNotHasKey('db.password', $r);            // SECRET
	}

	public function test_scalar_override_replaces() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.image.thumb_width' => 300]]);
		$this->assertSame(300, $r['media.image.thumb_width']);
	}

	public function test_list_override_replaces_not_appends() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.image.extensions_supported' => ['jpg']]]);
		$this->assertSame(['jpg'], $r['media.image.extensions_supported']);
	}

	public function test_map_override_deep_merges() : void {
		$r = config_compiler::resolve($this->catalog(), [['media.magick_config' => ['is_opaque' => false]]]);
		// remove_layer_0 retained from default, is_opaque overridden
		$this->assertSame(['remove_layer_0' => false, 'is_opaque' => false], $r['media.magick_config']);
	}

	public function test_derived_recomputed_after_override() : void {
		$r = config_compiler::resolve($this->catalog(), [['paths.core_url' => '/srv/core']]);
		$this->assertSame('/srv/core/media_engine/img.php', $r['media.image.file_url']);
	}

	public function test_higher_layer_wins() : void {
		$r = config_compiler::resolve($this->catalog(), [
			['media.image.thumb_width' => 300],  // lower
			['media.image.thumb_width' => 400],  // higher
		]);
		$this->assertSame(400, $r['media.image.thumb_width']);
	}

	public function test_deep_merge_replaces_list_subkeys_not_hybrid() : void {
		$catalog = [
			new config_key(
				path: 'm', const: 'M', type: 'map',
				default: ['formats' => ['png', 'jpg'], 'flag' => true],
				scope: config_scope::STATIC, merge: config_merge::DEEP
			),
		];
		$r = config_compiler::resolve($catalog, [['m' => ['formats' => ['gif']]]]);
		$this->assertSame(['gif'], $r['m']['formats']);  // list REPLACED, not merged
		$this->assertTrue($r['m']['flag']);              // sibling scalar retained (deep)
	}

	public function test_unknown_and_non_static_overrides_ignored() : void {
		$base = config_compiler::resolve($this->catalog(), []);
		$with = config_compiler::resolve($this->catalog(), [[
			'nonexistent.key'       => 'x',      // unknown key
			'db.password'           => 'hacked', // SECRET (non-STATIC)
			'lang.application_lang' => 'lg-x',   // REQUEST (non-STATIC)
		]]);
		$this->assertSame($base, $with);                       // all ignored
		$this->assertArrayNotHasKey('db.password', $with);
	}

	public function test_signature_is_deterministic_and_sensitive() : void {
		$a = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'abc']);
		$b = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'abc']);
		$c = config_compiler::signature(['v' => '7.0', 'env' => 'pro', 'hash' => 'XYZ']);
		$this->assertSame($a, $b);
		$this->assertNotSame($a, $c);
		$this->assertMatchesRegularExpression('/^[0-9a-f]{40}$/', $a);
	}

	public function test_cache_path_keyed_by_host_and_entity() : void {
		$this->assertSame(
			'/cache/config/config.example.org.museo_x.php',
			config_compiler::cache_path('/cache/config', 'example.org', 'museo_x')
		);
	}

	public function test_write_compiled_is_loadable_and_roundtrips() : void {
		$dir = sys_get_temp_dir() . '/dedalo_cc_' . getmypid() . '_' . uniqid();
		mkdir($dir, 0750, true);
		$path = $dir . '/config.host.entity.php';
		$flat = ['media.image.thumb_width' => 222, 'media.magick_config' => ['remove_layer_0' => false, 'is_opaque' => null], 'paths.core_url' => '/dedalo/core'];

		config_compiler::write_compiled($path, $flat);

		$this->assertFileExists($path);
		$loaded = require $path;          // opcache-friendly PHP array literal
		$this->assertSame($flat, $loaded);
		// no leftover temp files in the dir
		$this->assertSame([], glob($dir . '/*.tmp.*'));

		array_map('unlink', glob($dir . '/*'));
		rmdir($dir);
	}

	public function test_resolve_then_compile_end_to_end() : void {
		$dir = sys_get_temp_dir() . '/dedalo_cc_' . getmypid() . '_' . uniqid();
		mkdir($dir, 0750, true);
		$flat = config_compiler::resolve($this->catalog(), [['media.image.thumb_width' => 333]]);
		$path = config_compiler::cache_path($dir, 'h', 'e');
		config_compiler::write_compiled($path, $flat);
		$loaded = require $path;
		$this->assertSame(333, $loaded['media.image.thumb_width']);
		$this->assertSame('/dedalo/core/media_engine/img.php', $loaded['media.image.file_url']);

		array_map('unlink', glob($dir . '/*'));
		rmdir($dir);
	}

	public function test_cache_path_rejects_traversal_in_host() : void {
		$this->expectException(\InvalidArgumentException::class);
		config_compiler::cache_path('/cache/config', '../../evil', 'e');
	}

	public function test_cache_path_rejects_slash_in_entity() : void {
		$this->expectException(\InvalidArgumentException::class);
		config_compiler::cache_path('/cache/config', 'host', 'a/b');
	}

	public function test_cache_path_allows_host_with_port() : void {
		$this->assertSame(
			'/c/config.localhost:8080.museo_x.php',
			config_compiler::cache_path('/c', 'localhost:8080', 'museo_x')
		);
	}

	public function test_signature_is_order_independent() : void {
		$this->assertSame(
			config_compiler::signature(['a' => 1, 'b' => 2]),
			config_compiler::signature(['b' => 2, 'a' => 1])
		);
	}
}
