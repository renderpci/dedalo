<?php declare(strict_types=1);

require_once __DIR__ . '/class.boot_phase.php';
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

		$flat = [];

		$build = new boot_phase('config_build', function () use (&$flat, $catalog, $layer_overrides) : void {
			$flat = config_compiler::resolve($catalog, $layer_overrides);
			config::boot($flat);
		});

		$emit = new boot_phase('compat_shim', function () use (&$flat, $catalog, $definer) : void {
			compat_shim::emit($flat, $catalog, $definer);
		});

		return [$build, $emit];
	}//end phases
}
