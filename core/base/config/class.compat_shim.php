<?php declare(strict_types=1);

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_key.php';

/**
* COMPAT_SHIM
* Generates the legacy DEDALO_* (and other) constants from the resolved config,
* so existing define()-based core code keeps working unchanged. REQUEST/USER
* scoped keys are NEVER emitted (they are accessor-only — emitting them as
* process-global constants would freeze per-request/per-user state in a
* long-lived worker). The definer is injectable so the emission is unit-testable
* without polluting real process constants.
*/
final class compat_shim {

	/**
	* EMIT
	* @param array<string,mixed> $flat resolved dot-path => value (STATIC + DERIVED)
	* @param config_key[] $catalog
	* @param callable|null $definer fn(string $name, mixed $value): void — defaults to
	*        a guarded define() that never redefines an existing constant
	* @return array<string,mixed> the name => value pairs that were emitted
	*/
	public static function emit(array $flat, array $catalog, ?callable $definer = null) : array {

		$definer ??= static function (string $name, mixed $value) : void {
			if (!defined($name)) {
				define($name, $value);
			}
		};

		$emitted = [];
		foreach ($catalog as $key) {
			if ($key->const === null) {
				continue; // new-world-only key, no legacy constant
			}
			// Only REQUEST/USER are scope-excluded (accessor-only — never process
			// constants). SECRET/STATE keys ARE emittable as constants, but are
			// simply absent from the compiled $flat here; Phase 3 sources their
			// live values (env/state) and emits them via this same path.
			if ($key->scope === config_scope::REQUEST || $key->scope === config_scope::USER) {
				continue; // accessor-only — never a process-global constant
			}
			if (!array_key_exists($key->path, $flat)) {
				continue; // value not in the resolved map (e.g. SECRET/STATE read elsewhere)
			}
			$definer($key->const, $flat[$key->path]);
			$emitted[$key->const] = $flat[$key->path];
		}

		return $emitted;
	}//end emit
}
