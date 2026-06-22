<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:    'features.upload.chunk_files',
		const:   'DEDALO_UPLOAD_SERVICE_CHUNK_FILES',
		type:    'int',
		default: 4,
		doc:     'Split files into chunks before upload at max size defined (MB). false = no chunking.',
	),
	new config_key(
		path:    'features.upload.max_concurrent',
		const:   'DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT',
		type:    'int',
		default: 50,
		doc:     'Maximum simultaneous chunk upload requests the server can handle.',
	),
	new config_key(
		path:    'features.geo_provider',
		const:   'DEDALO_GEO_PROVIDER',
		type:    'string',
		default: 'VARIOUS',
		doc:     'Geo location provider: OSM | ARCGIS | GOOGLE | VARIOUS.',
	),
	new config_key(
		path:    'features.entity_media_area_tipo',
		const:   'DEDALO_ENTITY_MEDIA_AREA_TIPO',
		type:    'string',
		default: '',
		doc:     'Remove the Real sections from menu ALL sections.',
	),
	new config_key(
		path:    'features.entity_menu_skip_tipos',
		const:   'DEDALO_ENTITY_MENU_SKIP_TIPOS',
		type:    'list',
		default: [],
		doc:     'Skip array of tipos but walk children; used for groupings not shown in menu.',
	),
	new config_key(
		path:    'features.test_install',
		const:   'DEDALO_TEST_INSTALL',
		type:    'bool',
		default: true,
		doc:     'On true, check if root user has set password at login; if not, init the install process.',
	),
	new config_key(
		path:    'features.lock_components',
		const:   'DEDALO_LOCK_COMPONENTS',
		type:    'bool',
		default: true,
		doc:     'Set lock components function when users are editing fields.',
	),
	new config_key(
		path:    'features.media_access_mode',
		const:   'DEDALO_MEDIA_ACCESS_MODE',
		// string|bool: false (default, disabled) | 'private' | 'publication'. Typed 'string' so a
		// 'private'/'publication' value set via .env is NOT collapsed to a bool by config_caster;
		// the bool false default round-trips unchanged (get_mode() positive-matches the mode strings).
		type:    'string',
		default: false,
		doc:     'Media file access control: false | \'private\' | \'publication\'.',
	),
	new config_key(
		path:    'features.protect_media_files',
		const:   'DEDALO_PROTECT_MEDIA_FILES',
		type:    'bool',
		default: false,
		doc:     'Deprecated: legacy boolean kept for back-compat — true behaves as DEDALO_MEDIA_ACCESS_MODE=\'private\'.',
	),
	new config_key(
		path:    'features.notifications',
		const:   'DEDALO_NOTIFICATIONS',
		type:    'bool',
		default: false,
		doc:     'Send notifications to user browser (e.g. current lock components).',
	),
	new config_key(
		path:    'features.ar_exclude_components',
		const:   'DEDALO_AR_EXCLUDE_COMPONENTS',
		type:    'list',
		default: [],
		doc:     'Optional array of component tipo to exclude.',
	),
	new config_key(
		path:    'features.filter_user_records_by_id',
		const:   'DEDALO_FILTER_USER_RECORDS_BY_ID',
		type:    'bool',
		default: false,
		doc:     'Activate user records filter restriction.',
	),
	new config_key(
		path:    'features.search_client_max_limit',
		const:   'DEDALO_SEARCH_CLIENT_MAX_LIMIT',
		type:    'int',
		default: 1000,
		doc:     'Ceiling applied to client-supplied SQO limits (HTTP API).',
	),
	new config_key(
		path:    'features.ip_api',
		const:   'IP_API',
		type:    'map',
		default: [
			'url'          => 'https://api.country.is/$ip', // 10 Requests per second
			'href'         => 'https://ip-api.com/#$ip', // page to jump (Jump to another server because api.country.is don't provide this service)
			'country_code' => 'country', // property where look country code fro flag
		],
		doc:     'IP geolocation API endpoint. $ip is replaced by the real IP value.',
	),
	new config_key(
		path:    'features.show_debug_profiler',
		const:   'SHOW_DEBUG_PROFILER',
		type:    'bool',
		default: false,
		doc:     'Display the API end point report about memory usage.',
	),
];
