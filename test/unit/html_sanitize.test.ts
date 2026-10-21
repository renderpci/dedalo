/**
 * XSS-01 defense-in-depth sanitizer (2026-07-28 audit). Adversarial: each test
 * is a real stored-XSS payload that must be neutralized, plus proof that
 * legitimate CKEditor formatting survives (the sanitizer must not eat content).
 * The CSP is the primary control; this reduces the stored attack surface.
 *
 * THE ORACLE (CLIENT-2 / 2026-10-11). The earlier cases assert on the OUTPUT
 * STRING (`not.toMatch(/onerror/)`), which is the same regex view of HTML the
 * old sanitizer had — a payload a regex cannot see passes both. The cases below
 * judge the output the way a BROWSER would, through the spec-parser oracle in
 * test/helpers/html_oracle.ts (the declared parse5, driven directly — independent
 * of the code under test), including the noscript mutation round trip.
 *
 * And the other half, as binding as the first: a sanitizer that corrupts prose
 * destroys the curator's record. Benign content must come back BYTE-IDENTICAL.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { escapeHtml } from '../../src/core/security/html_escape.ts';
import * as sanitizeModule from '../../src/core/security/html_sanitize.ts';
import { sanitizeRichText } from '../../src/core/security/html_sanitize.ts';
import {
	browserViolations,
	endsInDataState,
	everyAttributeOccurrence,
	executesAsUrl,
	oracleElements,
	oracleFragment,
	oracleNodes,
	oracleTokens,
	TEXT_STATE_TAGS,
} from '../helpers/html_oracle.ts';

describe('sanitizeRichText — removes executable constructs', () => {
	test('strips inline event handlers', () => {
		expect(sanitizeRichText('<img src=x onerror="alert(1)">')).not.toMatch(/onerror/i);
		expect(sanitizeRichText("<a href='#' onclick='steal()'>x</a>")).not.toMatch(/onclick/i);
		expect(sanitizeRichText('<div onmouseover=alert(1)>x</div>')).not.toMatch(/onmouseover/i);
	});

	test('removes <script> and <style> with their content', () => {
		expect(sanitizeRichText('a<script>alert(1)</script>b')).toBe('ab');
		expect(sanitizeRichText('a<style>body{x:url(javascript:1)}</style>b')).toBe('ab');
		expect(sanitizeRichText('a<script>unterminated')).toBe('a');
	});

	test('removes embedding elements (iframe/object/embed/svg/form/link)', () => {
		for (const tag of ['iframe', 'object', 'embed', 'svg', 'form', 'meta', 'base', 'link']) {
			const out = sanitizeRichText(`x<${tag} src="evil">y</${tag}>z`);
			expect(out, `${tag} tag must be gone`).not.toMatch(new RegExp(`<${tag}`, 'i'));
		}
	});

	test('neutralizes javascript:/vbscript:/data:text/html URLs', () => {
		expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
		expect(sanitizeRichText('<a href="vbscript:msgbox">x</a>')).not.toMatch(/vbscript:/i);
		expect(sanitizeRichText('<a href="data:text/html,<script>">x</a>')).not.toMatch(
			/data:text\/html/i,
		);
		// Whitespace/control-char evasion inside the scheme is collapsed first.
		expect(sanitizeRichText('<a href="java\tscript:alert(1)">x</a>')).not.toMatch(
			/java\s*script:/i,
		);
	});
});

describe('sanitizeRichText — preserves legitimate CKEditor formatting', () => {
	test('keeps formatting tags, links, images, tables', () => {
		const legit =
			'<p><b>Bold</b> <i>italic</i> <a href="https://example.org">link</a></p>' +
			'<img src="/dedalo/media/x.jpg" alt="pic"><ul><li>one</li></ul>' +
			'<table><tr><td>cell</td></tr></table>';
		const out = sanitizeRichText(legit);
		expect(out).toContain('<b>Bold</b>');
		expect(out).toContain('<a href="https://example.org">');
		expect(out).toContain('<img src="/dedalo/media/x.jpg"');
		expect(out).toContain('<td>cell</td>');
	});

	test('non-strings and empty pass through', () => {
		expect(sanitizeRichText('')).toBe('');
		expect(sanitizeRichText('plain text, no tags')).toBe('plain text, no tags');
	});
});

/** Each letter of `javascript:` in turn, character-referenced in every spelling a browser decodes. */
function generatedSchemeEvasions(): string[] {
	const scheme = 'javascript:';
	const out: string[] = [];
	for (let i = 0; i < scheme.length; i += 1) {
		const code = scheme.charCodeAt(i);
		const before = scheme.slice(0, i);
		const after = scheme.slice(i + 1);
		// a hex reference without `;` ends at the first NON-HEX character (the
		// browser consumes hex greedily), so it is only this letter's spelling
		// when what follows is not a hex digit — `javas&#x63ript:` is `c`, while
		// `&#x6aavascript` would read `0x6aa`
		const nextIsHex = /^[0-9a-f]/i.test(`${after}alert(1)`);
		for (const ref of [
			`&#${code};`,
			`&#x${code.toString(16)};`,
			`&#X${code.toString(16).toUpperCase()};`,
			`&#0000${code};`,
			`&#x0000${code.toString(16)};`,
			`&#${code}`, // no semicolon: the reference ends at the first non-digit
			...(nextIsHex
				? []
				: [
						`&#x${code.toString(16)}`,
						`&#X${code.toString(16).toUpperCase()}`,
						`&#x00${code.toString(16)}`,
					]),
		]) {
			out.push(`<a href="${before}${ref}${after}alert(1)">x</a>`);
		}
	}
	return out;
}

/** The denylisted schemes, as the sanitizer contract names them. */
const DENYLISTED_SCHEMES = ['javascript:', 'vbscript:', 'data:text/html,', 'data:application/x,'];

/** Every denylisted scheme in case variants, behind every leading C0-control-or-space (raw and referenced), and split by &Tab;/&NewLine; at every position. */
function generatedSchemeVariants(): string[] {
	const out: string[] = [];
	const href = (value: string): string => `<a href="${value}alert(1)">x</a>`;
	for (const scheme of DENYLISTED_SCHEMES) {
		const mixed = [...scheme].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c)).join('');
		for (const variant of [scheme.toUpperCase(), mixed]) out.push(href(variant));
		for (let code = 0x01; code <= 0x20; code += 1) {
			out.push(href(`${String.fromCharCode(code)}${scheme}`));
			out.push(href(`&#${code};${scheme}`));
			out.push(href(`&#x${code.toString(16)};${scheme.toUpperCase()}`));
		}
		for (let i = 0; i <= scheme.indexOf(':'); i += 1) {
			for (const ref of ['&Tab;', '&NewLine;']) {
				out.push(href(`${scheme.slice(0, i)}${ref}${scheme.slice(i)}`));
			}
		}
	}
	return out;
}

/**
 * The WHATWG named character references whose value is ASCII (semicolon forms;
 * the legacy no-semicolon forms are amp/lt/gt/quot only). Proven against the
 * spec parser below, so a typo here cannot pass silently.
 */
const ASCII_NAMED_REFERENCES: Readonly<Record<string, string>> = {
	Tab: '\t',
	NewLine: '\n',
	excl: '!',
	quot: '"',
	QUOT: '"',
	num: '#',
	dollar: '$',
	percnt: '%',
	amp: '&',
	AMP: '&',
	apos: "'",
	lpar: '(',
	rpar: ')',
	ast: '*',
	midast: '*',
	plus: '+',
	comma: ',',
	period: '.',
	sol: '/',
	colon: ':',
	semi: ';',
	lt: '<',
	LT: '<',
	equals: '=',
	gt: '>',
	GT: '>',
	quest: '?',
	commat: '@',
	lsqb: '[',
	lbrack: '[',
	bsol: '\\',
	rsqb: ']',
	rbrack: ']',
	Hat: '^',
	lowbar: '_',
	UnderBar: '_',
	grave: '`',
	DiacriticalGrave: '`',
	lcub: '{',
	lbrace: '{',
	verbar: '|',
	vert: '|',
	VerticalLine: '|',
	rcub: '}',
	rbrace: '}',
	fjlig: 'fj',
};

/** Each denylisted scheme with every substring an ASCII-valued named reference spells replaced by that reference. */
function generatedNamedReferenceSpellings(): string[] {
	const out: string[] = [];
	for (const scheme of DENYLISTED_SCHEMES) {
		for (const [name, value] of Object.entries(ASCII_NAMED_REFERENCES)) {
			for (let i = scheme.indexOf(value); i !== -1; i = scheme.indexOf(value, i + 1)) {
				out.push(
					`<a href="${scheme.slice(0, i)}&${name};${scheme.slice(i + value.length)}alert(1)">x</a>`,
				);
			}
		}
	}
	return out;
}

/** Hostile inputs a regex view of HTML cannot see — each one is live in a browser. */
const HOSTILE: Readonly<Record<string, string>> = {
	'slash-separated handler': '<img/onerror=alert(1) src=x>',
	'handler glued to a double quote': '<img src="x"onerror="alert(1)">',
	'handler glued to a single quote': "<img src='x'onerror='alert(1)'>",
	'decimal reference in the scheme': '<a href="&#106;avascript:alert(1)">x</a>',
	'hex TAB reference inside the scheme': '<a href="java&#x09;script:alert(1)">x</a>',
	'named &Tab; before the scheme': '<a href="&Tab;javascript:alert(1)">x</a>',
	'named &colon; as the scheme colon': '<a href="javascript&colon;alert(1)">x</a>',
	'zero-padded, no semicolon': '<a href="&#0000106avascript:alert(1)">x</a>',
	'hex reference without semicolon': '<a href="javas&#x63ript:alert(1)">x</a>',
	'uppercase attribute names': '<a HREF="javascript:alert(1)" OnClick="alert(1)">x</a>',
	'scheme in a non-href attribute':
		'<form><button formaction="javascript:alert(1)">x</button></form>',
	'title RCDATA hides a live img': '<title><a title="</title><img src=x onerror=alert(1)>">',
	'textarea RCDATA hides a live img':
		'<textarea><a title="</textarea><img src=x onerror=alert(1)>"></textarea>',
	'abrupt empty comment <!-->': '<!--><img src=x onerror=alert(1)>-->',
	'svg CDATA hides a live img': '<svg><![CDATA[><img src=x onerror=alert(1)>]]></svg>',
	'math + style mutation': '<math><mi><style><img src=x onerror=alert(1)></style></mi></math>',
	'noscript mutation (mXSS)':
		'<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
	'details ontoggle': '<details open ontoggle=alert(1)>x</details>',
	'template content': '<template><img src=x onerror=alert(1)></template>',
	'iframe srcdoc': '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
	// lol-html has no tree builder: it switches to RCDATA on any <title>, while
	// in-select parsing (classic browsers, parse5) ignores the tag and tokenizes
	// its "content" as markup — handler-bearing text lol-html never inspects.
	'select + title, autofocus onfocus':
		'<select><title><input autofocus onfocus=alert(1)></title></select>',
	'select + title, input type=image onerror':
		'<select><title><input type=image src=x onerror=alert(1)></title></select>',
	'leading space before the scheme': '<a href=" javascript:alert(1)">x</a>',
	'leading raw C0 control before the scheme': '<a href="\u0001javascript:alert(1)">x</a>',
	'leading referenced C0 control (&#1;)': '<a href="&#1;javascript:alert(1)">x</a>',
	'uppercase scheme': '<a href="JAVASCRIPT:alert(1)">x</a>',
	'mixed-case scheme': '<a href="JaVaScRiPt:alert(1)">x</a>',
	'named &NewLine; inside the scheme': '<a href="java&NewLine;script:alert(1)">x</a>',
	'link stylesheet': '<link rel=stylesheet href=//x>',
	'data:application/ URL': '<a href="data:application/xhtml+xml,<x/>">x</a>',
	'named &sol; in data:text/html': '<a href="data:text&sol;html,<script>alert(1)</script>">x</a>',
	'&colon; and &sol; in data:text/html (base64)':
		'<a href="data&colon;text&sol;html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
	// same tree-builder veto as select + title; the generated family below covers
	// every spec text-state tag, these pin the named review cases
	'select + noframes, autofocus onfocus':
		'<select><noframes><input autofocus onfocus=alert(1)></noframes></select>',
	'select + noframes, input type=image onerror':
		'<select><noframes><input type=image src=x onerror=alert(1)></noframes></select>',
	'select + xmp, autofocus onfocus':
		'<select><xmp><input autofocus onfocus=alert(1)></xmp></select>',
	'select + noembed, autofocus onfocus':
		'<select><noembed><input autofocus onfocus=alert(1)></noembed></select>',
	'select + iframe, autofocus onfocus':
		'<select><iframe><input autofocus onfocus=alert(1)></iframe></select>',
};

/** The rule-1 tags the gate exercises one by one; every exported member must be here. */
const DROP_WITH_CONTENT_CASES: readonly string[] = [
	'script',
	'style',
	'svg',
	'math',
	'noscript',
	'template',
	'iframe',
	'xmp',
	'noembed',
	'noframes',
	// plaintext is ALSO closed by rule 5 (it never ends, so the tokenizer is not
	// in the data state at EOF and the tail from `<plaintext` is cut): dropping
	// it from rule 1 is an equivalent mutant, measured green — the outcome holds
	// either way, which is the property this case pins
	'plaintext',
	'title',
	'textarea',
];

/** Text-state tags the in-select tree builder HONOURS (no veto): textarea closes the select. */
const IN_SELECT_HONOURED: ReadonlySet<string> = new Set(['textarea']);

describe('sanitizeRichText — a spec parser finds nothing live in the output', () => {
	for (const [name, input] of Object.entries(HOSTILE)) {
		test(name, () => {
			// Positive control: the oracle convicts the RAW input, so a green
			// below is the sanitizer's work, not a blind oracle.
			expect(browserViolations(input).length, `oracle is blind to: ${input}`).toBeGreaterThan(0);
			const out = sanitizeRichText(input);
			expect(browserViolations(out), `${input}\n  => ${out}`).toEqual([]);
		});
	}

	test('every character-referenced spelling of javascript: is neutralized', () => {
		const offenders: string[] = [];
		let convictedRaw = 0;
		for (const input of generatedSchemeEvasions()) {
			if (browserViolations(input).length > 0) convictedRaw += 1;
			const out = sanitizeRichText(input);
			const violations = browserViolations(out);
			if (violations.length > 0) offenders.push(`${input} => ${out}  [${violations.join('; ')}]`);
		}
		// Anti-vacuity: most generated spellings ARE live in a browser.
		expect(convictedRaw).toBeGreaterThan(40);
		expect(offenders).toEqual([]);
	});

	test('a hex reference WITHOUT `;` (ended by a non-hex character): each spelling live raw, inert sanitized', () => {
		// The family a `;`-requiring hex decoder misses: the browser ends the
		// reference at the first non-hex character, so `javas&#x63ript:` IS
		// `javascript:`. Per-input positive control — the oracle convicts each raw.
		const family = generatedSchemeEvasions().filter((input) =>
			/&#[xX][0-9a-fA-F]+(?![0-9a-fA-F;])/.test(input),
		);
		expect(family.length).toBeGreaterThanOrEqual(21);
		const offenders: string[] = [];
		for (const input of family) {
			expect(browserViolations(input).length, `oracle is blind to: ${input}`).toBeGreaterThan(0);
			const out = sanitizeRichText(input);
			if (browserViolations(out).length > 0) offenders.push(`${input} => ${out}`);
		}
		expect(offenders).toEqual([]);
	});

	test('an OUT-OF-RANGE numeric reference is U+FFFD (the spec), never a throw', () => {
		// > U+10FFFF: the spec parser resolves it to U+FFFD — so it forms no scheme
		// — and `String.fromCodePoint` THROWS on it. Unguarded, a text_area save of
		// such a value fails as internal.unexpected instead of being stored.
		const cases = [
			'<a href="&#x110000;javascript:alert(1)">x</a>',
			'<a href="x&#99999999;">x</a>',
			'<img src="&#x10FFFF0;">',
			'<a href="&#1114112">x</a>',
		];
		for (const input of cases) {
			// the oracle: a browser reads U+FFFD where the reference was
			const element = oracleElements(input, true).find((el) => el.tag === 'a' || el.tag === 'img');
			const attribute =
				element?.attrs.find((a) => a.name === (element.tag === 'a' ? 'href' : 'src'))?.value ?? '';
			expect(attribute, `spec decoding of ${input}`).toContain('\uFFFD');
			let out = '';
			expect(() => {
				out = sanitizeRichText(input);
			}, input).not.toThrow();
			expect(browserViolations(out), `${input}\n  => ${out}`).toEqual([]);
			expect(sanitizeRichText(out), `idempotent: ${input}`).toBe(out);
		}
		// the verdict half reads the same U+FFFD the browser does
		expect(sanitizeModule.decodeForSchemeCheck('&#x110000;javascript:')).toBe('\uFFFDjavascript:');
	});

	test('every denylisted scheme in case, leading-control and &Tab;/&NewLine; variants is neutralized', () => {
		const offenders: string[] = [];
		for (const input of generatedSchemeVariants()) {
			// Each variant is live in a browser — the control is per input.
			expect(browserViolations(input).length, `oracle is blind to: ${input}`).toBeGreaterThan(0);
			const out = sanitizeRichText(input);
			const violations = browserViolations(out);
			if (violations.length > 0) offenders.push(`${input} => ${out}  [${violations.join('; ')}]`);
		}
		expect(offenders).toEqual([]);
	});

	test('every ASCII-valued named reference: proven by the spec parser, and no scheme spelt with one survives', () => {
		for (const [name, value] of Object.entries(ASCII_NAMED_REFERENCES)) {
			const anchor = oracleElements(`<a title="&${name};">x</a>`, true).find(
				(el) => el.tag === 'a',
			);
			expect(anchor?.attrs.find((a) => a.name === 'title')?.value, `&${name};`).toBe(value);
		}
		const spellings = generatedNamedReferenceSpellings();
		// &colon; and &sol; spell part of every data: scheme; &Tab;/&NewLine; are covered above.
		expect(spellings.length).toBeGreaterThanOrEqual(DENYLISTED_SCHEMES.length + 4);
		const offenders: string[] = [];
		for (const input of spellings) {
			expect(browserViolations(input).length, `oracle is blind to: ${input}`).toBeGreaterThan(0);
			const out = sanitizeRichText(input);
			if (browserViolations(out).length > 0) offenders.push(`${input} => ${out}`);
		}
		expect(offenders).toEqual([]);
	});

	test('the drop-with-content set leaves none of its content behind', () => {
		// svg/math are FOREIGN content: their CDATA and raw-text rules differ from
		// HTML's, so keeping their content while dropping the tags re-parses it as
		// HTML — which is exactly how the svg CDATA case above turns live.
		for (const tag of DROP_WITH_CONTENT_CASES) {
			const out = sanitizeRichText(`a<${tag}>INNER</${tag}>b`);
			// plaintext has no end tag: everything after it is its content
			expect(out, `${tag}`).toBe(tag === 'plaintext' ? 'a' : 'ab');
		}
	});

	test('every member of the drop-with-content set has a case above (a new member cannot go untested)', () => {
		const untested = [...sanitizeModule.REMOVE_WITH_CONTENT].filter(
			(tag) => !DROP_WITH_CONTENT_CASES.includes(tag),
		);
		expect(untested).toEqual([]);
	});

	// THE CLASS, not its known members. lol-html has no tree builder: every
	// text-state tag the SPEC knows (oracle TEXT_STATE_TAGS, written from the
	// spec) is one whose content lol-html never judges, while in-select parsing
	// ignores the tag and tokenizes that content as markup. Generated, so a tag
	// dropped from rule 1 ships red whatever its name.
	test('select + every spec text-state tag: the tree-builder veto leaves nothing live', () => {
		const offenders: string[] = [];
		let judged = 0;
		for (const tag of TEXT_STATE_TAGS) {
			for (const inner of [
				'<input autofocus onfocus=alert(1)>',
				'<input type=image src=x onerror=alert(1)>',
			]) {
				const input = `<select><${tag}>${inner}</${tag}></select>`;
				const liveRaw = browserViolations(input).length > 0;
				// Per-input positive control. The ONE tag in-select honours is
				// textarea (it closes the select and opens RCDATA): its raw input
				// must stay inert, or the exemption is stale.
				expect(liveRaw, `oracle verdict on the raw ${input}`).toBe(!IN_SELECT_HONOURED.has(tag));
				if (liveRaw) judged += 1;
				const out = sanitizeRichText(input);
				const violations = browserViolations(out);
				if (violations.length > 0) offenders.push(`${input} => ${out}  [${violations.join('; ')}]`);
			}
		}
		expect(judged).toBeGreaterThanOrEqual(2 * (TEXT_STATE_TAGS.size - IN_SELECT_HONOURED.size));
		expect(offenders).toEqual([]);
	});

	// RULE 3, ONE VERDICT PER NAME. A browser keeps the FIRST of a duplicated
	// attribute, so parse5 never sees the rest — this half is judged on the
	// LAST-WINS view (every occurrence, oracle everyAttributeOccurrence).
	test('a duplicated attribute keeps the first value, judged, and stores no dangerous duplicate (both orders)', () => {
		const offenders: string[] = [];
		for (const scheme of DENYLISTED_SCHEMES) {
			const dangerous = `${scheme}alert(1)`;
			for (const [input, kept] of [
				[`<a href="ok" href="${dangerous}">x</a>`, 'ok'],
				[`<a href="${dangerous}" href="ok">x</a>`, '#'],
				[`<a HREF="ok" href="${dangerous}" title=t>x</a>`, 'ok'],
				[`<a href="ok" href="ok2" href="${dangerous}">x</a>`, 'ok'],
			] as const) {
				// positive control: a last-wins reader of the RAW input meets the scheme
				expect(
					everyAttributeOccurrence(input).some((a) => executesAsUrl(a.value)),
					`raw ${input}`,
				).toBe(true);
				const out = sanitizeRichText(input);
				const hrefs = everyAttributeOccurrence(out).filter((a) => a.name === 'href');
				const bad =
					hrefs.length !== 1 ||
					hrefs[0]?.value !== kept ||
					everyAttributeOccurrence(out).some((a) => executesAsUrl(a.value));
				if (bad) offenders.push(`${input} => ${out}`);
				expect(browserViolations(out), out).toEqual([]);
			}
		}
		for (const input of [
			'<img src=x onerror=a ONERROR=b>',
			'<img src=x title=t onerror=a title=u ONERROR=b>',
		]) {
			const out = sanitizeRichText(input);
			if (everyAttributeOccurrence(out).some((a) => /^on/.test(a.name)))
				offenders.push(`${input} => ${out}`);
		}
		expect(offenders).toEqual([]);
	});

	// A name the rewriter cannot emit (`=x`), duplicated: removeAttribute twice,
	// then setAttribute('=x', …) THROWS in lol-html. The verdict is "dropped",
	// never a thrown save on user content, never the dangerous duplicate kept.
	test('a duplicated attribute name the rewriter cannot emit is dropped, not thrown on', () => {
		for (const input of ['<a =x=1 =x=2>y</a>', '<a =x=1 =x="javascript:alert(1)">y</a>']) {
			// positive control: the raw input carries the duplicated name
			expect(
				everyAttributeOccurrence(input).filter((a) => a.name === '=x').length,
				`raw ${input}`,
			).toBe(2);
			const out = sanitizeRichText(input);
			const occurrences = everyAttributeOccurrence(out);
			expect(
				occurrences.some((a) => a.name === '=x'),
				out,
			).toBe(false);
			expect(
				occurrences.some((a) => executesAsUrl(a.value)),
				out,
			).toBe(false);
			expect(out).toBe('<a>y</a>');
		}
	});

	// RULE 6, ONE PASS IS NOT ENOUGH (a): an ancestor's end tag implicitly closes
	// an svg/math (`<b><svg></b>`); lol-html stays in FOREIGN content and emits a
	// CDATA section as text, while the output — the root removed by rule 1 —
	// parses as plain HTML: `<![CDATA[ a>` is a bogus comment, the rest is live.
	test('foreign content implicitly closed by an ancestor: the CDATA after it stays inert', () => {
		const offenders: string[] = [];
		const inputs = generatedForeignBreakouts();
		expect(inputs.length).toBeGreaterThanOrEqual(2 * 2 * 8);
		for (const { input, root } of inputs) {
			// positive control: without its foreign root the payload is live — the
			// bytes a single pass emitted
			expect(
				browserViolations(input.replace(`<${root}>`, '')).some((v) =>
					/handler survived|executable URL/.test(v),
				),
				`oracle is blind to: ${input}`,
			).toBe(true);
			const out = sanitizeRichText(input);
			const violations = browserViolations(out);
			if (violations.length > 0) offenders.push(`${input} => ${out}  [${violations.join('; ')}]`);
			if (sanitizeRichText(out) !== out) offenders.push(`not idempotent: ${input} => ${out}`);
		}
		expect(offenders).toEqual([]);
	});

	// RULE 6 (b): a removal SPLICES its neighbours — the text `<` before a
	// removed construct and the text after it meet in the output as a tag no pass
	// ever judged. Every removal kind: rule-1 elements, rule-2 tags, comments.
	test('a removal never splices its neighbours into live markup', () => {
		const offenders: string[] = [];
		const inputs = generatedSplices();
		expect(inputs.length).toBeGreaterThanOrEqual(2 * (sanitizeModule.REMOVE_WITH_CONTENT.size + 9));
		for (const input of inputs) {
			const out = sanitizeRichText(input);
			const violations = browserViolations(out);
			if (violations.length > 0) offenders.push(`${input} => ${out}  [${violations.join('; ')}]`);
			if (sanitizeRichText(out) !== out) offenders.push(`not idempotent: ${input} => ${out}`);
		}
		expect(offenders).toEqual([]);
	});

	test('a NESTED splice, at every depth up to past the pass limit: inert, a fixed point, escaped past the limit', () => {
		const limit = sanitizeModule.SANITIZE_PASS_LIMIT;
		const payload = 'img src=x onerror=alert(1)>';
		for (let depth = 1; depth <= limit + 2; depth++) {
			// each pass removes one comment and splices one more `<` onto what follows
			const input = `${'<'.repeat(depth)}<!---->${'!---->'.repeat(depth - 1)}${payload}`;
			const out = sanitizeRichText(input);
			expect(browserViolations(out), `depth ${depth}: ${out}`).toEqual([]);
			expect(sanitizeRichText(out), `depth ${depth} is a fixed point`).toBe(out);
			// past the limit there is no element at all: the value is visible text
			if (depth > limit) expect(out.includes('<'), `depth ${depth}: ${out}`).toBe(false);
		}
	});
});

/** `<A><root></A>` + a CDATA payload, for formatting and block ancestors and both foreign roots. */
function generatedForeignBreakouts(): Array<{ input: string; root: string }> {
	const out: Array<{ input: string; root: string }> = [];
	const ancestors = ['b', 'i', 'a href=x', 'span', 'div', 'p', 'form', 'em'];
	const payloads = [
		'<![CDATA[ a><img src=x onerror=alert(1)>]]>',
		'<![CDATA[><a href="javascript:alert(1)">y</a>]]>',
	];
	for (const ancestor of ancestors) {
		const name = ancestor.split(' ')[0] as string;
		for (const root of ['svg', 'math']) {
			for (const payload of payloads) {
				out.push({ input: `<${ancestor}><${root}></${name}>X${payload}`, root });
			}
		}
	}
	// a nested foreign child, and two ancestors deep
	out.push({ input: `<i><svg><g></i>${payloads[0]}`, root: 'svg' });
	out.push({ input: `<p><b><math></b>${payloads[0]}`, root: 'math' });
	return out;
}

/** `<` + a removed construct + the rest of a tag, for every removal kind. */
function generatedSplices(): string[] {
	const removed: string[] = [];
	for (const tag of sanitizeModule.REMOVE_WITH_CONTENT) {
		// plaintext never ends: everything after it is its content
		if (tag !== 'plaintext') removed.push(`<${tag}></${tag}>`);
	}
	for (const tag of ['object', 'embed', 'form', 'base', 'meta', 'link', 'applet', 'frame']) {
		removed.push(`<${tag}>`);
	}
	removed.push('<!---->', '<!x>', '<?x>', '</ x>');
	const out: string[] = [];
	for (const construct of removed) {
		out.push(`<${construct}img src=x onerror=alert(1)>`);
		out.push(`<${construct}a href="javascript:alert(1)">y</a>`);
	}
	return out;
}

/** Benign rich text: must come back byte-identical. */
const BENIGN: Readonly<Record<string, string>> = {
	'CKEditor formatting corpus':
		'<p><strong>Bold</strong> <em>italic</em> <u>u</u> <s>s</s></p>' +
		'<h2>Heading</h2><blockquote><p>quote</p></blockquote>' +
		'<ol><li>one</li><li>two</li></ol><ul><li>a</li></ul>' +
		'<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>cell</td></tr></tbody></table>' +
		'<p><a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener">link</a></p>' +
		'<p><img src="/dedalo/media/image/1.5MB/x.jpg" alt="pic" width="100"><br></p>',
	'an attribute that merely mentions a handler': '<a title="x onclick=y" href="ok">t</a>',
	'escaped angle brackets in an epigraphic edition': '<p>IMP CAES&lt;A&gt;R</p>',
	'prose that mentions a scheme and an on-word': '<p>x = "javascript:foo" and the onion=3</p>',
	'an ampersand in a filename': '<a href="R&amp;D.pdf">report</a>',
	'a urn: link': '<a href="urn:isbn:0451450523">book</a>',
	'a doi: link': '<a href="doi:10.1000/182">doi</a>',
	'an ftp: link': '<a href="ftp://example.org/x.txt">ftp</a>',
	'an on-prefixed query parameter': '<a href="/dedalo/x?online=1&amp;onset=2">x</a>',
	'Dédalo index tags':
		'<img id="[index-n-5-]" src="/dedalo/core/component_text_area/tag/?id=[index-n-5-]" class="index" data-type="indexIn" data-tag_id="5" data-state="n" data-label="" data-data="">x<img id="[/index-n-5-]" src="/dedalo/core/component_text_area/tag/?id=[/index-n-5-]" class="index" data-type="indexOut" data-tag_id="5" data-state="n" data-label="" data-data="">',
	'Dédalo page tag paragraph': '<p>[page-n-1-1-data:[1]:data]</p><p>text</p>',
	'Dédalo person tag text': "<p>[person-a-1-JavNa-data:{'section_tipo':'test3'}:data]</p>",
};

describe('sanitizeRichText — benign content comes back byte-identical', () => {
	for (const [name, input] of Object.entries(BENIGN)) {
		test(name, () => {
			expect(sanitizeRichText(input)).toBe(input);
		});
	}
});

describe('sanitizeRichText — idempotent', () => {
	test('s(s(x)) === s(x) over the hostile and benign corpora', () => {
		const inputs = [
			...Object.values(HOSTILE),
			...Object.values(BENIGN),
			...Object.values(ATTRIBUTE_HIDDEN),
			...Object.values(OPEN_AT_EOF),
			...generatedSchemeEvasions(),
			...generatedSchemeVariants(),
			'<p>IMP CAES&lt;A&gt;R</p>',
			'<a title="x onclick=y" href="ok">t</a>',
		];
		for (const input of inputs) {
			const once = sanitizeRichText(input);
			expect(sanitizeRichText(once), input).toBe(once);
		}
	});
});

/**
 * Values whose raw markup is HIDDEN in an attribute value — inert alone, and
 * kept byte-identical (rewriting attribute text is not the sanitizer's job).
 * They turn live only if the bytes BEFORE them leave a context open.
 */
const ATTRIBUTE_HIDDEN: Readonly<Record<string, string>> = {
	'comment close in a title': '<p title="--><img src=x onerror=alert(1)>">y</p>',
	'textarea close in a title': '<p title="</textarea><img src=x onerror=alert(1)>">y</p>',
	'title close in a title': '<p title="</title><img src=x onerror=alert(1)>">y</p>',
	'tag close in a title': '<p title="><img src=x onerror=alert(1)>">y</p>',
	'a tag without its <': 'img src=x onerror=alert(1)>',
};

/** Inputs that leave a construct OPEN at end of input — harmless alone, live once wrapped or joined. */
const OPEN_AT_EOF: Readonly<Record<string, string>> = {
	'unterminated start tag': '<p>ok</p><img src=x onerror=alert(1) ',
	'unterminated quoted attribute': '<p>ok</p><a title="',
	'unterminated comment': '<p>x</p><!--',
	'unterminated textarea': '<p>x</p><textarea>',
	'unterminated title': '<p>x</p><title>',
	'unterminated doctype': '<p>x</p><!DOCTYPE x',
	'unterminated end tag': '<p>x</p ',
	'a raw < as the last byte': 'a<',
	// The sanitizer's own end-of-input probe element, forged: only its per-call
	// nonce tells it from the real one.
	'a forged EOF probe before an open tag':
		'<dedalo-eof-probe data-nonce="x"></dedalo-eof-probe><img src=x onerror=alert(1) ',
};

/** Each pair is LIVE as raw input (positive control) — the sanitized composition must not be. */
const LIVE_COMPOSITIONS: ReadonlyArray<readonly [string, string, string]> = [
	[
		OPEN_AT_EOF['unterminated quoted attribute'] as string,
		ATTRIBUTE_HIDDEN['comment close in a title'] as string,
		'',
	],
	[
		OPEN_AT_EOF['unterminated comment'] as string,
		ATTRIBUTE_HIDDEN['comment close in a title'] as string,
		' | ',
	],
	[
		OPEN_AT_EOF['unterminated textarea'] as string,
		ATTRIBUTE_HIDDEN['textarea close in a title'] as string,
		' | ',
	],
	[
		OPEN_AT_EOF['unterminated title'] as string,
		ATTRIBUTE_HIDDEN['title close in a title'] as string,
		' | ',
	],
	[
		OPEN_AT_EOF['unterminated doctype'] as string,
		ATTRIBUTE_HIDDEN['tag close in a title'] as string,
		' | ',
	],
	[
		OPEN_AT_EOF['a raw < as the last byte'] as string,
		ATTRIBUTE_HIDDEN['a tag without its <'] as string,
		'',
	],
];

describe('sanitizeRichText — the output is context-free (wrapped and joined)', () => {
	// The client does not parse a value on its own: render_escape.js wraps a
	// fallback value as `<mark>${v}</mark>`, and the list/mini/text views join
	// entries with the fields separator before assigning innerHTML.
	const corpus = [
		...Object.values(HOSTILE),
		...Object.values(BENIGN),
		...Object.values(ATTRIBUTE_HIDDEN),
		...Object.values(OPEN_AT_EOF),
	];
	const sanitized = corpus.map((x) => sanitizeRichText(x));

	test('positive control: each listed composition is live when NOT sanitized', () => {
		for (const [x, y, sep] of LIVE_COMPOSITIONS) {
			expect(browserViolations([x, y].join(sep)).length, `${x} ${sep} ${y}`).toBeGreaterThan(0);
		}
		expect(
			browserViolations(`<mark>${OPEN_AT_EOF['unterminated start tag']}</mark>`).length,
		).toBeGreaterThan(0);
	});

	test('the listed compositions are inert once each value is sanitized', () => {
		for (const [x, y, sep] of LIVE_COMPOSITIONS) {
			const joined = [sanitizeRichText(x), sanitizeRichText(y)].join(sep);
			expect(browserViolations(joined), joined).toEqual([]);
		}
	});

	test('<mark>${s(x)}</mark> is inert for every corpus and generated input', () => {
		const offenders: string[] = [];
		for (const x of [
			...corpus,
			...generatedSchemeEvasions(),
			...generatedSchemeVariants(),
			...generatedNamedReferenceSpellings(),
		]) {
			const wrapped = `<mark>${sanitizeRichText(x)}</mark>`;
			if (browserViolations(wrapped).length > 0) offenders.push(`${x} => ${wrapped}`);
		}
		expect(offenders).toEqual([]);
	});

	test('[s(x), s(y)].join(sep) is inert for every corpus pair', () => {
		const offenders: string[] = [];
		for (const sep of ['', ' | ']) {
			for (const sx of sanitized) {
				for (const sy of sanitized) {
					const joined = `${sx}${sep}${sy}`;
					if (browserViolations(joined).length > 0) offenders.push(joined);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test("the hidden-markup values come back byte-identical (inertness is the joiner's job, not a rewrite)", () => {
		for (const y of Object.values(ATTRIBUTE_HIDDEN)) expect(sanitizeRichText(y)).toBe(y);
	});

	test('no comment survives, bogus spellings included (they hide raw markup a later strip revives)', () => {
		for (const input of [
			'a<!-- <img src=x onerror=alert(1)> -->b',
			'a<!x>b',
			'a<?x>b',
			'a</ x>b',
		]) {
			// control: the oracle sees every one of these spellings AS a comment raw
			const rawKinds = oracleNodes(oracleFragment(input, true)).map((node) => node.nodeName);
			expect(rawKinds, `oracle is blind to: ${input}`).toContain('#comment');
			const kinds = oracleNodes(oracleFragment(sanitizeRichText(input), true)).map(
				(node) => node.nodeName,
			);
			expect(kinds, input).not.toContain('#comment');
		}
	});
});

// ════════════════════════════════════════════════════════════════════════════
// RULE 5 IN BOUNDED, VERIFIED PASSES (CLIENT-2, 2026-10-11).
//
// THE DEFECT. `closeAtDataState` found the start of an open tail by probing the
// LAST `<`, then the one before, and so on — one full HTMLRewriter pass over the
// prefix per probe. Every `<` INSIDE the open tail fails its probe, so a value
// ending `<p title="` + n×`<` costs n passes of O(n) each: O(n²) on the text_area
// SAVE path, fed by any client (a 256 KB tail is ~65 G byte-scans).
//
// THE DESIGN under gate. (1) one data-state pass; (2) today's backward walk,
// capped at CLOSE_EXACT_PROBES (16) — so every realistic tail is cut exactly
// where it was; (3) ONE boundary pass (`dataStateBoundaries`: every offset where
// the input provably sits in the data state, markers never inside raw text),
// then at most CLOSE_VERIFY_LIMIT (4) candidates verified from the last; (4) no
// verified candidate → the value is ESCAPED whole (kept as visible text, never
// markup). At most 2 + 16 + 1 + 4 = 23 passes, whatever n is (+2: rule 6's
// fixed-point check of the cut output).
//
// G1 cost (pass count, not time) · G2 safety (independent spec tokenizer) ·
// G3 boundary property · G4 equivalence with the pre-change walk · G5 fallback.
// ════════════════════════════════════════════════════════════════════════════

/**
 * The design's bound: the main sanitize pass + 1 + 16 + 1 + 4 verification
 * passes, + 2 for rule 6's fixed-point iteration over the already-cut output
 * (its rewriter pass and its data-state probe).
 */
const MAX_PASSES = 25;

type SanitizeInternals = {
	closeAtDataState?: (html: string) => string;
	dataStateBoundaries?: (html: string) => number[];
	CLOSE_EXACT_PROBES?: number;
	CLOSE_VERIFY_LIMIT?: number;
};
const internals = sanitizeModule as unknown as SanitizeInternals;

/** A door the gate needs, or a RED naming it (not a TypeError three frames down). */
function door<K extends keyof SanitizeInternals>(name: K): NonNullable<SanitizeInternals[K]> {
	const value = internals[name];
	expect(
		value,
		`html_sanitize.ts does not export \`${String(name)}\` — the bounded rule-5 walk is not in place`,
	).toBeDefined();
	return value as NonNullable<SanitizeInternals[K]>;
}

/** Open tails that each `<` extends without ever closing. */
const TAIL_SHAPES: Readonly<Record<string, (n: number) => string>> = {
	'quoted attribute': (n) => `<p>x</p><p title="${'<'.repeat(n)}`,
	'unquoted attribute': (n) => `<p>x</p><p title=${'<'.repeat(n)}`,
	'open tag of < attribute names': (n) => `<p>x</p><p ${'<'.repeat(n)}`,
	'open comment': (n) => `<p>x</p><!--${'<'.repeat(n)}`,
	'bogus end tag': (n) => `<p>x</p></ ${'<'.repeat(n)}`,
};

/** mulberry32: a seeded PRNG, so a fuzz red is reproducible from its seed. */
function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FUZZ_ALPHABET: readonly string[] = [
	'<',
	'<',
	'<',
	'>',
	'"',
	"'",
	'=',
	'/',
	'!',
	'-',
	'--',
	' ',
	'x',
	'ab',
	'&lt;',
	'&amp;',
	'<p>',
	'</p>',
	'<p ',
	'<p title="',
	"<p title='",
	'<p title=',
	'<a href="',
	'</a>',
	'<!--',
	'-->',
	'<!x',
	'<?',
	'</ ',
	'<!DOCTYPE ',
	'<![CDATA[',
	']]>',
	'<textarea>',
	'</textarea>',
	'<title>',
	'</title>',
	'<script>',
	'</script>',
	'<style>',
	'</style>',
	'<noscript>',
	'<svg>',
	'</svg>',
	'<math><mi>',
	'<select>',
	'<b>',
	'</b>',
	'<br/>',
	'<img src=x ',
	'<img src=x onerror=alert(1)>',
	'onerror=alert(1)',
	'<plaintext>',
	'</div>',
	'<div>',
];

/**
 * The alphabet without foreign-content roots. lol-html's tree-builder simulator
 * leaves ONE foreign level on a breakout tag where the spec pops them all
 * (measured: `<svg><svg>x<p><script>a` — lol-html: data state; a browser: script
 * data), so any lol-html-based closer disagrees with the spec there. Sanitized
 * values never hold svg/math (rule 1), so the closer's DIRECT contract is judged
 * on HTML content; single-level svg/CDATA stays in RAW_TEXT_CASES and the corpus.
 */
const HTML_ONLY_ALPHABET: readonly string[] = FUZZ_ALPHABET.filter((t) => !/<svg|<math/.test(t));

/** `count` seeded random inputs over an alphabet (1–24 tokens each). */
function fuzzInputs(
	seed: number,
	count: number,
	alphabet: readonly string[] = FUZZ_ALPHABET,
): string[] {
	const random = seededRandom(seed);
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const length = 1 + Math.floor(random() * 24);
		let s = '';
		for (let j = 0; j < length; j++) {
			s += alphabet[Math.floor(random() * alphabet.length)] as string;
		}
		out.push(s);
	}
	return out;
}

const FUZZ_SEED = 20261011;

/** The named corpora of this file (the "60 cases"). */
function namedCorpus(): string[] {
	return [
		...Object.values(HOSTILE),
		...Object.values(BENIGN),
		...Object.values(ATTRIBUTE_HIDDEN),
		...Object.values(OPEN_AT_EOF),
	];
}

/** Realistic tails (≤ 16 `<`) behind content a cut must not drop silently. */
const REALISTIC_TAILS: readonly string[] = [
	'<p>x</p><!--a--><p title="',
	'<p>x</p></div><img src=x ',
	'<p>x</p><!--a--></span><a title="<b>',
	'<p>x</p>tail text<p title="a<b<c',
	'<p>x</p><br><img src=x onerror=alert(1) ',
	`<p>x</p><p title="${'<'.repeat(16)}`,
	`<p>x</p><p title="${'<'.repeat(15)}`,
];

/** Raw-text content: a boundary inside one would cut in the middle of its text. */
const RAW_TEXT_CASES: readonly string[] = [
	`<p>a</p><textarea>${'b<'.repeat(100)}`,
	`<p>a</p><script>${'b<'.repeat(100)}`,
	`<p>a</p><title>${'b<'.repeat(100)}`,
	`<p>a</p><plaintext>${'b<'.repeat(100)}`,
	`<p>a</p><style>${'b<'.repeat(100)}</style>c<p title="`,
	'<p>a</p><svg><![CDATA[x>y<z]]></svg>b<p title="',
	`<p>a</p><svg><![CDATA[x>y${'<'.repeat(20)}`,
];

/**
 * THE PRE-CHANGE WALK — a verbatim copy of `endsInDataState` + `closeAtDataState`
 * as they stood before the bounded walk, returning the cut too. G4's reference.
 */
function referenceEndsInDataState(html: string): boolean {
	const nonce = crypto.randomUUID();
	let seen = false;
	new HTMLRewriter()
		.on('*', {
			element(element) {
				if (
					element.tagName === 'dedalo-eof-probe' &&
					element.getAttribute('data-nonce') === nonce
				) {
					seen = true;
				}
			},
		})
		.transform(`${html}<dedalo-eof-probe data-nonce="${nonce}">`);
	return seen;
}
function referenceClose(html: string): { out: string; cut: number } {
	let out = html;
	let cut = html.length;
	if (!referenceEndsInDataState(out)) {
		cut = out.lastIndexOf('<');
		while (cut > 0 && !referenceEndsInDataState(out.slice(0, cut))) {
			cut = out.lastIndexOf('<', cut - 1);
		}
		cut = Math.max(cut, 0);
		out = out.slice(0, cut);
	}
	return { out: out.endsWith('<') ? `${out.slice(0, -1)}&lt;` : out, cut };
}

const countLt = (s: string): number => s.split('<').length - 1;

// ── G1: the pass count does not grow with the tail ──────────────────────────

/** The global the sanitizer resolves at call time (`new HTMLRewriter()`), typed for the swap. */
const rewriterGlobal = globalThis as unknown as { HTMLRewriter: typeof HTMLRewriter };
const RealHTMLRewriter = rewriterGlobal.HTMLRewriter;
afterEach(() => {
	rewriterGlobal.HTMLRewriter = RealHTMLRewriter;
});

/**
 * Run `fn` with every HTMLRewriter pass counted. Above `cap` passes the run is
 * ABORTED (Infinity) — the O(n²) walk at n = 256K would otherwise not end inside
 * any test timeout, which is the finding, not a hang to wait out.
 */
function countPasses(fn: () => string, cap: number): { passes: number; out: string | null } {
	let passes = 0;
	const real = RealHTMLRewriter.prototype.transform;
	class CountingRewriter extends RealHTMLRewriter {}
	Object.defineProperty(CountingRewriter.prototype, 'transform', {
		value(this: HTMLRewriter, ...args: unknown[]) {
			passes++;
			if (passes > cap) throw new Error(`pass cap ${cap} exceeded`);
			return (real as (...a: unknown[]) => unknown).apply(this, args);
		},
	});
	rewriterGlobal.HTMLRewriter = CountingRewriter;
	try {
		const out = fn();
		return { passes, out };
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('pass cap')) {
			return { passes: Number.POSITIVE_INFINITY, out: null };
		}
		throw error;
	} finally {
		rewriterGlobal.HTMLRewriter = RealHTMLRewriter;
	}
}

describe('G1 — rule 5 costs a bounded number of passes, whatever the open tail holds', () => {
	for (const [shape, build] of Object.entries(TAIL_SHAPES)) {
		test(shape, () => {
			const small = countPasses(() => sanitizeRichText(build(1024)), 4096);
			const large = countPasses(() => sanitizeRichText(build(256 * 1024)), 64);
			expect(
				small.passes,
				`${shape}: ${small.passes} HTMLRewriter passes for a 1K-'<' tail (bound ${MAX_PASSES}) — the walk probes one pass per '<'`,
			).toBeLessThanOrEqual(MAX_PASSES);
			expect(
				large.passes,
				`${shape}: the 256K tail took ${large.passes} passes vs ${small.passes} for 1K — the cost grows with n`,
			).toBe(small.passes);
			expect(small.out?.startsWith('<p>x</p>'), `${shape}: content before the tail is kept`).toBe(
				true,
			);
			expect(large.out?.startsWith('<p>x</p>'), `${shape}: content before the tail is kept`).toBe(
				true,
			);
		});
	}
});

// ── G2: every output ends in the data state (independent spec tokenizer) ─────

describe('G2 — every sanitized value ends in the data state (parse5 tokenizer oracle)', () => {
	const probe = (inputs: readonly string[]): string[] => {
		const offenders: string[] = [];
		for (const input of inputs) {
			const out = sanitizeRichText(input);
			if (!endsInDataState(out))
				offenders.push(`${JSON.stringify(input)} => ${JSON.stringify(out)}`);
		}
		return offenders;
	};

	test('positive control: the oracle convicts every open-at-EOF value and the raw-text cases', () => {
		for (const input of [
			...Object.values(OPEN_AT_EOF).filter((x) => x !== 'a<'),
			...RAW_TEXT_CASES,
		]) {
			expect(endsInDataState(input), input).toBe(false);
		}
		expect(endsInDataState('<p>x</p>')).toBe(true);
	});

	test('the named corpus, the realistic tails and the raw-text cases', () => {
		expect(probe([...namedCorpus(), ...REALISTIC_TAILS, ...RAW_TEXT_CASES])).toEqual([]);
	});

	test('the open-tail shapes beyond the exact walk (17, 64 and 300 `<`)', () => {
		const inputs: string[] = [];
		for (const build of Object.values(TAIL_SHAPES))
			for (const n of [17, 64, 300]) inputs.push(build(n));
		expect(probe(inputs)).toEqual([]);
	});

	test(`a seeded fuzz of 5,000 values (seed ${FUZZ_SEED})`, () => {
		expect(probe(fuzzInputs(FUZZ_SEED, 5000))).toEqual([]);
	});

	// The sanitizer's main pass removes every raw-text element (rule 1), so a
	// closer that cut INSIDE raw text could never be seen through
	// sanitizeRichText. The closer is a contract of its own: judged directly on
	// UNSANITIZED inputs too — raw text, CDATA, long tails.
	test('closeAtDataState alone, on unsanitized inputs (raw text, CDATA, tails beyond the exact walk, fuzz)', () => {
		const close = door('closeAtDataState');
		const offenders: string[] = [];
		for (const input of [
			...namedCorpus(),
			...RAW_TEXT_CASES,
			...REALISTIC_TAILS,
			...Object.values(TAIL_SHAPES).flatMap((build) => [build(17), build(64)]),
			...fuzzInputs(FUZZ_SEED + 3, 3000, HTML_ONLY_ALPHABET),
		]) {
			const out = close(input);
			if (!endsInDataState(out))
				offenders.push(`${JSON.stringify(input)} => ${JSON.stringify(out)}`);
		}
		expect(offenders).toEqual([]);
	});
});

// ── G3: every boundary is a data-state offset ───────────────────────────────

describe('G3 — dataStateBoundaries: ascending from 0, and every prefix it names ends in the data state', () => {
	test('over the corpus, the raw-text cases, the tails and a seeded fuzz', () => {
		const boundaries = door('dataStateBoundaries');
		const offenders: string[] = [];
		const inputs = [
			...namedCorpus(),
			...RAW_TEXT_CASES,
			...REALISTIC_TAILS,
			...Object.values(TAIL_SHAPES).map((build) => build(40)),
			...fuzzInputs(FUZZ_SEED + 1, 1500),
		];
		let nonEmpty = 0;
		for (const html of inputs) {
			const list = boundaries(html);
			if (list.length === 0) continue; // the escape fallback's signal — G5's business
			nonEmpty++;
			if (list[0] !== 0)
				offenders.push(`${JSON.stringify(html)}: first boundary ${list[0]}, not 0`);
			for (let i = 0; i < list.length; i++) {
				const b = list[i] as number;
				if (i > 0 && b < (list[i - 1] as number))
					offenders.push(`${JSON.stringify(html)}: not ascending at ${i}`);
				if (b < 0 || b > html.length || !endsInDataState(html.slice(0, b))) {
					offenders.push(
						`${JSON.stringify(html)}: boundary ${b} is not a data-state offset (${JSON.stringify(html.slice(Math.max(0, b - 24), b))}|)`,
					);
				}
			}
		}
		// anti-vacuity: a function answering [] for everything would pass the loop
		expect(nonEmpty, 'boundaries were computed for (almost) every input').toBeGreaterThan(
			inputs.length * 0.9,
		);
		expect(offenders).toEqual([]);
	});

	test('raw text gets NO boundary inside it: the last boundary sits before the raw-text start tag', () => {
		const boundaries = door('dataStateBoundaries');
		for (const tag of ['textarea', 'script', 'title', 'plaintext']) {
			const html = `<p>a</p><${tag}>${'b<'.repeat(100)}`;
			const list = boundaries(html);
			expect(list.length, tag).toBeGreaterThan(0);
			expect(Math.max(...list), `${tag}: a boundary inside the raw text`).toBeLessThanOrEqual(
				html.indexOf(`<${tag}>`),
			);
		}
	});
});

// ── G4: equivalence with the pre-change walk ────────────────────────────────

describe('G4 — the bounded walk cuts where the old walk did, or drops only invisible markup', () => {
	test('identical for every tail of ≤ 16 `<`; otherwise a prefix (or the escape) whose dropped part has no text and no element', () => {
		const close = door('closeAtDataState');
		const inputs = [
			...namedCorpus(),
			...REALISTIC_TAILS,
			...RAW_TEXT_CASES,
			...Object.values(TAIL_SHAPES).flatMap((build) => [build(3), build(16), build(17), build(40)]),
			`<p>x</p><!--a--><p title="${'<'.repeat(30)}`,
			`<p>x</p></div><!DOCTYPE x><p title="${'<'.repeat(30)}`,
			...fuzzInputs(FUZZ_SEED + 2, 3000),
		];
		const offenders: string[] = [];
		let identityCases = 0;
		let boundedCases = 0;
		for (const html of inputs) {
			const reference = referenceClose(html);
			const got = close(html);
			if (countLt(html.slice(reference.cut)) <= 16) {
				identityCases++;
				if (got !== reference.out) {
					offenders.push(
						`identity: ${JSON.stringify(html)} => ${JSON.stringify(got)}, old walk ${JSON.stringify(reference.out)}`,
					);
				}
				continue;
			}
			boundedCases++;
			if (got === escapeHtml(html)) continue;
			const unescapeLast = (s: string): string => (s.endsWith('&lt;') ? `${s.slice(0, -4)}<` : s);
			const a = unescapeLast(got);
			const b = unescapeLast(reference.out);
			if (!b.startsWith(a)) {
				offenders.push(
					`prefix: ${JSON.stringify(html)} => ${JSON.stringify(got)} is not a prefix of ${JSON.stringify(reference.out)}`,
				);
				continue;
			}
			const dropped = b.slice(a.length);
			const visible = oracleTokens(dropped).filter((t) => t.kind === 'char' || t.kind === 'start');
			if (visible.length > 0) {
				offenders.push(`dropped content: ${JSON.stringify(html)} lost ${JSON.stringify(dropped)}`);
			}
		}
		expect(identityCases, 'the identity half is exercised').toBeGreaterThan(100);
		expect(boundedCases, 'the bounded half is exercised').toBeGreaterThan(10);
		expect(offenders).toEqual([]);
	});
});

// ── G6: the verification cap — a wrong boundary list costs ≤ CLOSE_VERIFY_LIMIT passes ──

describe('G6 — boundedCut verifies at most CLOSE_VERIFY_LIMIT candidates, then gives up', () => {
	test('candidates that ALL fail verification: ≤ CLOSE_VERIFY_LIMIT passes, and null (→ the escape)', () => {
		// The boundary pass never proposes a failing offset in practice (G3), so
		// the cap is unreachable through sanitizeRichText: it is gated HERE, with a
		// boundary list handed in. Every candidate sits INSIDE an open attribute
		// value — not the data state — so each verification fails.
		const limit = door('CLOSE_VERIFY_LIMIT');
		const boundedCut = sanitizeModule.boundedCut;
		const head = '<p title="';
		const html = `${head}${'x'.repeat(200)}`;
		const candidates = Array.from({ length: 40 }, (_, i) => head.length + 1 + i * 4);
		// positive control: the parse5 oracle agrees no candidate is in the data state
		for (const offset of candidates) {
			expect(endsInDataState(html.slice(0, offset)), `offset ${offset}`).toBe(false);
		}
		let result: string | null = 'unset';
		const counted = countPasses(() => {
			result = boundedCut(html, candidates);
			return '';
		}, 4096);
		expect(counted.passes).toBeLessThanOrEqual(limit);
		expect(counted.passes, 'it did verify (anti-vacuity)').toBeGreaterThan(0);
		expect(result).toBeNull();
	});

	test('a VALID candidate beyond the cap is not reached: the cap holds even when giving up costs a correct cut', () => {
		// offset 0 verifies; 40 failing ones are tried first (from the last).
		// Unbounded, the walk would reach 0 and return '' after 41 passes.
		const limit = door('CLOSE_VERIFY_LIMIT');
		const head = '<p title="';
		const html = `${head}${'x'.repeat(200)}`;
		const candidates = [0, ...Array.from({ length: 40 }, (_, i) => head.length + 1 + i * 4)];
		let result: string | null = 'unset';
		const counted = countPasses(() => {
			result = sanitizeModule.boundedCut(html, candidates);
			return '';
		}, 4096);
		expect(counted.passes).toBeLessThanOrEqual(limit);
		expect(result).toBeNull();
		// positive control: within the cap, the first verified candidate IS the cut
		expect(sanitizeModule.boundedCut(html, [0, head.length + 1])).toBe('');
	});
});

// ── G5: no verified boundary → the value is escaped, never dropped ──────────

describe('G5 — without a verified boundary the value is ESCAPED whole', () => {
	test('a value the boundary pass cannot reproduce byte for byte (lone surrogate) with a long open tail', () => {
		const close = door('closeAtDataState');
		const boundaries = door('dataStateBoundaries');
		// HTMLRewriter re-encodes a lone surrogate as U+FFFD, so the marked output
		// minus its markers is NOT the input: the boundary pass must refuse ([])
		// rather than hand back offsets into a different string.
		const html = `\uD800<p>x</p><p title="${'<'.repeat(40)}`;
		expect(boundaries(html), 'precondition: no boundaries for an input the pass rewrote').toEqual(
			[],
		);
		expect(close(html)).toBe(escapeHtml(html));
	});
});
