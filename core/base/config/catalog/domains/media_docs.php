<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * media_docs domain
 * Covers: pdf, 3d, svg, html_files media settings.
 * All keys are STATIC; defaults transcribed verbatim from config/sample.config.php.
 * AR_QUALITY lists are resolved from their constituent quality constants.
 *
 * @return config_key[]
 */
return [

	// ------------------------------------------------------------------
	// PDF media
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.pdf.folder',
		const:   'DEDALO_PDF_FOLDER',
		type:    'string',
		default: '/pdf',
		doc:     'Media subfolder for PDF files.',
	),

	new config_key(
		path:    'media.pdf.extension',
		const:   'DEDALO_PDF_EXTENSION',
		type:    'string',
		default: 'pdf',
		doc:     'Default PDF file extension.',
	),

	new config_key(
		path:    'media.pdf.extensions_supported',
		const:   'DEDALO_PDF_EXTENSIONS_SUPPORTED',
		type:    'list',
		default: ['pdf','doc','pages','odt','ods','rtf','ppt','pages'],
		merge:   config_merge::REPLACE,
		doc:     'Accepted PDF upload extensions.',
	),

	new config_key(
		path:    'media.pdf.alternative_extensions',
		const:   'DEDALO_PDF_ALTERNATIVE_EXTENSIONS',
		type:    'list',
		default: ['jpg'],
		merge:   config_merge::REPLACE,
		doc:     'Optional compression format extensions for PDF image versions.',
	),

	new config_key(
		path:    'media.pdf.mime_type',
		const:   'DEDALO_PDF_MIME_TYPE',
		type:    'string',
		default: 'application/pdf',
		doc:     'Default PDF MIME type.',
	),

	new config_key(
		path:    'media.pdf.type',
		const:   'DEDALO_PDF_TYPE',
		type:    'string',
		default: 'pdf',
		doc:     'Internal PDF type identifier.',
	),

	new config_key(
		path:    'media.pdf.quality_original',
		const:   'DEDALO_PDF_QUALITY_ORIGINAL',
		type:    'string',
		default: 'original',
		doc:     'Quality name for original PDF files.',
	),

	new config_key(
		path:    'media.pdf.quality_default',
		const:   'DEDALO_PDF_QUALITY_DEFAULT',
		type:    'string',
		default: 'web',
		doc:     'Default web delivery quality for PDF files.',
	),

	new config_key(
		path:    'media.pdf.ar_quality',
		const:   'DEDALO_PDF_AR_QUALITY',
		type:    'list',
		// sample: [DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		default: ['original', 'web'],
		merge:   config_merge::REPLACE,
		doc:     'Ordered list of PDF quality folder names (desc quality).',
	),

	new config_key(
		path:    'media.pdf.transcription_engine',
		const:   'PDF_AUTOMATIC_TRANSCRIPTION_ENGINE',
		type:    'string',
		default: '/usr/bin/pdftotext',
		doc:     'Path to the daemon that generates text files from PDF (XPDF/pdftotext).',
	),

	// ------------------------------------------------------------------
	// 3D media
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.3d.folder',
		const:   'DEDALO_3D_FOLDER',
		type:    'string',
		default: '/3d',
		doc:     'Media subfolder for 3D files.',
	),

	new config_key(
		path:    'media.3d.extension',
		const:   'DEDALO_3D_EXTENSION',
		type:    'string',
		default: 'glb',
		doc:     'Default 3D file extension.',
	),

	new config_key(
		path:    'media.3d.extensions_supported',
		const:   'DEDALO_3D_EXTENSIONS_SUPPORTED',
		type:    'list',
		default: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'zip'],
		merge:   config_merge::REPLACE,
		doc:     'Accepted 3D upload extensions.',
	),

	new config_key(
		path:    'media.3d.mime_type',
		const:   'DEDALO_3D_MIME_TYPE',
		type:    'string',
		default: 'model/gltf-binary',
		doc:     'Default 3D MIME type.',
	),

	new config_key(
		path:    'media.3d.quality_original',
		const:   'DEDALO_3D_QUALITY_ORIGINAL',
		type:    'string',
		default: 'original',
		doc:     'Quality name for original 3D files.',
	),

	new config_key(
		path:    'media.3d.quality_default',
		const:   'DEDALO_3D_QUALITY_DEFAULT',
		type:    'string',
		default: 'web',
		doc:     'Default web delivery quality for 3D files.',
	),

	new config_key(
		path:    'media.3d.thumb_default',
		const:   'DEDALO_3D_THUMB_DEFAULT',
		type:    'string',
		default: 'thumb',
		doc:     'Thumb folder name for 3D render used in list views.',
	),

	new config_key(
		path:    'media.3d.ar_quality',
		const:   'DEDALO_3D_AR_QUALITY',
		type:    'list',
		// sample: [DEDALO_3D_QUALITY_ORIGINAL, DEDALO_3D_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		default: ['original', 'web'],
		merge:   config_merge::REPLACE,
		doc:     'Ordered list of 3D quality folder names (desc quality).',
	),

	new config_key(
		path:    'media.3d.gltfpack_path',
		const:   'DEDALO_3D_GLTFPACK_PATH',
		type:    'string',
		default: '/usr/local/bin/gltfpack',
		doc:     'Path to gltfpack binary (converts/compresses .obj/.gltf to .glb/.gltf).',
	),

	new config_key(
		path:    'media.3d.fbx2gltf_path',
		const:   'DEDALO_3D_FBX2GLTF_PATH',
		type:    'string',
		default: '/usr/local/bin/FBX2glTF',
		doc:     'Path to FBX2glTF binary (converts .fbx to .glb/.gltf).',
	),

	new config_key(
		path:    'media.3d.collada2gltf_path',
		const:   'DEDALO_3D_COLLADA2GLTF_PATH',
		type:    'string',
		default: '/usr/local/bin/COLLADA2GLTF-bin',
		doc:     'Path to COLLADA2GLTF binary (converts .dae to .glb/.gltf).',
	),

	// ------------------------------------------------------------------
	// SVG media
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.svg.folder',
		const:   'DEDALO_SVG_FOLDER',
		type:    'string',
		default: '/svg',
		doc:     'Media subfolder for SVG files.',
	),

	new config_key(
		path:    'media.svg.extension',
		const:   'DEDALO_SVG_EXTENSION',
		type:    'string',
		default: 'svg',
		doc:     'Default SVG file extension.',
	),

	new config_key(
		path:    'media.svg.extensions_supported',
		const:   'DEDALO_SVG_EXTENSIONS_SUPPORTED',
		type:    'list',
		default: ['svg'],
		merge:   config_merge::REPLACE,
		doc:     'Accepted SVG upload extensions.',
	),

	new config_key(
		path:    'media.svg.mime_type',
		const:   'DEDALO_SVG_MIME_TYPE',
		type:    'string',
		default: 'image/svg+xml',
		doc:     'Default SVG MIME type.',
	),

	new config_key(
		path:    'media.svg.quality_original',
		const:   'DEDALO_SVG_QUALITY_ORIGINAL',
		type:    'string',
		default: 'original',
		doc:     'Quality name for original SVG files.',
	),

	new config_key(
		path:    'media.svg.quality_default',
		const:   'DEDALO_SVG_QUALITY_DEFAULT',
		type:    'string',
		default: 'web',
		doc:     'Default web delivery quality for SVG files.',
	),

	new config_key(
		path:    'media.svg.ar_quality',
		const:   'DEDALO_SVG_AR_QUALITY',
		type:    'list',
		// sample: [DEDALO_SVG_QUALITY_ORIGINAL, DEDALO_SVG_QUALITY_DEFAULT]
		// resolved: ['original', 'web']
		default: ['original', 'web'],
		merge:   config_merge::REPLACE,
		doc:     'Ordered list of SVG quality folder names (desc quality).',
	),

	// ------------------------------------------------------------------
	// HTML files media
	// ------------------------------------------------------------------

	new config_key(
		path:    'media.html_files.folder',
		const:   'DEDALO_HTML_FILES_FOLDER',
		type:    'string',
		default: '/html_files',
		doc:     'Media subfolder for HTML files.',
	),

	new config_key(
		path:    'media.html_files.extension',
		const:   'DEDALO_HTML_FILES_EXTENSION',
		type:    'string',
		default: 'html',
		doc:     'Default HTML file extension.',
	),
];
