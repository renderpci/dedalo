<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
require_once __DIR__ . '/class.env_loader.php';
require_once __DIR__ . '/class.config_caster.php';
require_once __DIR__ . '/../config/class.config_scope.php';
require_once __DIR__ . '/../config/class.config_compiler.php';
require_once __DIR__ . '/../config/class.config.php';
require_once __DIR__ . '/../config/class.compat_shim.php';

/**
* BOOT_CONFIG_PHASES
* Produces the config-foundation boot phases. The catalog+overrides are resolved
* ONCE; the resulting flat map is shared (by closure reference) between booting
* the `config` repository and emitting the legacy `DEDALO_*` constants — so the
* two phases never re-resolve or drift.
*/
final class boot_config_phases {

	/**
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $layer_overrides ordered low->high
	* @param callable|null $definer passed to compat_shim::emit (default: guarded define)
	* @return boot_phase[] exactly: [config_build, compat_shim]
	*/
	public static function phases(array $catalog, array $layer_overrides, ?callable $definer = null) : array {

		$flat = []; // populated by config_build; compat_shim must run after it (boot::run enforces order)

		$build = new boot_phase('config_build', function () use (&$flat, $catalog, $layer_overrides) : void {
			$flat = config_compiler::resolve($catalog, $layer_overrides);
			config::boot($flat);
		});

		$emit = new boot_phase('compat_shim', function () use (&$flat, $catalog, $definer) : void {
			compat_shim::emit($flat, $catalog, $definer);
		});

		return [$build, $emit];
	}//end phases

	/**
	* Build a config-override layer from the values already loaded into env_loader (i.e. from
	* ../private/.env then ../private/.env.<host>, host-last so it wins). Every STATIC catalog
	* key whose constant has an .env value becomes {dot.path => typed value}, so .env can
	* override ANY general setting — not just secrets. SECRET keys are emitted by the
	* secret/state phase; DERIVED keys are computed; so only STATIC keys are mapped here.
	* The caller layers this ABOVE config.local.php (env wins). No-op (returns []) when .env
	* defines no STATIC settings, so existing secrets-only .env files change nothing.
	*
	* @param config_key[] $catalog
	* @return array<string,mixed> dot.path => value (a high-precedence override layer)
	*/
	public static function env_overrides(array $catalog) : array {
		$out = [];
		foreach ($catalog as $key) {
			if ($key->const === null || $key->scope !== config_scope::STATIC) {
				continue;
			}
			$v = env_loader::get($key->const);
			if ($v === null) {
				continue;
			}
			$out[$key->path] = config_caster::cast($v, $key->type);
		}
		return $out;
	}//end env_overrides
}
