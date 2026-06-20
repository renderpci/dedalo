<?php declare(strict_types=1);

/**
* ENV_VALUE
* The single source of truth for quoting a value into a `.env` line so that
* env_loader::parse reads it back identically. Shared by the migration writer
* (install/class.env_writer.php) and the runtime install writer
* (core/install/class.install_config_persistor.php) so the quoting rules never drift.
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
		return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $value) . '"';
	}//end quote
}
