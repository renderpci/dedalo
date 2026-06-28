<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * paths domain
 * Four STATIC base keys (boot overrides them) + ~35 DERIVED path keys.
 * Closures reproduce the v6 expressions verbatim (config/sample.config.php).
 * Keys are listed in dependency order: bases → first-level derivations →
 * second-level derivations (so the compiler's in-order DERIVED pass resolves
 * each key's dependencies before the key itself runs).
 *
 * @return config_key[]
 */
return [

	// ------------------------------------------------------------------
	// STATIC base keys — boot_paths overrides these with real runtime values
	// ------------------------------------------------------------------

	new config_key(
		path:    'paths.root',
		const:   'DEDALO_ROOT_PATH',
		type:    'string',
		default: '',
		doc:     'Install root filesystem path (boot-resolved).',
	),

	new config_key(
		path:    'paths.root_web',
		const:   'DEDALO_ROOT_WEB',
		type:    'string',
		default: '/dedalo',
		doc:     'Web root URL segment (boot-resolved).',
	),

	new config_key(
		path:    'paths.host',
		const:   'DEDALO_HOST',
		type:    'string',
		default: 'localhost',
		doc:     'HTTP host (boot-resolved).',
	),

	new config_key(
		path:    'paths.protocol',
		const:   'DEDALO_PROTOCOL',
		type:    'string',
		default: 'http://',
		doc:     'Protocol scheme (boot-resolved).',
	),

	// ------------------------------------------------------------------
	// DERIVED — first level: depend only on the STATIC base keys above
	// (sample.config.php lines 52–112)
	// ------------------------------------------------------------------

	new config_key(
		path:    'paths.config_path',
		const:   'DEDALO_CONFIG_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/config',
		doc:     'config/ directory (DEDALO_ROOT_PATH . \'/config\').',
	),

	new config_key(
		path:    'paths.core_path',
		const:   'DEDALO_CORE_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/core',
		doc:     'core/ directory (DEDALO_ROOT_PATH . \'/core\').',
	),

	new config_key(
		path:    'paths.core_url',
		const:   'DEDALO_CORE_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/core',
		doc:     'core/ web URL (DEDALO_ROOT_WEB . \'/core\').',
	),

	new config_key(
		path:    'paths.shared_path',
		const:   'DEDALO_SHARED_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/shared',
		doc:     'shared/ directory.',
	),

	new config_key(
		path:    'paths.shared_url',
		const:   'DEDALO_SHARED_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/shared',
		doc:     'shared/ web URL.',
	),

	new config_key(
		path:    'paths.tools_path',
		const:   'DEDALO_TOOLS_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/tools',
		doc:     'tools/ directory.',
	),

	new config_key(
		path:    'paths.tools_url',
		const:   'DEDALO_TOOLS_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/tools',
		doc:     'tools/ web URL.',
	),

	new config_key(
		path:    'paths.lib_path',
		const:   'DEDALO_LIB_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/lib',
		doc:     'lib/ directory.',
	),

	new config_key(
		path:    'paths.lib_url',
		const:   'DEDALO_LIB_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/lib',
		doc:     'lib/ web URL.',
	),

	new config_key(
		path:    'paths.install_path',
		const:   'DEDALO_INSTALL_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/install',
		doc:     'install/ directory.',
	),

	new config_key(
		path:    'paths.install_url',
		const:   'DEDALO_INSTALL_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/install',
		doc:     'install/ web URL.',
	),

	new config_key(
		path:    'paths.diffusion_path',
		const:   'DEDALO_DIFFUSION_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/diffusion',
		doc:     'diffusion/ directory.',
	),

	new config_key(
		path:    'paths.diffusion_api_url',
		const:   'DEDALO_DIFFUSION_API_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/diffusion/api/v1/',
		doc:     'Diffusion engine API web URL.',
	),

	new config_key(
		path:    'paths.media_path',
		const:   'DEDALO_MEDIA_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/media',
		doc:     'media/ directory (DEDALO_ROOT_PATH . \'/media\').',
	),

	new config_key(
		path:    'paths.media_dir',
		const:   'DEDALO_MEDIA_DIR',
		type:    'string',
		default: 'media',
		doc:     'media directory/URL folder name (default "media"). Set to match a legacy '
			.'instance (e.g. "media_mib") so diffused media URLs are byte-identical.',
	),
	new config_key(
		path:    'paths.media_url',
		const:   'DEDALO_MEDIA_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root_web'] . '/' . ($r['paths.media_dir'] ?? 'media'),
		doc:     'media/ web URL (DEDALO_ROOT_WEB . \'/\' . DEDALO_MEDIA_DIR).',
	),

	new config_key(
		path:    'paths.sessions_path',
		const:   'DEDALO_SESSIONS_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => dirname($r['paths.root'], 1) . '/sessions',
		doc:     'sessions/ directory (one level above the install root, outside httpdocs).',
	),

	new config_key(
		path:    'paths.cache_path',
		const:   'DEDALO_CACHE_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => dirname($r['paths.root'], 1) . '/cache',
		doc:     'cache/ directory (one level above the install root, outside httpdocs).',
	),

	new config_key(
		path:    'paths.export_hierarchy_path',
		const:   'EXPORT_HIERARCHY_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.root'] . '/install/import/hierarchy',
		doc:     'export_hierarchy_path/ directory (inside install, import).',
	),

	new config_key(
		path:    'paths.binary_base',
		const:   null, // internal: media tool-binary base; the *_PATH consts derive from it
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => PHP_OS === 'Darwin' ? '/opt/homebrew/bin' : '/usr/bin',
		doc:     'Platform base dir for media tool binaries (mirrors v6 get_base_binary_path()).',
	),

	new config_key(
		path:    'paths.backup_path',
		const:   'DEDALO_BACKUP_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => dirname($r['paths.root'], 2) . '/backups',
		doc:     'backups/ directory (outside httpdocs).',
	),

	// ------------------------------------------------------------------
	// DERIVED — second level: depend on first-level keys above
	// ------------------------------------------------------------------

	new config_key(
		path:    'paths.widgets_path',
		const:   'DEDALO_WIDGETS_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_path'] . '/widgets',
		doc:     'core/widgets/ directory.',
	),

	new config_key(
		path:    'paths.widgets_url',
		const:   'DEDALO_WIDGETS_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_url'] . '/widgets',
		doc:     'core/widgets/ web URL.',
	),

	new config_key(
		path:    'paths.extras_path',
		const:   'DEDALO_EXTRAS_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_path'] . '/extras',
		doc:     'core/extras/ directory.',
	),

	new config_key(
		path:    'paths.extras_url',
		const:   'DEDALO_EXTRAS_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_url'] . '/extras',
		doc:     'core/extras/ web URL.',
	),

	new config_key(
		path:    'paths.api_url',
		const:   'DEDALO_API_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_url'] . '/api/v1/json/',
		doc:     'Work API URL.',
	),

	new config_key(
		path:    'paths.update_log_file',
		const:   'UPDATE_LOG_FILE',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.config_path'] . '/update.log',
		doc:     'Update log file path.',
	),

	new config_key(
		path:    'paths.color_profiles_path',
		const:   'COLOR_PROFILES_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_path'] . '/media_engine/lib/color_profiles_icc/',
		doc:     'ICC color profiles directory.',
	),

	new config_key(
		path:    'paths.av_ffmpeg_settings',
		const:   'DEDALO_AV_FFMPEG_SETTINGS',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.core_path'] . '/media_engine/lib/ffmpeg_settings',
		doc:     'FFmpeg settings directory.',
	),

	new config_key(
		path:    'paths.backup_path_temp',
		const:   'DEDALO_BACKUP_PATH_TEMP',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.backup_path'] . '/temp',
		doc:     'Backup temp directory.',
	),

	new config_key(
		path:    'paths.backup_path_db',
		const:   'DEDALO_BACKUP_PATH_DB',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.backup_path'] . '/db',
		doc:     'Backup DB directory.',
	),

	new config_key(
		path:    'paths.backup_path_ontology',
		const:   'DEDALO_BACKUP_PATH_ONTOLOGY',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.backup_path'] . '/ontology',
		doc:     'Backup ontology directory.',
	),

	new config_key(
		path:    'paths.av_watermark_file',
		const:   'DEDALO_AV_WATERMARK_FILE',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_path'] . '/' . $r['media.av.folder'] . '/watermark/watermark.png',
		doc:     'AV watermark file path (DEDALO_MEDIA_PATH.\'/\'.DEDALO_AV_FOLDER).',
	),

	new config_key(
		path:    'paths.upload_tmp_dir',
		const:   'DEDALO_UPLOAD_TMP_DIR',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_path'] . '/upload/service_upload/tmp',
		doc:     'Upload temp directory.',
	),

	new config_key(
		path:    'paths.upload_tmp_url',
		const:   'DEDALO_UPLOAD_TMP_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_url'] . '/upload/service_upload/tmp',
		doc:     'Upload temp web URL.',
	),

	new config_key(
		path:    'paths.tool_export_folder_path',
		const:   'DEDALO_TOOL_EXPORT_FOLDER_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_path'] . '/export/files',
		doc:     'Tool export folder path.',
	),

	new config_key(
		path:    'paths.tool_export_folder_url',
		const:   'DEDALO_TOOL_EXPORT_FOLDER_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_url'] . '/export/files',
		doc:     'Tool export folder web URL.',
	),

	new config_key(
		path:    'paths.tool_import_csv_path',
		const:   'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.media_path'] . '/import/files',
		doc:     'Tool import CSV folder path.',
	),

	new config_key(
		path:    'paths.ontology_data_io_dir',
		const:   'ONTOLOGY_DATA_IO_DIR',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.install_path'] . '/import/ontology',
		doc:     'Ontology data I/O directory.',
	),

	new config_key(
		path:    'paths.ontology_data_io_url',
		const:   'ONTOLOGY_DATA_IO_URL',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => $r['paths.install_url'] . '/import/ontology',
		doc:     'Ontology data I/O web URL.',
	),

	new config_key(
		path:    'paths.source_version_local_dir',
		const:   'DEDALO_SOURCE_VERSION_LOCAL_DIR',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r): string => '/tmp/' . $r['identity.entity'],
		doc:     'Local dir for source version download (\'/tmp/\'.DEDALO_ENTITY).',
	),

];
