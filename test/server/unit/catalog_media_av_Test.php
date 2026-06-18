<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.config_scope.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_merge.php';
require_once dirname(__DIR__, 3) . '/core/base/config/class.config_key.php';

final class catalog_media_av_Test extends TestCase {

	/** @return array<string,config_key> indexed by path */
	private function load() : array {
		$by = [];
		foreach (require dirname(__DIR__, 3) . '/core/base/config/catalog/domains/media_av.php' as $k) {
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
			'media.av.folder'                => [config_scope::STATIC, 'DEDALO_AV_FOLDER'],
			'media.av.extension'             => [config_scope::STATIC, 'DEDALO_AV_EXTENSION'],
			'media.av.extensions_supported'  => [config_scope::STATIC, 'DEDALO_AV_EXTENSIONS_SUPPORTED'],
			'media.av.mime_type'             => [config_scope::STATIC, 'DEDALO_AV_MIME_TYPE'],
			'media.av.type'                  => [config_scope::STATIC, 'DEDALO_AV_TYPE'],
			'media.av.quality_original'      => [config_scope::STATIC, 'DEDALO_AV_QUALITY_ORIGINAL'],
			'media.av.quality_default'       => [config_scope::STATIC, 'DEDALO_AV_QUALITY_DEFAULT'],
			'media.av.ar_quality'            => [config_scope::STATIC, 'DEDALO_AV_AR_QUALITY'],
			'media.av.posterframe_extension' => [config_scope::STATIC, 'DEDALO_AV_POSTERFRAME_EXTENSION'],
			'media.av.ffmpeg_path'           => [config_scope::STATIC, 'DEDALO_AV_FFMPEG_PATH'],
			'media.av.faststart_path'        => [config_scope::STATIC, 'DEDALO_AV_FASTSTART_PATH'],
			'media.av.ffprobe_path'          => [config_scope::STATIC, 'DEDALO_AV_FFPROBE_PATH'],
			'media.av.streamer'              => [config_scope::STATIC, 'DEDALO_AV_STREAMER'],
			'media.av.subtitles_folder'      => [config_scope::STATIC, 'DEDALO_SUBTITLES_FOLDER'],
			'media.av.subtitles_extension'   => [config_scope::STATIC, 'DEDALO_AV_SUBTITLES_EXTENSION'],
			'media.av.recompress_all'        => [config_scope::STATIC, 'DEDALO_AV_RECOMPRESS_ALL'],
		];

		foreach ($expect as $path => [$scope, $const]) {
			$this->assertArrayHasKey($path, $by, "missing key: $path");
			$this->assertSame($scope, $by[$path]->scope, "scope mismatch for $path");
			$this->assertSame($const, $by[$path]->const, "const mismatch for $path");
		}
	}

	// -----------------------------------------------------------------------
	// Excluded keys — watermark and ffmpeg_settings must NOT be present
	// -----------------------------------------------------------------------

	public function test_derived_keys_excluded() : void {
		$by = $this->load();
		$this->assertArrayNotHasKey('media.av.watermark_file',    $by, 'DEDALO_AV_WATERMARK_FILE deferred to 3b');
		$this->assertArrayNotHasKey('media.av.ffmpeg_settings',   $by, 'DEDALO_AV_FFMPEG_SETTINGS deferred to 3b');
	}

	// -----------------------------------------------------------------------
	// STATIC scalar defaults (verbatim from config/sample.config.php)
	// -----------------------------------------------------------------------

	public function test_scalar_defaults_verbatim() : void {
		$by = $this->load();

		$this->assertSame('/av',               $by['media.av.folder']->default,                'DEDALO_AV_FOLDER');
		$this->assertSame('mp4',               $by['media.av.extension']->default,             'DEDALO_AV_EXTENSION');
		$this->assertSame('video/mp4',         $by['media.av.mime_type']->default,             'DEDALO_AV_MIME_TYPE');
		$this->assertSame('h264/AAC',          $by['media.av.type']->default,                  'DEDALO_AV_TYPE');
		$this->assertSame('original',          $by['media.av.quality_original']->default,      'DEDALO_AV_QUALITY_ORIGINAL');
		$this->assertSame('404',               $by['media.av.quality_default']->default,       'DEDALO_AV_QUALITY_DEFAULT');
		$this->assertSame('jpg',               $by['media.av.posterframe_extension']->default, 'DEDALO_AV_POSTERFRAME_EXTENSION');
		$this->assertSame('/usr/bin/ffmpeg',   $by['media.av.ffmpeg_path']->default,           'DEDALO_AV_FFMPEG_PATH');
		$this->assertSame('/usr/bin/qt-faststart', $by['media.av.faststart_path']->default,    'DEDALO_AV_FASTSTART_PATH');
		$this->assertSame('/usr/bin/ffprobe',  $by['media.av.ffprobe_path']->default,          'DEDALO_AV_FFPROBE_PATH');
		$this->assertNull($by['media.av.streamer']->default,                                    'DEDALO_AV_STREAMER must be null');
		$this->assertSame('/subtitles',        $by['media.av.subtitles_folder']->default,      'DEDALO_SUBTITLES_FOLDER');
		$this->assertSame('vtt',               $by['media.av.subtitles_extension']->default,   'DEDALO_AV_SUBTITLES_EXTENSION');
		$this->assertSame(1,                   $by['media.av.recompress_all']->default,        'DEDALO_AV_RECOMPRESS_ALL');
	}

	// -----------------------------------------------------------------------
	// recompress_all must be an int (not bool, not string)
	// -----------------------------------------------------------------------

	public function test_recompress_all_is_int() : void {
		$by = $this->load();
		$this->assertIsInt($by['media.av.recompress_all']->default, 'DEDALO_AV_RECOMPRESS_ALL must be int');
		$this->assertSame(1, $by['media.av.recompress_all']->default);
	}

	// -----------------------------------------------------------------------
	// streamer must be strictly null
	// -----------------------------------------------------------------------

	public function test_streamer_is_strictly_null() : void {
		$by = $this->load();
		$this->assertNull($by['media.av.streamer']->default, 'DEDALO_AV_STREAMER default must be null');
	}

	// -----------------------------------------------------------------------
	// List defaults (REPLACE merge) — verbatim from sample.config.php
	// -----------------------------------------------------------------------

	public function test_extensions_supported_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.av.extensions_supported'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		$this->assertSame(
			['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv'],
			$key->default,
			'DEDALO_AV_EXTENSIONS_SUPPORTED verbatim'
		);
	}

	public function test_ar_quality_default_and_merge() : void {
		$by  = $this->load();
		$key = $by['media.av.ar_quality'];

		$this->assertSame(config_merge::REPLACE, $key->merge, 'merge strategy');
		// Verbatim from sample.config.php:
		// [DEDALO_AV_QUALITY_ORIGINAL,'1080','720','576','404','240','audio']
		// resolved: DEDALO_AV_QUALITY_ORIGINAL = 'original'
		$this->assertSame(
			['original','1080','720','576','404','240','audio'],
			$key->default,
			'DEDALO_AV_AR_QUALITY verbatim (resolved constants)'
		);
	}
}
