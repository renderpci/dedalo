<?php declare(strict_types=1);

/**
* BOOT_DIFF_MIGRATED_SURFACE
* Boots the migrated-config-CONSUMING pipeline against a staging dir and prints its
* user-constant surface as JSON. The cutover's surface-boot, minus the flip: it loads the
* migrated .env (secrets), applies the migrated local config override (a compiler layer),
* emits STATIC/DERIVED (compat_shim) + SECRET/STATE (boot_secret_state_phases), includes
* the subsystem constant files (version.inc/dd_tipos), and includes the migrated
* passthrough. Catalog + subsystem files are explicit args (fixtures in tests; real ones
* in the live validator). No DB; reads only the staging dir.
*
* Usage: php install/boot_diff_migrated_surface.php --staging=DIR --catalog=FILE [--subsystem=FILE ...]
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
require_once $repo . '/core/base/boot/class.boot_config_phases.php';
require_once $repo . '/core/base/boot/class.boot_paths.php';
require_once $repo . '/core/base/boot/class.boot_runtime_phases.php';
require_once $repo . '/core/base/boot/class.boot_subsystem_phases.php';
require_once $repo . '/core/base/boot/class.boot_secret_state_phases.php';

$staging = null; $catalog_file = null; $subsystems = [];
foreach (array_slice($argv, 1) as $arg) {
	if (preg_match('/^--staging=(.*)$/', $arg, $m))   { $staging = $m[1]; continue; }
	if (preg_match('/^--catalog=(.*)$/', $arg, $m))   { $catalog_file = $m[1]; continue; }
	if (preg_match('/^--subsystem=(.*)$/', $arg, $m)) { $subsystems[] = $m[1]; continue; }
}
if ($staging === null || $catalog_file === null || !is_file($catalog_file)) {
	fwrite(STDERR, "boot_diff_migrated_surface: need --staging=DIR and --catalog=FILE\n");
	exit(2);
}

$catalog = require $catalog_file;

$phases = [];
$env = $staging . '/private/.env';
if (is_file($env)) {
	$phases[] = boot_runtime_phases::env_load_phase($env);
}
// Paths resolve from the real install root (where core/, config/ live), NOT the staging
// dir (which only holds the migrated VALUE files). This is how the post-flip boot computes
// them, so the surfaces line up.
$paths_override = boot_paths::resolve($repo . '/config', $_SERVER, php_sapi_name());
$local_cfg = $staging . '/config/local/config.php';
$local_override = is_file($local_cfg) ? (require $local_cfg) : [];
if (!is_array($local_override)) {
	$local_override = [];
}
foreach (boot_config_phases::phases($catalog, [$paths_override, $local_override]) as $p) {
	$phases[] = $p;
}
$phases[] = boot_secret_state_phases::emit_phase($catalog, $staging . '/config/state.php');
foreach ($subsystems as $i => $file) {
	$phases[] = boot_subsystem_phases::include_phase('subsystem_' . $i, $file);
}
$passthrough = $staging . '/config/local/passthrough.php';
if (is_file($passthrough)) {
	$phases[] = boot_subsystem_phases::include_phase('passthrough', $passthrough);
}

boot::run(entrypoint_profile::CLI, $phases);

echo json_encode(get_defined_constants(true)['user']);
