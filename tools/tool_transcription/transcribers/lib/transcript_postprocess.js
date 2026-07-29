// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/


/**
* TRANSCRIPT_POSTPROCESS
* Deterministic clean-up of raw ASR segments — the safety net that removes the
* repetitions no decoding parameter can fully prevent.
*
* WHY THIS EXISTS. Whisper-family models fail in two well known ways that both
* surface to the user as "it repeats words":
*
*   1. REPETITION LOOPS. The autoregressive decoder gets stuck and emits the same
*      word or phrase over and over ("gracias, gracias, gracias, …"). Triggered by
*      silence, room tone, music, crosstalk, unclear audio and — heavily — by
*      aggressively quantized decoders. Decoding parameters (repetition penalty,
*      no-repeat n-grams, temperature fallback) reduce it; nothing removes it.
*   2. BOUNDARY DUPLICATION. Long audio is decoded in overlapping windows; the
*      merge of two windows routinely keeps the overlapping words TWICE, so a
*      phrase appears duplicated exactly where two windows met.
*
* This module is pure: segments in, segments out. No DOM, no network, no imports.
* It is loaded BOTH by the browser worker and by the TypeScript server path, so a
* transcript produced in the browser and one produced by the on-prem engine get
* byte-identical clean-up (single source of truth — never a second copy).
*
* SEGMENT SHAPE (the module's whole vocabulary):
*   {
*     text    : string,           // recognised text
*     start   : number|null,      // seconds from the start of the media
*     end     : number|null,      // seconds; models often leave the LAST one null
*     speaker : string|undefined, // optional diarization label
*     words   : Array|undefined   // optional word-level timings, carried through
*   }
*
* Exports:
*   clean_transcript          — the entry point: full clean-up pipeline
*   collapse_repeated_ngrams  — kill in-segment loops
*   strip_overlap             — kill cross-segment boundary duplication
*   repetition_score          — 0..1 metric, for gates and for the fallback decision
*   is_degenerate             — "this window looped, retry or drop it"
*   normalize_spacing         — whitespace/spacing normalisation
*/


/**
* DEFAULT_OPTIONS
* Tuning knobs. Every threshold that could plausibly need adjusting per language
* or per collection lives here, so callers override instead of forking the logic.
*
* The repeat allowances are deliberately asymmetric: a single word repeated three
* times is ordinary speech ("no, no, no"), while a repeated MULTI-word phrase is
* almost always a decoder loop, so it is allowed only once.
*/
export const DEFAULT_OPTIONS = {
	// in-segment loop collapsing
	max_ngram					: 8,	// longest phrase length (in words) checked for looping
	max_unigram_repeats			: 3,	// consecutive copies of ONE word we keep
	max_ngram_repeats			: 1,	// consecutive copies of a multi-word phrase we keep

	// cross-segment overlap removal
	max_overlap_words			: 24,	// longest tail/head overlap we try to match
	min_overlap_words			: 2,	// shorter matches are too likely to be real speech

	// duplicate-segment removal
	duplicate_max_gap_seconds	: 1.0,	// identical texts further apart than this are kept
	duplicate_min_words			: 3,	// … unless they are this long, then always collapse

	// degeneracy detection (the temperature-fallback / drop decision)
	degenerate_min_words		: 8,	// too short to judge
	degenerate_score			: 0.55,	// repetition_score above this = looped

	// noise detection (non-speech garbage: letter-spam chains, punctuation
	// cascades — what the model emits over music/room tone the VAD let through)
	noise_min_chars				: 12,	// shorter texts are never judged noise
	noise_letter_ratio			: 0.45,	// letters+digits below this share = not language

	// temporal monotonicity (a degenerating model re-emits EARLIER content with
	// regressed timestamp tokens — time only moves forward in a real recording)
	time_regression_tolerance	: 2.0	// seconds of backwards jitter tolerated
};


/**
* NORMALIZE_SPACING
* Collapse runs of whitespace, drop leading/trailing space, and repair the space
* that goes missing when two segments are concatenated.
*
* ASR segments conventionally carry a LEADING space (" and then he said"), which
* is exactly right for concatenation and exactly wrong for a standalone paragraph.
* Every text entering or leaving this module goes through here so that neither
* case leaks into the record.
*
* @param {string} text
* @returns {string}
*/
export function normalize_spacing( text ) {

	if (typeof text !== 'string') {
		return '';
	}

	return text
		.replace(/\s+/g, ' ')			// any whitespace run → one space
		.replace(/\s+([,.;:!?])/g, '$1')	// no space before closing punctuation
		.trim();
}//end normalize_spacing


/**
* SPLIT_WORDS
* Word tokeniser used by every comparison in this module.
* Splitting on whitespace (rather than on a letter class) keeps punctuation
* attached to its word, which is what makes the n-gram comparison conservative:
* "sí." and "sí" are different tokens, so real speech is less likely to be eaten.
*
* @param {string} text
* @returns {string[]}
*/
function split_words( text ) {

	const normalized = normalize_spacing( text );

	return normalized.length===0
		? []
		: normalized.split(' ');
}//end split_words


/**
* COMPARABLE
* The form two words are compared in: lower-cased, stripped of punctuation and of
* diacritics. A decoder loop is not obliged to repeat its own punctuation or
* capitalisation ("Gracias. gracias, Gracias") — comparing the bare word catches
* those, while the ORIGINAL text is what we keep.
*
* @param {string} word
* @returns {string}
*/
function comparable( word ) {

	return word
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')	// combining accents left by NFD
		.replace(/[^\p{L}\p{N}]/gu, '');	// punctuation, quotes, dashes
}//end comparable


/**
* SAME_SEQUENCE
* True when two equal-length word arrays are the same phrase under `comparable`.
*
* @param {string[]} a
* @param {string[]} b
* @returns {boolean}
*/
function same_sequence( a, b ) {

	if (a.length!==b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (comparable(a[i])!==comparable(b[i])) {
			return false;
		}
	}

	return true;
}//end same_sequence


/**
* COLLAPSE_REPEATED_NGRAMS
* Remove consecutive repetitions of the same phrase inside ONE segment — the
* in-segment half of the repetition problem.
*
* Longest phrases are collapsed first: a loop of "muchas gracias muchas gracias
* muchas gracias" must be recognised as a repeated BIGRAM, not as three unrelated
* unigram pairs. Collapsing short first would leave "muchas gracias gracias".
*
* Only IMMEDIATE repetitions are touched. A word that legitimately recurs later in
* the sentence is never affected, because the comparison window is always the
* phrase directly following the one being examined.
*
* @param {string} text
* @param {Object} [options] - see DEFAULT_OPTIONS (max_ngram, max_unigram_repeats, max_ngram_repeats)
* @returns {string} the text with loops collapsed
*/
export function collapse_repeated_ngrams( text, options ) {

	const opts	= Object.assign({}, DEFAULT_OPTIONS, options || {});
	let words	= split_words( text );

	if (words.length<2) {
		return normalize_spacing( text );
	}

	// Pass order. Single words FIRST, so that "gracias gracias gracias gracias"
	// is judged by the (generous) unigram allowance instead of being eaten by the
	// bigram pass, which would see two copies of "gracias gracias" and keep one.
	// Then multi-word phrases LONGEST first, so a repeated "muchas gracias" is
	// recognised as one looping bigram rather than as unrelated pairs — collapsing
	// short first would leave the residue "muchas gracias gracias".
	const passes = [1];
	for (let n = Math.min( opts.max_ngram, Math.floor(words.length / 2) ); n >= 2; n--) {
		passes.push( n );
	}

	for (const n of passes) {

		// How many consecutive copies of an n-word phrase we are willing to keep.
		const allowed = n===1
			? opts.max_unigram_repeats
			: opts.max_ngram_repeats;

		const kept = [];
		let i = 0;

		while (i < words.length) {

			const phrase = words.slice(i, i + n);

			if (phrase.length<n) {
				// tail shorter than the window: nothing left to compare
				kept.push(...words.slice(i));
				break;
			}

			// Count how many times this exact phrase repeats immediately after itself.
			let repeats = 1;
			while (same_sequence( phrase, words.slice(i + repeats * n, i + (repeats + 1) * n) )) {
				repeats++;
			}

			// Keep the ORIGINAL leading copies, never `allowed` clones of the first
			// one: the copies differ in casing and punctuation ("Gracias. gracias,
			// Gracias") and the text the archivist reads must stay as recognised.
			const keep = repeats>allowed
				? allowed
				: repeats;
			kept.push(...words.slice(i, i + keep * n));

			i += repeats * n;
		}

		words = kept;
	}

	return normalize_spacing( words.join(' ') );
}//end collapse_repeated_ngrams


/** Single letters chained by separators — 'M-M-M-T-A-D-C-…', 'B-b b a n' tails.
* Whisper's signature output over non-speech audio; never natural language
* (real spelled-out acronyms are short — the 4-link minimum spares them). */
const LETTER_SPAM_RE = /(?:[\p{L}][-–—.·,]\s?){4,}[\p{L}]?/gu;

/** Punctuation cascades — ', , ,, ,' / '. ,!' runs with nothing said. */
const PUNCT_RUN_RE = /(?:[,.;:!?¡¿…'"«»()\-–—]\s*){3,}/g;

/**
* LETTER_RATIO
* The share of letters+digits among the non-space characters — the cheapest
* language-vs-garbage signal there is. Real speech in any language sits far
* above 0.5; punctuation cascades and separator spam sit far below.
*
* @param {string} text
* @returns {number} 0..1 (1 for empty input — nothing to condemn)
*/
export function letter_ratio( text ) {

	const compact = String(text ?? '').replace(/\s+/g, '');
	if (compact.length===0) {
		return 1;
	}

	const letters = compact.match(/[\p{L}\p{N}]/gu);
	return (letters ? letters.length : 0) / compact.length;
}//end letter_ratio


/**
* IS_NOISE_TEXT
* True when a text is NON-SPEECH GARBAGE rather than looped speech: letter-spam
* chains, punctuation cascades, or a letters share too low to be language.
* This is the failure mode `repetition_score` is structurally blind to — the
* spam is one giant hyphen-joined token (a single 'unique word'), and lone
* punctuation tokens have no comparable form at all.
*
* @param {string} text
* @param {Object} [options] - see DEFAULT_OPTIONS (noise_min_chars, noise_letter_ratio)
* @returns {boolean}
*/
export function is_noise_text( text, options ) {

	const opts		= Object.assign({}, DEFAULT_OPTIONS, options || {});
	const normalized= normalize_spacing( text );

	if (normalized.length<opts.noise_min_chars) {
		// Too short to condemn — except the degenerate pure-punctuation case,
		// which carries no language at any length.
		return normalized.length>0 && letter_ratio( normalized )===0;
	}

	if (letter_ratio( normalized )<opts.noise_letter_ratio) {
		return true;
	}

	// A long spam chain dominating the text: strip it and see what remains.
	const without = normalized.replace(LETTER_SPAM_RE, ' ').replace(/\s+/g, ' ').trim();
	return without.length < normalized.length * 0.3;
}//end is_noise_text


/**
* STRIP_NOISE_RUNS
* Excise non-speech garbage EMBEDDED in an otherwise real segment: the model
* often degenerates mid-segment ('…it was unbelievable. Mm-H. M-M-M-T-A-D-…'),
* and dropping the whole segment would take the real sentence with it.
* Letter-spam chains are removed outright; punctuation cascades collapse to a
* single mark.
*
* @param {string} text
* @returns {string}
*/
export function strip_noise_runs( text ) {

	return normalize_spacing(
		String(text ?? '')
			.replace(LETTER_SPAM_RE, ' ')
			.replace(PUNCT_RUN_RE, (run) => `${run.trim()[0]} `)
	);
}//end strip_noise_runs


/**
* REPETITION_SCORE
* How repetitive a text is, from 0 (every word distinct) to ~1 (one word forever).
*
* Defined as `1 - unique_words / total_words`. This is the cheap, language-neutral
* stand-in for the compression-ratio heuristic reference Whisper implementations
* use to detect a looped window. Used for two things:
*   - deciding a decode window degenerated and should be retried or dropped;
*   - measuring, in the test gates, that this module actually improved a transcript.
*
* @param {string} text
* @returns {number} 0..1
*/
export function repetition_score( text ) {

	const words = split_words( text ).map( comparable ).filter( word => word.length>0 );

	if (words.length===0) {
		return 0;
	}

	const unique = new Set( words );

	return 1 - (unique.size / words.length);
}//end repetition_score


/**
* IS_DEGENERATE
* True when a decode window looks like a repetition loop rather than speech: long
* enough to judge, and repetitive beyond the configured threshold.
*
* The caller decides what to do with the verdict — retry the window at a higher
* temperature (the quality path) or drop it (the last resort).
*
* @param {string} text
* @param {Object} [options] - see DEFAULT_OPTIONS (degenerate_min_words, degenerate_score)
* @returns {boolean}
*/
export function is_degenerate( text, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	// Non-speech garbage first: it is degeneracy regardless of word counts, and
	// repetition_score cannot see it (a spam chain is ONE token; punctuation has
	// no comparable form).
	if (is_noise_text( text, opts )) {
		return true;
	}

	const words = split_words( text );
	if (words.length<opts.degenerate_min_words) {
		return false;
	}

	return repetition_score( text ) > opts.degenerate_score;
}//end is_degenerate


/**
* STRIP_OVERLAP
* Remove from `next_text` the leading words it shares with the tail of
* `previous_text` — the cross-segment half of the repetition problem.
*
* This is the deterministic replacement for the model's own overlap merge: when
* two decode windows overlap by a few seconds, both transcribe the same words and
* the merge keeps them twice. Here the longest tail/head match wins, so the longer
* (and therefore more certain) duplication is the one removed.
*
* Guards against eating real speech:
*   - matches shorter than `min_overlap_words` are ignored (people do start a
*     sentence with the word that ended the last one);
*   - a match is only accepted if it is a genuine prefix of `next_text`, never a
*     match found in the middle of it.
*
* @param {string} previous_text
* @param {string} next_text
* @param {Object} [options] - see DEFAULT_OPTIONS (max_overlap_words, min_overlap_words)
* @returns {string} `next_text` without the duplicated head (possibly empty)
*/
export function strip_overlap( previous_text, next_text, options ) {

	const opts		= Object.assign({}, DEFAULT_OPTIONS, options || {});
	const previous	= split_words( previous_text );
	const next		= split_words( next_text );

	if (previous.length===0 || next.length===0) {
		return normalize_spacing( next_text );
	}

	const longest = Math.min( opts.max_overlap_words, previous.length, next.length );

	// Longest overlap first: the biggest duplication is the real one.
	for (let size = longest; size >= opts.min_overlap_words; size--) {

		const tail = previous.slice( previous.length - size );
		const head = next.slice( 0, size );

		if (same_sequence( tail, head )) {
			return normalize_spacing( next.slice(size).join(' ') );
		}
	}

	return normalize_spacing( next_text );
}//end strip_overlap


/**
* IS_DUPLICATE_SEGMENT
* True when `segment` merely repeats `previous` and carries nothing new.
*
* Two ways a segment is a duplicate:
*   - its text is identical to the previous one and they are adjacent in time (a
*     loop that crossed a window boundary), or
*   - its text is identical and long enough that a genuine verbatim repetition is
*     implausible, whatever the gap.
*
* The time gap matters because "Sí." twice, twenty seconds apart, is two answers;
* "Sí." twice within the same breath is the decoder stuttering.
*
* @param {Object} segment
* @param {Object} previous
* @param {Object} opts - resolved options
* @returns {boolean}
*/
function is_duplicate_segment( segment, previous, opts ) {

	const words = split_words( segment.text );

	if (words.length===0) {
		return true;
	}

	const same_text = same_sequence( words, split_words( previous.text ) );
	if (!same_text) {
		return false;
	}

	if (words.length>=opts.duplicate_min_words) {
		return true;
	}

	const previous_end	= typeof previous.end==='number' ? previous.end : null;
	const segment_start	= typeof segment.start==='number' ? segment.start : null;

	if (previous_end===null || segment_start===null) {
		// No usable timing: fall back to treating a short identical text as speech.
		return false;
	}

	return (segment_start - previous_end) <= opts.duplicate_max_gap_seconds;
}//end is_duplicate_segment


/**
* HAS_TIME_REGRESSION
* True when any segment starts EARLIER than the furthest point already reached,
* beyond the jitter tolerance. Time only moves forward in a recording; a
* regression means the model degenerated and re-emitted earlier content with
* broken timestamp tokens (observed live: a window whose tail jumped from
* 29:29 back to 29:15 and re-transcribed twenty seconds of speech). Used by
* the worker as a RETRY trigger — a re-decode usually comes back clean.
*
* @param {Array<Object>} segments
* @param {Object} [options] - see DEFAULT_OPTIONS (time_regression_tolerance)
* @returns {boolean}
*/
export function has_time_regression( segments, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	if (!Array.isArray(segments)) {
		return false;
	}

	let front = Number.NEGATIVE_INFINITY;
	for (const segment of segments) {
		const start	= typeof segment?.start==='number' ? segment.start : null;
		const end	= typeof segment?.end==='number' ? segment.end : start;
		if (start===null) continue;
		if (start < front - opts.time_regression_tolerance) {
			return true;
		}
		if (end!==null && end>front) front = end;
		else if (start>front) front = start;
	}
	return false;
}//end has_time_regression


/**
* CLEAN_TRANSCRIPT
* The entry point: run the whole clean-up pipeline over an ASR segment array.
*
* Order matters and is not arbitrary:
*   1. normalise + drop empties — everything downstream assumes clean text;
*   2. collapse in-segment loops — so a looped segment cannot dominate the
*      overlap comparison in step 3;
*   3. strip cross-segment overlap — the boundary duplication;
*   4. drop segments that became empty, or that duplicate the previous one;
*   5. repair timings — a null `end` (models routinely omit the last one) becomes
*      the next segment's start, or the segment's own start.
*
* Timings are never invented beyond that repair: a segment whose text was stripped
* keeps the start it was recognised at, so the timecode still points at the audio.
*
* @param {Array<Object>} segments - raw ASR segments (see the module header)
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {Array<Object>} cleaned segments, same shape
*/
export function clean_transcript( segments, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	if (!Array.isArray(segments)) {
		return [];
	}

	const cleaned = [];
	// The furthest point transcribed so far — the monotonicity front. A segment
	// starting behind it (beyond the jitter tolerance) is a degeneration
	// artifact: the model looped and re-emitted EARLIER content with broken
	// timestamp tokens. Dropping it removes both the disordered timecodes and
	// the duplicated re-transcription in one rule.
	let time_front = Number.NEGATIVE_INFINITY;

	for (let i = 0; i < segments.length; i++) {

		const source = segments[i] || {};

		// 0. temporal monotonicity
		const source_start = typeof source.start==='number' ? source.start : null;
		if (source_start!==null && source_start < time_front - opts.time_regression_tolerance) {
			continue;
		}

		// 1 + 2. normalise, excise embedded non-speech garbage (letter-spam
		// chains, punctuation cascades — the model's output over music/room
		// tone), then collapse in-segment loops. A segment that was ONLY noise
		// disappears here.
		let text = collapse_repeated_ngrams( strip_noise_runs( source.text ), opts );
		if (text==='' || is_noise_text( text, opts )) {
			continue;
		}

		const previous = cleaned.length>0
			? cleaned[cleaned.length - 1]
			: null;

		// 3. strip what the previous segment already said
		if (previous!==null) {
			text = strip_overlap( previous.text, text, opts );
			if (text==='') {
				// The whole segment was duplication. Extend the previous segment's
				// end so the timeline keeps covering the audio it occupied.
				if (typeof source.end==='number') {
					previous.end = source.end;
				}
				continue;
			}
		}

		const segment = {
			text	: text,
			start	: typeof source.start==='number' ? source.start : null,
			end		: typeof source.end==='number' ? source.end : null
		};
		if (source.speaker!==undefined) {
			segment.speaker = source.speaker;
		}
		if (Array.isArray(source.words)) {
			segment.words = source.words;
		}

		// 4. a segment that merely repeats the previous one
		if (previous!==null && is_duplicate_segment( segment, previous, opts )) {
			if (segment.end!==null) {
				previous.end = segment.end;
			}
			continue;
		}

		cleaned.push( segment );
		const advance = typeof segment.end==='number' ? segment.end : segment.start;
		if (typeof advance==='number' && advance>time_front) {
			time_front = advance;
		}
	}

	// 5. timing repair
	for (let i = 0; i < cleaned.length; i++) {
		if (cleaned[i].end===null) {
			const next = cleaned[i + 1];
			cleaned[i].end = (next!==undefined && typeof next.start==='number')
				? next.start
				: cleaned[i].start;
		}
	}

	return cleaned;
}//end clean_transcript


// @license-end
