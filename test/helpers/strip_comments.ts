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
export function stripComments(source: string): string {
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
				output += inner;
				index++;
				if (inner === '\\') {
					if (index < source.length) {
						output += source[index];
						index++;
					}
					continue;
				}
				if (inner === quote) break;
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
				output += source.slice(index, cursor);
				index = cursor;
				continue;
			}
		}
		output += char;
		index++;
	}
	return output;
}
