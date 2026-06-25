<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_compiler.php';

final class catalog_paths_Test extends TestCase {

	/** @return array<string,config_key> */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/paths.php' as $k) { $by[$k->path] = $k; }
		return $by;
	}

	public function test_base_keys_static_with_dev_defaults() : void {
		$by = $this->load();
		$this->assertSame(config_scope::STATIC, $by['paths.root']->scope);
		$this->assertSame('', $by['paths.root']->default);
		$this->assertSame('/dedalo', $by['paths.root_web']->default);
		$this->assertSame('localhost', $by['paths.host']->default);
		$this->assertSame('http://', $by['paths.protocol']->default);
		$this->assertSame('DEDALO_ROOT_PATH', $by['paths.root']->const);
		$this->assertSame('DEDALO_ROOT_WEB', $by['paths.root_web']->const);
	}

	public function test_path_keys_are_derived_with_correct_const() : void {
		$by = $this->load();
		$expect = [
			'paths.core_path' => 'DEDALO_CORE_PATH', 'paths.core_url' => 'DEDALO_CORE_URL',
			'paths.media_path' => 'DEDALO_MEDIA_PATH', 'paths.sessions_path' => 'DEDALO_SESSIONS_PATH',
			'paths.api_url' => 'DEDALO_API_URL', 'paths.av_watermark_file' => 'DEDALO_AV_WATERMARK_FILE',
		];
		foreach ($expect as $path => $const) {
			$this->assertArrayHasKey($path, $by, "missing $path");
			$this->assertSame(config_scope::DERIVED, $by[$path]->scope, "$path scope");
			$this->assertSame($const, $by[$path]->const, "$path const");
			$this->assertInstanceOf(\Closure::class, $by[$path]->derived, "$path closure");
		}
	}

	public function test_derived_values_resolve_v6_equivalent() : void {
		// resolve the whole catalog with boot base overrides + assert path family values
		$catalog = require dirname(__DIR__, 3) . '/core/base/config/catalog/catalog.php';
		$bases = [['paths.root' => '/srv/dedalo', 'paths.root_web' => '/dedalo']];
		$r = config_compiler::resolve($catalog, $bases);
		$this->assertSame('/srv/dedalo/core', $r['paths.core_path']);
		$this->assertSame('/dedalo/core', $r['paths.core_url']);
		$this->assertSame('/srv/dedalo/media', $r['paths.media_path']);           // root.'/media' (single media dir, no per-entity subfolder)
		$this->assertSame('/srv/sessions', $r['paths.sessions_path']);           // dirname('/srv/dedalo',1)='/srv'.'/sessions'
		$this->assertSame('/dedalo/core/api/v1/json/', $r['paths.api_url']);      // core_url.'/api/v1/json/'
		$this->assertSame('/srv/dedalo/core/widgets', $r['paths.widgets_path']);  // core_path.'/widgets'
		$this->assertSame('/srv/dedalo/media//av/watermark/watermark.png', $r['paths.av_watermark_file']); // media_path.'/'.av.folder.'/watermark/watermark.png' (av.folder='/av')
	}
}
