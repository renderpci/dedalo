<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_media_image_Test extends TestCase {

	/** @return array<string,config_key> indexed by path */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/media_image.php' as $k) {
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
			// path                              scope                   const
			'media.thumb_extension'              => [config_scope::STATIC,  'DEDALO_THUMB_EXTENSION'],
			'media.quality_thumb'                => [config_scope::STATIC,  'DEDALO_QUALITY_THUMB'],
			'media.image.thumb_width'            => [config_scope::STATIC,  'DEDALO_IMAGE_THUMB_WIDTH'],
			'media.image.thumb_height'           => [config_scope::STATIC,  'DEDALO_IMAGE_THUMB_HEIGHT'],
			'media.image.folder'                 => [config_scope::STATIC,  'DEDALO_IMAGE_FOLDER'],
			'media.image.extension'              => [config_scope::STATIC,  'DEDALO_IMAGE_EXTENSION'],
			'media.image.mime_type'              => [config_scope::STATIC,  'DEDALO_IMAGE_MIME_TYPE'],
			'media.image.type'                   => [config_scope::STATIC,  'DEDALO_IMAGE_TYPE'],
			'media.image.extensions_supported'   => [config_scope::STATIC,  'DEDALO_IMAGE_EXTENSIONS_SUPPORTED'],
			'media.image.alternative_extensions' => [config_scope::STATIC,  'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS'],
			'media.image.quality_original'       => [config_scope::STATIC,  'DEDALO_IMAGE_QUALITY_ORIGINAL'],
			'media.image.quality_retouched'      => [config_scope::STATIC,  'DEDALO_IMAGE_QUALITY_RETOUCHED'],
			'media.image.quality_default'        => [config_scope::STATIC,  'DEDALO_IMAGE_QUALITY_DEFAULT'],
			'media.image.ar_quality'             => [config_scope::STATIC,  'DEDALO_IMAGE_AR_QUALITY'],
			'media.image.print_dpi'              => [config_scope::STATIC,  'DEDALO_IMAGE_PRINT_DPI'],
			'media.image.file_url'               => [config_scope::DERIVED, 'DEDALO_IMAGE_FILE_URL'],
			'media.image.web_folder'             => [config_scope::STATIC,  'DEDALO_IMAGE_WEB_FOLDER'],
			'media.magick_config'                => [config_scope::STATIC,  'MAGICK_CONFIG'],
			'media.magick_path'                  => [config_scope::STATIC,  'MAGICK_PATH'],
		];

		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope mismatch for $path");
			$this->assertSame($const, $by[$path]->const, "const mismatch for $path");
		}
	}

	// -----------------------------------------------------------------------
	// STATIC scalar defaults (verbatim from config/sample.config.php)
	// -----------------------------------------------------------------------

	public function test_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('jpg',         $by['media.thumb_extension']->default,        'DEDALO_THUMB_EXTENSION');
		$this->assertSame('thumb',       $by['media.quality_thumb']->default,          'DEDALO_QUALITY_THUMB');
		$this->assertSame(222,           $by['media.image.thumb_width']->default,      'DEDALO_IMAGE_THUMB_WIDTH');
		$this->assertSame(148,           $by['media.image.thumb_height']->default,     'DEDALO_IMAGE_THUMB_HEIGHT');
		$this->assertSame('/image',      $by['media.image.folder']->default,           'DEDALO_IMAGE_FOLDER');
		$this->assertSame('jpg',         $by['media.image.extension']->default,        'DEDALO_IMAGE_EXTENSION');
		$this->assertSame('image/jpeg',  $by['media.image.mime_type']->default,        'DEDALO_IMAGE_MIME_TYPE');
		$this->assertSame('jpeg',        $by['media.image.type']->default,             'DEDALO_IMAGE_TYPE');
		$this->assertSame([],            $by['media.image.alternative_extensions']->default, 'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS');
		$this->assertSame('original',    $by['media.image.quality_original']->default, 'DEDALO_IMAGE_QUALITY_ORIGINAL');
		$this->assertSame('modified',    $by['media.image.quality_retouched']->default,'DEDALO_IMAGE_QUALITY_RETOUCHED');
		$this->assertSame('1.5MB',       $by['media.image.quality_default']->default,  'DEDALO_IMAGE_QUALITY_DEFAULT');
		$this->assertSame(150,           $by['media.image.print_dpi']->default,        'DEDALO_IMAGE_PRINT_DPI');
		$this->assertSame('/web',        $by['media.image.web_folder']->default,       'DEDALO_IMAGE_WEB_FOLDER');
		$this->assertSame('/usr/bin/',   $by['media.magick_path']->default,            'MAGICK_PATH');
	}

	// -----------------------------------------------------------------------
	// List defaults (REPLACE merge) — verbatim from sample.config.php
	// -----------------------------------------------------------------------

	public function test_extensions_supported_default_and_merge() : void {
		$by = $this->load();
		$key = $by['media.image.extensions_supported'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic','avif'],
			$key->default,
			'DEDALO_IMAGE_EXTENSIONS_SUPPORTED verbatim'
		);
	}

	public function test_ar_quality_default_and_merge() : void {
		$by = $this->load();
		$key = $by['media.image.ar_quality'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		// Verbatim from sample.config.php line 482:
		// [DEDALO_IMAGE_QUALITY_ORIGINAL, DEDALO_IMAGE_QUALITY_RETOUCHED,'100MB','25MB','6MB','1.5MB', DEDALO_QUALITY_THUMB]
		// resolved constants: 'original', 'modified', '100MB', '25MB', '6MB', '1.5MB', 'thumb'
		$this->assertSame(
			['original','modified','100MB','25MB','6MB','1.5MB','thumb'],
			$key->default,
			'DEDALO_IMAGE_AR_QUALITY verbatim'
		);
	}

	// -----------------------------------------------------------------------
	// Map default (DEEP merge) — verbatim from sample.config.php
	// -----------------------------------------------------------------------

	public function test_magick_config_merge_and_default() : void {
		$by  = $this->load();
		$key = $by['media.magick_config'];

		$this->assertSame(config_merge::DEEP, $key->merge, 'MAGICK_CONFIG merge must be DEEP');
		$this->assertSame(
			['remove_layer_0' => false, 'is_opaque' => null],
			$key->default,
			'MAGICK_CONFIG exact map'
		);
	}

	// -----------------------------------------------------------------------
	// DERIVED key: media.image.file_url closure
	// -----------------------------------------------------------------------

	public function test_file_url_scope_derived() : void {
		$by = $this->load();
		$this->assertSame(config_scope::DERIVED, $by['media.image.file_url']->scope);
	}

	public function test_file_url_closure_computes_correctly() : void {
		$by = $this->load();
		$fn = $by['media.image.file_url']->derived;
		$this->assertInstanceOf(\Closure::class, $fn);
		$this->assertSame(
			'/dedalo/core/media_engine/img.php',
			$fn(['paths.core_url' => '/dedalo/core']),
			'closure must concat core_url + /media_engine/img.php'
		);
	}

	// -----------------------------------------------------------------------
	// Slice-key identity — exact match for Phase-2 representative slice
	// -----------------------------------------------------------------------

	public function test_slice_key_thumb_width_identity() : void {
		$by = $this->load();
		$k  = $by['media.image.thumb_width'];
		$this->assertSame(config_scope::STATIC,  $k->scope);
		$this->assertSame('DEDALO_IMAGE_THUMB_WIDTH', $k->const);
		$this->assertSame(222, $k->default);
	}

	public function test_slice_key_extensions_supported_identity() : void {
		$by = $this->load();
		$k  = $by['media.image.extensions_supported'];
		$this->assertSame(config_scope::STATIC,    $k->scope);
		$this->assertSame('DEDALO_IMAGE_EXTENSIONS_SUPPORTED', $k->const);
		$this->assertSame(config_merge::REPLACE,   $k->merge);
	}

	public function test_slice_key_magick_config_identity() : void {
		$by = $this->load();
		$k  = $by['media.magick_config'];
		$this->assertSame(config_scope::STATIC,   $k->scope);
		$this->assertSame('MAGICK_CONFIG',        $k->const);
		$this->assertSame(config_merge::DEEP,     $k->merge);
		$this->assertSame(['remove_layer_0' => false, 'is_opaque' => null], $k->default);
	}

	public function test_slice_key_file_url_identity() : void {
		$by = $this->load();
		$k  = $by['media.image.file_url'];
		$this->assertSame(config_scope::DERIVED,    $k->scope);
		$this->assertSame('DEDALO_IMAGE_FILE_URL',  $k->const);
		$this->assertSame(
			'/x/core/media_engine/img.php',
			($k->derived)(['paths.core_url' => '/x/core'])
		);
	}
}
