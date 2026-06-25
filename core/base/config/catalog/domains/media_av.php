<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * media_av domain
 * Covers: AV (audio/video) media settings and subtitles.
 * Defaults transcribed verbatim from config/sample.config.php.
 * DEDALO_AV_WATERMARK_FILE and DEDALO_AV_FFMPEG_SETTINGS are MEDIA_PATH/CORE_PATH-derived
 * and are deferred to Phase 3b.
 *
 * @return config_key[]
 */
return [

	// ------------------------------------------------------------------
	// av — folder / extension / mime / type
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.folder',
		const:   'DEDALO_AV_FOLDER',
		type:    'string',
		default: '/av',
		doc:     'Media subfolder for audio/video files.',
	),

	new config_key(
		path:    'media.av.extension',
		const:   'DEDALO_AV_EXTENSION',
		type:    'string',
		default: 'mp4',
		doc:     'Default AV file extension.',
	),

	// ------------------------------------------------------------------
	// av — supported extensions (list; REPLACE merge)
	// verbatim from sample.config.php:
	// ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.extensions_supported',
		const:   'DEDALO_AV_EXTENSIONS_SUPPORTED',
		type:    'list',
		default: ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv'],
		merge:   config_merge::REPLACE,
		doc:     'Accepted AV upload extensions.',
	),

	new config_key(
		path:    'media.av.mime_type',
		const:   'DEDALO_AV_MIME_TYPE',
		type:    'string',
		default: 'video/mp4',
		doc:     'Default AV MIME type.',
	),

	new config_key(
		path:    'media.av.type',
		const:   'DEDALO_AV_TYPE',
		type:    'string',
		default: 'h264/AAC',
		doc:     'Internal AV codec type identifier.',
	),

	// ------------------------------------------------------------------
	// av — quality names
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.quality_original',
		const:   'DEDALO_AV_QUALITY_ORIGINAL',
		type:    'string',
		default: 'original',
		doc:     'Quality name for original AV files.',
	),

	new config_key(
		path:    'media.av.quality_default',
		const:   'DEDALO_AV_QUALITY_DEFAULT',
		type:    'string',
		default: '404',
		doc:     'Default web delivery quality for AV (standard dedalo 72×404).',
	),

	// ------------------------------------------------------------------
	// av — quality ladder (list; REPLACE merge)
	// verbatim from sample.config.php:
	// [DEDALO_AV_QUALITY_ORIGINAL,'1080','720','576','404','240','audio']
	// resolved: ['original','1080','720','576','404','240','audio']
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.ar_quality',
		const:   'DEDALO_AV_AR_QUALITY',
		type:    'list',
		default: ['original','1080','720','576','404','240','audio'],
		merge:   config_merge::REPLACE,
		doc:     'Ordered list of AV quality folder names (desc quality).',
	),

	// ------------------------------------------------------------------
	// av — poster frame
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.posterframe_extension',
		const:   'DEDALO_AV_POSTERFRAME_EXTENSION',
		type:    'string',
		default: 'jpg',
		doc:     'File extension for AV poster frame images.',
	),

	// ------------------------------------------------------------------
	// av — tool paths
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.ffmpeg_path',
		const:   'DEDALO_AV_FFMPEG_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.binary_base'] . '/ffmpeg',
		doc:     'Filesystem path to the ffmpeg binary (derived from paths.binary_base).',
	),

	new config_key(
		path:    'media.av.faststart_path',
		const:   'DEDALO_AV_FASTSTART_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.binary_base'] . '/qt-faststart',
		doc:     'Filesystem path to the qt-faststart binary (derived from paths.binary_base).',
	),

	new config_key(
		path:    'media.av.ffprobe_path',
		const:   'DEDALO_AV_FFPROBE_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.binary_base'] . '/ffprobe',
		doc:     'Filesystem path to the ffprobe binary (derived from paths.binary_base).',
	),

	// ------------------------------------------------------------------
	// av — optional streamer (null = disabled)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.streamer',
		const:   'DEDALO_AV_STREAMER',
		type:    'string',
		default: null,
		doc:     'Optional external media streamer URL. Null means disabled.',
	),

	// ------------------------------------------------------------------
	// subtitles
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.subtitles_folder',
		const:   'DEDALO_SUBTITLES_FOLDER',
		type:    'string',
		default: '/subtitles',
		doc:     'Media subfolder for subtitle files (tool_subtitles).',
	),

	new config_key(
		path:    'media.av.subtitles_extension',
		const:   'DEDALO_AV_SUBTITLES_EXTENSION',
		type:    'string',
		default: 'vtt',
		doc:     'Default subtitle file extension.',
	),

	// ------------------------------------------------------------------
	// av — recompression flag (int)
	// 1 = re-compress all uploaded AV files; 0 = copy only
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.av.recompress_all',
		const:   'DEDALO_AV_RECOMPRESS_ALL',
		type:    'int',
		default: 1,
		doc:     'Re-compress all uploaded AV files (1) or copy without recompression (0).',
	),
];
