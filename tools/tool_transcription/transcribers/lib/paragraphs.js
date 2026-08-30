// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/


/**
* PARAGRAPHS
* Turn subtitle-grained ASR segments into an INTERVIEW TRANSCRIPT: prose split
* into paragraphs, not a cue list.
*
* WHY THIS EXISTS. Speech recognisers emit one segment every few seconds, sized
* for subtitles. Writing each of those as its own paragraph with its own timecode
* produces a wall of 5-second fragments — unreadable as an interview, and wrong:
* in oral history the paragraph is an editorial unit (a thought, a turn, an
* answer), and the archivist needs it to survive the automatic transcription.
*
* WHAT A PARAGRAPH IS HERE. Segments are joined until one of the natural breaks
* below occurs, in priority order:
*   - a SPEAKER CHANGE (when diarization gave us labels) — always a new paragraph;
*   - a SILENCE longer than `gap_seconds` — the speaker stopped;
*   - a SENTENCE END, once the paragraph is already long enough to stand alone —
*     so a paragraph never ends mid-sentence;
*   - the HARD CAPS (`max_seconds`, `max_chars`) — a monologue still gets broken up.
*
* TIMECODES. Dédalo transcription text carries `[TC_HH:MM:SS.mmm_TC]` marks, and
* the subtitle builder derives cue times by interpolating BETWEEN consecutive
* marks. So dropping marks would make the paragraphs read well and the subtitles
* drift. `tc_mode` resolves that trade-off explicitly:
*
*   'paragraph_anchors' (default) — one mark opens each paragraph, plus an inline
*        mark roughly every `anchor_seconds` inside it. Reads as prose, and the
*        subtitle builder still has anchors to interpolate between.
*   'paragraph'                   — one mark per paragraph. Cleanest text; coarser
*        subtitle timing.
*   'segment'                     — one mark per ASR segment (the historical
*        behaviour), for anyone who wants the cue list.
*
* THE ARCHIVIST'S MARKUP SURVIVES A RE-GROUPING (2026-08-30, P0-12/CLI-24).
* The component this writes to is the RICH-TEXT one, and until this date the
* re-grouping path was lossy in two ways, silently, on a value a curator had
* already worked on:
*   - `parse_transcript` dropped EVERY tag (`.replace(/<[^>]*>/g,'')`), so one
*     press of "Rebuild paragraphs" deleted the emphasis, the foreign-word
*     marking and the uncertain-reading formatting — scholarly apparatus, not
*     decoration — while reporting nothing;
*   - it decoded only escape_html's four entities, so any other one (`&#39;`,
*     `&nbsp;`…) came back through the escaper as `&amp;#39;` and the reader saw
*     the raw entity instead of the character.
* The fix is the `html` field on a segment: the stored fragment VERBATIM, carried
* through grouping and emitted instead of re-escaping the plain text. So
*   segments_to_html( parse_transcript( x ) ) === x
* for a well-formed x whose paragraph grouping the current options reproduce, and
* the operation is idempotent. `text` stays PLAIN — the grouping decisions
* (length caps, sentence ends) must never count tag characters.
*
* This module is pure — no DOM, no network, no imports — and is loaded BOTH by the
* browser worker and by the TypeScript server path, so browser-produced and
* server-produced transcripts are formatted identically (single source of truth).
*
* Exports:
*   group_paragraphs   — segments → paragraph objects
*   build_paragraph_text — paragraph → the TC-tagged HTML of one paragraph
*   segments_to_html   — segments → the `<p>…</p>` string the text component stores
*   parse_transcript   — stored TC-tagged HTML → segments (for re-grouping)
*   seconds_to_tc / tc_to_seconds — the Dédalo timecode format
*/


/**
* DEFAULT_OPTIONS
* Every paragraph-shaping threshold. Defaults are tuned for interview speech:
* a one-second pause is a real pause, and ~90 seconds or ~750 characters is about
* as much unbroken text as a reader tolerates on screen.
*/
export const DEFAULT_OPTIONS = {
	tc_mode			: 'paragraph_anchors',	// 'paragraph_anchors' | 'paragraph' | 'segment'
	gap_seconds		: 1.0,	// silence between segments that starts a new paragraph
	min_seconds		: 12,	// a sentence end before this is ignored (too short to stand alone)
	min_chars		: 180,	// … or before this many characters
	max_seconds		: 90,	// hard cap: break even mid-sentence beyond this
	max_chars		: 750,	// hard cap on paragraph length
	anchor_seconds	: 15,	// inline anchor spacing in 'paragraph_anchors' mode
	speaker_prefix	: true	// write "SPEAKER: " when a paragraph starts a new speaker
};


/** Sentence-final punctuation, optionally followed by a closing quote or bracket. */
const SENTENCE_END_RE = /[.!?…]["'”»)\]]?$/;

/** The Dédalo timecode mark. Kept in sync with src/core/resolve/tr_marks.ts TC_PATTERN. */
const TC_MARK_RE = /\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(?:\.[0-9]{1,3})?)_TC\]/g;

/**
* The tag that carries the transcript's STRUCTURE rather than its meaning: the
* paragraph, which is exactly what this module rebuilds, so on the way in it
* becomes a plain boundary. Every OTHER tag — `<br>` included, because a manual
* line break inside a paragraph is something a person typed, not a shape the
* grouper owns — is inline markup and is kept verbatim.
*/
const STRUCTURAL_TAG_RE = /<\/?p(?:\s[^>]*?)?\/?>/gi;

/** Any tag, capturing the slash and the name. Attribute values holding a literal
* '>' are not supported — transcript markup does not produce them, and such a
* value is already broken for every other consumer of the stored HTML. */
const TAG_SCAN_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;

/** Elements that never close, so they must not be pushed on the balancing stack. */
const VOID_ELEMENTS = [
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr'
];


/**
* PAD
* Zero-pad a number to a fixed width (timecode formatting helper).
*
* @param {number} value
* @param {number} [length=2]
* @returns {string}
*/
function pad( value, length ) {

	return value.toString().padStart( length || 2, '0' );
}//end pad


/**
* SECONDS_TO_TC
* Format seconds as the Dédalo timecode 'HH:MM:SS.mmm'.
*
* Guards a null/undefined/negative input by returning zero rather than 'NaN:NaN:…'
* — models routinely omit the final segment's end timestamp, and a malformed mark
* would corrupt the stored transcript and every subtitle derived from it.
*
* @param {number} total_seconds
* @returns {string} 'HH:MM:SS.mmm'
*/
export function seconds_to_tc( total_seconds ) {

	const safe = (typeof total_seconds==='number' && Number.isFinite(total_seconds) && total_seconds>0)
		? total_seconds
		: 0;

	const hours			= Math.floor(safe / 3600);
	const minutes		= Math.floor((safe % 3600) / 60);
	const seconds		= Math.floor(safe % 60);
	const milliseconds	= Math.round((safe % 1) * 1000);

	// Rounding milliseconds up to 1000 must carry into the seconds, or we emit
	// an impossible '00:00:05.1000'.
	if (milliseconds===1000) {
		return seconds_to_tc( Math.floor(safe) + 1 );
	}

	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}//end seconds_to_tc


/**
* TC_TO_SECONDS
* Parse 'HH:MM:SS.mmm' back into seconds. The inverse of seconds_to_tc, used when
* re-grouping an already stored transcript.
*
* @param {string} tc
* @returns {number} seconds, or 0 when unparseable
*/
export function tc_to_seconds( tc ) {

	const match = /^([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(?:\.([0-9]{1,3}))?$/.exec( String(tc).trim() );
	if (match===null) {
		return 0;
	}

	const hours			= Number.parseInt(match[1], 10);
	const minutes		= Number.parseInt(match[2], 10);
	const seconds		= Number.parseInt(match[3], 10);
	const milliseconds	= match[4]!==undefined
		? Number.parseInt(match[4].padEnd(3, '0'), 10)
		: 0;

	return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
}//end tc_to_seconds


/**
* ENDS_SENTENCE
* True when the text ends on sentence-final punctuation — the signal that a
* paragraph MAY close here without cutting a sentence in half.
*
* @param {string} text
* @returns {boolean}
*/
function ends_sentence( text ) {

	return SENTENCE_END_RE.test( text.trim() );
}//end ends_sentence


/**
* JOIN_TEXT
* Concatenate two segment texts with exactly one space, tolerating the leading
* space ASR segments conventionally carry.
*
* @param {string} left
* @param {string} right
* @returns {string}
*/
function join_text( left, right ) {

	const a = left.trim();
	const b = right.trim();

	if (a==='') {
		return b;
	}
	if (b==='') {
		return a;
	}

	return `${a} ${b}`;
}//end join_text


/**
* GROUP_PARAGRAPHS
* Group ASR segments into paragraphs.
*
* The break decision is taken BEFORE a segment is appended, looking at the
* paragraph built so far plus the incoming segment, so a paragraph never grows
* past its caps and never ends mid-sentence unless a cap forces it.
*
* @param {Array<Object>} segments - cleaned segments {text, start, end, speaker?}
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {Array<Object>} paragraphs:
*   { start, end, speaker, segments:Array<Object> }
*/
export function group_paragraphs( segments, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	if (!Array.isArray(segments) || segments.length===0) {
		return [];
	}

	// 'segment' mode IS the historical cue-list output: one paragraph per segment,
	// each opened by its own mark. No grouping decisions are taken at all.
	if (opts.tc_mode==='segment') {
		return segments
			.filter( segment => typeof segment.text==='string' && segment.text.trim()!=='' )
			.map( segment => new_paragraph( segment, segment.text.trim() ) );
	}

	const paragraphs	= [];
	let current			= null;

	for (let i = 0; i < segments.length; i++) {

		const segment = segments[i];
		const text = typeof segment.text==='string'
			? segment.text.trim()
			: '';
		if (text==='') {
			continue;
		}

		if (current===null) {
			current = new_paragraph( segment, text );
			continue;
		}

		if (should_break( current, segment, opts )) {
			paragraphs.push( current );
			current = new_paragraph( segment, text );
			continue;
		}

		// Extend the open paragraph. `html` travels with the segment: it is the
		// stored fragment VERBATIM and is what gets emitted, so dropping it here
		// would delete the archivist's markup exactly as the old parse did.
		current.segments.push({
			text	: text,
			[VERBATIM_HTML]	: segment[VERBATIM_HTML],
			start	: segment.start,
			end		: segment.end,
			words	: segment.words
		});
		current.text = join_text( current.text, text );
		if (typeof segment.end==='number') {
			current.end = segment.end;
		}
	}

	if (current!==null) {
		paragraphs.push( current );
	}

	return paragraphs;
}//end group_paragraphs


/**
* NEW_PARAGRAPH
* Open a paragraph on a segment.
*
* @param {Object} segment
* @param {string} text - the segment's trimmed text
* @returns {Object} paragraph
*/
function new_paragraph( segment, text ) {

	return {
		start		: typeof segment.start==='number' ? segment.start : 0,
		end			: typeof segment.end==='number' ? segment.end : null,
		speaker		: segment.speaker,
		text		: text,
		segments	: [{
			text	: text,
			[VERBATIM_HTML]	: segment[VERBATIM_HTML],
			start	: segment.start,
			end		: segment.end,
			words	: segment.words
		}]
	};
}//end new_paragraph


/**
* SHOULD_BREAK
* Decide whether `segment` starts a new paragraph instead of extending `current`.
* The rules, in the order they are evaluated (see the module header for the why):
*   1. speaker change      — unconditional;
*   2. hard caps           — unconditional;
*   3. silence gap         — the speaker paused;
*   4. sentence end + long enough — the readable break.
*
* @param {Object} current - the open paragraph
* @param {Object} segment - the incoming segment
* @param {Object} opts - resolved options
* @returns {boolean}
*/
function should_break( current, segment, opts ) {

	// 1. speaker change
	if (segment.speaker!==undefined && current.speaker!==undefined && segment.speaker!==current.speaker) {
		return true;
	}

	const duration	= (typeof current.end==='number' && typeof current.start==='number')
		? current.end - current.start
		: 0;
	const length	= current.text.length;

	// 2. hard caps — break even mid-sentence
	if (duration>=opts.max_seconds || length>=opts.max_chars) {
		return true;
	}

	// 3. silence gap
	const gap = (typeof segment.start==='number' && typeof current.end==='number')
		? segment.start - current.end
		: 0;
	if (gap>=opts.gap_seconds) {
		return true;
	}

	// 4. sentence end, but only once the paragraph can stand on its own
	if (ends_sentence( current.text ) && (duration>=opts.min_seconds || length>=opts.min_chars)) {
		return true;
	}

	return false;
}//end should_break


/**
* BUILD_PARAGRAPH_TEXT
* Render one paragraph as the TC-tagged text stored in the transcription
* component, honouring `tc_mode` (see the module header).
*
* In 'paragraph_anchors' mode an inline mark is emitted for the first segment that
* starts at least `anchor_seconds` after the last mark — so anchors follow the
* real segment boundaries instead of cutting words, and a paragraph shorter than
* the anchor spacing gets exactly one mark.
*
* WHAT COMES OUT IS HTML, not plain text (changed 2026-08-30). Escaping used to
* happen once, over the whole finished paragraph, in segments_to_html — which is
* precisely why a segment that already carried markup could not survive: its tags
* would have been escaped into visible text. Each segment is now emitted as either
* its verbatim `html` fragment (re-grouping an existing transcript) or its plain
* `text` escaped (a fresh recognition, SEC-031), so the two sources mix safely in
* one paragraph.
*
* @param {Object} paragraph - as returned by group_paragraphs
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {string} HTML, e.g. '[TC_00:00:05.600_TC]Text… [TC_00:00:20.100_TC]more text…'
*/
export function build_paragraph_text( paragraph, options ) {

	const opts		= Object.assign({}, DEFAULT_OPTIONS, options || {});
	const segments	= Array.isArray(paragraph.segments) ? paragraph.segments : [];

	// A person TAG for this paragraph (the transcription speaker mapping):
	// `speaker_tag` is the ready-made wire tag string ('[person-a-1-…-data:…]')
	// the caller resolved for THIS paragraph — placed right after the opening
	// TC mark, the position v6 transcriptions used. The tag contains no
	// HTML-escapable characters (its data payload uses single quotes by
	// construction), so it survives segments_to_html's escaping intact.
	const tag = typeof opts.speaker_tag==='string' ? opts.speaker_tag : '';

	// The speaker label is DATA (a diarization label, or a name), so it is escaped;
	// the tag above is ready-made wire markup and is not.
	const prefix = tag + ((opts.speaker_prefix===true && paragraph.speaker!==undefined && paragraph.speaker!=='')
		? `${escape_html(paragraph.speaker)}: `
		: '');

	if (segments.length===0) {
		return `[TC_${seconds_to_tc(paragraph.start)}_TC]${prefix}${escape_html(paragraph.text || '')}`;
	}

	let out			= `[TC_${seconds_to_tc(paragraph.start)}_TC]${prefix}`;
	let last_anchor	= paragraph.start;

	for (let i = 0; i < segments.length; i++) {

		const segment	= segments[i];
		const text		= (segment.text || '').trim();
		if (text==='') {
			continue;
		}

		// The fidelity override: a segment read back out of the stored transcript
		// carries the fragment it came from, tags and entities intact, and that is
		// what goes out again. Only a segment WITHOUT one is escaped text.
		const verbatim = segment[VERBATIM_HTML];
		const piece = (typeof verbatim==='string' && verbatim!=='')
			? verbatim
			: escape_html( text );

		const start = typeof segment.start==='number'
			? segment.start
			: null;

		// An inline mark for this segment?
		const wants_mark = i>0 && (
			opts.tc_mode==='segment' ||
			(
				opts.tc_mode==='paragraph_anchors' &&
				start!==null &&
				(start - last_anchor)>=opts.anchor_seconds
			)
		);

		if (wants_mark && start!==null) {
			out			= `${out.replace(/\s+$/, '')} [TC_${seconds_to_tc(start)}_TC]`;
			last_anchor	= start;
			out			= `${out}${piece}`;
			continue;
		}

		out = /[\s\]]$/.test(out)
			? `${out}${piece}`
			: `${out} ${piece}`;
	}

	return out;
}//end build_paragraph_text


/**
* SEGMENTS_TO_HTML
* The end-to-end formatter: segments → the `<p>…</p>` string that
* component_text_area stores.
*
* Recognised speech is escaped before it is embedded — it can contain `<`, `&`
* and quotes, and the result is assigned as HTML by the client and written to the
* database by the server (SEC-031 — never build markup by raw concatenation). The
* escaping happens per SEGMENT, inside build_paragraph_text, so a segment read
* back out of an existing transcript keeps its markup (see the module header).
*
* Inline markup is re-BALANCED across the new paragraph boundaries: a re-grouping
* moves the boundaries, so an `<em>` opened in one paragraph and closed in another
* would otherwise be emitted as `<p>…<em>…</p><p>…</em>…</p>` — invalid markup the
* editor would repair by guessing. Each `<p>` closes what it left open and the
* next one re-opens it, and a close tag with no opening anywhere is dropped.
*
* @param {Array<Object>} segments - cleaned segments
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {string} '<p>[TC_…_TC]…</p><p>…</p>'
*/
export function segments_to_html( segments, options ) {

	const opts			= options || {};
	const paragraphs	= group_paragraphs( segments, opts );

	// `speaker_tags` maps a segment speaker id to a ready-made person tag
	// string. The tag is emitted at every SPEAKER TURN — the first paragraph
	// of each run of same-speaker paragraphs — never repeated while the same
	// person keeps talking across paragraph breaks (the v6 convention).
	const speaker_tags	= (opts.speaker_tags && typeof opts.speaker_tags==='object') ? opts.speaker_tags : null;
	// A person tag REPLACES the plain-text "SPEAKER: " prefix: with a mapping,
	// the diarization label (an integer) must never leak into the stored text.
	const base_opts		= speaker_tags!==null
		? Object.assign({}, opts, { speaker_prefix: false })
		: opts;
	let previous_speaker= undefined;

	// Inline elements still open when a paragraph ends. Shared across the whole
	// document: each `<p>` closes them and the next one re-opens them.
	const open_stack = [];

	return paragraphs
		.map( paragraph => {
			let tag = '';
			if (speaker_tags!==null && paragraph.speaker!==undefined && paragraph.speaker!==previous_speaker) {
				const mapped = speaker_tags[paragraph.speaker];
				if (typeof mapped==='string' && mapped!=='') {
					tag = mapped;
				}
			}
			if (paragraph.speaker!==undefined) {
				previous_speaker = paragraph.speaker;
			}
			const text = build_paragraph_text( paragraph, tag==='' ? base_opts : Object.assign({}, base_opts, { speaker_tag: tag }) );

			// Re-open what the previous paragraph left open, AFTER the opening time
			// mark (the mark is text: italicising it would be a visible change), then
			// balance this paragraph and close whatever is still open at its end.
			const reopen	= open_stack.map( entry => entry.tag ).join('');
			const balanced	= balance_inline_tags( text, open_stack );
			const body		= reopen==='' ? balanced : insert_after_opening_mark( balanced, reopen );

			let tail = '';
			for (let k = open_stack.length - 1; k >= 0; k--) {
				tail += `</${open_stack[k].name}>`;
			}

			return `<p>${body}${tail}</p>`;
		})
		.join('');
}//end segments_to_html


/**
* ESCAPE_HTML
* Minimal HTML escaping for text that becomes markup. Deliberately local (no DOM):
* this module runs both in a Worker — where `document` does not exist — and in Bun.
*
* @param {string} text
* @returns {string}
*/
export function escape_html( text ) {

	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}//end escape_html


/**
* UNESCAPE_HTML
* The exact inverse of escape_html, plus `&nbsp;` — which a rich-text editor
* inserts on its own and which is an ordinary space as far as the spoken text is
* concerned.
*
* ORDER IS LOAD-BEARING: `&amp;` is decoded LAST, mirroring escape_html, or a
* stored `&amp;lt;` (the literal text "&lt;", written by a linguist quoting
* markup) would decode twice and the transcript would gain a tag it never had.
*
* Used only to derive a segment's PLAIN text; the stored fragment is never
* rewritten by it.
*
* @param {string} text
* @returns {string}
*/
function unescape_html( text ) {

	return String(text)
		.replace(/&nbsp;/gi, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&');
}//end unescape_html



/**
* COLLAPSE_SPACES_OUTSIDE_TAGS
* Collapse runs of whitespace to a single space WITHOUT touching the inside of a
* tag: `<span class="foo  bar">` must come out byte-identical, or a re-grouping
* would rewrite the archivist's attributes as a side effect.
*
* @param {string} fragment
* @returns {string}
*/
function collapse_spaces_outside_tags( fragment ) {

	return String(fragment).replace(/<\/?[a-zA-Z][^>]*>|\s+/g, function( match ) {
		return match.charAt(0)==='<' ? match : ' ';
	});
}//end collapse_spaces_outside_tags



/**
* PLAIN_TEXT_OF
* The spoken words of a stored fragment: tags removed, entities decoded, spaces
* collapsed. This — never the fragment — is what the grouping rules measure, so
* `max_chars` counts characters a reader sees and a sentence end is still found
* when the full stop sits inside `<em>…</em>`.
*
* @param {string} fragment
* @returns {string}
*/
function plain_text_of( fragment ) {

	return unescape_html( String(fragment).replace(/<[^>]*>/g, '') )
		.replace(/\s+/g, ' ')
		.trim();
}//end plain_text_of



/**
* THE FIDELITY OVERRIDE IS A SYMBOL, AND THAT IS A SECURITY PROPERTY, not a style.
*
* It carries a stored fragment VERBATIM — tags and entities intact — past
* `escape_html`, which is exactly what makes the round-trip lossless. It is also,
* by construction, an UNESCAPED-HTML CHANNEL, so the only safe design is one where
* nothing outside this module can put a value on it.
*
* It was a plain `html` STRING KEY for a few hours on 2026-08-30 and that was a
* hole, found by adversarial review before it shipped: `TranscriptionSegment`
* (src/core/tools/transcription_asr.ts) declares no `html` field, but TypeScript
* strips nothing at runtime, and the ASR seam passes a REMOTE transcriber's JSON
* `segments` array through verbatim. A hostile or compromised transcription
* service could therefore hand back `{text:'hola', html:'<img src=x onerror=…>'}`
* and have it stored, unescaped, in a heritage record's transcription. Measured
* at the time: `segments_to_html([{…, html:'<img src=x onerror=alert(1)>'}])`
* emitted the tag intact while the plain path still escaped correctly.
*
* A Symbol closes it structurally rather than by validation: JSON cannot carry
* one, so a segment that crossed a wire cannot own this key no matter what it
* claims. `make_segment` is the ONLY mint. (The seam ALSO strips unknown keys —
* defence in depth, and the place a future non-JSON path would be caught.)
*/
const VERBATIM_HTML = Symbol('dedalo.transcription.verbatim_html');

/**
* MAKE_SEGMENT
* Build a parsed segment, attaching the fidelity override only when the
* stored fragment carries something re-escaping the plain text would not
* reproduce: inline markup, or an entity outside escape_html's four (`&#39;`,
* `&#8212;`…). When the fragment IS exactly the escaped plain text the override
* would be redundant, and a segment stays the minimal {text,start,end} the
* recogniser path produces.
*
* @param {string} plain
* @param {string} fragment
* @param {number} start
* @param {number|null} end
* @returns {Object} segment
*/
function make_segment( plain, fragment, start, end ) {

	const segment = {
		text	: plain,
		start	: start,
		end		: end
	};

	if (escape_html(plain)!==fragment) {
		segment[VERBATIM_HTML] = fragment;
	}

	return segment;
}//end make_segment



/**
* INSERT_AFTER_OPENING_MARK
* Put `addition` right after a paragraph's opening `[TC_…_TC]` mark (or at the
* head when there is none). Used to re-open inline elements that the previous
* paragraph left open without wrapping the time mark itself.
*
* @param {string} text
* @param {string} addition
* @returns {string}
*/
function insert_after_opening_mark( text, addition ) {

	const match = /^\[TC_[^\]]*_TC\]/.exec( text );

	return match===null
		? addition + text
		: match[0] + addition + text.slice( match[0].length );
}//end insert_after_opening_mark



/**
* BALANCE_INLINE_TAGS
* Walk one paragraph's markup keeping a stack of the elements it leaves open.
*
* WHY. Re-grouping MOVES the paragraph boundaries, so an emphasis that opened in
* the old paragraph 3 and closed in the old paragraph 4 can end up straddling a
* new one. Emitted as-is that is `<p>…<em>…</p><p>…</em>…</p>`: invalid, and the
* editor repairs it by guessing — which is how formatting silently spreads to
* text it never covered. The stack survives between paragraphs (the caller closes
* it at the end of each `<p>` and re-opens it in the next), and a close tag whose
* element is open NOWHERE is dropped rather than emitted stray.
*
* Interleaving (`<em>a<strong>b</em>c</strong>`) is repaired the way a parser
* would: the inner elements are closed before the outer one and re-opened after.
*
* @param {string} fragment - one paragraph's markup
* @param {Array<Object>} open_stack - MUTATED: [{name, tag}] still open on exit
* @returns {string} the paragraph, with only well-nested tags
*/
function balance_inline_tags( fragment, open_stack ) {

	let out		= '';
	let cursor	= 0;

	TAG_SCAN_RE.lastIndex = 0;
	let match = TAG_SCAN_RE.exec( fragment );

	while (match!==null) {

		out		+= fragment.slice( cursor, match.index );
		cursor	= match.index + match[0].length;

		const closing	= match[1]==='/';
		const name		= match[2].toLowerCase();
		const is_void	= VOID_ELEMENTS.indexOf(name)!==-1 || /\/>$/.test(match[0]);

		if (is_void) {
			out += match[0];
		} else if (closing===false) {
			open_stack.push({ name: name, tag: match[0] });
			out += match[0];
		} else {

			// Deepest matching open element, if any.
			let depth = -1;
			for (let k = open_stack.length - 1; k >= 0; k--) {
				if (open_stack[k].name===name) {
					depth = k;
					break;
				}
			}

			if (depth!==-1) {
				// Everything opened INSIDE it is closed first and re-opened after.
				const inner = open_stack.splice( depth + 1 );
				for (let k = inner.length - 1; k >= 0; k--) {
					out += `</${inner[k].name}>`;
				}
				out += `</${name}>`;
				open_stack.pop();
				for (let k = 0; k < inner.length; k++) {
					out += inner[k].tag;
					open_stack.push( inner[k] );
				}
			}
			// depth===-1: stray close tag, dropped.
		}

		match = TAG_SCAN_RE.exec( fragment );
	}

	return out + fragment.slice( cursor );
}//end balance_inline_tags


/**
* PARSE_TRANSCRIPT
* Read stored TC-tagged transcription text back into segments, so an existing
* transcript can be RE-GROUPED (different paragraph rules, different TC density)
* without re-running the recogniser.
*
* Paragraph markup is treated as a segment boundary, and every timecode mark opens
* a new segment. Text before the first mark keeps the previous segment's timing —
* or starts at 0 when there is none, which is the only honest guess available.
*
* WHAT IS AND IS NOT PRESERVED (2026-08-30 — this function used to delete all of
* the first line, see the module header):
*   - INLINE MARKUP is kept verbatim on the segment's `html` field, so it is
*     written back unchanged;
*   - ENTITIES are kept verbatim there too, so `&#39;` stays `&#39;` instead of
*     being re-escaped into the visible text `&amp;#39;`;
*   - `<p>` is consumed: it is the structure being rebuilt (`<br>` is not — it is
*     a break a person typed, and it survives inside the fragment);
*   - a fragment with markup but NO words (an `<img>` alone in a segment) is still
*     dropped, as it always was — there is no text to time-code it against. That
*     is why the caller confirms before writing (tool_transcription.js
*     regroup_paragraphs).
*
* @param {string} html - the component value ('<p>[TC_…_TC]text</p>…')
* @returns {Array<Object>} segments {text, start, end, html?}
*/
export function parse_transcript( html ) {

	if (typeof html!=='string' || html.trim()==='') {
		return [];
	}

	// Only the STRUCTURAL tags become boundaries. Everything else stays where it
	// is and travels back out on the `html` field.
	const flat = html.replace(STRUCTURAL_TAG_RE, '\n');

	const segments	= [];
	let cursor		= 0;
	let start		= 0;

	TC_MARK_RE.lastIndex = 0;
	let match = TC_MARK_RE.exec( flat );

	// Text preceding the first mark (rare, but it must not be lost).
	if (match!==null && match.index>0) {
		const head_fragment	= collapse_spaces_outside_tags( flat.slice(0, match.index) ).trim();
		const head			= plain_text_of( head_fragment );
		if (head!=='') {
			segments.push( make_segment( head, head_fragment, 0, null ) );
		}
	}

	while (match!==null) {

		start	= tc_to_seconds( match[1] );
		cursor	= match.index + match[0].length;

		const next		= TC_MARK_RE.exec( flat );
		const fragment	= collapse_spaces_outside_tags(
			next===null ? flat.slice(cursor) : flat.slice(cursor, next.index)
		).trim();
		const text		= plain_text_of( fragment );

		if (text!=='') {
			segments.push( make_segment(
				text,
				fragment,
				start,
				next===null ? null : tc_to_seconds( next[1] )
			));
		}

		match = next;
	}

	// No marks at all: one untimed segment, so the caller can still re-paragraph it.
	if (segments.length===0) {
		const fragment	= collapse_spaces_outside_tags( flat ).trim();
		const text		= plain_text_of( fragment );
		if (text!=='') {
			segments.push( make_segment( text, fragment, 0, null ) );
		}
	}

	return segments;
}//end parse_transcript


// @license-end
