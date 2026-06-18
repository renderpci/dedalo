<?php declare(strict_types=1);

// Dédalo v7 config catalog — aggregates all domain files into one config_key[].
// The install-root-derived path family is intentionally deferred to Phase 3b;
// paths.core_url is retained here for continuity with the config-core machinery.

require_once __DIR__ . '/../class.config_scope.php';
require_once __DIR__ . '/../class.config_merge.php';
require_once __DIR__ . '/../class.config_key.php';

$keys = [
	// retained path slice key (full path family lands in Phase 3b)
	new config_key(path: 'paths.core_url', const: 'DEDALO_CORE_URL', type: 'string', default: '/dedalo/core', doc: 'Web URL of the core directory.'),
];

foreach ([
	'identity', 'runtime', 'lang', 'defaults',
	'media_image', 'media_av', 'media_docs',
	'features', 'diffusion', 'db', 'areas', 'state',
] as $domain) {
	foreach (require __DIR__ . '/domains/' . $domain . '.php' as $key) {
		$keys[] = $key;
	}
}

return $keys;
