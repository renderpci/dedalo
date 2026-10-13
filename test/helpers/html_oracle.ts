/**
 * THE BROWSER-EYE ORACLE for any HTML the engine emits for innerHTML.
 *
 * A gate that asserts on an output STRING (`not.toMatch(/onerror/)`) shares the
 * regex view of HTML that the defect had: a payload a regex cannot see passes
 * both. This oracle judges a string the way a browser does — it parses it with a
 * spec HTML parser (cheerio over parse5, independent of the engine's own
 * sanitizer, which is built on Bun's HTMLRewriter) and walks every element, so
 * `<img/onerror>`, a handler glued to a quote, a character-referenced
 * `&#106;avascript:` and an RCDATA/noscript mutation are judged by what they
 * BECOME, not by how they are spelt.
 *
 * The noscript round trip (parse with scripting OFF, serialise, re-parse with
 * scripting ON) is the mutation-XSS route: a DOM that is cleaned in one parsing
 * mode and rendered in the other.
 *
 * Users: test/unit/html_sanitize.test.ts, test/unit/tool_pdf_extractor.test.ts.
 * The TOKENIZER half (`oracleTokens`, `endsInDataState`, at the end of this
 * file) judges rule 5 — where a value's bytes leave the tokenizer.
 */

import * as cheerio from 'cheerio';

/**
 * A URL a browser would EXECUTE, judged on the PARSER-DECODED attribute value
 * (cheerio hands attribs back with character references already resolved).
 * WHATWG URL: leading C0-control-or-space is stripped, ASCII tab/LF/CR are
 * removed anywhere, the scheme is ASCII case-insensitive. The denylist is the
 * sanitizer's contract (javascript:, vbscript:, data:text/html,
 * data:application/) — written here from the spec, not from its code.
 */
export function executesAsUrl(decoded: string): boolean {
	const normalized = decoded
		.replace(/[\t\n\r]/g, '')
		// biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips leading C0 controls — that IS the rule being modelled
		.replace(/^[\u0000- ]+/, '')
		.toLowerCase();
	return (
		normalized.startsWith('javascript:') ||
		normalized.startsWith('vbscript:') ||
		normalized.startsWith('data:text/html') ||
		normalized.startsWith('data:application/')
	);
}

/** Elements whose very presence is a defect: they execute, embed, or re-parse their content. */
export const LIVE_CONTAINERS: ReadonlySet<string> = new Set([
	'script',
	'style',
	'iframe',
	'noscript',
	'noembed',
	'noframes',
	'xmp',
	'plaintext',
	'template',
	'svg',
	'math',
	'object',
	'embed',
	'form',
	'base',
	'meta',
	'link',
	'applet',
	'frame',
	'frameset',
]);

interface OracleElement {
	tagName?: string;
	attribs?: Record<string, string>;
}

/** Every violation a spec parser finds in `html`, parsed (as a fragment) in one scripting mode. */
export function violationsIn(html: string, scriptingEnabled: boolean): string[] {
	const $ = cheerio.load(html, { scriptingEnabled } as cheerio.CheerioOptions, false);
	const found: string[] = [];
	$('*').each((_, node) => {
		const el = node as unknown as OracleElement;
		const tag = (el.tagName ?? '').toLowerCase();
		if (LIVE_CONTAINERS.has(tag)) found.push(`<${tag}> element survived`);
		for (const [name, value] of Object.entries(el.attribs ?? {})) {
			if (/^on/i.test(name)) found.push(`<${tag} ${name}="${value}"> handler survived`);
			else if (executesAsUrl(value)) found.push(`<${tag} ${name}="${value}"> executable URL`);
		}
	});
	return found;
}

/**
 * The browser verdict on a string bound for innerHTML: parsed as a browser does
 * (scripting ON), AND through the mutation route — parsed with scripting OFF,
 * serialised, re-parsed with scripting ON. Empty = nothing live.
 */
export function browserViolations(html: string): string[] {
	const direct = violationsIn(html, true);
	const roundTrip = cheerio
		.load(html, { scriptingEnabled: false } as cheerio.CheerioOptions, false)
		.html();
	const mutated = violationsIn(roundTrip, true).map((v) => `[noscript round trip] ${v}`);
	return [...direct, ...mutated];
}

// ── THE TOKENIZER HALF (CLIENT-2 cost/closure gates, 2026-10-11) ──────────────
//
// Rule 5 of the sanitizer ("the output ends in the DATA state") is a TOKENIZER
// property, not a tree property: a tree builder can veto where an element lands
// (in-select parsing drops a `<b>`), but whether the bytes AFTER a value open a
// tag of their own is decided by the tokenizer state at the value's last byte.
// So the data-state oracle drives parse5's spec Tokenizer directly — independent
// of the code under test (lol-html via Bun's HTMLRewriter) — and applies the
// spec's state switches itself: the in-body start-tag rules (RCDATA for title /
// textarea, RAWTEXT for style / xmp / iframe / noembed / noframes / noscript
// with scripting ON, SCRIPT_DATA for script, PLAINTEXT for plaintext) in HTML
// content only, and `inForeignNode` (CDATA sections are real only there) inside
// svg / math outside their HTML integration points.

// parse5 and htmlparser2 are DECLARED devDependencies (package.json), never borrowed
// through cheerio's transitive tree: the version every security case is judged by is
// explicit and Dependabot-tracked. htmlparser2 gives the LAST-WINS view below.
import { Parser as Htmlparser2Parser } from 'htmlparser2';
import { Tokenizer, TokenizerMode } from 'parse5';

/** One token as the spec tokenizer emits it. */
export interface OracleToken {
	kind: 'start' | 'end' | 'char' | 'comment' | 'doctype' | 'eof';
	name?: string;
	attrs?: ReadonlyArray<{ name: string; value: string }>;
	chars?: string;
}

const RCDATA_TAGS: ReadonlySet<string> = new Set(['title', 'textarea']);
const RAWTEXT_TAGS: ReadonlySet<string> = new Set([
	'style',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'noscript',
]);
/** HTML integration points (svg) and MathML text integration points: HTML content inside. */
const SVG_HTML_POINTS: ReadonlySet<string> = new Set(['foreignobject', 'desc', 'title']);
const MATH_TEXT_POINTS: ReadonlySet<string> = new Set(['mi', 'mo', 'mn', 'ms', 'mtext']);
/** Start tags that break out of foreign content back to HTML (spec "in foreign content"). */
const FOREIGN_BREAKOUT: ReadonlySet<string> = new Set(
	(
		'b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img ' +
		'li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var'
	).split(' '),
);

/**
 * Tokenize `html` with parse5's spec Tokenizer, applying the content-model
 * switches a tree builder would (see the section header). Tokens are coalesced
 * per kind; character tokens of every flavour (whitespace, NUL) are 'char'.
 */
export function oracleTokens(html: string): OracleToken[] {
	const tokens: OracleToken[] = [];
	// open foreign elements and integration points; HTML elements are not tracked
	// (they never change the tokenizer's content model on their own)
	const foreign: { name: string; ns: 'svg' | 'math'; htmlInside: boolean }[] = [];
	const inForeign = (): boolean => {
		const top = foreign[foreign.length - 1];
		return top !== undefined && !top.htmlInside;
	};
	const pushChar = (chars: string): void => {
		const last = tokens[tokens.length - 1];
		if (last?.kind === 'char') last.chars = `${last.chars ?? ''}${chars}`;
		else tokens.push({ kind: 'char', chars });
	};
	const tokenizer: Tokenizer = new Tokenizer(
		{},
		{
			onStartTag(token) {
				const name = token.tagName.toLowerCase();
				tokens.push({
					kind: 'start',
					name,
					attrs: token.attrs.map((a) => ({ name: a.name, value: a.value })),
				});
				if (inForeign()) {
					if (FOREIGN_BREAKOUT.has(name)) {
						while (inForeign()) foreign.pop();
						tokenizer.inForeignNode = inForeign();
					} else {
						const ns = (foreign[foreign.length - 1] as { ns: 'svg' | 'math' }).ns;
						if (!token.selfClosing) {
							foreign.push({
								name,
								ns,
								htmlInside: ns === 'svg' ? SVG_HTML_POINTS.has(name) : MATH_TEXT_POINTS.has(name),
							});
						}
						tokenizer.inForeignNode = inForeign();
						return;
					}
				}
				if (name === 'svg' || name === 'math') {
					if (!token.selfClosing) foreign.push({ name, ns: name, htmlInside: false });
					tokenizer.inForeignNode = inForeign();
					return;
				}
				if (RCDATA_TAGS.has(name)) tokenizer.state = TokenizerMode.RCDATA;
				else if (RAWTEXT_TAGS.has(name)) tokenizer.state = TokenizerMode.RAWTEXT;
				else if (name === 'script') tokenizer.state = TokenizerMode.SCRIPT_DATA;
				else if (name === 'plaintext') tokenizer.state = TokenizerMode.PLAINTEXT;
			},
			onEndTag(token) {
				const name = token.tagName.toLowerCase();
				tokens.push({ kind: 'end', name });
				// `</p>` and `</br>` break out of foreign content as their start tags do
				if (inForeign() && (name === 'p' || name === 'br')) {
					while (inForeign()) foreign.pop();
					tokenizer.inForeignNode = inForeign();
					return;
				}
				for (let i = foreign.length - 1; i >= 0; i--) {
					if ((foreign[i] as { name: string }).name === name) {
						foreign.length = i;
						break;
					}
				}
				tokenizer.inForeignNode = inForeign();
			},
			onComment() {
				tokens.push({ kind: 'comment' });
			},
			onDoctype() {
				tokens.push({ kind: 'doctype' });
			},
			onEof() {
				tokens.push({ kind: 'eof' });
			},
			onCharacter(token) {
				pushChar(token.chars);
			},
			onNullCharacter(token) {
				pushChar(token.chars);
			},
			onWhitespaceCharacter(token) {
				pushChar(token.chars);
			},
		},
	);
	tokenizer.write(html, true);
	return tokens;
}

/**
 * True when `html` ends in the tokenizer's DATA state: an element appended after
 * it — `<b data-oracle-probe="…">z</b>`, with a per-call nonce the content
 * cannot forge — tokenizes as exactly that element: a start tag, the text `z`,
 * an end tag. Inside an open tag, attribute value, comment, doctype, CDATA
 * section or raw-text element the probe is swallowed instead. A raw `<` as the
 * last byte counts as the data state here (it is data `<` before the probe's own
 * `<`); the sanitizer escapes it because it would GLUE to a following tag name.
 */
export function endsInDataState(html: string): boolean {
	const nonce = crypto.randomUUID();
	const tokens = oracleTokens(`${html}<b data-oracle-probe="${nonce}">z</b>`).filter(
		(t) => t.kind !== 'eof',
	);
	const [start, text, end] = tokens.slice(-3);
	return (
		start?.kind === 'start' &&
		start.name === 'b' &&
		start.attrs?.some((a) => a.name === 'data-oracle-probe' && a.value === nonce) === true &&
		text?.kind === 'char' &&
		text.chars === 'z' &&
		end?.kind === 'end' &&
		end.name === 'b'
	);
}

// ── THE TEXT-STATE TAGS AND THE LAST-WINS VIEW (CLIENT-2 review, 2026-10-11) ──

/**
 * Every tag whose start tag the SPEC's in-body rules switch the tokenizer into a
 * text state for (RCDATA, RAWTEXT with scripting ON, script data, PLAINTEXT) —
 * written from the spec, not from the sanitizer's sets. A tokenizer without a
 * tree builder (lol-html) switches on these by NAME; a browser's tree builder
 * can veto the switch by context (in-select ignores most of them), so each one
 * is a place where the two disagree about what is markup.
 */
export const TEXT_STATE_TAGS: ReadonlySet<string> = new Set([
	...RCDATA_TAGS,
	...RAWTEXT_TAGS,
	'script',
	'plaintext',
]);

/**
 * Every attribute OCCURRENCE in `html`, duplicates included, values decoded —
 * the view of a consumer that does NOT drop a duplicated name the way a browser
 * (and parse5) does: htmlparser2's event parser reports each one, so a
 * last-wins reader (an export re-serialiser, bs4's default) sees exactly this
 * list. A browser-eye oracle cannot judge rule 3's duplicate half: parse5 keeps
 * the first occurrence and the rest never reach it.
 */
export function everyAttributeOccurrence(
	html: string,
): Array<{ tag: string; name: string; value: string }> {
	const found: Array<{ tag: string; name: string; value: string }> = [];
	let pending: Array<{ name: string; value: string }> = [];
	const parser = new Htmlparser2Parser(
		{
			onattribute(name, value) {
				pending.push({ name: name.toLowerCase(), value });
			},
			onopentag(tag) {
				for (const a of pending) found.push({ tag: tag.toLowerCase(), ...a });
				pending = [];
			},
		},
		{ decodeEntities: true, lowerCaseAttributeNames: true },
	);
	parser.write(html);
	parser.end();
	return found;
}
