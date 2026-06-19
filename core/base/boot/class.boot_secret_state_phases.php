<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.env_loader.php';
require_once __DIR__ . '/../config/class.config_scope.php';

/**
* BOOT_SECRET_STATE_PHASES
* compat_shim emits STATIC/DERIVED (the compiled $flat) only. The migrated/cutover boot
* must ALSO emit SECRET constants — sourced LIVE from the loaded .env (env_loader),
* keyed by the constant name — and STATE constants — sourced from state.php, keyed by the
* catalog dot-path. This phase fills that gap; it runs AFTER env_load + compat_shim. The
* $definer is injectable so it is unit-testable without polluting real process constants.
*/
final class boot_secret_state_phases {

	/**
	* @param config_key[] $catalog
	* @param ?string $state_file absolute path to a state.php returning [dot.path => value]
	* @param ?callable $definer fn(string $name, mixed $value): void (default: guarded define)
	*/
	public static function emit_phase(array $catalog, ?string $state_file = null, ?callable $definer = null) : boot_phase {
		return new boot_phase('secret_state_emit', static function () use ($catalog, $state_file, $definer) : void {
			$definer ??= static function (string $name, mixed $value) : void {
				if (!defined($name)) {
					define($name, $value);
				}
			};
			$state = ($state_file !== null && is_file($state_file)) ? (require $state_file) : [];
			if (!is_array($state)) {
				$state = [];
			}
			foreach ($catalog as $key) {
				if ($key->const === null) {
					continue;
				}
				if ($key->scope === config_scope::SECRET) {
					$v = env_loader::get($key->const); // .env key == constant name (env_writer convention)
					if ($v !== null) {
						$definer($key->const, self::cast_value($v, $key->type)); // .env is text → cast to the catalog type
					}
				} elseif ($key->scope === config_scope::STATE) {
					if (array_key_exists($key->path, $state)) {
						$definer($key->const, $state[$key->path]);
					}
				}
			}
		});
	}//end emit_phase

	/** Cast a .env STRING value back to the catalog's declared type (.env is text-only). */
	private static function cast_value(string $value, string $type) : mixed {
		return match ($type) {
			'int'         => (int) $value,
			'bool'        => in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true),
			'list', 'map' => is_array($decoded = json_decode($value, true)) ? $decoded : [],
			default       => $value, // string
		};
	}//end cast_value
}
