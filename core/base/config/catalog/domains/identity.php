<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(path: 'identity.salt_string', const: 'DEDALO_SALT_STRING', type: 'string', scope: config_scope::SECRET, doc: 'Crypto salt (env-only; never compiled).'),
	new config_key(path: 'identity.timezone', const: 'DEDALO_TIMEZONE', type: 'string', default: 'Europe/Madrid', doc: 'Default timezone.'),
	new config_key(path: 'identity.locale', const: 'DEDALO_LOCALE', type: 'string', default: 'es-ES', doc: 'Locale.'),
	new config_key(path: 'identity.date_order', const: 'DEDALO_DATE_ORDER', type: 'string', default: 'dmy', doc: 'Date order dmy|mdy|ymd.'),
	new config_key(path: 'identity.entity', const: 'DEDALO_ENTITY', type: 'string', default: 'my_entity_name', doc: 'Entity name.'),
	new config_key(path: 'identity.entity_label', const: 'DEDALO_ENTITY_LABEL', type: 'string', scope: config_scope::DERIVED, derived: static fn(array $r) : string => (class_exists('env_loader') && ($l = (string)(env_loader::get('DEDALO_ENTITY_LABEL') ?? '')) !== '') ? $l : (string) $r['identity.entity'], doc: 'Entity label. Set DEDALO_ENTITY_LABEL in .env to override; defaults to the entity name.'),
	new config_key(path: 'identity.entity_id', const: 'DEDALO_ENTITY_ID', type: 'int', default: 0, doc: 'Entity id from the Dédalo registry.'),
	new config_key(path: 'identity.development_server', const: 'DEVELOPMENT_SERVER', type: 'bool', default: false, doc: 'Development server flag.'),
	new config_key(path: 'identity.encryption_mode', const: 'ENCRYPTION_MODE', type: 'string', default: 'openssl', doc: 'Encryption mode.'),
];
