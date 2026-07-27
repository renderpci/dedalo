<?php declare(strict_types=1);

/**
* ENV_LOADER
* Zero-dependency .env reader for the Dédalo v7 boot. Never uses Composer.
* Hard rules (config+bootstrap design spec §5.8):
*  - real process env ALWAYS wins over the .env file (see get());
*  - NEVER writes $_ENV / $_SERVER / putenv() — values live in a private
*    static array only, so phpinfo() and proc_open children cannot leak them;
*  - refuses a group/world-WRITABLE .env file;
*  - no ${VAR} interpolation.
*/
final class env_loader {

	/** @var array<string,string> parsed values from the .env file(s) */
	private static array $values = [];
	private static bool $loaded = false;

	/**
	* PARSE
	* Pure: turns .env text into a KEY=>string map. No I/O, no side effects.
	* @param string $content
	* @return array<string,string>
	*/
	public static function parse(string $content) : array {

		$out   = [];
		$lines = preg_split('/\r\n|\r|\n/', $content);
		foreach ($lines as $raw) {
			$line = ltrim($raw);
			if ($line === '' || $line[0] === '#') {
				continue;
			}
			// optional leading `export `
			$line = preg_replace('/^export\s+/', '', $line);
			$eq = strpos($line, '=');
			if ($eq === false) {
				continue;
			}
			$key = rtrim(substr($line, 0, $eq));
			if (preg_match('/^[A-Z_][A-Z0-9_]*$/', $key) !== 1) {
				continue; // reject non-conforming keys
			}
			$out[$key] = self::parse_value(substr($line, $eq + 1));
		}

		return $out;
	}//end parse

	/**
	* PARSE_VALUE
	* Quoting/comment rules for a single value (no interpolation).
	* @param string $val
	* @return string
	*/
	private static function parse_value(string $val) : string {

		$val = trim($val);
		if ($val === '') {
			return '';
		}

		$q = $val[0];
		if ($q === '"' || $q === "'") {
			// Single-line values only. The structural closing quote is the FIRST
			// unescaped occurrence of the opening quote char (forward scan); any
			// remainder after it (trailing whitespace or a `# comment`) is ignored.
			// In double-quoted values a `\"` is an escaped quote, not the closer.
			$len    = strlen($val);
			$inner  = '';
			$closed = false;
			$i      = 1;
			while ($i < $len) {
				$c = $val[$i];
				if ($q === '"' && $c === '\\' && $i + 1 < $len) {
					$inner .= $c . $val[$i + 1]; // keep escape pair for strtr below
					$i += 2;
					continue;
				}
				if ($c === $q) {
					$closed = true;
					break;
				}
				$inner .= $c;
				$i++;
			}
			if ($closed) {
				if ($q === "'") {
					return $inner; // literal, no escapes
				}
				// double quote: limited escapes only
				return strtr($inner, [
					'\\\\' => "\\",
					'\\n'  => "\n",
					'\\t'  => "\t",
					'\\r'  => "\r",
					'\\"'  => '"',
				]);
			}
			// unterminated quote → malformed line. Surface it (silent corruption of a secret is
			// the worst failure mode) and drop the dangling opening quote so the remainder is
			// handled as an unquoted value instead of baking the leading quote into the constant.
			@error_log('env_loader: unterminated quote in a .env value; treating it as unquoted');
			$val = ltrim($val, $q);
		}

		// unquoted: a whitespace-prefixed # starts an inline comment
		if (preg_match('/\s#/', $val) === 1) {
			$val = rtrim(preg_split('/\s+#/', $val, 2)[0]);
		}

		return $val;
	}//end parse_value

	/**
	* LOAD
	* Loads a .env file into the private store, merged UNDER real process env.
	* Refuses a group/world-writable file. Idempotent across keys.
	* @param string $path absolute path to the .env file
	* @param bool $require when true, a missing/unreadable/over-permissive file throws
	* @return void
	*/
	public static function load(string $path, bool $require = false) : void {

		if (is_file($path) === false || is_readable($path) === false) {
			if ($require === true) {
				throw new \RuntimeException('env_loader: required env file not readable: ' . $path);
			}
			return;
		}

		// refuse group/other WRITABLE files (0o022). 640/600 are fine.
		if ((fileperms($path) & 0o022) !== 0) {
			@error_log('env_loader: refusing writable-by-group/other env file: ' . $path);
			if ($require === true) {
				throw new \RuntimeException('env_loader: env file permissions too open: ' . $path);
			}
			return;
		}

		$content = file_get_contents($path);
		if ($content === false) {
			if ($require === true) {
				throw new \RuntimeException('env_loader: failed reading env file: ' . $path);
			}
			return;
		}

		foreach (self::parse($content) as $k => $v) {
			// real process env wins: never store over a real env value
			if (getenv($k) !== false) {
				continue;
			}
			self::$values[$k] = $v;
		}
		self::$loaded = true;
	}//end load

	/**
	* GET
	* Real process env wins, then the loaded .env store, then $default.
	* @param string $key
	* @param string|null $default
	* @return string|null
	*/
	public static function get(string $key, ?string $default = null) : ?string {
		$env = getenv($key);
		if ($env !== false) {
			return $env;
		}
		return self::$values[$key] ?? $default;
	}//end get

	public static function has(string $key) : bool {
		return getenv($key) !== false || array_key_exists($key, self::$values);
	}//end has

	public static function get_int(string $key, ?int $default = null) : ?int {
		$v = self::get($key);
		return $v === null ? $default : (int)$v;
	}//end get_int

	public static function get_bool(string $key, ?bool $default = null) : ?bool {
		$v = self::get($key);
		if ($v === null) {
			return $default;
		}
		return in_array(strtolower(trim($v)), ['1', 'true', 'yes', 'on'], true);
	}//end get_bool

	public static function get_json(string $key, mixed $default = null) : mixed {
		$v = self::get($key);
		if ($v === null) {
			return $default;
		}
		try {
			return json_decode($v, true, 64, JSON_THROW_ON_ERROR);
		} catch (\JsonException $e) {
			@error_log('env_loader: invalid JSON for ' . $key);
			return $default;
		}
	}//end get_json

	/**
	* RESET
	* Test-only seam: clears the private store.
	* @return void
	*/
	public static function reset() : void {
		self::$values = [];
		self::$loaded = false;
	}//end reset
}
