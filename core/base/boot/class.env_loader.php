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
			$last = strrpos($val, $q);
			if ($last !== false && $last > 0) {
				$inner = substr($val, 1, $last - 1);
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
		}

		// unquoted: a whitespace-prefixed # starts an inline comment
		if (preg_match('/\s#/', $val) === 1) {
			$val = rtrim(preg_split('/\s+#/', $val, 2)[0]);
		}

		return $val;
	}//end parse_value

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
