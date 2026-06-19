<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_media_docs_Test extends TestCase {

	/** @return array<string,config_key> indexed by path */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/media_docs.php' as $k) {
			$by[$k->path] = $k;
		}
		return $by;
	}

	// -----------------------------------------------------------------------
	// Presence + scope + const
	// -----------------------------------------------------------------------

	public function test_all_keys_present_with_correct_scope_and_const() : void {
		$by = $this->load();

		$expect = [
			// path                                    scope                  const
			// PDF
			'media.pdf.folder'                      => [config_scope::STATIC, 'DEDALO_PDF_FOLDER'],
			'media.pdf.extension'                   => [config_scope::STATIC, 'DEDALO_PDF_EXTENSION'],
			'media.pdf.extensions_supported'        => [config_scope::STATIC, 'DEDALO_PDF_EXTENSIONS_SUPPORTED'],
			'media.pdf.alternative_extensions'      => [config_scope::STATIC, 'DEDALO_PDF_ALTERNATIVE_EXTENSIONS'],
			'media.pdf.mime_type'                   => [config_scope::STATIC, 'DEDALO_PDF_MIME_TYPE'],
			'media.pdf.type'                        => [config_scope::STATIC, 'DEDALO_PDF_TYPE'],
			'media.pdf.quality_original'            => [config_scope::STATIC, 'DEDALO_PDF_QUALITY_ORIGINAL'],
			'media.pdf.quality_default'             => [config_scope::STATIC, 'DEDALO_PDF_QUALITY_DEFAULT'],
			'media.pdf.ar_quality'                  => [config_scope::STATIC, 'DEDALO_PDF_AR_QUALITY'],
			'media.pdf.transcription_engine'        => [config_scope::DERIVED, 'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE'],
			'media.pdf.ocr_engine'                  => [config_scope::DERIVED, 'PDF_OCR_ENGINE'],
			// 3D
			'media.3d.folder'                       => [config_scope::STATIC, 'DEDALO_3D_FOLDER'],
			'media.3d.extension'                    => [config_scope::STATIC, 'DEDALO_3D_EXTENSION'],
			'media.3d.extensions_supported'         => [config_scope::STATIC, 'DEDALO_3D_EXTENSIONS_SUPPORTED'],
			'media.3d.mime_type'                    => [config_scope::STATIC, 'DEDALO_3D_MIME_TYPE'],
			'media.3d.quality_original'             => [config_scope::STATIC, 'DEDALO_3D_QUALITY_ORIGINAL'],
			'media.3d.quality_default'              => [config_scope::STATIC, 'DEDALO_3D_QUALITY_DEFAULT'],
			'media.3d.thumb_default'                => [config_scope::STATIC, 'DEDALO_3D_THUMB_DEFAULT'],
			'media.3d.ar_quality'                   => [config_scope::STATIC, 'DEDALO_3D_AR_QUALITY'],
			'media.3d.gltfpack_path'                => [config_scope::STATIC, 'DEDALO_3D_GLTFPACK_PATH'],
			'media.3d.fbx2gltf_path'                => [config_scope::STATIC, 'DEDALO_3D_FBX2GLTF_PATH'],
			'media.3d.collada2gltf_path'            => [config_scope::STATIC, 'DEDALO_3D_COLLADA2GLTF_PATH'],
			// SVG
			'media.svg.folder'                      => [config_scope::STATIC, 'DEDALO_SVG_FOLDER'],
			'media.svg.extension'                   => [config_scope::STATIC, 'DEDALO_SVG_EXTENSION'],
			'media.svg.extensions_supported'        => [config_scope::STATIC, 'DEDALO_SVG_EXTENSIONS_SUPPORTED'],
			'media.svg.mime_type'                   => [config_scope::STATIC, 'DEDALO_SVG_MIME_TYPE'],
			'media.svg.quality_original'            => [config_scope::STATIC, 'DEDALO_SVG_QUALITY_ORIGINAL'],
			'media.svg.quality_default'             => [config_scope::STATIC, 'DEDALO_SVG_QUALITY_DEFAULT'],
			'media.svg.ar_quality'                  => [config_scope::STATIC, 'DEDALO_SVG_AR_QUALITY'],
			// HTML files
			'media.html_files.folder'               => [config_scope::STATIC, 'DEDALO_HTML_FILES_FOLDER'],
			'media.html_files.extension'            => [config_scope::STATIC, 'DEDALO_HTML_FILES_EXTENSION'],
		];

		$this->assertCount(count($expect), $by, 'key count mismatch — expected ' . count($expect));

		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope mismatch for $path");
			$this->assertSame($const, $by[$path]->const, "const mismatch for $path");
		}
	}

	// -----------------------------------------------------------------------
	// STATIC scalar defaults — verbatim from config/sample.config.php
	// -----------------------------------------------------------------------

	public function test_pdf_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('/pdf',              $by['media.pdf.folder']->default,           'DEDALO_PDF_FOLDER');
		$this->assertSame('pdf',               $by['media.pdf.extension']->default,        'DEDALO_PDF_EXTENSION');
		$this->assertSame('application/pdf',   $by['media.pdf.mime_type']->default,        'DEDALO_PDF_MIME_TYPE');
		$this->assertSame('pdf',               $by['media.pdf.type']->default,             'DEDALO_PDF_TYPE');
		$this->assertSame('original',          $by['media.pdf.quality_original']->default, 'DEDALO_PDF_QUALITY_ORIGINAL');
		$this->assertSame('web',               $by['media.pdf.quality_default']->default,  'DEDALO_PDF_QUALITY_DEFAULT');
		// transcription_engine + ocr_engine are DERIVED from paths.binary_base (platform-aware) — no static default
		$this->assertInstanceOf(\Closure::class, $by['media.pdf.transcription_engine']->derived, 'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE derived');
		$this->assertInstanceOf(\Closure::class, $by['media.pdf.ocr_engine']->derived,           'PDF_OCR_ENGINE derived');
	}

	public function test_3d_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('/3d',                        $by['media.3d.folder']->default,            'DEDALO_3D_FOLDER');
		$this->assertSame('glb',                        $by['media.3d.extension']->default,         'DEDALO_3D_EXTENSION');
		$this->assertSame('model/gltf-binary',          $by['media.3d.mime_type']->default,         'DEDALO_3D_MIME_TYPE');
		$this->assertSame('original',                   $by['media.3d.quality_original']->default,  'DEDALO_3D_QUALITY_ORIGINAL');
		$this->assertSame('web',                        $by['media.3d.quality_default']->default,   'DEDALO_3D_QUALITY_DEFAULT');
		$this->assertSame('thumb',                      $by['media.3d.thumb_default']->default,     'DEDALO_3D_THUMB_DEFAULT');
		$this->assertSame('/usr/local/bin/gltfpack',    $by['media.3d.gltfpack_path']->default,     'DEDALO_3D_GLTFPACK_PATH');
		$this->assertSame('/usr/local/bin/FBX2glTF',    $by['media.3d.fbx2gltf_path']->default,    'DEDALO_3D_FBX2GLTF_PATH');
		$this->assertSame('/usr/local/bin/COLLADA2GLTF-bin', $by['media.3d.collada2gltf_path']->default, 'DEDALO_3D_COLLADA2GLTF_PATH');
	}

	public function test_svg_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('/svg',          $by['media.svg.folder']->default,           'DEDALO_SVG_FOLDER');
		$this->assertSame('svg',           $by['media.svg.extension']->default,        'DEDALO_SVG_EXTENSION');
		$this->assertSame('image/svg+xml', $by['media.svg.mime_type']->default,        'DEDALO_SVG_MIME_TYPE');
		$this->assertSame('original',      $by['media.svg.quality_original']->default, 'DEDALO_SVG_QUALITY_ORIGINAL');
		$this->assertSame('web',           $by['media.svg.quality_default']->default,  'DEDALO_SVG_QUALITY_DEFAULT');
	}

	public function test_html_files_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('/html_files', $by['media.html_files.folder']->default,    'DEDALO_HTML_FILES_FOLDER');
		$this->assertSame('html',        $by['media.html_files.extension']->default, 'DEDALO_HTML_FILES_EXTENSION');
	}

	// -----------------------------------------------------------------------
	// List defaults (REPLACE merge) — verbatim from sample.config.php
	// -----------------------------------------------------------------------

	public function test_pdf_extensions_supported_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.pdf.extensions_supported'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['pdf','doc','pages','odt','ods','rtf','ppt','pages'],
			$key->default,
			'DEDALO_PDF_EXTENSIONS_SUPPORTED verbatim'
		);
	}

	public function test_pdf_alternative_extensions_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.pdf.alternative_extensions'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['jpg'],
			$key->default,
			'DEDALO_PDF_ALTERNATIVE_EXTENSIONS verbatim'
		);
	}

	public function test_pdf_ar_quality_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.pdf.ar_quality'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		// sample: [DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		$this->assertSame(
			['original', 'web'],
			$key->default,
			'DEDALO_PDF_AR_QUALITY verbatim'
		);
	}

	public function test_3d_extensions_supported_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.3d.extensions_supported'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['glb', 'gltf', 'obj', 'fbx', 'dae', 'zip'],
			$key->default,
			'DEDALO_3D_EXTENSIONS_SUPPORTED verbatim'
		);
	}

	public function test_3d_ar_quality_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.3d.ar_quality'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		// sample: [DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		$this->assertSame(
			['original', 'web'],
			$key->default,
			'DEDALO_3D_AR_QUALITY verbatim'
		);
	}

	public function test_svg_extensions_supported_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.svg.extensions_supported'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['svg'],
			$key->default,
			'DEDALO_SVG_EXTENSIONS_SUPPORTED verbatim'
		);
	}

	public function test_svg_ar_quality_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.svg.ar_quality'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		// sample: [DEDALO_SVG_QUALITY_ORIGINAL, DEDALO_SVG_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		$this->assertSame(
			['original', 'web'],
			$key->default,
			'DEDALO_SVG_AR_QUALITY verbatim'
		);
	}

	// -----------------------------------------------------------------------
	// Spot-checks (from the brief)
	// -----------------------------------------------------------------------

	public function test_spot_checks() : void {
		$by = $this->load();

		$this->assertSame('pdf',           $by['media.pdf.extension']->default,   'brief spot-check: pdf extension');
		$this->assertSame('glb',           $by['media.3d.extension']->default,    'brief spot-check: 3d extension');
		$this->assertSame('image/svg+xml', $by['media.svg.mime_type']->default,   'brief spot-check: svg mime_type');
		$this->assertSame('html',          $by['media.html_files.extension']->default, 'brief spot-check: html extension');
	}

	// -----------------------------------------------------------------------
	// All keys are STATIC scope
	// -----------------------------------------------------------------------

	public function test_all_keys_are_static_scope_except_derived_binaries() : void {
		$by = $this->load();
		$derived = ['media.pdf.transcription_engine', 'media.pdf.ocr_engine']; // platform binary paths
		foreach ($by as $path => $key) {
			$expected = in_array($path, $derived, true) ? config_scope::DERIVED : config_scope::STATIC;
			$this->assertSame($expected, $key->scope, "key $path scope");
		}
	}
}
