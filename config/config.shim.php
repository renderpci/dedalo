<?php declare(strict_types=1);

/**
* CONFIG.SHIM.PHP — the v7 thin shim that REPLACES config.php at cutover (spec §5.1).
* INERT until the flip: nothing includes this file yet. At flip-time it is moved to
* config.php (after the migration has populated ../private/.env + config/local/config.php
* + config/state.php, with a backup) so existing `include config/config.php` sites boot
* the v7 pipeline. Do NOT enable without: a faithful validate_migration run, the migration
* committed, a backup, and a live verify.
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

$env_path     = $repo . '/../private/.env';
$local_cfg    = $repo . '/config/local/config.php';
$state_file   = $repo . '/config/state.php';
$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) { $local_override = []; }

boot::run(entrypoint_profile::WEB, boot_web_profile::phases(
	$catalog,
	[],
	is_file($env_path) ? $env_path : null,
	$local_override,
	is_file($state_file) ? $state_file : null,
	$repo,
	$_SERVER,
	php_sapi_name()
));
