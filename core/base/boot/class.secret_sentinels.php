<?php declare(strict_types=1);

/**
* SECRET_SENTINELS
* SEC-094 (v7): pure, dependency-free evaluation of configuration secrets.
* No constants, no I/O — the caller passes the current values in and acts on
* the result. This is the testable core extracted from
* dedalo_assert_secrets_initialised().
*/
final class secret_sentinels {

	/**
	* EVALUATE
	* Flags values that still equal a sample default (or a too-weak salt).
	* The caller passes only the values that are actually set.
	* @param array<string,string> $values
	* @return string[] names of offending values
	*/
	public static function evaluate(array $values) : array {

		$rules = [
			'DEDALO_INFORMATION'			=> static fn(string $v) : bool => $v === 'Dédalo install version',
			'DEDALO_USERNAME_CONN'			=> static fn(string $v) : bool => $v === 'myusername',
			'DEDALO_PASSWORD_CONN'			=> static fn(string $v) : bool => $v === 'mypassword',
			'DEDALO_SALT_STRING'			=> static fn(string $v) : bool => $v === 'dedalo_six',
			'API_WEB_USER_CODE'				=> static fn(string $v) : bool => preg_match('/^X{10,}$/', $v) === 1,
		];

		$violations = [];
		foreach ($rules as $name => $is_bad) {
			if (array_key_exists($name, $values) && $is_bad((string)$values[$name]) === true) {
				$violations[] = $name;
			}
		}

		return $violations;
	}//end evaluate

	/**
	* EVALUATE_WARNINGS
	* Warn-only checks: conditions an operator should know about but that must
	* NEVER block boot, because remediation would break data. Currently: a salt
	* shorter than 16 chars that is not the v6 sample default — rotating the
	* salt would break ALL stored ciphertext, so it can never be a hard failure.
	* @param array<string,string> $values
	* @return string[] names of values that warrant a warning (not enforcement)
	*/
	public static function evaluate_warnings(array $values) : array {

		$warnings = [];

		if (array_key_exists('DEDALO_SALT_STRING', $values)) {
			$salt = (string)$values['DEDALO_SALT_STRING'];
			if ($salt !== '' && $salt !== 'dedalo_six' && strlen($salt) < 16) {
				$warnings[] = 'DEDALO_SALT_STRING';
			}
		}

		return $warnings;
	}//end evaluate_warnings

	/**
	* EVALUATE_CONTEXT
	* Cross-key checks that need more than one value.
	* @param array<string,string> $values
	* @param bool $is_production
	* @return string[]
	*/
	public static function evaluate_context(array $values, bool $is_production) : array {

		$violations = [];

		if (array_key_exists('DEDALO_INFO_KEY', $values)
			&& array_key_exists('DEDALO_ENTITY', $values)
			&& (string)$values['DEDALO_INFO_KEY'] === (string)$values['DEDALO_ENTITY']) {
			$violations[] = 'DEDALO_INFO_KEY';
		}

		if ($is_production === true
			&& array_key_exists('DEDALO_DIFFUSION_INTERNAL_TOKEN', $values)
			&& trim((string)$values['DEDALO_DIFFUSION_INTERNAL_TOKEN']) === '') {
			$violations[] = 'DEDALO_DIFFUSION_INTERNAL_TOKEN';
		}

		return $violations;
	}//end evaluate_context

	/**
	* SHOULD_ENFORCE
	* The fail-closed decision. Production fails closed by default; dev warns;
	* the install carve-out suppresses; an explicit opt-in/out overrides both.
	* @param string[] $violations
	* @param bool $is_production
	* @param bool $is_installing
	* @param bool|null $explicit  value of DEDALO_ENFORCE_SECRET_SENTINELS if defined, else null
	* @return bool
	*/
	public static function should_enforce(array $violations, bool $is_production, bool $is_installing, ?bool $explicit) : bool {

		if (empty($violations)) {
			return false;
		}
		if ($explicit === true) {
			return true;  // operator opt-in: force 503 even in dev
		}
		// PHASE-1 ROLLOUT: warn by default (v6 semantics). The production
		// default-on 503 is intentionally DEFERRED to Phase 4, after the .env
		// migration can detect and remediate the INFO_KEY/salt conditions
		// first. $is_production / $is_installing are retained in the signature
		// for the Phase-4 reinstatement of the production-default-on branch.
		return false;
	}//end should_enforce

	/**
	* NORMALIZE_BOOL
	* Intent-preserving bool coercion for config flags. A native bool passes
	* through; common stringy falses ('false','0','','no','off') map to false;
	* only the truthy set ('1','true','yes','on', case-insensitive) is true.
	* Prevents the `(bool)'false' === true` foot-gun on string-valued constants.
	* @param mixed $value
	* @return bool
	*/
	public static function normalize_bool(mixed $value) : bool {

		if (is_bool($value)) {
			return $value;
		}
		if (is_int($value) || is_float($value)) {
			return $value != 0;
		}
		if (is_string($value)) {
			return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
		}
		return (bool)$value;
	}//end normalize_bool
}
