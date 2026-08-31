/**
 * THE SCANNER'S COMMENT STRIPPER — shared by every source-grepping tripwire.
 *
 * A gate that greps source for a banned token must not fire on the module header
 * that EXPLAINS the ban, so the scanners strip comments first. The two-regex
 * form they each used to carry — a non-greedy block-comment replace followed by
 * a line-comment replace guarded only by "no colon before the slashes" — has a
 * hole that is a real defect, not a theoretical one: it does not know
 * what a string literal is. Any non-URL `//` inside one (`const sep = 'a//b';
 * await fetch(url)`) ate the rest of that LINE, including a genuine violation
 * after it. Only a `:` immediately before the slashes was protected (the `http://`
 * case), so this hid ACCIDENTS, not just adversaries — exactly the failure a
 * tripwire may never have.
 *
 * This is therefore a small SCANNER instead of a regex: it walks the source and
 * knows four things a regex cannot — string literals (`'`, `"`, backtick),
 * regex literals, and comments. Literal CONTENT is KEPT verbatim (only comments
 * disappear), which keeps the scanners conservative: a banned token inside a
 * string is still reported, and reporting is the safe direction.
 *
 * ONE COPY, on purpose: three tripwires (external_outbound, external_client_render,
 * sql_confinement's src/external scan) fired on the same broken stripper, and
 * three copies is three chances to fix one of them.
 *
 * `{ blankStrings: true }` (2026-08-15, for the error_throw_ratchet census in
 * scripts/lib/throw_census.ts) additionally BLANKS the content of every string
 * and template literal — the quotes stay, the bytes between them become spaces
 * (newlines kept), so a scanner counting a CODE token (`throw new Error(`) does
 * not count a message that merely mentions it. Same scanner, one option: a
 * second walker that only knew strings would disagree with this one about where
 * a regex literal ends, which is exactly the two-copies defect this file exists
 * to prevent. Default behaviour is unchanged.
 */

/** Chars after which a `/` starts a REGEX rather than a division. */
const REGEX_ALLOWED_AFTER = new Set([
	'',
	'(',
	',',
	'=',
	':',
	'[',
	'!',
	'&',
	'|',
	'?',
	'{',
	'}',
	';',
	'+',
	'-',
	'*',
	'%',
	'~',
	'^',
	'<',
	'>',
	'\n',
]);

/** …and after these KEYWORDS, where the preceding char is a letter. */
const REGEX_ALLOWED_KEYWORD =
	/(?:^|[^\w$.])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

function regexMayStart(emitted: string): boolean {
	const trimmed = emitted.replace(/[ \t]+$/, '');
	const last = trimmed.slice(-1);
	if (REGEX_ALLOWED_AFTER.has(last)) return true;
	return REGEX_ALLOWED_KEYWORD.test(trimmed);
}

/**
 * Remove line and block comments, leaving every string and regex literal intact.
 *
 * Newlines inside removed comments are preserved so line numbers still line up
 * for a scanner that reports them.
 */
export interface StripCommentsOptions {
	/** Also blank the CONTENT of string/template literals (quotes and newlines kept). */
	blankStrings?: boolean;
	/**
	 * Also blank the BODY of a regex literal, keeping the slashes.
	 *
	 * A regex body is copied verbatim by default, which is right for a scanner
	 * looking for a banned token. It is WRONG for one that counts brackets: an
	 * escaped or character-class paren (`/^\(*​/`, `/[()]/`) adds depth that never
	 * closes, so a "matching close paren" is found later than the real one and the
	 * window runs into the following statements. Measured 2026-08-31 — it let a
	 * signal-less `fetch` pass `outbound_fetch_tripwire` by swallowing a decoy.
	 */
	blankRegexBodies?: boolean;
	/**
	 * Keep `${…}` substitutions as CODE when `blankStrings` is on.
	 *
	 * A substitution is not string content — it is an expression, and blanking it
	 * hides real calls from a census (`` await fetch(`${base}/x`) `` is fine, but
	 * `` `${await fetch(u)}` `` disappears entirely). The literal parts around it
	 * are still blanked.
	 */
	keepTemplateSubstitutions?: boolean;
}

export function stripComments(source: string, options: StripCommentsOptions = {}): string {
	const blankStrings = options.blankStrings === true;
	const blankRegexBodies = options.blankRegexBodies === true;
	const keepSubstitutions = options.keepTemplateSubstitutions === true;
	let output = '';
	let index = 0;
	while (index < source.length) {
		const char = source[index] as string;
		const next = source[index + 1];

		// Line comment: drop to (not including) the newline.
		if (char === '/' && next === '/') {
			while (index < source.length && source[index] !== '\n') index++;
			continue;
		}
		// Block comment: drop it, keeping its newlines.
		if (char === '/' && next === '*') {
			const end = source.indexOf('*/', index + 2);
			const body = source.slice(index, end === -1 ? source.length : end + 2);
			output += body.replace(/[^\n]/g, '');
			index = end === -1 ? source.length : end + 2;
			continue;
		}
		// String or template literal: copied verbatim, comment markers and all.
		if (char === "'" || char === '"' || char === '`') {
			const quote = char;
			output += char;
			index++;
			while (index < source.length) {
				const inner = source[index] as string;
				index++;
				if (inner === '\\') {
					output += blankStrings ? ' ' : inner;
					if (index < source.length) {
						const escaped = source[index] as string;
						output += blankStrings && escaped !== '\n' ? ' ' : escaped;
						index++;
					}
					continue;
				}
				if (inner === quote) {
					output += inner;
					break;
				}
				// `${` inside a template opens CODE again. Recursing keeps one
				// definition of what a literal is — a second walker that only knew
				// substitutions would disagree with this one about regexes.
				if (keepSubstitutions && quote === '`' && inner === '$' && source[index] === '{') {
					const start = index + 1;
					let depth = 1;
					let cursor = start;
					while (cursor < source.length && depth > 0) {
						const brace = source[cursor];
						if (brace === '{') depth++;
						else if (brace === '}') depth--;
						cursor++;
					}
					output += `\${${stripComments(source.slice(start, cursor - 1), options)}}`;
					index = cursor;
					continue;
				}
				output += blankStrings && inner !== '\n' ? ' ' : inner;
				// A non-template literal never spans a raw newline; bail out rather
				// than swallowing the file when the source is not what we assumed.
				if (inner === '\n' && quote !== '`') break;
			}
			continue;
		}
		// Regex literal — only where one may legally start, so `a / b // c` still
		// has its trailing comment removed.
		if (char === '/' && regexMayStart(output)) {
			let cursor = index + 1;
			let inClass = false;
			let closed = false;
			while (cursor < source.length) {
				const inner = source[cursor] as string;
				if (inner === '\\') {
					cursor += 2;
					continue;
				}
				if (inner === '\n') break; // not a regex after all
				if (inner === '[') inClass = true;
				else if (inner === ']') inClass = false;
				else if (inner === '/' && !inClass) {
					closed = true;
					cursor++;
					break;
				}
				cursor++;
			}
			if (closed) {
				const literal = source.slice(index, cursor);
				output += blankRegexBodies ? `/${literal.slice(1, -1).replace(/[^\n]/g, ' ')}/` : literal;
				index = cursor;
				continue;
			}
		}
		output += char;
		index++;
	}
	return output;
}
