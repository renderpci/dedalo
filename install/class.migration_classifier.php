<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';
require_once __DIR__ . '/class.constant_map.php';
require_once dirname(__DIR__) . '/core/base/boot/class.env_sync.php';

/**
* MIGRATION_CLASSIFIER
* Routes each extracted constant to a migration_destination. Known constants (present in
* the catalog as a config_key->const) route by their config_scope; non-catalog constants
* route to ENV when constant_map flags them secret, else to PASSTHROUGH (preserved
* verbatim). The original extractor record is carried through unchanged so writers can use
* the resolved value (or the verbatim raw text for passthrough).
*/
final class migration_classifier {

	/**
	* @param array<string,array> $records  migration_extractor::extract() output
	* @param config_key[] $catalog
	* @return array<string,array{destination:migration_destination,record:array,scope:?config_scope}>
	*/
	public static function classify(array $records, array $catalog) : array {
		$scope_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$scope_of[$key->const] = $key->scope;
			}
		}

		$out = [];
		foreach ($records as $name => $record) {
			$scope = $scope_of[$name] ?? null;
			$out[$name] = [
				'destination' => self::route($name, $scope),
				'record'      => $record,
				'scope'       => $scope,
			];
		}
		return $out;
	}//end classify

	private static function route(string $name, ?config_scope $scope) : migration_destination {
		// MariaDB is Bun-only: never written to the PHP side. The migration still hands its
		// value to the Bun engine's .env (env_writer::render_bun via env_sync::BUN_DB_MAP),
		// which reads the classification record regardless of this DROP destination.
		if (array_key_exists($name, env_sync::BUN_DB_MAP)) {
			return migration_destination::DROP;
		}
		if ($scope !== null) {
			return match ($scope) {
				config_scope::SECRET      => migration_destination::ENV,
				config_scope::STATE       => migration_destination::STATE,
				config_scope::STATIC      => migration_destination::CONFIG,
				config_scope::PASSTHROUGH => migration_destination::PASSTHROUGH,
				config_scope::DERIVED, config_scope::DERIVED_REQUEST,
				config_scope::REQUEST, config_scope::USER => migration_destination::DROP,
			};
		}
		// unknown (not in catalog): secrets to .env, everything else preserved verbatim
		return constant_map::is_secret_unknown($name)
			? migration_destination::ENV
			: migration_destination::PASSTHROUGH;
	}//end route
}
