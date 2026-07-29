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
* This module is pure — no DOM, no network, no imports — and is loaded BOTH by the
* browser worker and by the TypeScript server path, so browser-produced and
* server-produced transcripts are formatted identically (single source of truth).
*
* Exports:
*   group_paragraphs   — segments → paragraph objects
*   build_paragraph_text — paragraph → the TC-tagged text of one paragraph
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

		// Extend the open paragraph.
		current.segments.push({
			text	: text,
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
* @param {Object} paragraph - as returned by group_paragraphs
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {string} e.g. '[TC_00:00:05.600_TC]Text… [TC_00:00:20.100_TC]more text…'
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

	const prefix = tag + ((opts.speaker_prefix===true && paragraph.speaker!==undefined && paragraph.speaker!=='')
		? `${paragraph.speaker}: `
		: '');

	if (segments.length===0) {
		return `[TC_${seconds_to_tc(paragraph.start)}_TC]${prefix}${paragraph.text || ''}`;
	}

	let out			= `[TC_${seconds_to_tc(paragraph.start)}_TC]${prefix}`;
	let last_anchor	= paragraph.start;

	for (let i = 0; i < segments.length; i++) {

		const segment	= segments[i];
		const text		= (segment.text || '').trim();
		if (text==='') {
			continue;
		}

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
			out			= `${out}${text}`;
			continue;
		}

		out = /[\s\]]$/.test(out)
			? `${out}${text}`
			: `${out} ${text}`;
	}

	return out;
}//end build_paragraph_text


/**
* SEGMENTS_TO_HTML
* The end-to-end formatter: segments → the `<p>…</p>` string that
* component_text_area stores.
*
* Text is escaped before it is embedded: recognised speech can contain `<`, `&`
* and quotes, and the result is assigned as HTML by the client and written to the
* database by the server (SEC-031 — never build markup by raw concatenation).
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
			return `<p>${escape_html( text )}</p>`;
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
* PARSE_TRANSCRIPT
* Read stored TC-tagged transcription text back into segments, so an existing
* transcript can be RE-GROUPED (different paragraph rules, different TC density)
* without re-running the recogniser.
*
* Paragraph markup is treated as a segment boundary, and every timecode mark opens
* a new segment. Text before the first mark keeps the previous segment's timing —
* or starts at 0 when there is none, which is the only honest guess available.
*
* @param {string} html - the component value ('<p>[TC_…_TC]text</p>…')
* @returns {Array<Object>} segments {text, start, end}
*/
export function parse_transcript( html ) {

	if (typeof html!=='string' || html.trim()==='') {
		return [];
	}

	// Paragraph boundaries → newlines, then all remaining markup is dropped: the
	// transcript's meaning lives in the TC marks and the text, not in the tags.
	const flat = html
		.replace(/<\/p>/gi, '\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&');

	const segments	= [];
	let cursor		= 0;
	let start		= 0;

	TC_MARK_RE.lastIndex = 0;
	let match = TC_MARK_RE.exec( flat );

	// Text preceding the first mark (rare, but it must not be lost).
	if (match!==null && match.index>0) {
		const head = flat.slice(0, match.index).trim();
		if (head!=='') {
			segments.push({ text: head, start: 0, end: null });
		}
	}

	while (match!==null) {

		start	= tc_to_seconds( match[1] );
		cursor	= match.index + match[0].length;

		const next	= TC_MARK_RE.exec( flat );
		const text	= (next===null ? flat.slice(cursor) : flat.slice(cursor, next.index))
			.replace(/\s+/g, ' ')
			.trim();

		if (text!=='') {
			segments.push({
				text	: text,
				start	: start,
				end		: next===null ? null : tc_to_seconds( next[1] )
			});
		}

		match = next;
	}

	// No marks at all: one untimed segment, so the caller can still re-paragraph it.
	if (segments.length===0) {
		const text = flat.replace(/\s+/g, ' ').trim();
		if (text!=='') {
			segments.push({ text: text, start: 0, end: null });
		}
	}

	return segments;
}//end parse_transcript


// @license-end
