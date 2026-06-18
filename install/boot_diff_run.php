<?php declare(strict_types=1);

/**
* BOOT_DIFF_RUN (spec §5.9, prove-now) — CONTROLLER one-shot verification.
* Boots the OLD config.php and the NEW pipeline in ISOLATED subprocesses, captures each
* emitted user-constant surface, and prints a redacted classification.
*
* Booting config.php runs the full v6 chain and needs the live DB — run this ONCE on the
* install box. It NEVER reads config.php source; it only captures the runtime constant
* table the boot produces. Values are never printed (see boot_diff::render).
*
* Usage:  php install/boot_diff_run.php
* Exit:   0 = parity, 1 = parity failure, 2 = a surface capture failed.
*/

$root = dirname(__DIR__);

require_once $root . '/core/base/config/class.config_scope.php';
require_once $root . '/core/base/config/class.config_merge.php';
require_once $root . '/core/base/config/class.config_key.php';
require_once $root . '/install/class.legacy_surface.php';
require_once $root . '/install/class.boot_diff.php';

// --- subprocess: NEW pipeline surface (hermetic, no DB) ---
$new_cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($root . '/install/boot_diff_new_surface.php') . ' 2>/dev/null';
$new = json_decode((string) shell_exec($new_cmd), true);
if (!is_array($new)) {
	fwrite(STDERR, "boot_diff: new-pipeline surface capture failed\n");
	exit(2);
}

// --- subprocess: OLD config.php surface (runs the full v6 chain; needs the live DB) ---
$old_php = 'include ' . var_export($root . '/config/config.php', true) . '; echo json_encode(get_defined_constants(true)["user"]);';
$old_cmd = escapeshellarg(PHP_BINARY) . ' -d error_reporting=0 -d display_errors=0 -r ' . escapeshellarg($old_php) . ' 2>/dev/null';
$old = json_decode((string) shell_exec($old_cmd), true);
if (!is_array($old)) {
	fwrite(STDERR, "boot_diff: legacy config.php surface capture failed (CLI boot did not complete)\n");
	exit(2);
}

$catalog         = require $root . '/core/base/config/catalog/catalog.php';
$subsystem_files = [$root . '/core/base/version.inc', $root . '/core/base/dd_tipos.php'];

$report = boot_diff::classify($old, $new, $catalog, $subsystem_files);
echo boot_diff::render($report) . "\n";
exit($report['parity'] ? 0 : 1);
