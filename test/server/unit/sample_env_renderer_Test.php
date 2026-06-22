<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.sample_env_renderer.php';

/**
* SAMPLE_ENV_RENDERER_TEST
* Verifies the catalog → sample.env reference renderer: every configurable constant
* appears, commented out at its default, grouped by domain and tagged by scope.
*/
final class sample_env_renderer_Test extends TestCase {

	private static function render() : string {
		return sample_env_renderer::render(null, '2026-01-01');
	}

	public function test_render_returns_non_empty_documented_text() : void {
		$out = self::render();
		$this->assertNotSame('', $out);
		$this->assertStringContainsString('DÉDALO v7 — sample.env', $out);
		$this->assertStringContainsString('Generated 2026-01-01 from the config catalog', $out);
	}

	public function test_render_contains_scope_tags_and_domain_titles() : void {
		$out = self::render();
		$this->assertStringContainsString('[secret', $out);
		$this->assertStringContainsString('[static', $out);
		$this->assertStringContainsString('DATABASE', $out);   // 'db' domain title, uppercased
		$this->assertStringContainsString('LANGUAGES', $out);  // 'lang' domain title, uppercased
	}

	public function test_render_includes_a_known_key_commented_at_default() : void {
		$out = self::render();
		$this->assertMatchesRegularExpression('/^#DEDALO_DATA_LANG=/m', $out);
	}

	public function test_render_includes_every_catalog_key_with_a_const() : void {
		$repo   = dirname(__DIR__, 3);
		$keys   = require $repo . '/core/base/config/catalog/catalog.php';
		$consts = array_values(array_filter(array_map(static fn($k) => $k->const, $keys)));
		$this->assertNotEmpty($consts);

		$out = self::render();
		foreach ($consts as $c) {
			$this->assertStringContainsString('#' . $c . '=', $out, "Missing catalog key in sample.env: $c");
		}
	}
}
