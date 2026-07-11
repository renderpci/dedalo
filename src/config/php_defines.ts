/**
 * PHP `define()` EXTRACTOR — reads a v6 config WITHOUT executing it.
 *
 * A v6 install configures itself with ~200 `define()` statements in
 * `<dedalo>/config/` (config.php + config_db.php + config_areas.php +
 * config_core.php). We cannot evaluate that PHP: the TS engine spawns no `php`
 * binary, and v6's own `config.php` is a PROGRAM — it calls `setlocale()`,
 * `session_start_manager()` and includes `class.loader.php`, so `include`-ing it
 * boots the whole application. So we tokenize.
 *
 * Port of the PHP-side `install/class.migration_extractor.php` (the previous,
 * PHP-targeted execution of this same migration), with ONE deliberate fix: that
 * implementation's `is_safe_array()` rejects any bare identifier inside an array
 * literal, so a LIST-OF-CONSTANTS (`[DEDALO_IMAGE_QUALITY_ORIGINAL, '100MB', …]`)
 * silently degraded to `kind:'runtime'` and was dropped — losing every
 * `DEDALO_*_AR_QUALITY` and `DEDALO_CACHE_MANAGER`. Here identifiers are resolved
 * against the symbol table BEFORE any safety check, so those values survive.
 *
 * What resolves to a `literal`: scalars, arrays, maps (incl. nested), string
 * concatenation, references to a previously-defined constant, and `$var` when the
 * variable was assigned a literal earlier in the file.
 * What is `runtime` (value unknowable statically, NEVER baked into the .env):
 * anything touching `$_SERVER`, `dirname()`, `php_sapi_name()`, a function call,
 * a ternary, or an unresolved symbol.
 */

/** A value expression that could not be resolved statically. */
const UNRESOLVED = Symbol('unresolved');

export type DefineKind = 'literal' | 'runtime';

export interface DefineRecord {
	readonly name: string;
	/** Resolved JS value when kind==='literal'; null when 'runtime'. */
	readonly value: unknown;
	/** Verbatim source text of the value expression (for the report). */
	readonly raw: string;
	readonly kind: DefineKind;
	readonly file: string;
	readonly line: number;
	/**
	 * The define sits inside a block (`if (!defined(…))`, `switch (DEDALO_ENTITY)`,
	 * …) rather than at top level, so which branch wins is a RUNTIME fact a static
	 * parse cannot know. Recorded, and surfaced in the report as ambiguous.
	 */
	readonly conditional: boolean;
}

export interface ExtractResult {
	/** name → record. A name defined more than once keeps the FIRST top-level define (PHP semantics: first define wins). */
	readonly records: Map<string, DefineRecord>;
	/** Names defined more than once (any branch) — ambiguous, reported. */
	readonly duplicates: readonly string[];
	/** include/require statements seen and deliberately NOT followed. */
	readonly includes: readonly { file: string; line: number; raw: string }[];
	/** Names appearing in a COMMENTED-OUT define — the operator's deliberate defaults. */
	readonly commentedOut: readonly string[];
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokenType = 'id' | 'str' | 'num' | 'var' | 'punct';

interface Token {
	readonly type: TokenType;
	/** For 'str', the DECODED value; otherwise the verbatim text. */
	readonly text: string;
	readonly line: number;
	readonly start: number;
	readonly end: number;
	/** A double-quoted string containing `$` interpolates at runtime — never a literal. */
	readonly interpolated?: boolean;
}

/** Frozen grammar table — never mutated, so it carries no cross-request state. */
const PUNCT: ReadonlySet<string> = new Set([
	'(',
	')',
	'[',
	']',
	',',
	'.',
	';',
	'=',
	'>',
	'{',
	'}',
	'?',
	':',
	'-',
	'!',
]);

/** Tokenize PHP, dropping comments and whitespace. Comment text is captured separately. */
function lex(src: string): { tokens: Token[]; comments: string[] } {
	const tokens: Token[] = [];
	const comments: string[] = [];
	let i = 0;
	let line = 1;
	const n = src.length;

	while (i < n) {
		const c = src[i] as string;

		if (c === '\n') {
			line++;
			i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') {
			i++;
			continue;
		}

		// comments: // … , # … , /* … */
		if ((c === '/' && src[i + 1] === '/') || c === '#') {
			const start = i;
			while (i < n && src[i] !== '\n') i++;
			comments.push(src.slice(start, i));
			continue;
		}
		if (c === '/' && src[i + 1] === '*') {
			const start = i;
			i += 2;
			while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
				if (src[i] === '\n') line++;
				i++;
			}
			i += 2;
			comments.push(src.slice(start, i));
			continue;
		}

		// <?php / ?>
		if (c === '<' && src.startsWith('<?php', i)) {
			i += 5;
			continue;
		}
		if (c === '?' && src[i + 1] === '>') {
			i += 2;
			continue;
		}

		// strings
		if (c === "'" || c === '"') {
			const quote = c;
			const start = i;
			const startLine = line;
			i++;
			let decoded = '';
			while (i < n && src[i] !== quote) {
				if (src[i] === '\\') {
					const next = src[i + 1] as string;
					// single-quoted PHP only escapes \' and \\; double-quoted does more.
					if (quote === "'") {
						decoded += next === "'" || next === '\\' ? next : `\\${next}`;
					} else {
						decoded += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
					}
					i += 2;
					continue;
				}
				if (src[i] === '\n') line++;
				decoded += src[i];
				i++;
			}
			i++; // closing quote
			tokens.push({
				type: 'str',
				text: decoded,
				line: startLine,
				start,
				end: i,
				interpolated: quote === '"' && /\$|\{\$/.test(src.slice(start, i)),
			});
			continue;
		}

		// variables ($foo, $_SERVER)
		if (c === '$') {
			const start = i;
			i++;
			while (i < n && /[A-Za-z0-9_]/.test(src[i] as string)) i++;
			tokens.push({ type: 'var', text: src.slice(start, i), line, start, end: i });
			continue;
		}

		// numbers
		if (/[0-9]/.test(c)) {
			const start = i;
			while (i < n && /[0-9._]/.test(src[i] as string)) i++;
			tokens.push({ type: 'num', text: src.slice(start, i), line, start, end: i });
			continue;
		}

		// identifiers / keywords / constants
		if (/[A-Za-z_\\]/.test(c)) {
			const start = i;
			while (i < n && /[A-Za-z0-9_\\]/.test(src[i] as string)) i++;
			tokens.push({ type: 'id', text: src.slice(start, i), line, start, end: i });
			continue;
		}

		// '=>' as one token
		if (c === '=' && src[i + 1] === '>') {
			tokens.push({ type: 'punct', text: '=>', line, start: i, end: i + 2 });
			i += 2;
			continue;
		}

		if (PUNCT.has(c)) {
			tokens.push({ type: 'punct', text: c, line, start: i, end: i + 1 });
			i++;
			continue;
		}

		i++; // anything else (operators we don't model) — skipped; the parser sees the gap
	}

	return { tokens, comments };
}

// ---------------------------------------------------------------------------
// Expression evaluation (over a token slice)
// ---------------------------------------------------------------------------

interface EvalContext {
	readonly consts: Map<string, unknown>;
	readonly vars: Map<string, unknown>;
}

/**
 * Evaluate the token slice [from, to) as a PHP value expression.
 * Returns UNRESOLVED for anything not statically knowable.
 */
function evalExpr(tokens: Token[], from: number, to: number, ctx: EvalContext): unknown {
	let pos = from;

	const peek = (): Token | undefined => (pos < to ? tokens[pos] : undefined);

	function parsePrimary(): unknown {
		const t = peek();
		if (t === undefined) return UNRESOLVED;

		// unary minus
		if (t.type === 'punct' && t.text === '-') {
			pos++;
			const inner = parsePrimary();
			return typeof inner === 'number' ? -inner : UNRESOLVED;
		}

		if (t.type === 'str') {
			pos++;
			return t.interpolated === true ? UNRESOLVED : t.text;
		}

		if (t.type === 'num') {
			pos++;
			const parsed = Number(t.text.replace(/_/g, ''));
			return Number.isFinite(parsed) ? parsed : UNRESOLVED;
		}

		// $var — resolvable only if a literal was assigned earlier
		if (t.type === 'var') {
			pos++;
			// $_SERVER and friends are runtime by definition
			if (!ctx.vars.has(t.text)) return UNRESOLVED;
			return ctx.vars.get(t.text);
		}

		if (t.type === 'punct' && t.text === '[') {
			pos++;
			return parseArrayBody(']');
		}

		if (t.type === 'id') {
			const lower = t.text.toLowerCase();
			if (lower === 'true') {
				pos++;
				return true;
			}
			if (lower === 'false') {
				pos++;
				return false;
			}
			if (lower === 'null') {
				pos++;
				return null;
			}
			if (lower === 'array' && tokens[pos + 1]?.text === '(') {
				pos += 2;
				return parseArrayBody(')');
			}
			// A function call — runtime (dirname(), php_sapi_name(), fix_cascade_config_var()…)
			if (tokens[pos + 1]?.text === '(') return UNRESOLVED;
			// A bare identifier = a constant reference. THIS is the case the PHP
			// original mishandled inside arrays.
			pos++;
			if (!ctx.consts.has(t.text)) return UNRESOLVED;
			return ctx.consts.get(t.text);
		}

		return UNRESOLVED;
	}

	/** Elements until the closing bracket. Handles `k => v` maps and plain lists. */
	function parseArrayBody(close: string): unknown {
		const list: unknown[] = [];
		const map: Record<string, unknown> = {};
		let isMap = false;

		while (pos < to) {
			const t = peek();
			if (t === undefined) return UNRESOLVED;
			if (t.type === 'punct' && t.text === close) {
				pos++;
				return isMap ? map : list;
			}
			if (t.type === 'punct' && t.text === ',') {
				pos++;
				continue;
			}

			const first = parseConcat();
			if (first === UNRESOLVED) return UNRESOLVED;

			const next = peek();
			if (next !== undefined && next.type === 'punct' && next.text === '=>') {
				pos++;
				const value = parseConcat();
				if (value === UNRESOLVED) return UNRESOLVED;
				isMap = true;
				map[String(first)] = value;
			} else {
				list.push(first);
			}
		}
		return UNRESOLVED;
	}

	/** `a . b . c` string concatenation. */
	function parseConcat(): unknown {
		let left = parsePrimary();
		if (left === UNRESOLVED) return UNRESOLVED;

		while (pos < to) {
			const t = peek();
			if (t === undefined || t.type !== 'punct' || t.text !== '.') break;
			pos++;
			const right = parsePrimary();
			if (right === UNRESOLVED) return UNRESOLVED;
			if (
				(typeof left !== 'string' && typeof left !== 'number') ||
				(typeof right !== 'string' && typeof right !== 'number')
			) {
				return UNRESOLVED;
			}
			left = `${left}${right}`;
		}
		return left;
	}

	const result = parseConcat();
	// Trailing tokens we didn't model (a ternary `? :`, an operator) ⇒ not a literal.
	if (pos < to) {
		const rest = tokens.slice(pos, to).filter((t) => t.text !== ';');
		if (rest.length > 0) return UNRESOLVED;
	}
	return result;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Find the index of the ')' matching the '(' at openIdx. */
function matchParen(tokens: Token[], openIdx: number): number {
	let depth = 0;
	for (let i = openIdx; i < tokens.length; i++) {
		const text = tokens[i]?.text;
		if (text === '(') depth++;
		else if (text === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

const COMMENTED_DEFINE = /define\s*\(\s*['"]([A-Z_0-9]+)['"]/g;
/** Frozen keyword table — never mutated, so it carries no cross-request state. */
const INCLUDE_KEYWORDS: ReadonlySet<string> = new Set([
	'include',
	'include_once',
	'require',
	'require_once',
]);

/**
 * Extract every `define()` from the given files, in order. Later files see the
 * constants defined by earlier ones (the symbol table is shared), mirroring the
 * include order of a real boot.
 */
export function extractDefines(files: readonly { path: string; content: string }[]): ExtractResult {
	const records = new Map<string, DefineRecord>();
	const duplicates: string[] = [];
	const includes: { file: string; line: number; raw: string }[] = [];
	const commentedOut = new Set<string>();
	const consts = new Map<string, unknown>();
	const vars = new Map<string, unknown>();
	/**
	 * The verbatim SOURCE of each `$var` assignment. A real v6 install writes
	 * `$path = dirname(…) . '/private/config.inc'; include $path;` — the include
	 * statement alone says nothing, so without the assignment text we would report
	 * "an include we didn't follow" and be unable to say it was the config. The
	 * target is unresolvable statically (dirname() is runtime), but its SOURCE tells
	 * the operator exactly which file we skipped.
	 */
	const varSource = new Map<string, string>();
	const ctx: EvalContext = { consts, vars };

	for (const file of files) {
		const { tokens, comments } = lex(file.content);

		for (const comment of comments) {
			COMMENTED_DEFINE.lastIndex = 0;
			let m = COMMENTED_DEFINE.exec(comment);
			while (m !== null) {
				commentedOut.add(m[1] as string);
				m = COMMENTED_DEFINE.exec(comment);
			}
		}

		let depth = 0; // brace depth: a define at depth>0 is inside a branch

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i] as Token;

			if (token.type === 'punct' && token.text === '{') {
				depth++;
				continue;
			}
			if (token.type === 'punct' && token.text === '}') {
				depth = Math.max(0, depth - 1);
				continue;
			}

			if (token.type === 'id' && INCLUDE_KEYWORDS.has(token.text.toLowerCase())) {
				// Seen, deliberately NOT followed: the migration reads <v6>/config/ only.
				let end = i;
				while (end < tokens.length && tokens[end]?.text !== ';') end++;
				let raw = file.content
					.slice(token.start, tokens[Math.min(end, tokens.length - 1)]?.end ?? token.end)
					.trim();
				// `include $path;` — resolve the variable back to the expression that
				// built it, or the report cannot say WHICH file was skipped.
				const arg = tokens[i + 1];
				if (arg?.type === 'var' && varSource.has(arg.text)) {
					raw = `${raw}   (${arg.text} = ${varSource.get(arg.text)})`;
				}
				includes.push({ file: file.path, line: token.line, raw });
				continue;
			}

			// `$var = <literal>;` — so `define('X', $var)` can resolve (form (j)).
			if (token.type === 'var' && tokens[i + 1]?.text === '=' && tokens[i + 2]?.text !== '>') {
				let end = i + 2;
				while (end < tokens.length && tokens[end]?.text !== ';') end++;
				const value = evalExpr(tokens, i + 2, end, ctx);
				if (value !== UNRESOLVED) vars.set(token.text, value);
				else vars.delete(token.text);
				// Keep the SOURCE even when the value is runtime-unresolvable.
				const from = tokens[i + 2]?.start;
				const to = tokens[Math.max(i + 2, end - 1)]?.end;
				if (from !== undefined && to !== undefined) {
					varSource.set(token.text, file.content.slice(from, to).trim());
				}
				i = end;
				continue;
			}

			if (token.type !== 'id' || token.text.toLowerCase() !== 'define') continue;
			const open = i + 1;
			if (tokens[open]?.text !== '(') continue;
			const close = matchParen(tokens, open);
			if (close === -1) continue;

			const nameToken = tokens[open + 1];
			if (nameToken === undefined || nameToken.type !== 'str') {
				i = close;
				continue;
			}
			if (tokens[open + 2]?.text !== ',') {
				i = close;
				continue;
			}

			const name = nameToken.text;
			const valueFrom = open + 3;
			const value = evalExpr(tokens, valueFrom, close, ctx);
			const rawStart = tokens[valueFrom]?.start ?? nameToken.end;
			const rawEnd = tokens[close - 1]?.end ?? rawStart;

			const record: DefineRecord = {
				name,
				value: value === UNRESOLVED ? null : value,
				raw: file.content.slice(rawStart, rawEnd).trim(),
				kind: value === UNRESOLVED ? 'runtime' : 'literal',
				file: file.path,
				line: token.line,
				conditional: depth > 0,
			};

			if (records.has(name)) {
				// PHP: the FIRST define wins; a second one is a no-op (and a warning).
				// Keep the first, but surface the name — a static parse cannot know
				// which branch of an if/switch actually ran.
				if (!duplicates.includes(name)) duplicates.push(name);
			} else {
				records.set(name, record);
				// Only a top-level literal may seed the symbol table for later folds.
				if (record.kind === 'literal' && !record.conditional) consts.set(name, record.value);
			}

			i = close;
		}
	}

	return {
		records,
		duplicates,
		includes,
		// A name that is ALSO actively defined was merely commented as an example —
		// only the ones left purely commented are the operator's deliberate defaults.
		commentedOut: [...commentedOut].filter((name) => !records.has(name)).sort(),
	};
}
