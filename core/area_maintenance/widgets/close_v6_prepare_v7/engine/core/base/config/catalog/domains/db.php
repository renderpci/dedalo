<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	// PostgreSQL (primary)
	new config_key(
		path:    'db.type',
		const:   'DEDALO_DB_TYPE',
		type:    'string',
		default: 'postgresql',
		doc:     'Database type. Default: postgresql.',
	),
	new config_key(
		path:    'db.hostname',
		const:   'DEDALO_HOSTNAME_CONN',
		type:    'string',
		default: 'localhost',
		doc:     'PostgreSQL host.',
	),
	new config_key(
		path:    'db.port',
		const:   'DEDALO_DB_PORT_CONN',
		type:    'string',
		default: '5432',
		doc:     'PostgreSQL port.',
	),
	new config_key(
		path:    'db.socket',
		const:   'DEDALO_SOCKET_CONN',
		type:    'string',
		default: null,
		doc:     'PostgreSQL unix socket path. Null = not used.',
	),
	new config_key(
		path:    'db.database',
		const:   'DEDALO_DATABASE_CONN',
		type:    'string',
		default: 'dedalo_mydatabase',
		doc:     'PostgreSQL database name.',
	),
	new config_key(
		path:    'db.username',
		const:   'DEDALO_USERNAME_CONN',
		type:    'string',
		default: 'myusername',
		doc:     'PostgreSQL username.',
	),
	new config_key(
		path:    'db.password',
		const:   'DEDALO_PASSWORD_CONN',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'PostgreSQL password (env-only; never compiled).',
	),
	new config_key(
		path:    'db.slow_query_ms',
		const:   'SLOW_QUERY_MS',
		type:    'int',
		default: 6000,
		doc:     'Slow query threshold in milliseconds.',
	),
	new config_key(
		path:    'db.management',
		const:   'DEDALO_DB_MANAGEMENT',
		type:    'bool',
		default: true,
		doc:     'Activate Dédalo management of the database. If false, all admin tasks must be done manually.',
	),
	new config_key(
		path:    'db.bin_path',
		const:   'DB_BIN_PATH',
		type:    'string',
		default: '/usr/bin/',
		doc:     'Path to PostgreSQL binaries.',
	),
	new config_key(
		path:    'db.php_bin_path',
		const:   'PHP_BIN_PATH',
		type:    'string',
		default: '/usr/bin/php',
		doc:     'Path to PHP binary.',
	),
	// MariaDB (publication) is handled exclusively by the Bun diffusion engine now: its
	// connection lives only in diffusion/api/v1/.env (DB_*). PHP no longer defines
	// MYSQL_DEDALO_* — see env_sync::BUN_DB_MAP for the install/migration → Bun handoff.
];
