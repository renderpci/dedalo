<?php declare(strict_types=1);

/**
* CONFIG_CASTER
* The single .env-string → catalog-type caster, shared by the STATIC override path
* (boot_config_phases) and the SECRET/STATE live-emission path (boot_secret_state_phases),
* so the two can never drift. .env is text-only, so every typed value arrives as a string:
*  - the literal `null` marker (any type) → real PHP null (a real null can't live in .env;
*    e.g. a socket DB port with no TCP port). Trimmed + case-insensitive.
*  - int  → (int) cast
*  - bool → true for the trimmed, case-insensitive set {1,true,yes,on}; everything else false
*  - list/map → JSON-decoded to an array; malformed JSON → [] and an error_log of the failure
*    (silent corruption of a JSON-valued secret is the worst failure mode — surface it)
*  - anything else → the string verbatim
*/
final class config_caster {

	/**
	* @param string $value the raw .env string
	* @param string $type  the catalog key's declared type
	* @return mixed
	*/
	public static function cast(string $value, string $type) : mixed {
		if (strtolower(trim($value)) === 'null') {
			return null; // explicit null marker — .env can't carry a real null
		}
		return match ($type) {
			'int'         => (int) $value,
			'bool'        => in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true),
			'list', 'map' => self::to_array($value, $type),
			default       => $value, // string
		};
	}//end cast

	/** Decode a JSON list/map; on malformed JSON return [] and log the failing key type (never silent). */
	private static function to_array(string $value, string $type) : array {
		$decoded = json_decode($value, true);
		if (!is_array($decoded)) {
			if (trim($value) !== '') {
				@error_log('config_caster: invalid JSON for ' . $type . '-typed config value; using empty array');
			}
			return [];
		}
		return $decoded;
	}//end to_array
}
