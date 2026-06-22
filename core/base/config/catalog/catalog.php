<?php declare(strict_types=1);

// Dédalo v7 config catalog — aggregates all domain files into one config_key[].
// paths domain is listed first so its STATIC base keys resolve before
// media's DERIVED file_url (which depends on paths.core_url).

require_once __DIR__ . '/../class.config_scope.php';
require_once __DIR__ . '/../class.config_merge.php';
require_once __DIR__ . '/../class.config_key.php';

$keys = [];

foreach ([
	'paths',
	'identity', 'runtime', 'lang', 'defaults',
	'media_image', 'media_av', 'media_docs',
	'features', 'diffusion', 'db', 'rag', 'mailer', 'areas', 'state',
] as $domain) {
	foreach (require __DIR__ . '/domains/' . $domain . '.php' as $key) {
		$keys[] = $key;
	}
}

return $keys;
