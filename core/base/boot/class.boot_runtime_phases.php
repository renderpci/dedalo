<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.boot_config_phases.php';
require_once __DIR__ . '/class.env_loader.php';
require_once __DIR__ . '/../config/class.config.php';

/**
* BOOT_RUNTIME_PHASES
* The hermetic runtime boot phases — env load, and the v6 process-global
* locale/encoding/timezone side-effects driven by the booted config — composed
* with boot_config_phases (config-build + compat-shim) into the boot pipeline.
* The subsystem-include / session / request-state phases are added by the
* cutover unit (they need the full app and are validated by the boot-diff gate).
*/
final class boot_runtime_phases {

	/**
	* APPLY_LOCALE_PHASE
	* Reproduces v6's mb_internal_encoding('UTF-8'), date_default_timezone_set,
	* and setlocale. Runs AFTER config is booted (reads config('identity.*')).
	*/
	public static function apply_locale_phase() : boot_phase {
		return new boot_phase('apply_locale', static function () : void {
			mb_internal_encoding('UTF-8');
			date_default_timezone_set(config('identity.timezone'));
			setlocale(LC_ALL, config('identity.locale'));
		});
	}//end apply_locale_phase

	/**
	* ENV_LOAD_PHASE
	* Loads the .env file (secrets) via the zero-dependency env_loader.
	* @param string $env_path absolute path to the .env file
	*/
	public static function env_load_phase(string $env_path) : boot_phase {
		return new boot_phase('env_load', static function () use ($env_path) : void {
			env_loader::load($env_path);
		});
	}//end env_load_phase

	/**
	* FOR
	* The ordered hermetic runtime pipeline:
	* [env_load? -> config_build -> compat_shim -> apply_locale].
	* $base_overrides (e.g. boot_paths::resolve()) is the compiler layer override
	* that resolves the path family to real install values.
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $base_overrides ordered low->high
	* @param string|null $env_path  if given, env_load runs first
	* @param callable|null $definer  passed to compat_shim
	* @return boot_phase[]
	*/
	public static function for(array $catalog, array $base_overrides = [], ?string $env_path = null, ?callable $definer = null) : array {

		$phases = [];
		if ($env_path !== null) {
			$phases[] = self::env_load_phase($env_path);
		}
		foreach (boot_config_phases::phases($catalog, $base_overrides, $definer) as $phase) {
			$phases[] = $phase;
		}
		$phases[] = self::apply_locale_phase();

		return $phases;
	}//end for
}
