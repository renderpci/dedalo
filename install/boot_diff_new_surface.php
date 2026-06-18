<?php declare(strict_types=1);

/**
* BOOT_DIFF_NEW_SURFACE
* Boots the NEW config pipeline (prove-now surface scope) in isolation and prints its
* emitted user-constant surface as JSON on stdout. Used by boot_diff_run.php as the
* "new" subprocess, and exercised hermetically by boot_diff_new_surface_Test.
*
* Surface scope = config catalog (STATIC/DERIVED via compat_shim) + version.inc +
* dd_tipos.php. NO database, session, autoloader, or logger — none affect the constant
* surface. SECRET/STATE are absent (live-sourced); REQUEST/USER are accessor-only.
*/

$root = dirname(__DIR__); // install/ -> repo root

require_once $root . '/core/base/config/class.config_scope.php';
require_once $root . '/core/base/config/class.config_merge.php';
require_once $root . '/core/base/config/class.config_key.php';
require_once $root . '/core/base/config/class.config.php';
require_once $root . '/core/base/config/class.config_compiler.php';
require_once $root . '/core/base/config/class.compat_shim.php';
require_once $root . '/core/base/boot/class.entrypoint_profile.php';
require_once $root . '/core/base/boot/class.boot_state.php';
require_once $root . '/core/base/boot/class.boot_phase.php';
require_once $root . '/core/base/boot/class.boot.php';
require_once $root . '/core/base/boot/class.boot_config_phases.php';
require_once $root . '/core/base/boot/class.boot_paths.php';
require_once $root . '/core/base/boot/class.boot_subsystem_phases.php';

$catalog = require $root . '/core/base/config/catalog/catalog.php';

// runtime-derived path bases (root/root_web/host/protocol) as a compiler layer override
$paths_override = boot_paths::resolve($root . '/config', $_SERVER, php_sapi_name());

// config_build + compat_shim (default definer = real guarded define())
$phases = boot_config_phases::phases($catalog, [$paths_override]);
// + the two constant-defining subsystem includes
$phases[] = boot_subsystem_phases::include_phase('version', $root . '/core/base/version.inc');
$phases[] = boot_subsystem_phases::include_phase('dd_tipos', $root . '/core/base/dd_tipos.php');

boot::run(entrypoint_profile::CLI, $phases);

echo json_encode(get_defined_constants(true)['user']);
