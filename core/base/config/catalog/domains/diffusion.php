<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:    'diffusion.socket_path',
		const:   'DEDALO_DIFFUSION_SOCKET_PATH',
		type:    'string',
		default: '/tmp/diffusion.sock',
		doc:     'Unix socket of the Bun diffusion engine. null forces HTTP calls through DEDALO_DIFFUSION_API_URL.',
	),
	new config_key(
		path:    'diffusion.service_cmd',
		const:   'DEDALO_DIFFUSION_SERVICE_CMD',
		type:    'string',
		default: '',
		doc:     'Supervisor command used by diffusion_server_control to start/stop/restart the Bun engine. Empty = disabled.',
	),
	new config_key(
		path:    'diffusion.internal_token',
		const:   'DEDALO_DIFFUSION_INTERNAL_TOKEN',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'Internal token for server-to-server diffusion calls without a session (CLI/cron). Must match DIFFUSION_INTERNAL_TOKEN in .env.',
	),
	new config_key(
		path:    'diffusion.domain',
		const:   'DEDALO_DIFFUSION_DOMAIN',
		type:    'string',
		default: 'default',
		doc:     'Publication diffusion domain.',
	),
	new config_key(
		path:    'diffusion.resolve_levels',
		const:   'DEDALO_DIFFUSION_RESOLVE_LEVELS',
		type:    'int',
		default: 2,
		doc:     'Number of resolution levels to accomplish.',
	),
	new config_key(
		path:    'diffusion.publication_clean_url',
		const:   'DEDALO_PUBLICATION_CLEAN_URL',
		type:    'bool',
		default: false,
		doc:     'On true, media paths are simplified to filename only in diffusion processing.',
	),
	new config_key(
		path:    'diffusion.custom',
		const:   'DEDALO_DIFFUSION_CUSTOM',
		// string|bool: false (default, disabled) | a custom file path. Typed 'string' so a path set
		// via .env is NOT collapsed to a bool; the bool false default round-trips unchanged (the
		// loader gates on !empty(), so false stays disabled).
		type:    'string',
		default: false,
		doc:     'Optional custom file to manipulate diffusion options. string|bool.',
	),
	new config_key(
		path:    'diffusion.api_web_user_code_multiple',
		const:   'API_WEB_USER_CODE_MULTIPLE',
		type:    'list',
		scope:   config_scope::SECRET,
		doc:     'Publication API credentials (list of maps with db_name, code, api_ui). SECRET — contains codes.',
	),
	new config_key(
		path:    'diffusion.structure_from_server',
		const:   'STRUCTURE_FROM_SERVER',
		type:    'bool',
		default: true,
		doc:     'Remote structure server code flag.',
	),
	new config_key(
		path:    'diffusion.is_an_ontology_server',
		const:   'IS_AN_ONTOLOGY_SERVER',
		type:    'bool',
		default: false,
		doc:     'Defines if this installation can provide its ontology files to other Dédalo servers.',
	),
	new config_key(
		path:    'diffusion.ontology_servers',
		const:   'ONTOLOGY_SERVERS',
		type:    'list',
		scope:   config_scope::SECRET,
		doc:     'Remote ontology servers (list of maps with name, url, code). SECRET — contains codes.',
	),
	new config_key(
		path:    'diffusion.is_a_code_server',
		const:   'IS_A_CODE_SERVER',
		type:    'bool',
		default: false,
		doc:     'Defines if this installation can provide new code files to other Dédalo servers.',
	),
	new config_key(
		path:    'diffusion.code_servers',
		const:   'CODE_SERVERS',
		type:    'list',
		scope:   config_scope::SECRET,
		doc:     'Remote code servers (list of maps with name, url, code). SECRET — contains codes.',
	),
];
