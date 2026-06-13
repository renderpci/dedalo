<?php declare(strict_types=1);
/**
* CLASS DD_CONFIG
* --------------------------------------------------------------------------
* Layered configuration registry and legacy-constant emitter.
*
* Source of truth for Dédalo's *declarative* configuration. It loads flat
* `key=value` text layers, coerces each value to the type declared in the
* schema, deep-merges the layers (last wins, deltas only), validates them
* fail-closed, and then EMITS the legacy `define()` constants so the ~300
* existing call sites keep working unchanged.
*
* Two value classes (see the architecture plan):
*   - Declarative  -> live here, in `key=value` layers + schema (this class).
*   - Computed     -> stay in PHP (paths.php / derived bootstrap code), since
*                     they depend on __FILE__, the host, or other constants.
*
* Layer precedence (lowest -> highest, last wins):
*     defaults.env  <  profiles/{profile}.env  <  /private/.env  <  real env vars
*
* The registry is process-static and immutable once booted, which is correct
* for persistent workers (one boot per process). Request-scoped values
* (application lang, debug flags) are NOT handled here — see the kernel.
* --------------------------------------------------------------------------
*/
final class dd_config {

	/** @var array<string,mixed> merged + coerced declarative values, keyed by env key */
	private static array $values = [];

	/** @var array<string,array> schema manifest: key => [type, const, default, flags[]] */
	private static array $schema = [];

	/** @var bool */
	private static bool $booted = false;

	/** @var array<string,string> diagnostics collected during boot (key => message) */
	private static array $warnings = [];


	/**
	* boot
	* Loads the schema + layers, coerces, merges, validates. Idempotent: a
	* second call is a no-op (constants cannot be redefined anyway).
	* @param array $opts {
	*   schema_file?: string,            // path to schema.php
	*   layers?: string[],               // ordered list of .env files (low->high precedence)
	*   use_env?: bool,                  // overlay real getenv()/$_ENV on top (default true)
	*   is_unit_test?: bool              // relax fail-closed (skip hard exit), collect warnings
	* }
	* @return void
	*/
	public static function boot(array $opts=[]) : void {

		if (self::$booted===true) {
			return;
		}

		$schema_file = $opts['schema_file'] ?? (__DIR__ . '/schema.php');
		self::$schema = self::load_schema($schema_file);

		// merge layers in order (deltas only, last wins)
		$merged = [];
		foreach (($opts['layers'] ?? []) as $layer_file) {
			$layer = self::parse_env_file($layer_file);
			foreach ($layer as $k => $v) {
				$merged[$k] = $v; // raw string; coercion happens after merge
			}
		}

		// real environment variables win over files (containers / php-fpm pools)
		$use_env = $opts['use_env'] ?? true;
		if ($use_env===true) {
			foreach (self::$schema as $key => $spec) {
				$env_val = getenv($key);
				if ($env_val!==false) {
					$merged[$key] = $env_val;
				}
			}
		}

		// coerce every schema key (use layer value when present, else schema default)
		$is_unit_test = $opts['is_unit_test'] ?? (defined('IS_UNIT_TEST') && IS_UNIT_TEST===true);
		$errors = [];
		foreach (self::$schema as $key => $spec) {
			$type  = $spec['type']    ?? 'string';
			$flags = $spec['flags']   ?? [];
			$has_raw = array_key_exists($key, $merged);
			$raw   = $has_raw ? $merged[$key] : ($spec['default'] ?? null);

			// required keys must be supplied by a layer/env (not just defaulted to null)
			if (in_array('required', $flags, true) && !$has_raw && ($spec['default'] ?? null)===null) {
				$errors[] = "missing required config '{$key}'";
				continue;
			}

			// not supplied by any layer/env AND no schema default: leave the
			// constant undefined so a legacy definer (config_db.php) can provide
			// it, or it simply stays unset. Avoids emitting a spurious null.
			// (A value explicitly written as `null` in a layer has $has_raw=true
			// and is preserved — e.g. DEDALO_AV_STREAMER=null.)
			if (!$has_raw && ($spec['default'] ?? null)===null) {
				continue;
			}

			try {
				$value = self::coerce($raw, $type, $key);
			} catch (\Throwable $e) {
				$errors[] = "invalid value for '{$key}': " . $e->getMessage();
				continue;
			}

			// enum validation
			$enum = self::flag_value($flags, 'enum');
			if ($enum!==null) {
				$allowed = array_map([self::class, 'enum_token'], explode('|', $enum));
				if (!in_array($value, $allowed, true)) {
					$errors[] = "value for '{$key}' not in enum [{$enum}]";
					continue;
				}
			}

			// sentinel: refuse to boot with a known sample-default secret
			$sentinel = self::flag_value($flags, 'sentinel');
			if ($sentinel!==null && is_string($value) && $value===$sentinel) {
				$errors[] = "config '{$key}' still holds its sample-default value";
			}

			self::$values[$key] = $value;
		}

		if (!empty($errors)) {
			self::fail($errors, $is_unit_test);
		}

		self::$booted = true;
	}


	/**
	* emit_constants
	* Defines every schema-mapped legacy constant from the merged values.
	* Honors the existing override idiom (`if(!defined())`) so a pre-defined
	* constant always wins. Two-phase aware via the 'phase' spec field.
	* @param string|null $phase  only emit entries whose spec['phase'] matches
	*                            (null = entries with no phase / phase 'main')
	* @return array<string,mixed> the constants actually defined this call
	*/
	public static function emit_constants(?string $phase=null) : array {

		$defined = [];
		foreach (self::$schema as $key => $spec) {

			$const = $spec['const'] ?? $key;
			$entry_phase = $spec['phase'] ?? 'main';
			$want_phase  = $phase ?? 'main';
			if ($entry_phase!==$want_phase) {
				continue;
			}
			if (!array_key_exists($key, self::$values)) {
				continue; // required-and-missing keys already failed in boot()
			}
			if (defined($const)) {
				continue; // explicit override wins
			}

			define($const, self::$values[$key]);
			$defined[$const] = self::$values[$key];
		}

		return $defined;
	}


	// ---- typed getters (for new code; constant adoption is optional) --------

	public static function get(string $key, $default=null) {
		return self::$values[$key] ?? $default;
	}
	public static function str(string $key, ?string $default=null) : ?string {
		$v = self::$values[$key] ?? $default;
		return $v===null ? null : (string)$v;
	}
	public static function int(string $key, ?int $default=null) : ?int {
		$v = self::$values[$key] ?? $default;
		return $v===null ? null : (int)$v;
	}
	public static function bool(string $key, bool $default=false) : bool {
		return (bool)(self::$values[$key] ?? $default);
	}
	public static function has(string $key) : bool {
		return array_key_exists($key, self::$values);
	}

	/**
	* request
	* Resolves a REQUEST-SCOPED value live from the current request, instead of
	* a frozen constant. Required under persistent workers (DEDALO_RR_WORKER),
	* where boot runs once per process and freezing DEDALO_APPLICATION_LANG etc.
	* as constants would bleed request #1's value into every later request.
	*
	* New code (and migrated call sites) should prefer this over the constants:
	*   dd_config::request('application_lang')  // not DEDALO_APPLICATION_LANG
	*
	* @param string $key  application_lang | data_lang | show_debug | show_developer
	* @return mixed
	*/
	public static function request(string $key) {
		switch ($key) {
			case 'application_lang':
				return function_exists('fix_cascade_config_var')
					? fix_cascade_config_var('dedalo_application_lang', defined('DEDALO_APPLICATION_LANGS_DEFAULT') ? DEDALO_APPLICATION_LANGS_DEFAULT : 'lg-eng')
					: (defined('DEDALO_APPLICATION_LANG') ? DEDALO_APPLICATION_LANG : 'lg-eng');
			case 'data_lang':
				return function_exists('fix_cascade_config_var')
					? fix_cascade_config_var('dedalo_data_lang', defined('DEDALO_DATA_LANG_DEFAULT') ? DEDALO_DATA_LANG_DEFAULT : 'lg-eng')
					: (defined('DEDALO_DATA_LANG') ? DEDALO_DATA_LANG : 'lg-eng');
			case 'show_debug':
				return function_exists('logged_user_id') && defined('DEDALO_SUPERUSER')
					? (logged_user_id()==DEDALO_SUPERUSER)
					: (defined('SHOW_DEBUG') ? SHOW_DEBUG : false);
			case 'show_developer':
				return function_exists('logged_user_is_developer')
					? (logged_user_is_developer()===true)
					: (defined('SHOW_DEVELOPER') ? SHOW_DEVELOPER : false);
			default:
				return null;
		}
	}
	public static function all() : array {
		return self::$values;
	}
	public static function schema() : array {
		return self::$schema;
	}
	public static function warnings() : array {
		return self::$warnings;
	}


	// ---- internals ----------------------------------------------------------

	/**
	* load_schema
	* @return array<string,array> normalized schema (each entry has type/const/default/flags/phase)
	*/
	private static function load_schema(string $file) : array {
		if (!is_file($file)) {
			self::fail(["schema file not found: {$file}"], false);
		}
		$raw = include $file;
		if (!is_array($raw)) {
			self::fail(["schema file did not return an array: {$file}"], false);
		}
		$norm = [];
		foreach ($raw as $key => $spec) {
			// compact form: 'KEY' => ['type','CONST', default, ['flag',...]]
			if (array_is_list($spec)) {
				$norm[$key] = [
					'type'    => $spec[0] ?? 'string',
					'const'   => $spec[1] ?? $key,
					'default' => $spec[2] ?? null,
					'flags'   => $spec[3] ?? [],
					'phase'   => $spec[4] ?? 'main'
				];
			} else {
				$norm[$key] = $spec + ['type'=>'string','const'=>$key,'default'=>null,'flags'=>[],'phase'=>'main'];
			}
		}
		return $norm;
	}

	/**
	* parse_env_file
	* Minimal `key=value` parser: ignores blank lines and `#` comments,
	* strips one optional layer of surrounding quotes, keeps the raw string
	* (typing happens later via the schema, not by heuristic).
	* @return array<string,string>
	*/
	public static function parse_env_file(string $file) : array {
		$out = [];
		if (!is_file($file)) {
			return $out;
		}
		$lines = file($file, FILE_IGNORE_NEW_LINES);
		if ($lines===false) {
			return $out;
		}
		foreach ($lines as $line) {
			$trim = ltrim($line);
			if ($trim==='' || $trim[0]==='#') {
				continue;
			}
			$pos = strpos($line, '=');
			if ($pos===false) {
				continue;
			}
			$key = trim(substr($line, 0, $pos));
			$val = trim(substr($line, $pos + 1));
			// strip one matching pair of surrounding quotes
			$len = strlen($val);
			if ($len>=2 && (($val[0]==='"' && $val[$len-1]==='"') || ($val[0]==="'" && $val[$len-1]==="'"))) {
				$val = substr($val, 1, -1);
			}
			$out[$key] = $val;
		}
		return $out;
	}

	/**
	* coerce
	* Turns a raw string (or already-typed default) into the schema type.
	*/
	private static function coerce($raw, string $type, string $key) {

		// schema defaults may already be native (null, bool, array, int)
		if (!is_string($raw)) {
			return $raw;
		}

		switch ($type) {
			case 'int':
				if (!preg_match('/^-?\d+$/', $raw)) {
					throw new \InvalidArgumentException("not an int: '{$raw}'");
				}
				return (int)$raw;
			case 'float':
				if (!is_numeric($raw)) {
					throw new \InvalidArgumentException("not a float: '{$raw}'");
				}
				return (float)$raw;
			case 'bool':
				$low = strtolower($raw);
				if (in_array($low, ['true','1','yes','on'], true))  return true;
				if (in_array($low, ['false','0','no','off',''], true)) return false;
				throw new \InvalidArgumentException("not a bool: '{$raw}'");
			case 'json':
				$decoded = json_decode($raw, true);
				if ($decoded===null && strtolower(trim($raw))!=='null') {
					throw new \InvalidArgumentException("invalid JSON for '{$key}'");
				}
				return $decoded;
			case 'string':
			case 'enum':
			default:
				// allow the bare tokens false/true/null inside enum/string unions
				return self::enum_token($raw);
		}
	}

	/**
	* enum_token
	* Maps the bare literals false/true/null to their PHP types; everything
	* else stays a string. Lets enum members like `false` coexist with strings.
	*/
	private static function enum_token(string $raw) {
		switch ($raw) {
			case 'false': return false;
			case 'true':  return true;
			case 'null':  return null;
			default:      return $raw;
		}
	}

	/**
	* flag_value
	* Returns the argument of a `name:arg` flag, or null if absent.
	*/
	private static function flag_value(array $flags, string $name) : ?string {
		foreach ($flags as $flag) {
			if (strncmp($flag, $name.':', strlen($name)+1)===0) {
				return substr($flag, strlen($name)+1);
			}
		}
		return null;
	}

	/**
	* fail
	* Fail-closed: never leave a half-defined constant surface. Under unit
	* tests we collect warnings instead of aborting so fixtures can boot.
	*/
	private static function fail(array $errors, bool $is_unit_test) : void {
		foreach ($errors as $e) {
			self::$warnings[] = $e;
			error_log('[dd_config] ' . $e);
		}
		if ($is_unit_test===true) {
			return;
		}
		if (PHP_SAPI==='cli') {
			fwrite(STDERR, "[dd_config] configuration error:\n  - " . implode("\n  - ", $errors) . "\n");
			exit(78); // EX_CONFIG
		}
		http_response_code(503);
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode([
			'result' => false,
			'msg'    => 'Service unavailable: configuration error',
			'errors' => $errors
		], JSON_UNESCAPED_UNICODE);
		exit;
	}
}
