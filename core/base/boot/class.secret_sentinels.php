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
			'DEDALO_SALT_STRING'			=> static fn(string $v) : bool => $v === 'dedalo_six' || strlen($v) < 16,
			'API_WEB_USER_CODE'				=> static fn(string $v) : bool => preg_match('/^X{10,}$/', $v) === 1,
			'MYSQL_DEDALO_PASSWORD_CONN'	=> static fn(string $v) : bool => preg_match('/^X+\.\.$/', $v) === 1,
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
	* EVALUATE_CONTEXT
	* Cross-key checks that need more than one value.
	* @param array<string,string> $values
	* @param bool $is_production
	* @return string[]
	*/
	public static function evaluate_context(array $values, bool $is_production) : array {

		$violations = [];

		if (isset($values['DEDALO_INFO_KEY'], $values['DEDALO_ENTITY'])
			&& $values['DEDALO_INFO_KEY'] === $values['DEDALO_ENTITY']) {
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
			return true;  // force even in dev
		}
		if ($explicit === false) {
			return false; // explicit escape hatch, even in prod (supervised migration)
		}
		return $is_production === true && $is_installing === false;
	}//end should_enforce
}
