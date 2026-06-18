<?php declare(strict_types=1);

require_once __DIR__ . '/class.config_scope.php';
require_once __DIR__ . '/class.config_merge.php';
require_once __DIR__ . '/class.config_key.php';

/**
* CONFIG_COMPILER
* Resolves the catalog + layered overrides into a flat, request-independent map
* (STATIC + DERIVED only), and persists it as an opcache-friendly PHP artifact.
* SECRET/STATE/REQUEST/USER/DERIVED_REQUEST scopes are deliberately excluded
* from the compiled artifact (read live at boot in later phases).
*/
final class config_compiler {

	/**
	* RESOLVE
	* @param config_key[] $catalog
	* @param array<int,array<string,mixed>> $layer_overrides ordered low->high precedence
	* @return array<string,mixed> flat dot-path => value (STATIC + DERIVED)
	*/
	public static function resolve(array $catalog, array $layer_overrides) : array {

		// index catalog by path
		$by_path = [];
		foreach ($catalog as $key) {
			$by_path[$key->path] = $key;
		}

		// 1. seed STATIC defaults
		$resolved = [];
		foreach ($catalog as $key) {
			if ($key->scope === config_scope::STATIC) {
				$resolved[$key->path] = $key->default;
			}
		}

		// 2. apply layer overrides (low -> high), per-key merge strategy
		foreach ($layer_overrides as $overrides) {
			foreach ($overrides as $path => $value) {
				$key = $by_path[$path] ?? null;
				if ($key === null || $key->scope !== config_scope::STATIC) {
					continue; // unknown or non-static-overridable key: ignored here
				}
				if ($key->merge === config_merge::DEEP
					&& is_array($resolved[$path] ?? null) && is_array($value)) {
					$resolved[$path] = self::deep_merge($resolved[$path], $value);
				} else {
					$resolved[$path] = $value; // REPLACE
				}
			}
		}

		// 3. compute DERIVED values from the resolved static map
		foreach ($catalog as $key) {
			if ($key->scope === config_scope::DERIVED && $key->derived !== null) {
				$resolved[$key->path] = ($key->derived)($resolved);
			}
		}

		return $resolved;
	}//end resolve

	/**
	* DEEP_MERGE
	* Recursive associative merge; $b wins on scalar collisions, assoc subarrays recurse.
	* @param array<mixed> $a
	* @param array<mixed> $b
	* @return array<mixed>
	*/
	private static function deep_merge(array $a, array $b) : array {
		foreach ($b as $k => $v) {
			// recurse only into associative maps; list-valued sub-keys REPLACE wholesale
			if (is_array($v) && isset($a[$k]) && is_array($a[$k])
				&& !array_is_list($v) && !array_is_list($a[$k])) {
				$a[$k] = self::deep_merge($a[$k], $v);
			} else {
				$a[$k] = $v;
			}
		}
		return $a;
	}//end deep_merge
}
