<?php declare(strict_types=1);

/**
* CONSTANT_MAP
* The migrator's manifest for constants NOT covered by the catalog (the catalog's
* config_scope already classifies every known key). It answers one question: is a given
* UNKNOWN constant actually a secret that must go to .env rather than be preserved as a
* (potentially tracked) passthrough define? Safe-by-default: explicit names (spec
* Appendix A + the dev-box live boot-diff findings) PLUS conservative credential
* substrings. Over-routing to .env is acceptable; leaking a secret into a tracked file is not.
*/
final class constant_map {

	/** Explicit non-catalog secret constant names. */
	private const SECRET_NAMES = [
		'GEONAMES_ACCOUNT_USERNAME',
		'DEDALO_RECOVERY_KEY',
		'MAILER_CONFIG',
		'SAML_CONFIG',
		'SOCRATA_CONFIG',
	];

	/** Conservative credential substrings (uppercased name match). */
	private const SECRET_SUBSTRINGS = ['PASSWORD', 'PASSWD', 'SALT', 'SECRET', 'TOKEN', 'PRIVATE_KEY', 'RECOVERY_KEY', 'API_KEY'];

	public static function is_secret_unknown(string $name) : bool {
		if (in_array($name, self::SECRET_NAMES, true)) {
			return true;
		}
		$upper = strtoupper($name);
		foreach (self::SECRET_SUBSTRINGS as $needle) {
			if (str_contains($upper, $needle)) {
				return true;
			}
		}
		return false;
	}//end is_secret_unknown
}
