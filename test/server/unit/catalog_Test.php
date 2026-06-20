<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_Test extends TestCase {

	/** @return config_key[] */
	private function load() : array {
		return require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
	}

	public function test_catalog_returns_config_keys_indexed_by_path() : void {
		$catalog = $this->load();
		$this->assertNotEmpty($catalog);
		foreach ($catalog as $key) {
			$this->assertInstanceOf(config_key::class, $key);
		}
	}

	public function test_expected_keys_and_scopes_present() : void {
		$by_path = [];
		foreach ($this->load() as $k) {
			$by_path[$k->path] = $k;
		}
		$this->assertSame(config_scope::STATIC,  $by_path['media.image.thumb_width']->scope);
		$this->assertSame(config_scope::DERIVED, $by_path['media.image.file_url']->scope);
		$this->assertSame(config_scope::REQUEST, $by_path['lang.application_lang']->scope);
		$this->assertSame(config_scope::SECRET,  $by_path['db.password']->scope);
		$this->assertSame(config_merge::DEEP,    $by_path['media.magick_config']->merge);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $by_path['media.image.thumb_width']->const);
	}

	public function test_derived_key_computes_from_core_url() : void {
		$by_path = [];
		foreach ($this->load() as $k) {
			$by_path[$k->path] = $k;
		}
		$fn = $by_path['media.image.file_url']->derived;
		$this->assertSame('/x/core/media_engine/img.php', $fn(['paths.core_url' => '/x/core']));
	}
}
