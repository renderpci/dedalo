/**
 * TRIPWIRE — THE SHARED SCANNER'S OWN CONTRACT.
 *
 * `test/helpers/strip_comments.ts` is the one stripper every source-grepping
 * tripwire runs on, so a defect in it is a silent, simultaneous hole in all of
 * them. It had no gate of its own: measured 2026-08-31, deleting BOTH new
 * options left `outbound_fetch_tripwire` reporting 9 pass / 0 fail, because the
 * calling gate's assertions could not tell "nothing to find" from "found
 * nothing".
 *
 * Two of the four behaviours here exist because a review defeated a gate through
 * them, and both are recorded at the assertion they broke:
 *   - a REGEX BODY's escaped paren desynced a caller's bracket counting, so the
 *     window ran past the call and a decoy in the next statement satisfied it;
 *   - a TEMPLATE SUBSTITUTION is CODE, and blanking it hid a real call.
 *
 * The default behaviour is asserted byte-for-byte because several existing gates
 * depend on it: literal CONTENT kept, comments gone. A change to the default is
 * a change to every one of them at once.
 */

import { describe, expect, test } from 'bun:test';
import { stripComments } from '../helpers/strip_comments.ts';

describe('the default contract, which other gates depend on', () => {
	test('comments go, literal content stays', () => {
		const source = [
			"const a = 'keep // this';",
			'// drop this',
			'/* and this */',
			'const b = `keep ${x} this`;',
			'const c = /ke(ep)/;',
		].join('\n');
		const out = stripComments(source);
		expect(out).toContain("'keep // this'");
		expect(out).toContain('`keep ${x} this`');
		expect(out).toContain('/ke(ep)/');
		expect(out).not.toContain('drop this');
		expect(out).not.toContain('and this');
	});

	test('line numbers survive, so a scanner can report them', () => {
		const source = 'a\n/* two\nlines */\nb';
		expect(stripComments(source).split('\n').length).toBe(source.split('\n').length);
	});

	test('a `//` inside a string does not eat the rest of the line', () => {
		// The defect this scanner was written to replace: a regex-based stripper
		// swallowed a genuine violation sitting after a string containing `//`.
		const out = stripComments("const sep = 'a//b'; danger();");
		expect(out).toContain('danger()');
	});
});

describe('blankStrings — a string is not code', () => {
	test('literal content becomes spaces, quotes and newlines stay', () => {
		const out = stripComments("const a = 'forceContextLoss';", { blankStrings: true });
		expect(out).not.toContain('forceContextLoss');
		expect(out).toContain("''".slice(0, 1)); // the quote survives
		expect(out.length).toBe("const a = 'forceContextLoss';".length);
	});
});

describe('blankRegexBodies — a regex body is not brackets', () => {
	test("a regex's own parens stop desyncing a caller's bracket count", () => {
		// MEASURED: `fetch(url.replace(/^\(*​/, ''), { unix: s })` left a caller's
		// depth counter one open-paren short, so its "matching" close paren was
		// found in the NEXT statement and a decoy `signal:` there satisfied a
		// security assertion over a signal-less call.
		const source =
			"const a = f(url.replace(/^\\(*/, ''), { unix: s });\nconst decoy = { signal: 1 };";
		const out = stripComments(source, { blankStrings: true, blankRegexBodies: true });
		const open = (out.match(/\(/g) ?? []).length;
		const close = (out.match(/\)/g) ?? []).length;
		expect(open, 'the regex body still contributes brackets').toBe(close);
		// the slashes stay, so the literal is still recognisable as one
		expect(out).toContain('/');
	});

	test('the option is OFF by default, so existing gates are unchanged', () => {
		const source = 'const r = /a(b/;';
		expect(stripComments(source)).toBe(source);
	});
});

describe('keepTemplateSubstitutions — a substitution IS code', () => {
	test('a call inside `${…}` stays visible to a census', () => {
		const source = 'const a = `${await fetch(u, { signal: x })}`;';
		const out = stripComments(source, { blankStrings: true, keepTemplateSubstitutions: true });
		expect(out, 'the call disappeared with the string').toContain('fetch(u, { signal: x })');
	});

	test('the literal parts around it are still blanked', () => {
		const out = stripComments('const a = `secret${x}secret`;', {
			blankStrings: true,
			keepTemplateSubstitutions: true,
		});
		expect(out).not.toContain('secret');
		expect(out).toContain('${x}');
	});

	test('a nested template inside a substitution is handled', () => {
		const out = stripComments('const a = `${b(`${c}`)}`;', {
			blankStrings: true,
			keepTemplateSubstitutions: true,
		});
		expect(out).toContain('b(');
		expect(out).toContain('${c}');
	});

	test('the option is OFF by default', () => {
		const out = stripComments('const a = `${fetch(u)}`;', { blankStrings: true });
		expect(out).not.toContain('fetch(u)');
	});
});
