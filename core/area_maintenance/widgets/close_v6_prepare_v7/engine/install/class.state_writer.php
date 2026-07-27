<?php declare(strict_types=1);

require_once __DIR__ . '/class.migration_destination.php';

/**
* STATE_WRITER
* Renders state.php (machine-written install state) from the 4a classification: every
* STATE-destination constant with a literal value (install fingerprints INFO_KEY /
* INFORMATION, install status, maintenance), keyed by the catalog dot-path. Returns the
* PHP file content `<?php return ['dot.path' => value, ...];`. Non-STATE destinations and
* runtime values are omitted.
*/
final class state_writer {

	/**
	* @param array<string,array> $classification migration_classifier::classify() output
	* @param config_key[] $catalog
	*/
	public static function render(array $classification, array $catalog) : string {
		$path_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$path_of[$key->const] = $key->path;
			}
		}

		$state = [];
		foreach ($classification as $name => $info) {
			if ($info['destination'] !== migration_destination::STATE) {
				continue;
			}
			if (($info['record']['kind'] ?? null) !== 'literal' || !isset($path_of[$name])) {
				continue;
			}
			$state[$path_of[$name]] = $info['record']['value'];
		}

		ksort($state);
		return "<?php declare(strict_types=1);\n\n// Machine-written install state — generated/updated by the migration. Do not hand-edit.\nreturn " . var_export($state, true) . ";\n";
	}//end render
}
