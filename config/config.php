<?php declare(strict_types=1);

/**
* CONFIG.PHP — the v7 application config ENTRY POINT (spec §5.1).
* The ONLY config file in this web-served directory. It is the thin loader: it boots the
* catalog-driven pipeline (boot_web_profile), reading every per-install value + secret from
* OUTSIDE the web root, in ../private/: .env (+ host override .env.<host>), config.local.php,
* state.php, passthrough.php. No editable values or secrets live here. Existing
* `include config/config.php` sites boot the v7 pipeline unchanged.
* Precedence (low→high): catalog defaults → config.local.php → .env → .env.<host> → process env.
*/

$repo = dirname(__DIR__);

require_once $repo . '/core/base/config/class.config_scope.php';
require_once $repo . '/core/base/config/class.config_merge.php';
require_once $repo . '/core/base/config/class.config_key.php';
require_once $repo . '/core/base/config/class.config.php';
require_once $repo . '/core/base/config/class.config_compiler.php';
require_once $repo . '/core/base/config/class.compat_shim.php';
require_once $repo . '/core/base/boot/class.entrypoint_profile.php';
require_once $repo . '/core/base/boot/class.boot_state.php';
require_once $repo . '/core/base/boot/class.boot_phase.php';
require_once $repo . '/core/base/boot/class.boot.php';
require_once $repo . '/core/base/boot/class.boot_web_profile.php';
require_once $repo . '/core/base/boot/class.env_loader.php';
require_once $repo . '/core/base/boot/class.boot_config_phases.php';

$catalog = require $repo . '/core/base/config/catalog/catalog.php';

// All per-install config + secrets live OUTSIDE the web-served tree, in ../private/.
$private          = $repo . '/../private';
$local_cfg        = $private . '/config.local.php';
$state_file       = $private . '/state.php';
$passthrough_file = $private . '/passthrough.php';

// Host-layered env: load ../private/.env (shared base) then ../private/.env.<host> (overrides).
// host = the web Host header, else the DEDALO_ENV var / machine hostname on CLI. Sanitized for
// use in a filename (no path separators), so a spoofed/unknown Host can only ever miss (no file).
$raw_host = $_SERVER['HTTP_HOST'] ?? (getenv('DEDALO_ENV') ?: gethostname());
$host     = preg_replace('/[^A-Za-z0-9_.-]/', '', explode(':', (string) $raw_host)[0]);
$env_files = [$private . '/.env'];
if ($host !== '' && strpos($host, '..') === false) {
	$env_files[] = $private . '/.env.' . $host; // e.g. .env.localhost, .env.my-local-domain
}
foreach ($env_files as $env_file) {
	if (is_file($env_file)) { env_loader::load($env_file); } // later file wins (env_loader is last-wins)
}

$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) { $local_override = []; }
// .env (+ .env.<host>) overrides any STATIC setting, layered ABOVE config.local.php (env wins).
$local_override = array_replace($local_override, boot_config_phases::env_overrides($catalog));

// CLI entrypoints (crons, tools) must NOT start a web session: pick the profile by SAPI so
// the WEB-only phases (session_start, request_state) skip under CLI.
$profile = (php_sapi_name() === 'cli') ? entrypoint_profile::CLI : entrypoint_profile::WEB;

boot::run($profile, boot_web_profile::phases(
	$catalog,
	[],
	null, // env already loaded above (host-layered); skip the profile's single-file env_load
	$local_override,
	is_file($state_file) ? $state_file : null,
	is_file($passthrough_file) ? $passthrough_file : null,
	$repo,
	$_SERVER,
	php_sapi_name()
));
