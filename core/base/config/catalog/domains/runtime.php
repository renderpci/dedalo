<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(path: 'runtime.session_handler', const: 'DEDALO_SESSION_HANDLER', type: 'string', default: 'files', doc: 'Session save handler: files|redis|memcached|postgresql|user.'),
	new config_key(path: 'runtime.cache_manager', const: 'DEDALO_CACHE_MANAGER', type: 'map', default: ['manager' => 'files', 'files_path' => ''], merge: config_merge::DEEP, doc: 'Cache manager (files_path resolved at boot).'),
	new config_key(path: 'runtime.show_debug', const: 'SHOW_DEBUG', type: 'bool', scope: config_scope::USER, doc: 'Debug output (per logged user; resolved at boot).'),
	new config_key(path: 'runtime.show_developer', const: 'SHOW_DEVELOPER', type: 'bool', scope: config_scope::USER, doc: 'Developer mode (per logged user).'),
	new config_key(path: 'runtime.logger_level', const: 'LOGGER_LEVEL', type: 'int', scope: config_scope::USER, doc: 'Logger verbosity (depends on debug/developer).'),
	new config_key(path: 'runtime.backup_on_login', const: 'DEDALO_BACKUP_ON_LOGIN', type: 'bool', default: true, doc: 'Run backups on login.'),
	new config_key(path: 'runtime.backup_time_range', const: 'DEDALO_BACKUP_TIME_RANGE', type: 'int', default: 8, doc: 'Min hours between backups.'),
];
