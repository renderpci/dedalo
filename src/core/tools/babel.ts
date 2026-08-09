/**
 * THE BABEL (Apertium) TRANSLATION ADAPTER — twin of the PHP
 * `tools/tool_lang/translators/class.babel.php` + `TR::addBabelTagsOnTheFly`
 * (shared/class.TR.php:445-469).
 *
 * Why this is a module of its own and not three lines inside a fetch call: a
 * Dédalo text value is NOT prose. It carries the marks that bind a transcription
 * to its recording — `[TC_00:01:25.627_TC]` timecodes, `[index-…]` pairs,
 * `[person-…]`, `[note-…]`, `[reference-…]`, `[svg|geo|page-…]` — and a machine
 * translator will happily rewrite, reorder or "translate" the text inside them.
 * A mangled timecode does not look broken; it looks like a transcription that no
 * longer lines up with the audio, which is the most expensive kind of damage an
 * oral-history archive can take. So the marks are wrapped in
 * `<apertium-notrans>` before the text leaves the building, and unwrapped on the
 * way back.
 *
 * The PHP pipeline, in order (class.babel.php:79-159), reproduced here exactly:
 *   1. wrap every protected mark in `<apertium-notrans>` and `trim()`;
 *   2. POST {key, text, direction};
 *   3. screen the RAW body for the known provider-error strings — on a hit the
 *      call FAILS; the body is never a translation;
 *   4. `html_entity_decode($result, ENT_COMPAT, 'UTF-8')` — Babel returns the
 *      special characters entity-encoded;
 *   5. `strip_tags($result, '<p><br><strong><em>')` — removes the residual
 *      `<apertium-notrans>` wrappers (and anything else the engine invented),
 *      restoring the protected marks byte-for-byte.
 *
 * Steps 1, 3, 4 and 5 were ALL missing from the TS port (audit 2026-08 §5.6):
 * the raw body — including `Error: Mode …` — was written straight over the
 * target-language slot and reported as a success. Gate:
 * `test/unit/translation_pipeline_native.test.ts`.
 */

import {
	INDEX_IN_PATTERN,
	INDEX_OUT_PATTERN,
	NOTE_PATTERN,
	TC_PATTERN,
} from '../resolve/tr_marks.ts';

// ---------------------------------------------------------------------------
// 1. Mark protection (PHP TR::addBabelTagsOnTheFly)
// ---------------------------------------------------------------------------

/**
 * The mark families `tr_marks.ts` does not export yet — byte-ports of the same
 * `TR::get_mark_pattern` branches its private DELETE_PATTERNS list carries
 * (class.TR.php:136-196). They live here rather than being re-derived per call
 * site; when `tr_marks.ts` exports them, delete these four and import instead
 * (they must stay ONE grammar).
 */
const SVG_PATTERN = /\[(svg)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\]/g;
const GEO_PATTERN = /\[(geo)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\]/g;
const PAGE_PATTERN = /\[(page)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]/g;
const PERSON_PATTERN = /\[(person)-([a-z])-([0-9]{0,6})-([^-]{0,22})-data:(.*?):data\]/g;
/** reference, open AND close in one pattern — exactly PHP's 'reference' branch. */
const REFERENCE_PATTERN =
	/\[\/{0,1}(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\]/g;

/**
 * The protected families, in PHP's declaration order (class.TR.php:447-457):
 * indexIn, indexOut, tc, svg, geo, page, person, note, reference.
 *
 * `lang` and `draw` marks are deliberately ABSENT — PHP does not protect them
 * either, and adding a family here silently changes what an installed Apertium
 * box receives. Any change to this list is a wire change (WC entry), not a tidy-up.
 */
const BABEL_PROTECTED_PATTERNS: readonly RegExp[] = [
	INDEX_IN_PATTERN,
	INDEX_OUT_PATTERN,
	TC_PATTERN,
	SVG_PATTERN,
	GEO_PATTERN,
	PAGE_PATTERN,
	PERSON_PATTERN,
	NOTE_PATTERN,
	REFERENCE_PATTERN,
];

/**
 * Wrap every Dédalo mark in `<apertium-notrans>` so the engine leaves it alone
 * (PHP TR::addBabelTagsOnTheFly). Prose is untouched.
 */
export function addBabelNotransTags(text: string): string {
	let out = text;
	for (const pattern of BABEL_PROTECTED_PATTERNS) {
		// PHP: preg_replace($pattern, '<apertium-notrans>$0</apertium-notrans>').
		// `String.replace` with a /g regex resets lastIndex itself, so sharing the
		// module-level patterns with tr_marks.ts carries no state between calls.
		out = out.replace(pattern, '<apertium-notrans>$&</apertium-notrans>');
	}
	return out;
}

// ---------------------------------------------------------------------------
// 3. The provider-error screen (PHP class.babel.php:134-140)
// ---------------------------------------------------------------------------

/**
 * Babel answers a plain-text error with HTTP 200. These substrings, anywhere in
 * the body, mean the response is an ERROR — never a translation. PHP's list,
 * verbatim; `Sorry. Quota exceeded` is screened one layer up (tool_lang's own
 * check, ported in translation.ts::translateItems).
 */
export const BABEL_INVALID_RESPONSES: readonly string[] = [
	'Error: Mode',
	'Error. You need authorization',
];

/**
 * The provider error carried by a raw body, or null when the body is a
 * translation. PHP builds `'Trigger Error: [translate] '.$result`; the caller
 * truncates it (tool_lang:270).
 */
export function babelErrorIn(rawResult: string): string | null {
	for (const marker of BABEL_INVALID_RESPONSES) {
		if (rawResult.includes(marker)) return `Trigger Error: [translate] ${rawResult}`;
	}
	return null;
}

// ---------------------------------------------------------------------------
// 4. html_entity_decode(ENT_COMPAT, 'UTF-8') — PHP's HTML 4.01 table
// ---------------------------------------------------------------------------

/**
 * The HTML 4.01 named-entity table PHP decodes against (Latin-1 + special +
 * symbol blocks). Stored as one compact `name:codepoint` string so the table
 * reads as DATA, not as 250 lines of code.
 *
 * `&apos;` is absent ON PURPOSE: HTML 4.01 never defined it, so PHP leaves it
 * literal — and so do we.
 */
const HTML401_ENTITIES_SOURCE =
	'quot:34,amp:38,lt:60,gt:62,' +
	'nbsp:160,iexcl:161,cent:162,pound:163,curren:164,yen:165,brvbar:166,sect:167,uml:168,' +
	'copy:169,ordf:170,laquo:171,not:172,shy:173,reg:174,macr:175,deg:176,plusmn:177,sup2:178,' +
	'sup3:179,acute:180,micro:181,para:182,middot:183,cedil:184,sup1:185,ordm:186,raquo:187,' +
	'frac14:188,frac12:189,frac34:190,iquest:191,Agrave:192,Aacute:193,Acirc:194,Atilde:195,' +
	'Auml:196,Aring:197,AElig:198,Ccedil:199,Egrave:200,Eacute:201,Ecirc:202,Euml:203,Igrave:204,' +
	'Iacute:205,Icirc:206,Iuml:207,ETH:208,Ntilde:209,Ograve:210,Oacute:211,Ocirc:212,Otilde:213,' +
	'Ouml:214,times:215,Oslash:216,Ugrave:217,Uacute:218,Ucirc:219,Uuml:220,Yacute:221,THORN:222,' +
	'szlig:223,agrave:224,aacute:225,acirc:226,atilde:227,auml:228,aring:229,aelig:230,ccedil:231,' +
	'egrave:232,eacute:233,ecirc:234,euml:235,igrave:236,iacute:237,icirc:238,iuml:239,eth:240,' +
	'ntilde:241,ograve:242,oacute:243,ocirc:244,otilde:245,ouml:246,divide:247,oslash:248,' +
	'ugrave:249,uacute:250,ucirc:251,uuml:252,yacute:253,thorn:254,yuml:255,' +
	'OElig:338,oelig:339,Scaron:352,scaron:353,Yuml:376,fnof:402,circ:710,tilde:732,' +
	'Alpha:913,Beta:914,Gamma:915,Delta:916,Epsilon:917,Zeta:918,Eta:919,Theta:920,Iota:921,' +
	'Kappa:922,Lambda:923,Mu:924,Nu:925,Xi:926,Omicron:927,Pi:928,Rho:929,Sigma:931,Tau:932,' +
	'Upsilon:933,Phi:934,Chi:935,Psi:936,Omega:937,alpha:945,beta:946,gamma:947,delta:948,' +
	'epsilon:949,zeta:950,eta:951,theta:952,iota:953,kappa:954,lambda:955,mu:956,nu:957,xi:958,' +
	'omicron:959,pi:960,rho:961,sigmaf:962,sigma:963,tau:964,upsilon:965,phi:966,chi:967,psi:968,' +
	'omega:969,thetasym:977,upsih:978,piv:982,' +
	'ensp:8194,emsp:8195,thinsp:8201,zwnj:8204,zwj:8205,lrm:8206,rlm:8207,ndash:8211,mdash:8212,' +
	'lsquo:8216,rsquo:8217,sbquo:8218,ldquo:8220,rdquo:8221,bdquo:8222,dagger:8224,Dagger:8225,' +
	'bull:8226,hellip:8230,permil:8240,prime:8242,Prime:8243,lsaquo:8249,rsaquo:8250,oline:8254,' +
	'frasl:8260,euro:8364,image:8465,weierp:8472,real:8476,trade:8482,alefsym:8501,larr:8592,' +
	'uarr:8593,rarr:8594,darr:8595,harr:8596,crarr:8629,lArr:8656,uArr:8657,rArr:8658,dArr:8659,' +
	'hArr:8660,forall:8704,part:8706,exist:8707,empty:8709,nabla:8711,isin:8712,notin:8713,' +
	'ni:8715,prod:8719,sum:8721,minus:8722,lowast:8727,radic:8730,prop:8733,infin:8734,ang:8736,' +
	'and:8743,or:8744,cap:8745,cup:8746,int:8747,there4:8756,sim:8764,cong:8773,asymp:8776,' +
	'ne:8800,equiv:8801,le:8804,ge:8805,sub:8834,sup:8835,nsub:8836,sube:8838,supe:8839,' +
	'oplus:8853,otimes:8855,perp:8869,sdot:8901,lceil:8968,rceil:8969,lfloor:8970,rfloor:8971,' +
	'lang:9001,rang:9002,loz:9674,spades:9824,clubs:9827,hearts:9829,diams:9830';

const HTML401_ENTITIES: ReadonlyMap<string, string> = new Map(
	HTML401_ENTITIES_SOURCE.split(',').map((entry) => {
		const [name, code] = entry.split(':');
		return [name as string, String.fromCodePoint(Number(code))] as const;
	}),
);

/** The single quote, which ENT_COMPAT deliberately leaves encoded. */
const SINGLE_QUOTE_CODEPOINT = 39;

/**
 * `html_entity_decode($text, ENT_COMPAT, 'UTF-8')` twin.
 *
 * ENT_COMPAT decodes the DOUBLE quote and leaves the SINGLE one alone — both as
 * `&apos;`/`&#39;`/`&#039;` — because a decoded apostrophe would break the
 * single-quoted locator payloads Dédalo marks carry. Unknown entities are left
 * verbatim, exactly like PHP. One pass only: `&amp;quot;` decodes to `&quot;`,
 * never to `"`.
 */
export function decodeBabelEntities(text: string): string {
	return text.replace(
		/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
		(full, ref: string) => {
			if (ref.startsWith('#')) {
				const code =
					ref[1] === 'x' || ref[1] === 'X'
						? Number.parseInt(ref.slice(2), 16)
						: Number.parseInt(ref.slice(1), 10);
				if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return full;
				if (code === SINGLE_QUOTE_CODEPOINT) return full; // ENT_COMPAT
				// Surrogate halves are not valid characters; PHP rejects them too.
				if (code >= 0xd800 && code <= 0xdfff) return full;
				return String.fromCodePoint(code);
			}
			return HTML401_ENTITIES.get(ref) ?? full;
		},
	);
}

// ---------------------------------------------------------------------------
// 5. strip_tags with the PHP allowlist (class.babel.php:228-234)
// ---------------------------------------------------------------------------

/** PHP `strip_tags($result, '<p><br><strong><em>')`. */
const BABEL_ALLOWED_TAGS: ReadonlySet<string> = new Set(['p', 'br', 'strong', 'em']);

/**
 * `strip_tags` twin, matching PHP's state machine (this and
 * `decodeBabelEntities` were diffed against a real `php 8` run over 44 inputs —
 * 0 divergences — when they were written):
 *   - `<` followed by WHITESPACE (or ending the string) is literal text
 *     (`'a < b'` survives intact);
 *   - `<!-- … -->` is dropped whole;
 *   - anything else from `<` to the next `>` is a tag: kept verbatim (attributes
 *     included) when its name is allowlisted, dropped otherwise;
 *   - an UNTERMINATED tag drops the rest of the string — PHP does exactly this,
 *     and for a sanitiser the fail-closed direction is the right one anyway.
 */
export function stripTagsAllowing(
	input: string,
	allowed: ReadonlySet<string> = BABEL_ALLOWED_TAGS,
): string {
	let out = '';
	let index = 0;
	while (index < input.length) {
		const lt = input.indexOf('<', index);
		if (lt === -1) {
			out += input.slice(index);
			break;
		}
		const next = input[lt + 1];
		if (next === undefined || /\s/.test(next)) {
			// Not a tag opener — PHP keeps the '<' as text.
			out += input.slice(index, lt + 1);
			index = lt + 1;
			continue;
		}
		out += input.slice(index, lt);
		if (input.startsWith('<!--', lt)) {
			const end = input.indexOf('-->', lt + 4);
			if (end === -1) return out;
			index = end + 3;
			continue;
		}
		const gt = input.indexOf('>', lt + 1);
		if (gt === -1) return out;
		const name = /^\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(input.slice(lt + 1, gt))?.[1]?.toLowerCase();
		if (name !== undefined && allowed.has(name)) out += input.slice(lt, gt + 1);
		index = gt + 1;
	}
	return out;
}

/**
 * PHP `babel::sanitize_result` — drop the residual `<apertium-notrans>`
 * wrappers (and every other tag the engine invented), keeping the inline HTML a
 * transcription legitimately carries.
 */
export function sanitizeBabelResult(result: string): string {
	return stripTagsAllowing(result);
}

/**
 * The whole post-processing half in PHP's order: error screen → entity decode →
 * strip_tags. Returns `{ ok:false, msg }` when the body is a provider error, so
 * a caller CANNOT accidentally persist it.
 */
export function processBabelResponse(
	rawResult: string,
): { ok: true; value: string } | { ok: false; msg: string } {
	const error = babelErrorIn(rawResult);
	if (error !== null) return { ok: false, msg: error };
	return { ok: true, value: sanitizeBabelResult(decodeBabelEntities(rawResult)) };
}
