<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';

/**
* BOOT_SUBSYSTEM_PHASES
* Factories for boot phases that include a legacy subsystem file by absolute path.
* In the prove-now scope only the CONSTANT-defining subsystems are wired:
*   - core/base/version.inc   → DEDALO_VERSION / DEDALO_BUILD / DEDALO_MAJOR_VERSION
*   - core/base/dd_tipos.php  → ~200 DEDALO_*_TIPO ontology constants
* Both are pure declarative define() files (no side effects, CLI-safe), so a phase is
* just a guarded require of the file. The remaining functioning-only subsystems
* (core_functions, logger, autoloader, session, request-state) are wired in the
* deferred cutover unit, where running the app verifies them.
*/
final class boot_subsystem_phases {

	/**
	* INCLUDE_PHASE — a boot_phase that require_once's a PHP file by absolute path.
	* @param string   $name    phase name (recorded by boot on failure)
	* @param string   $path    absolute path to the file to include
	* @param string[] $skip_in entrypoint_profile string values to skip in
	*/
	public static function include_phase(string $name, string $path, array $skip_in = []) : boot_phase {
		return new boot_phase($name, static function () use ($name, $path) : void {
			if (!is_file($path)) {
				throw new \RuntimeException("boot: {$name} phase: file not found: {$path}");
			}
			require_once $path;
		}, $skip_in);
	}
}
