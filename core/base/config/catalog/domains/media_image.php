<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * media_image domain
 * Covers: media-common thumb keys, image-specific settings, ImageMagick (magick)
 * Defaults transcribed verbatim from config/sample.config.php.
 * COLOR_PROFILES_PATH is CORE_PATH-derived and is deferred to Phase 3b.
 *
 * @return config_key[]
 */
return [

	// ------------------------------------------------------------------
	// media-common (thumb)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.thumb_extension',
		const:   'DEDALO_THUMB_EXTENSION',
		type:    'string',
		default: 'jpg',
		doc:     'Thumb file extension used by all component thumb renderers.',
	),

	new config_key(
		path:    'media.quality_thumb',
		const:   'DEDALO_QUALITY_THUMB',
		type:    'string',
		default: 'thumb',
		doc:     'Quality folder name for thumbnails.',
	),

	// ------------------------------------------------------------------
	// image — thumb dimensions (slice keys)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.thumb_width',
		const:   'DEDALO_IMAGE_THUMB_WIDTH',
		type:    'int',
		default: 222,
		doc:     'Image thumbnail width in pixels.',
	),

	new config_key(
		path:    'media.image.thumb_height',
		const:   'DEDALO_IMAGE_THUMB_HEIGHT',
		type:    'int',
		default: 148,
		doc:     'Image thumbnail height in pixels.',
	),

	// ------------------------------------------------------------------
	// image — folder / extension / mime / type
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.folder',
		const:   'DEDALO_IMAGE_FOLDER',
		type:    'string',
		default: '/image',
		doc:     'Media subfolder for images.',
	),

	new config_key(
		path:    'media.image.extension',
		const:   'DEDALO_IMAGE_EXTENSION',
		type:    'string',
		default: 'jpg',
		doc:     'Default image file extension.',
	),

	new config_key(
		path:    'media.image.mime_type',
		const:   'DEDALO_IMAGE_MIME_TYPE',
		type:    'string',
		default: 'image/jpeg',
		doc:     'Default image MIME type.',
	),

	new config_key(
		path:    'media.image.type',
		const:   'DEDALO_IMAGE_TYPE',
		type:    'string',
		default: 'jpeg',
		doc:     'Internal image type identifier.',
	),

	// ------------------------------------------------------------------
	// image — supported / alternative extensions (lists; REPLACE merge)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.extensions_supported',
		const:   'DEDALO_IMAGE_EXTENSIONS_SUPPORTED',
		type:    'list',
		default: ['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic','avif'],
		merge:   config_merge::REPLACE,
		doc:     'Accepted image upload extensions.',
	),

	new config_key(
		path:    'media.image.alternative_extensions',
		const:   'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS',
		type:    'list',
		default: [],
		merge:   config_merge::REPLACE,
		doc:     'Optional alternative compression format extensions (e.g. avif, png).',
	),

	// ------------------------------------------------------------------
	// image — quality names
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.quality_original',
		const:   'DEDALO_IMAGE_QUALITY_ORIGINAL',
		type:    'string',
		default: 'original',
		doc:     'Quality name for original files.',
	),

	new config_key(
		path:    'media.image.quality_retouched',
		const:   'DEDALO_IMAGE_QUALITY_RETOUCHED',
		type:    'string',
		default: 'modified',
		doc:     'Quality name for retouched/modified files.',
	),

	new config_key(
		path:    'media.image.quality_default',
		const:   'DEDALO_IMAGE_QUALITY_DEFAULT',
		type:    'string',
		default: '1.5MB',
		doc:     'Default web delivery quality for images.',
	),

	// ------------------------------------------------------------------
	// image — quality ladder (list; REPLACE merge)
	// verbatim from sample.config.php line 482:
	// [DEDALO_IMAGE_QUALITY_ORIGINAL, DEDALO_IMAGE_QUALITY_RETOUCHED,
	//  '100MB','25MB','6MB','1.5MB', DEDALO_QUALITY_THUMB]
	// resolved: ['original','modified','100MB','25MB','6MB','1.5MB','thumb']
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.ar_quality',
		const:   'DEDALO_IMAGE_AR_QUALITY',
		type:    'list',
		default: ['original','modified','100MB','25MB','6MB','1.5MB','thumb'],
		merge:   config_merge::REPLACE,
		doc:     'Ordered list of image quality folder names (desc quality).',
	),

	// ------------------------------------------------------------------
	// image — print DPI
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.print_dpi',
		const:   'DEDALO_IMAGE_PRINT_DPI',
		type:    'int',
		default: 150,
		doc:     'DPI used to calculate print size of images (tool_image_versions).',
	),

	// ------------------------------------------------------------------
	// image — file URL (DERIVED slice key)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.file_url',
		const:   'DEDALO_IMAGE_FILE_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r) : string => $r['paths.core_url'] . '/media_engine/img.php',
		doc:     'Computed URL of the image proxy endpoint (core_url + /media_engine/img.php).',
	),

	// ------------------------------------------------------------------
	// image — web folder
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.image.web_folder',
		const:   'DEDALO_IMAGE_WEB_FOLDER',
		type:    'string',
		default: '/web',
		doc:     'Subfolder for images uploaded from component_html_text.',
	),

	// ------------------------------------------------------------------
	// magick — ImageMagick config (map; DEEP merge; slice key)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.magick_config',
		const:   'MAGICK_CONFIG',
		type:    'map',
		default: ['remove_layer_0' => false, 'is_opaque' => null],
		merge:   config_merge::DEEP,
		doc:     'ImageMagick per-platform tweaks (remove_layer_0, is_opaque).',
	),

	// ------------------------------------------------------------------
	// magick — binary path (STATIC)
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.magick_path',
		const:   'MAGICK_PATH',
		type:    'string',
		default: '/usr/bin/',
		doc:     'Filesystem path to the ImageMagick binary directory.',
	),
];
