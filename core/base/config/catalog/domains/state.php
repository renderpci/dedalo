<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:  'state.install_status',
		const: 'DEDALO_INSTALL_STATUS',
		type:  'bool',
		scope: config_scope::STATE,
		doc:   'Install status flag. Machine-written at install time.',
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
];
