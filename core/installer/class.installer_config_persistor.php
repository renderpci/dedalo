<?php declare(strict_types=1);

require_once dirname(__DIR__) . '/base/boot/class.env_value.php';
require_once dirname(__DIR__) . '/base/boot/class.env_sync.php';

/**
* INSTALL_CONFIG_PERSISTOR
* The runtime config writer used by the install wizard. Renders, from the values the
* administrator submits in the UI, the three machine-managed config artifacts as content
* strings (no disk writes — the caller commits them atomically):
*  - render_env()   → ../private/.env (PHP side): every collected value keyed by its
*                     DEDALO_ / MYSQL_ constant name, merged over the existing .env so
*                     prior keys (e.g. a salt written earlier in the wizard) survive.
*  - render_bun()   → diffusion/api/v1/.env (Bun side): only the shared keys, mapped
*                     PHP→Bun via env_sync::MAP (the one name map).
*  - render_state() → ../private/state.php: STATE values by catalog dot-path
*                     (info_key, information, install_status), merged over existing state.
* Quoting is delegated to env_value::quote so values round-trip through env_loader::parse
* exactly as the migration writer's do.
*/
final class installer_config_persistor {

	/**
	* RENDER_ENV
	* @param array<string,string> $existing parsed current .env (KEY=>string), or []
	* @param array<string,mixed>  $values   collected values (KEY=>typed value), new wins
	* @return string full .env content
	*/
	public static function render_env(array $existing, array $values) : string {
		$merged = $existing;
		foreach ($values as $key => $value) {
			$merged[$key] = self::stringify($value);
		}
		ksort($merged);
		$lines = ['# Dédalo v7 config + secrets — written by the installer. chmod 600. Never commit.'];
		foreach ($merged as $key => $raw) {
			$lines[] = $key . '=' . env_value::quote((string) $raw);
		}
		return implode("\n", $lines) . "\n";
	}//end render_env

	/**
	* RENDER_BUN
	* @param array<string,mixed> $values collected values keyed by PHP/.env constant name
	* @return string Bun diffusion .env content (keys mapped via env_sync::MAP)
	*/
	public static function render_bun(array $values, array $extra = []) : string {
		$lines = ['# Dédalo diffusion (Bun) .env — written by the installer; keys mapped via env_sync (MAP + BUN_DB_MAP).'];
		// MAP = shared keys; BUN_DB_MAP = MariaDB (Bun-only) — both are written to the Bun .env.
		foreach (array_merge(env_sync::MAP, env_sync::BUN_DB_MAP) as $php_key => $bun_key) {
			if (!array_key_exists($php_key, $values)) {
				continue;
			}
			$lines[] = $bun_key . '=' . env_value::quote((string) self::stringify($values[$php_key]));
		}
		// Bun-only transport controls with no PHP-side equivalent (e.g. DB_FORCE_TCP); passed
		// through verbatim by the installer. NOT part of env_sync::MAP / the drift contract.
		foreach ($extra as $bun_key => $val) {
			$lines[] = $bun_key . '=' . env_value::quote((string) self::stringify($val));
		}
		return implode("\n", $lines) . "\n";
	}//end render_bun

	/**
	* RENDER_STATE
	* @param array<string,mixed> $existing current state.php array (dot.path=>value), or []
	* @param array<string,mixed> $state    STATE values to set (dot.path=>value), new wins
	* @return string state.php PHP file content
	*/
	public static function render_state(array $existing, array $state) : string {
		$merged = array_replace($existing, $state);
		ksort($merged);
		return "<?php declare(strict_types=1);\n\n"
			. "// Machine-written install state — generated/updated by the installer. Do not hand-edit.\n"
			. "return " . var_export($merged, true) . ";\n";
	}//end render_state

	/** A typed value → its .env string form. Delegates to the shared serializer so the
	* installer and the migration writer encode identically (env_value::stringify). */
	private static function stringify(mixed $value) : string {
		return env_value::stringify($value);
	}//end stringify
}
