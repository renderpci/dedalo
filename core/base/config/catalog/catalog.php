<?php declare(strict_types=1);

// Representative Dédalo v7 config catalog slice (Phase 2 machinery proof).
// The full ~150-key catalog is populated in a later mechanical pass (Phase 2b).
// Each entry is the single declaration of one setting.

require_once __DIR__ . '/../class.config_scope.php';
require_once __DIR__ . '/../class.config_merge.php';
require_once __DIR__ . '/../class.config_key.php';

return [
	new config_key(
		path: 'paths.core_url', const: 'DEDALO_CORE_URL', type: 'string',
		default: '/dedalo/core', doc: 'Web URL of the core directory.'
	),
	new config_key(
		path: 'media.image.thumb_width', const: 'DEDALO_IMAGE_THUMB_WIDTH', type: 'int',
		default: 222, doc: 'Thumbnail width in pixels.'
	),
	new config_key(
		path: 'media.image.extensions_supported', const: 'DEDALO_IMAGE_EXTENSIONS_SUPPORTED', type: 'list',
		default: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'avif'],
		merge: config_merge::REPLACE, doc: 'Accepted image upload extensions.'
	),
	new config_key(
		path: 'media.magick_config', const: 'MAGICK_CONFIG', type: 'map',
		default: ['remove_layer_0' => false, 'is_opaque' => null],
		merge: config_merge::DEEP, doc: 'ImageMagick per-platform tweaks.'
	),
	new config_key(
		path: 'media.image.file_url', const: 'DEDALO_IMAGE_FILE_URL', type: 'string',
		scope: config_scope::DERIVED,
		derived: static fn(array $r) : string => $r['paths.core_url'] . '/media_engine/img.php',
		doc: 'Computed URL of the image proxy endpoint.'
	),
	new config_key(
		path: 'lang.application_lang', const: 'DEDALO_APPLICATION_LANG', type: 'string',
		scope: config_scope::REQUEST, doc: 'Current UI language (request-negotiated; accessor-only).'
	),
	new config_key(
		path: 'db.password', const: 'DEDALO_PASSWORD_CONN', type: 'string',
		scope: config_scope::SECRET, doc: 'PostgreSQL password (from .env; never compiled).'
	),
];
