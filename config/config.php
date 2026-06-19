<?php declare(strict_types=1);

/**
* CONFIG.PHP — the v7 application config ENTRY POINT (spec §5.1).
* The ONLY config file in this web-served directory. It is the thin loader: it boots the
* catalog-driven pipeline (boot_web_profile), reading every per-install value + secret from
* OUTSIDE the web root, in ../private/ (.env, config.local.php, state.php, passthrough.php).
* No editable values or secrets live here. Existing `include config/config.php` sites boot
* the v7 pipeline unchanged.
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

$catalog = require $repo . '/core/base/config/catalog/catalog.php';

// All per-install config + secrets live OUTSIDE the web-served tree, in ../private/.
$env_path         = $repo . '/../private/.env';
$local_cfg        = $repo . '/../private/config.local.php';
$state_file       = $repo . '/../private/state.php';
$passthrough_file = $repo . '/../private/passthrough.php';
$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) { $local_override = []; }

// CLI entrypoints (crons, tools) must NOT start a web session: pick the profile by SAPI so
// the WEB-only phases (session_start, request_state) skip under CLI.
$profile = (php_sapi_name() === 'cli') ? entrypoint_profile::CLI : entrypoint_profile::WEB;

boot::run($profile, boot_web_profile::phases(
	$catalog,
	[],
	is_file($env_path) ? $env_path : null,
	$local_override,
	is_file($state_file) ? $state_file : null,
	is_file($passthrough_file) ? $passthrough_file : null,
	$repo,
	$_SERVER,
	php_sapi_name()
));
