<?php declare(strict_types=1);

require_once dirname(__DIR__) . '/core/base/config/class.config_scope.php';

/**
* MIGRATION_VALIDATOR
* Faithful-migration check: every OLD constant must reappear in the MIGRATED surface with
* an identical value, EXCEPT REQUEST/USER scope (accessor-only — legitimately absent) and
* DERIVED_REQUEST (host/web-root/protocol — CLI-dependent; differences reported, not fatal,
* pending the boot_paths web-root reconciliation at cutover). Pure; the surfaces come from
* booting the old config and the migrated pipeline in subprocesses.
*/
final class migration_validator {

	/**
	* @param array<string,mixed> $old constants from the legacy config.php boot
	* @param array<string,mixed> $migrated constants from the migrated pipeline boot
	* @param config_key[] $catalog
	* @return array{faithful:bool,missing:string[],value_mismatches:string[],excluded_absent_ok:string[],derived_request_diffs:string[]}
	*/
	public static function validate(array $old, array $migrated, array $catalog) : array {
		$scope_of = [];
		foreach ($catalog as $key) {
			if ($key->const !== null) {
				$scope_of[$key->const] = $key->scope;
			}
		}

		// DEDALO_ROOT_WEB is request-derived (boot_paths resolves it from REQUEST_URI; in CLI both
		// sides fall back to install-specific defaults). Any constant whose ONLY difference is that
		// web-mount prefix is faithful in a real request — non-fatal here, verified at the live check.
		$old_web = (string) ($old['DEDALO_ROOT_WEB'] ?? '');
		$mig_web = (string) ($migrated['DEDALO_ROOT_WEB'] ?? '');
		$web_differs = ($old_web !== '' && $mig_web !== '' && $old_web !== $mig_web);

		$missing = $mismatch = $excluded = $derived_req = [];
		foreach ($old as $name => $old_value) {
			$scope = $scope_of[$name] ?? null;
			if ($scope === config_scope::REQUEST || $scope === config_scope::USER) {
				if (!array_key_exists($name, $migrated)) {
					$excluded[] = $name; // legitimately absent
				}
				continue; // either way, never a faithfulness failure
			}
			if (!array_key_exists($name, $migrated)) {
				$missing[] = $name;
				continue;
			}
			if ($migrated[$name] !== $old_value) {
				$web_mount_only = $web_differs
					&& is_string($old_value) && is_string($migrated[$name])
					&& str_replace($mig_web, $old_web, $migrated[$name]) === $old_value;
				if ($scope === config_scope::DERIVED_REQUEST || $web_mount_only) {
					$derived_req[] = $name; // request-derived (web mount) — non-fatal, verified live
				} else {
					$mismatch[] = $name;
				}
			}
		}

		sort($missing); sort($mismatch); sort($excluded); sort($derived_req);
		return [
			'faithful'              => ($missing === [] && $mismatch === []),
			'missing'               => $missing,
			'value_mismatches'      => $mismatch,
			'excluded_absent_ok'    => $excluded,
			'derived_request_diffs' => $derived_req,
		];
	}//end validate
}
