<?php declare(strict_types=1);

/**
* ENV_VALUE
* The single source of truth for quoting a value into a `.env` line so that
* env_loader::parse reads it back identically. Shared by the migration writer
* (install/class.env_writer.php) and the runtime install writer
* (core/installer/class.installer_config_persistor.php) so the quoting rules never drift.
*/
final class env_value {

	/**
	* QUOTE
	* Quote an env value so env_loader::parse round-trips it:
	*  - plain tokens → unquoted;
	*  - otherwise SINGLE-quoted (literal, no escaping) when the value carries no
	*    single-quote or newline — keeps JSON readable, e.g.
	*    API_X='[{"code":"","api_ui":null}]' rather than escaped double-quotes;
	*  - values containing a single-quote (or newline) → double-quoted with `\` and
	*    `"` escaped (a literal `'` cannot live inside a single-quoted value here).
	* @param string $value
	* @return string
	*/
	public static function quote(string $value) : string {
		if ($value !== '' && preg_match('/^[A-Za-z0-9_\/.:@+-]+$/', $value) === 1) {
			return $value;
		}
		if (strpbrk($value, "'\n\r") === false) {
			return "'" . $value . "'";
		}
		// double-quoted: escape what env_loader::parse decodes back, so newline/CR/tab survive the
		// line-based reader (a literal newline would otherwise split the value across two .env lines).
		return '"' . strtr($value, [
			'\\' => '\\\\',
			'"'  => '\\"',
			"\n" => '\\n',
			"\r" => '\\r',
			"\t" => '\\t',
		]) . '"';
	}//end quote

	/**
	* STRINGIFY
	* A typed PHP value → its raw .env string form (caller wraps with quote()):
	*  - null  → the literal `null` marker (a real null can't live in .env — e.g. a socket
	*            DB port with no TCP port — and config_caster reads the marker back as null);
	*  - bool  → `true`/`false` (human-readable; round-trips via config_caster/env_loader);
	*  - array → JSON (list/map decoded back by the catalog type at boot);
	*  - scalar → verbatim.
	* The single serializer shared by the migration writer (env_writer) and the runtime
	* install writer (installer_config_persistor) so the encoding never drifts.
	* @param mixed $value
	* @return string
	*/
	public static function stringify(mixed $value) : string {
		if ($value === null) {
			return 'null';
		}
		if (is_bool($value)) {
			return $value ? 'true' : 'false';
		}
		if (is_array($value)) {
			return (string) json_encode($value);
		}
		return (string) $value;
	}//end stringify
}
