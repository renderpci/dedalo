<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.boot_config_phases.php';
require_once __DIR__ . '/class.boot_runtime_phases.php';
require_once __DIR__ . '/class.boot_paths.php';
require_once __DIR__ . '/class.boot_subsystem_phases.php';
require_once __DIR__ . '/class.boot_secret_state_phases.php';
require_once __DIR__ . '/class.boot_web_phases.php';

/**
* BOOT_WEB_PROFILE
* Assembles the full WEB boot phase list (spec §5.7 P0–P14), composing the surface phases
* (config_build/compat_shim, secret/state emit, subsystem includes, apply_locale) with the
* functioning phases (error handlers, core_functions, logger, autoloader, session,
* request-state). The thin shim config/config.shim.php calls boot::run(WEB, phases(...)).
* The warn-only secret-gate (P5) is a deferred polish (not assembled here).
*/
final class boot_web_profile {

	/**
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $base_overrides extra low-precedence layers
	* @param ?string $env_path the .env to load (null = skip env_load)
	* @param array<string,mixed> $local_override per-install config override layer (highest)
	* @param ?string $state_file state.php for STATE emission
	* @param string $repo absolute repo root (for subsystem file paths)
	* @param array $server $_SERVER-like map (for paths)
	* @param string $sapi php_sapi_name()
	* @return boot_phase[]
	*/
	public static function phases(array $catalog, array $base_overrides, ?string $env_path, array $local_override, ?string $state_file, ?string $passthrough_file, string $repo, array $server, string $sapi, ?callable $definer = null) : array {
		$paths_override = boot_paths::resolve($repo . '/config', $server, $sapi);
		$layers = $base_overrides;
		$layers[] = $paths_override;
		$layers[] = $local_override;

		$phases = [];
		// P0/P1 error + shutdown handlers (class.Error.php auto-initializes on include)
		$phases[] = boot_subsystem_phases::include_phase('error_handlers', $repo . '/core/base/class.Error.php');
		// P3 secrets
		if ($env_path !== null) {
			$phases[] = boot_runtime_phases::env_load_phase($env_path);
		}
		// P4 config-build + P6 compat-shim (paths + local override as layers)
		foreach (boot_config_phases::phases($catalog, $layers, $definer) as $p) {
			$phases[] = $p;
		}
		// P6.5 SECRET/STATE live emission
		$phases[] = boot_secret_state_phases::emit_phase($catalog, $state_file, $definer);
		// P6.6 per-install passthrough defines (verbatim: DEDALO_CONFIG/CORE/... + SESSION_SAVE_PATH);
		// after compat_shim so const-refs (e.g. DEDALO_SESSIONS_PATH) are already defined. Path is
		// caller-provided (the shim points it outside the web root, alongside .env).
		if ($passthrough_file !== null && is_file($passthrough_file)) {
			$phases[] = boot_subsystem_phases::include_phase('passthrough', $passthrough_file);
		}
		// P7–P10 subsystem includes
		$phases[] = boot_subsystem_phases::include_phase('core_functions', $repo . '/shared/core_functions.php');
		// autoloader BEFORE logger/dd_tipos so their on-demand classes (e.g. logger_backend) resolve via spl_autoload
		$phases[] = boot_subsystem_phases::include_phase('autoloader', $repo . '/core/base/class.loader.php');
		$phases[] = boot_web_phases::logger_phase($repo . '/core/logger/class.logger.php');
		$phases[] = boot_subsystem_phases::include_phase('dd_tipos', $repo . '/core/base/dd_tipos.php');
		$phases[] = boot_subsystem_phases::include_phase('version', $repo . '/core/base/version.inc');
		// P11/P12 encoding + locale + timezone
		$phases[] = boot_runtime_phases::apply_locale_phase();
		// P13/P14 WEB-only
		$phases[] = boot_web_phases::session_phase();
		$phases[] = boot_web_phases::request_state_phase();

		return $phases;
	}//end phases
}
