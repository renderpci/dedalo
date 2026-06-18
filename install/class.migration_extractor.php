<?php declare(strict_types=1);

/**
* MIGRATION_EXTRACTOR
* Tokenizer-based static extractor for the v6→v7 config migration (spec §5.10). Recovers
* every ACTIVE top-level define('NAME', <value>) in the given files WITHOUT executing them.
* Per constant it records: a resolved scalar value when the value is a literal (or a
* concatenation / cross-reference that folds to one); the verbatim source text of the
* value expression (for verbatim PASSTHROUGH preservation); and 'kind' = 'runtime' for
* values built from $_SERVER / dirname() / function calls / unresolved refs (value null —
* must not be baked). A running symbol table of literal values lets a later define reuse an
* earlier literal const (e.g. INFO_KEY = ENTITY). First ACTIVE definition of a name wins.
*
* Commented-out defines are intentionally NOT captured (the migration keeps a timestamped
* backup of the original file). Standalone from legacy_surface — different semantics.
*/
final class migration_extractor {

	/**
	* @param string[] $files absolute paths, processed in order (symbol table persists across them)
	* @return array<string,array{value:mixed,raw:string,kind:string,file:string,line:int}>
	*/
	public static function extract(array $files) : array {
		$out = [];
		$symbols = []; // const name => resolved scalar value (literals only)
		foreach ($files as $file) {
			$src = file_get_contents($file);
			if ($src === false) {
				throw new \RuntimeException("migration_extractor: cannot read {$file}");
			}
			self::scan($src, $file, $out, $symbols);
		}
		return $out;
	}//end extract

	private static function scan(string $src, string $file, array &$out, array &$symbols) : void {
		$tokens = token_get_all($src);
		$n = count($tokens);
		for ($i = 0; $i < $n; $i++) {
			$t = $tokens[$i];
			if (!is_array($t) || !self::is_define($t)) {
				continue;
			}
			$prev = self::prev_meaningful($tokens, $i);
			if (is_array($prev) && in_array($prev[0], [T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NULLSAFE_OBJECT_OPERATOR, T_FUNCTION], true)) {
				continue;
			}
			$open = self::next_meaningful($tokens, $i);
			if ($open === null || $tokens[$open] !== '(') {
				continue;
			}
			$name_idx = self::next_meaningful($tokens, $open);
			if ($name_idx === null || !is_array($tokens[$name_idx]) || $tokens[$name_idx][0] !== T_CONSTANT_ENCAPSED_STRING) {
				continue;
			}
			$name = self::unquote($tokens[$name_idx][1]);
			$line = $tokens[$name_idx][2];
			$comma = self::next_meaningful($tokens, $name_idx);
			if ($comma === null || $tokens[$comma] !== ',') {
				continue;
			}
			[$value_tokens, $end] = self::collect_value($tokens, $comma + 1);
			$i = $end;
			if (array_key_exists($name, $out)) {
				continue; // first active definition wins
			}
			[$kind, $value] = self::resolve($value_tokens, $symbols);
			$out[$name] = [
				'value' => $value,
				'raw'   => trim(self::raw_text($value_tokens)),
				'kind'  => $kind,
				'file'  => $file,
				'line'  => $line,
			];
			if ($kind === 'literal') {
				$symbols[$name] = $value;
			}
		}
	}//end scan

	/** @return array{0:string,1:mixed} [kind, value] */
	private static function resolve(array $value_tokens, array $symbols) : array {
		$mean = array_values(array_filter($value_tokens, static function ($t) : bool {
			return !(is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true));
		}));
		if ($mean === []) {
			return ['runtime', null];
		}
		// optional leading +/- on a numeric literal
		if (count($mean) === 2 && !is_array($mean[0]) && ($mean[0] === '-' || $mean[0] === '+')
			&& is_array($mean[1]) && in_array($mean[1][0], [T_LNUMBER, T_DNUMBER], true)) {
			$num = $mean[1][0] === T_LNUMBER ? (int) $mean[1][1] : (float) $mean[1][1];
			return ['literal', $mean[0] === '-' ? -$num : $num];
		}
		if (count($mean) === 1) {
			return self::scalar_token($mean[0], $symbols);
		}
		// concatenation: operand ('.' operand)*  — operands at even indices, '.' at odd
		$parts = [];
		foreach ($mean as $idx => $tok) {
			if ($idx % 2 === 1) {
				if ($tok === '.') {
					continue;
				}
				return ['runtime', null];
			}
			[$k, $v] = self::scalar_token($tok, $symbols);
			if ($k !== 'literal' || is_bool($v) || $v === null || !is_scalar($v)) {
				return ['runtime', null];
			}
			$parts[] = (string) $v;
		}
		return ['literal', implode('', $parts)];
	}//end resolve

	/** @return array{0:string,1:mixed} a single value token → [kind, value] */
	private static function scalar_token($tok, array $symbols) : array {
		if (!is_array($tok)) {
			return ['runtime', null];
		}
		switch ($tok[0]) {
			case T_CONSTANT_ENCAPSED_STRING:
				return ['literal', self::unquote($tok[1])];
			case T_LNUMBER:
				return ['literal', (int) $tok[1]];
			case T_DNUMBER:
				return ['literal', (float) $tok[1]];
			case T_STRING:
				$low = strtolower($tok[1]);
				if ($low === 'true')  { return ['literal', true]; }
				if ($low === 'false') { return ['literal', false]; }
				if ($low === 'null')  { return ['literal', null]; }
				if (array_key_exists($tok[1], $symbols)) {
					return ['literal', $symbols[$tok[1]]]; // cross-ref to an earlier literal const
				}
				return ['runtime', null];
		}
		return ['runtime', null];
	}//end scalar_token

	private static function raw_text(array $value_tokens) : string {
		$s = '';
		foreach ($value_tokens as $t) {
			$s .= is_array($t) ? $t[1] : $t;
		}
		return $s;
	}//end raw_text

	private static function is_define(array $token) : bool {
		if ($token[0] === T_STRING) {
			return strtolower($token[1]) === 'define';
		}
		if ($token[0] === T_NAME_FULLY_QUALIFIED) {
			return strtolower($token[1]) === '\\define';
		}
		return false;
	}//end is_define

	/** @return array{0:array<int,array|string>,1:int} [value tokens, index of define()'s closing paren] */
	private static function collect_value(array $tokens, int $start) : array {
		$depth = 1;
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
		return [$collected, $n - 1];
	}//end collect_value

	private static function unquote(string $raw) : string {
		$quote = $raw[0];
		$inner = substr($raw, 1, -1);
		if ($quote === "'") {
			return str_replace(['\\\\', "\\'"], ['\\', "'"], $inner);
		}
		return stripcslashes($inner);
	}//end unquote

	private static function next_meaningful(array $tokens, int $from) : ?int {
		$n = count($tokens);
		for ($i = $from + 1; $i < $n; $i++) {
			$t = $tokens[$i];
			if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
				continue;
			}
			return $i;
		}
		return null;
	}//end next_meaningful

	/** @return array|string|null */
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
