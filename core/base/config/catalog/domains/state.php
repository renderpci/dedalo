<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:  'state.install_status',
		const: 'DEDALO_INSTALL_STATUS',
		type:  'string',
		scope: config_scope::STATE,
		doc:   "Install status. Machine-written at install completion: the string 'installed' once the installation is sealed; absent/empty before. ~15 consumers gate on DEDALO_INSTALL_STATUS === 'installed' (install flow, v1 API, dd_ontology_db_manager, dd_init_test), so this is a string, not a bool.",
	),
	new config_key(
		path:  'state.maintenance_mode',
		const: 'DEDALO_MAINTENANCE_MODE',
		type:  'bool',
		scope: config_scope::STATE,
		doc:   'Maintenance mode active (true) / inactive (false). Machine-written.',
	),
	new config_key(
		path:  'state.information',
		const: 'DEDALO_INFORMATION',
		type:  'string',
		scope: config_scope::STATE,
		doc:   'Install information string. Set before install; do not change after.',
	),
	new config_key(
		path:  'state.info_key',
		const: 'DEDALO_INFO_KEY',
		type:  'string',
		scope: config_scope::STATE,
		doc:   'Install info key. Set before install; do not change after.',
	),
	// Runtime override flags written by the area_maintenance widgets (set_config_core).
	// Machine-written to ../private/state.php; legacy v6 kept them in config_core.php.
	new config_key(
		path:  'state.maintenance_mode_custom',
		const: 'DEDALO_MAINTENANCE_MODE_CUSTOM',
		type:  'bool',
		scope: config_scope::STATE,
		doc:   'Maintenance mode runtime override (set from the maintenance area). Absent/false = no maintenance.',
	),
	new config_key(
		path:  'state.notification_custom',
		const: 'DEDALO_NOTIFICATION_CUSTOM',
		type:  'map',
		scope: config_scope::STATE,
		doc:   "Browser notification runtime override: empty = none; otherwise ['msg'=>..., 'class_name'=>...]. Consumers gate on !empty().",
	),
	new config_key(
		path:  'state.media_access_mode_custom',
		const: 'DEDALO_MEDIA_ACCESS_MODE_CUSTOM',
		type:  'string',
		scope: config_scope::STATE,
		doc:   "Media access mode runtime override: '' (no override) | 'false' | 'private' | 'publication'. media_protection::get_mode() treats ''/null as no override.",
	),
	new config_key(
		path:  'state.entity_menu_skip_tipos_custom',
		const: 'DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM',
		type:  'list',
		scope: config_scope::STATE,
		doc:   'Menu skip-tipos runtime override (set from the menu_skip_tipos maintenance widget). When NON-EMPTY it REPLACES the base DEDALO_ENTITY_MENU_SKIP_TIPOS in menu.php; empty (a list key resolves to [] when unset) = no override, use the base. Lets an admin override a base list deployed via .env.',
	),
	new config_key(
		path:  'state.recovery_mode',
		const: 'DEDALO_RECOVERY_MODE',
		type:  'bool',
		scope: config_scope::STATE,
		doc:   'Recovery mode flag (set during an API boot-failure scenario). Absent/false = normal operation.',
	),
];
