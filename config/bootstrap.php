<?php declare(strict_types=1);

/**
* BOOTSTRAP.PHP — the v7 application config ENTRY POINT (spec §5.1).
* The ONLY git-TRACKED file in this web-served directory and the thin loader: it boots the
* catalog-driven pipeline (boot_web_profile), reading every per-install value + secret from
* OUTSIDE the web root, in ../private/: .env (+ host override .env.<host>), config.local.php,
* state.php, passthrough.php. No editable values or secrets live here.
*
* Renamed from config.php so that pulling the config flip onto a pre-flip box never collides
* with that box's untracked, secret-bearing config/config.php (git would refuse to overwrite it).
* All in-repo entry points include config/bootstrap.php; out-of-repo callers keep working via a
* generated, UNtracked config/config.php shim (`require __DIR__.'/bootstrap.php';`) written by the
* migration/installer. The legacy-config readers (install/migrate_config_v7.php,
* install/boot_diff_run.php) still read the file literally named config.php — do not repoint them.
*
* On a pre-flip box (legacy config present, ../private not yet populated) the loader transparently
* runs the one-time config migration BEFORE loading env, so `git pull` alone moves the install to
* the .env layout (see config_auto_migrate). DEDALO_INSTALL_STATUS carries over verbatim from the
* legacy config_core.php, so an already-installed box stays installed (no wizard).
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

// ONE-TIME TRANSPARENT CONFIG MIGRATION (pre-flip box).
// Hot path is two is_file() checks: once migrated (sentinel present) this is skipped entirely.
// Only when the legacy config is still present AND ../private has not been populated do we load
// the migrator and run it — BEFORE env loading below, so the .env we are about to read exists.
// Opt out with DEDALO_AUTO_MIGRATE=0 in the process env (e.g. to migrate manually via the CLI).
if (!is_file($private . '/.migration.json')
	&& (is_file($repo . '/config/config_core.php') || is_file($repo . '/config/config_db.php'))
	&& getenv('DEDALO_AUTO_MIGRATE') !== '0'
) {
	require_once $repo . '/install/class.config_auto_migrate.php';
	try {
		config_auto_migrate::run(
			$repo,
			$repo . '/config',
			$private,
			$repo . '/diffusion/api/v1/.env',
			$repo . '/../backups/config_migration'
		);
	} catch (config_migrate_blocked $e) {
		// FAIL SAFE: never boot a half-configured box. Tell the operator exactly what to do.
		if (php_sapi_name() === 'cli') {
			fwrite(STDERR, "Dédalo config migration could not complete:\n  " . $e->getMessage() . "\n");
		} else {
			http_response_code(503);
			header('Content-Type: text/plain; charset=utf-8');
			echo "Dédalo is upgrading its configuration and needs attention:\n\n  " . $e->getMessage()
				. "\n\nFix the above, then reload. Or migrate manually: php install/migrate_config_v7.php\n";
		}
		exit(1);
	}
}

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

// FRESH-INSTALL SAFETY NET.
// A brand-new download has NO ../private/.env and NO state.php, so the SECRET and STATE
// constants are emitted by nothing and remain UNDEFINED. v6 always define()'d these, and a lot
// of legacy code still reads them unconditionally — e.g. DBi's default parameters
// (`$password = DEDALO_PASSWORD_CONN`) and dedalo_encrypt (DEDALO_INFORMATION / DEDALO_INFO_KEY) —
// so an unconfigured install would FATAL before the API could even return the installer context.
// Guarantee every legacy SECRET/STATE constant EXISTS with a type-appropriate empty default; real
// values from .env / state.php were emitted earlier in the boot and always win (define() is no-op
// once a constant exists). This is what makes the installer self-bootstrapping on a fresh server.
foreach ($catalog as $cfg_key) {
	if ($cfg_key->const === null) {
		continue;
	}
	if ($cfg_key->scope !== config_scope::SECRET && $cfg_key->scope !== config_scope::STATE) {
		continue;
	}
	if (defined($cfg_key->const)) {
		continue; // real value already emitted from .env / state.php
	}
	define($cfg_key->const, match ($cfg_key->type) {
		'int'         => 0,
		'bool'        => false,
		'list', 'map' => [],
		default       => '',
	});
}
