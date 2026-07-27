<?php declare(strict_types=1);

/**
* DEFINE_SCANNER
* The shared token-walking primitives for statically reading top-level define('NAME', VALUE)
* calls WITHOUT executing the source (token_get_all). Used by both legacy_surface (boot-diff
* gate) and migration_extractor (the v6→v7 migration); each keeps its own value-classification
* semantics (legacy_surface::classify vs migration_extractor::resolve, which adds symbol-table
* cross-refs, concatenation folding and guarded array-literal eval) but shares this tokenizer
* core so a fix to the scanning logic lands in ONE place.
*/
trait define_scanner {

	/**
	* IS_DEFINE_CALL — true for a call to the GLOBAL define(): either bare `define`
	* (T_STRING) or the fully-qualified `\define` (T_NAME_FULLY_QUALIFIED, PHP 8.0+).
	* A namespaced `Ns\define` (T_NAME_QUALIFIED, no leading backslash) is a DIFFERENT
	* function and is deliberately NOT matched.
	* @param array{0:int,1:string} $token a token_get_all array token
	*/
	private static function is_define_call(array $token) : bool {
		if ($token[0] === T_STRING) {
			return strtolower($token[1]) === 'define';
		}
		if ($token[0] === T_NAME_FULLY_QUALIFIED) {
			return strtolower($token[1]) === '\\define';
		}
		return false;
	}//end is_define_call

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

	/** UNQUOTE a T_CONSTANT_ENCAPSED_STRING literal to its PHP string value. */
	private static function unquote(string $raw) : string {
		$quote = $raw[0];
		$inner = substr($raw, 1, -1);
		if ($quote === "'") {
			return str_replace(['\\\\', "\\'"], ['\\', "'"], $inner);
		}
		return stripcslashes($inner); // double-quoted: \n \t \\ \" etc.
	}//end unquote

	/** Index of the next non-whitespace, non-comment token after $from, or null. */
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
