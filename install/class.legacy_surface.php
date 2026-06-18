<?php declare(strict_types=1);

/**
* LEGACY_SURFACE
* Static analyzer that recovers the top-level define() constant surface of a set of
* PHP files WITHOUT executing them. The v6 config files — and even the
* sample.config*.php templates — cannot be include()d in isolation: they pull in the
* logger, the autoloader and core_functions, start a session and call setlocale
* (spec §5.10). Tokenizing with token_get_all is the only safe way to read their
* constant surface, and it is the same technique the Phase-4 migration tool
* (install/migrate_config_v7.php) will use.
*
* First consumer: the boot-diff gate (test/server/unit/boot_diff_gate_Test.php).
*/
final class legacy_surface {

	/**
	* EXTRACT
	* @param string[] $files absolute paths to PHP files to scan
	* @return array<string,array{kind:string,value:mixed,file:string}>
	*         name => ['kind'=>'literal'|'runtime', 'value'=>mixed|null, 'file'=>string].
	*         A name's FIRST definition wins (matches PHP's first-define()-wins runtime).
	*/
	public static function extract(array $files) : array {
		$out = [];
		foreach ($files as $file) {
			$src = file_get_contents($file);
			if ($src === false) {
				throw new \RuntimeException("legacy_surface: cannot read {$file}");
			}
			foreach (self::scan($src, $file) as $name => $info) {
				if (!array_key_exists($name, $out)) {
					$out[$name] = $info; // first definition wins
				}
			}
		}
		return $out;
	}//end extract

	/**
	* SCAN one file's source for top-level define('NAME', VALUE) calls.
	* @return array<string,array{kind:string,value:mixed,file:string}>
	*/
	private static function scan(string $src, string $file) : array {
		$tokens = token_get_all($src);
		$n = count($tokens);
		$found = [];

		for ($i = 0; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t) || $t[0] !== T_STRING || strtolower($t[1]) !== 'define') {
				continue;
			}
			// reject method/static calls and function declarations: $o->define(), C::define(), function define()
			$prev = self::prev_meaningful($tokens, $i);
			if (is_array($prev) && in_array($prev[0], [
				T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NULLSAFE_OBJECT_OPERATOR, T_FUNCTION,
			], true)) {
				continue;
			}
			$open = self::next_meaningful_index($tokens, $i);
			if ($open === null || $tokens[$open] !== '(') {
				continue;
			}
			$name_idx = self::next_meaningful_index($tokens, $open);
			if ($name_idx === null
				|| !is_array($tokens[$name_idx])
				|| $tokens[$name_idx][0] !== T_CONSTANT_ENCAPSED_STRING) {
				continue; // dynamic define name — not part of the static surface
			}
			$name = self::unquote($tokens[$name_idx][1]);
			$comma = self::next_meaningful_index($tokens, $name_idx);
			if ($comma === null || $tokens[$comma] !== ',') {
				continue;
			}
			[$value_tokens, $end] = self::collect_value($tokens, $comma + 1);
			$found[$name] = self::classify($value_tokens) + ['file' => $file];
			$i = $end; // resume after this define()'s closing paren
		}
		return $found;
	}//end scan

	/**
	* COLLECT_VALUE — gather the tokens of the value argument up to define()'s closing ')'.
	* @return array{0:array<int,array|string>,1:int} [value tokens, index of closing paren]
	*/
	private static function collect_value(array $tokens, int $start) : array {
		$depth = 1; // already inside define( ... )
		$collected = [];
		$n = count($tokens);
		for ($i = $start; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t)) {
				if ($t === '(' || $t === '[') {
					$depth++;
				} elseif ($t === ')' || $t === ']') {
					$depth--;
					if ($depth === 0) {
						return [$collected, $i];
					}
				}
			}
			$collected[] = $t;
		}
		return [$collected, $n - 1]; // unbalanced — defensive
	}//end collect_value

	/**
	* CLASSIFY — a single scalar literal (with an optional leading +/- on a number)
	* is a 'literal' with its parsed value; anything else is 'runtime'.
	* @return array{kind:string,value:mixed}
	*/
	private static function classify(array $value_tokens) : array {
		$meaningful = array_values(array_filter($value_tokens, static function ($t) : bool {
			if (is_array($t)) {
				return !in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true);
			}
			return true;
		}));

		// optional single leading +/- before a numeric literal
		if (count($meaningful) === 2
			&& !is_array($meaningful[0])
			&& ($meaningful[0] === '-' || $meaningful[0] === '+')
			&& is_array($meaningful[1])
			&& in_array($meaningful[1][0], [T_LNUMBER, T_DNUMBER], true)) {
			$num = $meaningful[1][0] === T_LNUMBER ? (int) $meaningful[1][1] : (float) $meaningful[1][1];
			return ['kind' => 'literal', 'value' => $meaningful[0] === '-' ? -$num : $num];
		}

		if (count($meaningful) === 1 && is_array($meaningful[0])) {
			$tok = $meaningful[0];
			switch ($tok[0]) {
				case T_CONSTANT_ENCAPSED_STRING:
					return ['kind' => 'literal', 'value' => self::unquote($tok[1])];
				case T_LNUMBER:
					return ['kind' => 'literal', 'value' => (int) $tok[1]];
				case T_DNUMBER:
					return ['kind' => 'literal', 'value' => (float) $tok[1]];
				case T_STRING:
					$low = strtolower($tok[1]);
					if ($low === 'true')  { return ['kind' => 'literal', 'value' => true]; }
					if ($low === 'false') { return ['kind' => 'literal', 'value' => false]; }
					if ($low === 'null')  { return ['kind' => 'literal', 'value' => null]; }
					break; // bare constant ref → runtime
			}
		}
		return ['kind' => 'runtime', 'value' => null];
	}//end classify

	/** UNQUOTE a T_CONSTANT_ENCAPSED_STRING literal to its PHP string value. */
	private static function unquote(string $raw) : string {
		$quote = $raw[0];
		$inner = substr($raw, 1, -1);
		if ($quote === "'") {
			return str_replace(['\\\\', "\\'"], ['\\', "'"], $inner);
		}
		return stripcslashes($inner); // double-quoted: \n \t \\ \" etc.
	}//end unquote

	private static function next_meaningful_index(array $tokens, int $from) : ?int {
		$n = count($tokens);
		for ($i = $from + 1; $i < $n; $i++) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $i;
		}
		return null;
	}//end next_meaningful_index

	/** @return array|string|null the previous non-whitespace, non-comment token */
	private static function prev_meaningful(array $tokens, int $from) {
		for ($i = $from - 1; $i >= 0; $i--) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $t;
		}
		return null;
	}//end prev_meaningful
}
