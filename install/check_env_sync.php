<?php declare(strict_types=1);

/**
* CHECK_ENV_SYNC (CLI)
* Reports drift between the PHP `.env` and the Bun diffusion `.env`.
* Usage: php install/check_env_sync.php [path/to/php.env] [path/to/bun.env]
* Exit 0 = in sync, 1 = drift, 2 = usage/read error.
* Prints only KEY NAMES — never secret values.
*/
if (php_sapi_name() !== 'cli') {
	http_response_code(404);
	exit;
}

require_once dirname(__DIR__) . '/core/base/boot/class.env_loader.php';
require_once dirname(__DIR__) . '/core/base/boot/class.env_sync.php';

$php_env = $argv[1] ?? (dirname(__DIR__, 2) . '/private/.env');
$bun_env = $argv[2] ?? (dirname(__DIR__) . '/diffusion/api/v1/.env');

foreach ([$php_env, $bun_env] as $p) {
	if (!is_file($p) || !is_readable($p)) {
		fwrite(STDERR, "check_env_sync: cannot read env file: $p\n");
		exit(2);
	}
}

$drift = env_sync::compare(
	env_loader::parse(file_get_contents($php_env)),
	env_loader::parse(file_get_contents($bun_env))
);

if (empty($drift)) {
	fwrite(STDOUT, "env sync OK: PHP and Bun shared keys match.\n");
	exit(0);
}

fwrite(STDERR, "env DRIFT detected (values hidden):\n");
foreach ($drift as $d) {
	$state = $d['php_val'] === null ? 'missing in PHP'
		: ($d['bun_val'] === null ? 'missing in Bun' : 'values differ');
	fwrite(STDERR, "  - {$d['php_key']} <-> {$d['bun_key']}: {$state}\n");
}
exit(1);
