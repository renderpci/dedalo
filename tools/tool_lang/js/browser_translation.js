// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* SHARED BROWSER TRANSLATION ENGINE
* Client-side AI translation orchestration for tool_lang.
*
* Runs the TranslateGemma 4B model entirely in the browser through the
* Web Worker at tools/tool_lang/translators/browser_transformer/browser_transformer.js
* (HuggingFace Transformers + ONNX runtime).
*
* Design:
* - A single module-level worker is reused across calls so the (heavy) model
*   is downloaded/compiled once and cached inside the worker.
* - The worker is NOT terminated on a normal 'end'; use dispose_browser_worker()
*   to free resources (on tool destroy, fatal error or cancel).
*
* Translation pipeline for each call to translate_component_browser():
*   1. Extract source text from component data (value[]).
*   2. Replace Dédalo inline marks (index, tc, svg, …) with [[[n]]] placeholders
*      so the LLM never sees or corrupts them, and classify each one as the
*      open/close half of a pair or as a standalone atom.
*   3. Convert the resulting HTML to Markdown via html_to_markdown().
*   4. Split into ≤1000-char chunks and renumber each chunk's placeholders to a
*      local 1..k sequence — short ids cost fewer tokens and survive decoding better.
*   5. Post the chunks (text + descriptors + restore map) to the shared worker.
*   6. Stream 'on_chunk' partial results into the streaming overlay.
*   7. On 'end': restore the marks, validate, and save only once the result is known
*      to be intact — or once the user has accepted an imperfect one.
*
* The component's own data.value is NOT touched until the result is accepted, so a
* cancelled or rejected translation leaves the target component exactly as it was.
*
* v6 data model: uses data.value[] only with save protocol { action:'update', key:0, value:string }.
*
* Exports:
*   get_browser_worker          — lazy-initialise the shared Worker
*   dispose_browser_worker      — terminate and null the shared Worker
*   cancel_browser_translation  — post a cancel signal to the worker
*   translate_component_browser — the main orchestrator (async)
*
* The pure steps of the pipeline are exported too — extract_dedalo_marks,
* replace_dedalo_marks_with_placeholders, build_blocks, restore_placeholders and
* validate_translation. They are what stands between the model's output and the record,
* so they are kept side-effect-free and independently exercisable rather than buried
* inside the orchestrator.
*/

// imports
	import {get_json_langs} from '../../../core/common/js/utils/index.js'
	import {tr} from '../../../core/common/js/tr.js'
	import {html_to_markdown, markdown_to_html, segment_markdown} from './markdown_utils.js'
	import {make_placeholder, placeholder_re, extract_placeholders} from './placeholders.js'



/**
* Dédalo inline marks shielded from the model.
*
* Deliberately excludes 'html_style' (<strong>/<em>/<i>/<u>): those have native Markdown
* equivalents that html_to_markdown/markdown_to_html already round-trip, and the model
* handles Markdown emphasis far better than an opaque [[[n]]] token. Protecting them
* would spend a large share of the placeholder budget on formatting rather than on the
* marks that actually carry data. The server-side path excludes them for the same reason
* (see TR::addBabelTagsOnTheFly in shared/class.TR.php).
*
* @type {string[]}
*/
const DEDALO_MARKS = [
	'indexIn',
	'indexOut',
	'tc',
	'svg',
	'geo',
	'page',
	'person',
	'note',
	'reference',
	'lang'
]



/**
* Target size of one segment sent to the model, in characters.
*
* Deliberately small: TranslateGemma is a sentence-level translation model, and feeding it
* long multi-sentence blocks is what drives greedy decoding into repetition loops.
* @type {number}
*/
const SEGMENT_MAX_CHARS = 250



/**
* A translation is roughly as long as its source. Beyond this multiple the output is not a
* translation any more — it is a degenerate loop — and must not be saved without review.
* Mirrors the worker's own guard, deliberately: this one is the last line of defence and
* does not depend on any heuristic upstream having worked.
* @type {number}
*/
const MAX_LENGTH_RATIO = 2.5



/**
* Module-level reusable worker. Lazy created.
* @type {Worker|null}
*/
let shared_worker = null



/**
* GET_BROWSER_WORKER
* Lazily create (or reuse) the shared translation worker.
*
* The Worker is instantiated with `type: 'module'` so browser_transformer.js
* can use ES-module imports. The path is relative to the HTML page, not this
* module file, so it must remain the canonical tool_lang path.
*
* The singleton pattern is intentional: re-using the same Worker across
* repeated calls avoids re-downloading and re-compiling the ~1.5 GB ONNX
* model. Callers that need a fresh worker (e.g. after a fatal error) must
* call dispose_browser_worker() first.
* @returns {Worker} The shared worker instance (newly created or cached).
*/
export const get_browser_worker = function() {

	if (!shared_worker) {
		shared_worker = new Worker(
			'../../tools/tool_lang/translators/browser_transformer/browser_transformer.js',
			{ type : 'module' }
		)
	}

	return shared_worker
}//end get_browser_worker



/**
* DISPOSE_BROWSER_WORKER
* Terminate and null the shared worker, freeing the ONNX model from memory.
*
* Should be called:
*   - when the parent tool is destroyed (component lifecycle `destroy()`)
*   - after a fatal 'error' status from the worker (translate_component_browser
*     calls this automatically in that branch)
*   - when the user explicitly closes the translation panel
*
* Safe to call when no worker exists (no-op). Any subsequent call to
* get_browser_worker() will recreate the worker and reload the model.
* @returns {boolean} Always true.
*/
export const dispose_browser_worker = function() {

	if (shared_worker) {
		try {
			shared_worker.terminate()
		} catch (error) {
			console.error('Error terminating browser translation worker:', error)
		}
		shared_worker = null
	}

	return true
}//end dispose_browser_worker



/**
* CANCEL_BROWSER_TRANSLATION
* Ask the worker to abort the in-progress translation between blocks.
*
* Sends `{ cancel: true }` to the worker via postMessage. The worker checks
* this flag between block translations and responds with a 'cancelled' status
* message before stopping. The Promise returned by translate_component_browser
* resolves (not rejects) with `{ result: false, msg: 'Translation cancelled' }`
* when the worker acknowledges the cancellation.
*
* Note: cancellation is cooperative and takes effect only at a block boundary.
* A block already being processed by the model will run to completion first.
* The worker is NOT terminated — call dispose_browser_worker() afterwards if
* the user wants to fully release the model from memory.
* @returns {boolean} Always true (the signal is fire-and-forget).
*/
export const cancel_browser_translation = function() {

	if (shared_worker) {
		shared_worker.postMessage({ cancel : true })
	}

	return true
}//end cancel_browser_translation



/**
* DEDALO_TO_LOCALE
* Convert a Dédalo lang code (e.g. 'lg-eng') to a BCP 47 base-language locale
* code (e.g. 'en') expected by the TranslateGemma model prompt.
*
* Falls back to 'en' when the Dédalo code is unknown or the entry has no
* `locale` field.
* @param {string} dedalo_lang - Dédalo internal lang identifier, e.g. 'lg-eng'.
* @param {Array}  json_langs  - Array of lang-registry objects with { dd_lang, locale }.
* @returns {string} Short locale code ('en', 'es', 'fr', …), default 'en'.
*/
const dedalo_to_locale = function(dedalo_lang, json_langs) {

	const lang_obj = json_langs.find(item => item.dd_lang===dedalo_lang)
	if (!lang_obj || !lang_obj.locale) {
		return 'en'
	}

	return lang_obj.locale.split('-')[0]
}//end dedalo_to_locale



/**
* EXTRACT_DEDALO_MARKS
* Find every Dédalo inline mark in a text, in document order, with its offsets.
*
* Two mark patterns can in principle match overlapping ranges; when they do, the
* first (and longest) match wins and the overlapped one is discarded, so a mark is
* never counted twice.
*
* @param {string} text - HTML string possibly containing Dédalo marks.
* @returns {Array<{start:number, end:number, mark:string}>} Sorted by start offset.
*/
export const extract_dedalo_marks = function(text) {

	const found = []
	for (let i = 0; i < DEDALO_MARKS.length; i++) {
		const pattern = tr.get_mark_pattern(DEDALO_MARKS[i])
		let match
		while ((match = pattern.exec(text))!==null) {
			found.push({
				start	: match.index,
				end		: match.index + match[0].length,
				mark	: match[0]
			})
			// a zero-length match would spin the loop forever
			if (match[0].length===0) {
				pattern.lastIndex++
			}
		}
	}

	// longest match first at any given offset, then drop anything it swallows
	found.sort((a, b) => (a.start - b.start) || (b.end - a.end))

	const marks = []
	let cursor = -1
	for (let i = 0; i < found.length; i++) {
		if (found[i].start < cursor) {
			continue
		}
		marks.push(found[i])
		cursor = found[i].end
	}

	return marks
}//end extract_dedalo_marks



/**
* CLASSIFY_MARK
* Decide whether a mark is one half of a paired mark or a standalone atom.
*
* index and reference marks come in pairs that wrap a span of text and share a numeric
* id — '[index-n-7-…]' … '[/index-n-7-…]'. Knowing that a token is the *close* of a
* specific *open* is what lets the repair place it deterministically when the model
* drops it. Everything else (tc, note, person, svg, geo, page, lang) stands alone.
*
* @param {string} mark - The raw mark string.
* @returns {{kind:string, pair_key:string|null}} kind is 'open' | 'close' | 'atom'.
*/
const classify_mark = function(mark) {

	const match = mark.match(/^\[(\/)?(index|reference)-[a-z]-([0-9]{1,6})/)
	if (!match) {
		return { kind : 'atom', pair_key : null }
	}

	return {
		kind		: match[1] ? 'close' : 'open',
		pair_key	: `${match[2]}-${match[3]}`
	}
}//end classify_mark



/**
* REORDER_INVERTED_PAIRS
* Put a paired mark back in order when translation reversed it.
*
* index and reference marks come in an open/close pair sharing an id. Translation reorders
* words — a Spanish '[open]pasaba[/close]' becomes Nepali where the verb moves — and the
* model can emit the close before the open, producing invalid markup ('[/index-105]…[index-105]').
* The mark multiset is intact, so validate_translation's count check does not notice.
*
* The correct order is knowable from the mark itself (the '/' says which is the close), so
* this is a deterministic fix, not a guess: for any id whose close sits before its open, swap
* the two token strings. Whatever text lies between them is then wrapped by a well-formed pair
* — approximately the right span, and always valid markup, which invalid ordering is not.
*
* Every reordered pair is returned so the caller can flag it: we changed what the model
* produced, and the user should see that we did.
*
* @param {string} text - Restored HTML, marks already back in place.
* @returns {{text:string, reordered:string[]}} reordered lists the open mark of each swapped pair.
*/
export const reorder_inverted_pairs = function(text) {

	const marks = extract_dedalo_marks(text)

	// group open/close by shared id
	const groups = new Map()
	for (const item of marks) {
		const classification = classify_mark(item.mark)
		if (!classification.pair_key) {
			continue
		}
		if (!groups.has(classification.pair_key)) {
			groups.set(classification.pair_key, {})
		}
		groups.get(classification.pair_key)[classification.kind] = item
	}

	// an edit swaps the two token strings at their original offsets
	const edits		= []
	const reordered	= []
	for (const group of groups.values()) {
		if (group.open && group.close && group.close.start < group.open.start) {
			// the close currently sits earlier — put the open string there, and vice versa
			edits.push({ start : group.close.start, end : group.close.end, replacement : group.open.mark })
			edits.push({ start : group.open.start,  end : group.open.end,  replacement : group.close.mark })
			reordered.push(group.open.mark)
		}
	}

	if (edits.length===0) {
		return { text, reordered }
	}

	// apply right-to-left so earlier offsets stay valid as lengths change
	edits.sort((a, b) => b.start - a.start)

	let out = text
	for (const edit of edits) {
		out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end)
	}

	return { text : out, reordered }
}//end reorder_inverted_pairs



/**
* REPLACE_DEDALO_MARKS_WITH_PLACEHOLDERS
* Substitute Dédalo inline marks with numbered [[[n]]] tokens so the LLM never sees
* (and thus cannot corrupt) them.
*
* Tokens are numbered in *document order*, not grouped by mark type, so that token
* number and text position agree — which the worker's repair and its retry prompts
* both rely on.
*
* @param {string} source_text - Full HTML string, possibly containing Dédalo marks.
* @returns {{safe_source_text:string, placeholders:Object, descriptors:Array}}
*   placeholders maps token → original mark string.
*   descriptors is [{ token, kind, pair }] with pair naming the token of the other half.
*/
export const replace_dedalo_marks_with_placeholders = function(source_text) {

	const marks = extract_dedalo_marks(source_text)

	const placeholders	= {}
	const descriptors	= []

	let safe_source_text	= ''
	let cursor				= 0

	for (let i = 0; i < marks.length; i++) {
		const mark	= marks[i]
		const token	= make_placeholder(i + 1)

		safe_source_text	+= source_text.slice(cursor, mark.start) + token
		cursor				= mark.end

		placeholders[token] = mark.mark

		const classification = classify_mark(mark.mark)
		descriptors.push({
			token		: token,
			kind		: classification.kind,
			pair_key	: classification.pair_key,
			pair		: null
		})
	}
	safe_source_text += source_text.slice(cursor)

	// link the two halves of each paired mark by their shared id
	const groups = new Map()
	for (let i = 0; i < descriptors.length; i++) {
		const descriptor = descriptors[i]
		if (!descriptor.pair_key) {
			continue
		}
		if (!groups.has(descriptor.pair_key)) {
			groups.set(descriptor.pair_key, [])
		}
		groups.get(descriptor.pair_key).push(descriptor)
	}
	for (const group of groups.values()) {
		const open	= group.find(item => item.kind==='open')
		const close	= group.find(item => item.kind==='close')
		if (open && close) {
			open.pair	= close.token
			close.pair	= open.token
		} else {
			// an unmatched half has no partner to anchor against — treat it as an atom
			// so the repair does not go looking for a token that was never there
			for (const item of group) {
				item.kind = 'atom'
			}
		}
	}

	return { safe_source_text, placeholders, descriptors }
}//end replace_dedalo_marks_with_placeholders



/**
* Paired Markdown emphasis delimiters, longest first so that '**' is matched before '*'.
* @type {string[]}
*/
const MD_DELIMITERS = ['**', '__', '*']



/**
* BALANCE_MARKDOWN_CHUNKS
* Make every chunk self-contained: close any emphasis run left open at the end of a
* chunk, and reopen it at the start of the next.
*
* A chunk is a whole prompt. Handing the model '**Line one' — an opening delimiter with
* no partner — is handing it broken Markdown and then blaming it for the result. That is
* what was happening whenever a split landed inside an emphasis run.
*
* segment_markdown prefers paragraph and line boundaries, so this rarely triggers. It
* still can when a paragraph has to be cut at a sentence (or, for a pathological sentence,
* at a word), and it guards any future cut point we have not thought of.
*
*   in :  ['**Line one', 'Line two**']
*   out:  ['**Line one**', '**Line two**']
*
* The spans rejoin correctly once the translated chunks are concatenated, because each
* one is independently well-formed.
*
* @param {string[]} chunks - Markdown chunks, in document order.
* @returns {string[]} The same chunks, each individually balanced.
*/
const balance_markdown_chunks = function(chunks) {

	// delimiters left open when the previous chunk ended, innermost last
	let carried = []

	return chunks.map(function(chunk){

		let text = carried.join('') + chunk

		// walk the chunk, tracking which delimiters are open at the end of it
		const open = []
		for (let i = 0; i < text.length; i++) {

			// html_to_markdown escapes literal asterisks and underscores as '\*' / '\_';
			// those are text, not delimiters, and counting them would corrupt the tally
			if (text[i]==='\\') {
				i++
				continue
			}

			const delimiter = MD_DELIMITERS.find(item => text.startsWith(item, i))
			if (!delimiter) {
				continue
			}

			const position = open.lastIndexOf(delimiter)
			if (position===-1) {
				open.push(delimiter)
			} else {
				open.splice(position, 1)
			}
			i += delimiter.length - 1
		}

		// close what is still open, innermost first, and carry it into the next chunk
		text	+= open.slice().reverse().join('')
		carried	= open.slice()

		return text
	})
}//end balance_markdown_chunks



/**
* HOIST_EDGE_PLACEHOLDERS
* Pull the markers off the front and back of a chunk so the model never sees them.
*
* The most reliable way to stop the model corrupting a marker is not to show it one. At
* sentence granularity that is achievable for most of them: a Dédalo mark overwhelmingly
* sits at a segment edge — a timecode opening a segment, an index close ending one — and
* an edge marker's position in the translation is not in question. It goes back exactly
* where it was.
*
* Only markers genuinely embedded mid-sentence still have to ride through the model as
* [[[n]]], and the repair ladder already handles those.
*
* This is also what makes the repetition penalty affordable again: a penalty suppresses
* tokens that have already been emitted, which is ruinous for markers built out of
* repeated brackets — but costs nothing when the block contains no markers at all.
*
* Whitespace between the edge markers and the body is kept with the marker, so
* prefix + body + suffix reproduces the chunk exactly.
*
* @param {string} chunk - Markdown chunk carrying document-wide [[[n]]] tokens.
* @returns {{prefix:string, body:string, suffix:string}}
*/
const hoist_edge_placeholders = function(chunk) {

	// leading run of markers (and the whitespace that follows them)
	const leading	= chunk.match(/^(?:\s*\[\[\[\d+\]\]\])+\s*/)
	const prefix	= leading ? leading[0] : ''

	let body = chunk.slice(prefix.length)

	// trailing run of markers (and the whitespace that precedes them)
	const trailing	= body.match(/\s*(?:\[\[\[\d+\]\]\]\s*)+$/)
	const suffix	= trailing ? trailing[0] : ''

	body = body.slice(0, body.length - suffix.length)

	// a chunk made ENTIRELY of markers has no body to translate; leave it whole rather
	// than emit an empty prompt, and let the (marker-only) text pass through untouched
	if (body.trim().length===0) {
		return { prefix : '', body : chunk, suffix : '' }
	}

	return { prefix, body, suffix }
}//end hoist_edge_placeholders



/**
* BUILD_BLOCKS
* Turn the chunked Markdown into the block payload the worker consumes.
*
* Each chunk's tokens are renumbered to a local 1..k sequence. Document-wide numbering
* produces tokens like [[[47]]] — several tokens' worth of digits and brackets, all of
* which the model has to copy verbatim. Local single-digit ids are cheaper and more
* reliably reproduced. The worker translates and repairs in local space, then maps back
* to the document-wide tokens via restore_map before returning, so everything downstream
* (streaming preview, mark restoration) keeps working in one namespace.
*
* Chunks are balanced first, so no chunk ever reaches the model with a dangling emphasis
* delimiter. Markers sitting at the very start or end of a chunk are then HOISTED out of
* the model input entirely — see hoist_edge_placeholders.
*
* Each block also carries the `sep` of the segment it came from — the literal text that
* separated it from the previous one in the source. The worker rejoins with it. Rejoining
* with a hardcoded '\n\n' instead is what turned a record of one <p> with four <br> into
* twenty-five <p>: every seam, whatever it had actually been, became a paragraph break.
*
* @param {Array}    segments    - [{text, sep}] from segment_markdown, carrying document-wide tokens.
* @param {Array}    descriptors - Document-wide descriptors from replace_dedalo_marks_with_placeholders.
* @returns {Array<{text:string, placeholders:Array, restore_map:Object, prefix:string, suffix:string, sep:string}>}
*/
export const build_blocks = function(segments, descriptors) {

	const by_token = new Map(descriptors.map(item => [item.token, item]))

	const balanced = balance_markdown_chunks(segments.map(item => item.text))

	return balanced.map(function(chunk, index){

		// markers at the edges never need to be copied by the model — pull them off first,
		// so the local numbering only covers what actually gets translated
		const hoisted = hoist_edge_placeholders(chunk)

		// global token → local token, in order of appearance within the remaining body
		const local_of = new Map()
		const tokens = extract_placeholders(hoisted.body)
		for (let i = 0; i < tokens.length; i++) {
			if (!local_of.has(tokens[i])) {
				local_of.set(tokens[i], make_placeholder(local_of.size + 1))
			}
		}

		// single pass, so a rewritten token can never be rewritten again
		const text = hoisted.body.replace(placeholder_re(), (match) => local_of.get(match) || match)

		const block_placeholders	= []
		const restore_map			= {}
		for (const [global_token, local_token] of local_of) {

			restore_map[local_token] = global_token

			const descriptor = by_token.get(global_token)
			// the other half of a pair may have landed in a different chunk, or been hoisted
			// out of this one; either way it has no anchor here, so it behaves as an atom
			const pair_local = (descriptor && descriptor.pair)
				? local_of.get(descriptor.pair)
				: null

			block_placeholders.push({
				token	: local_token,
				kind	: pair_local ? descriptor.kind : 'atom',
				pair	: pair_local || null
			})
		}

		return {
			text			: text,
			placeholders	: block_placeholders,
			restore_map		: restore_map,
			// document-wide tokens: the worker re-attaches these verbatim after translating,
			// so they bypass local renumbering entirely
			prefix			: hoisted.prefix,
			suffix			: hoisted.suffix,
			// what stood between this segment and the previous one in the source: '\n\n' for a
			// paragraph, '\n' for a <br>, ' ' between sentences. The worker rejoins with it.
			sep				: segments[index].sep
		}
	})
}//end build_blocks



/**
* RESTORE_PLACEHOLDERS
* Put the original Dédalo marks back where their tokens ended up.
*
* Two model artefacts are handled here rather than being written to the record:
*
*   - a *duplicated* token. Emitting the mark twice would produce broken markup (two
*     opens for one close), so only the first occurrence becomes a mark and the rest
*     are dropped.
*   - an *invented* token ([[[99]]] when only 12 marks exist). It maps to nothing, and
*     leaving it in place would save the literal text '[[[99]]]' into the component.
*
* @param {string} translated_text - Text from the model, carrying document-wide tokens.
* @param {Object} placeholders    - token → original mark string.
* @returns {{text:string, duplicated:string[], residual:string[]}}
*/
export const restore_placeholders = function(translated_text, placeholders) {

	const known		= new Set(Object.keys(placeholders))
	const residual	= extract_placeholders(translated_text).filter(token => !known.has(token))

	const duplicated = []

	let text = translated_text
	for (const [token, mark] of Object.entries(placeholders)) {

		const first = text.indexOf(token)
		if (first===-1) {
			continue
		}

		text = text.slice(0, first) + mark + text.slice(first + token.length)

		if (text.indexOf(token)!==-1) {
			duplicated.push(mark)
			text = text.split(token).join('')
		}
	}

	// strip whatever tokens are left: by construction they map to no mark at all
	if (residual.length>0) {
		text = text.replace(placeholder_re(), '')
	}

	return { text, duplicated, residual }
}//end restore_placeholders



/**
* COUNT_EMPHASIS_LOST
* How many inline formatting spans the translation dropped.
*
* Counts opening tags only — the output is balanced by markdown_to_html, so openers and
* closers always agree. A negative delta (the model added emphasis) is not interesting
* and is reported as zero.
*
* @param {string} source_text
* @param {string} restored_text
* @returns {number} Spans present in the source but absent from the translation.
*/
const count_emphasis_lost = function(source_text, restored_text) {

	const pattern = /<(strong|b|em|i|u)\b[^>]*>/gi

	const source_count	= (source_text.match(pattern) || []).length
	const result_count	= (restored_text.match(pattern) || []).length

	return Math.max(0, source_count - result_count)
}//end count_emphasis_lost



/**
* IS_DEGENERATE
* Has the model produced a repetition loop rather than a translation?
*
* This is the last line of defence, and the only one that does not depend on a heuristic
* having fired upstream. The worker's detect_repetition is a good detector, but it IS a
* detector — it can be wrong. This is arithmetic: a translation is roughly as long as its
* source, so a result several times longer is not a translation, whatever produced it.
*
* Compares plain-text length so that markup and restored marks (which can be long, e.g.
* an index mark carrying a JSON locator) do not distort the ratio.
*
* The reported failure — ~900 tokens of 'सामान्य भन्दा' from one paragraph — is caught here
* even with every other guard in this file removed.
*
* @param {string} source_text   - The original HTML value.
* @param {string} restored_text - The translated HTML value.
* @returns {boolean}
*/
const is_degenerate = function(source_text, restored_text) {

	const plain = (html) => html
		.replace(/<[^>]*>/g, ' ')				// markup
		.replace(/\[[^\]]*\]/g, ' ')			// Dédalo marks
		.replace(/\s+/g, ' ')
		.trim()

	const source_length = plain(source_text).length
	const result_length = plain(restored_text).length

	if (source_length < 20) {
		return false
	}

	return result_length > source_length * MAX_LENGTH_RATIO
}//end is_degenerate



/**
* VALIDATE_TRANSLATION
* Decide whether the translated value is safe to persist without asking the user.
*
* The invariant that matters is that the set of Dédalo marks is preserved exactly: the
* translation may reorder them (word order changes between languages) but it must not
* invent, drop or duplicate one. A dropped index mark silently breaks a thesaurus link;
* an invented token would be written into the record as literal text.
*
* Anything the *model* did not place — a token it dropped that we had to re-insert — is
* reported as uncertain too. We may have put it in the right place, but we guessed.
*
* So are blocks that failed and came back in the source language. The mark check cannot
* catch those — an untranslated block still carries every one of its marks — so without
* counting them explicitly a partially untranslated result would be reported to the user
* as a clean success.
*
* @param {string} source_text   - The original HTML value (marks intact).
* @param {string} restored_text - The translated HTML value after restore_placeholders().
* @param {Object} extra         - { duplicated, residual, repaired, unrepairable, failed_blocks }
* @returns {Object} report; `ok` is true only when nothing at all is in doubt.
*/
export const validate_translation = function(source_text, restored_text, extra) {

	const source_marks = extract_dedalo_marks(source_text).map(item => item.mark)
	const result_marks = extract_dedalo_marks(restored_text).map(item => item.mark)

	const counts = new Map()
	for (const mark of source_marks) {
		counts.set(mark, (counts.get(mark) || 0) + 1)
	}
	for (const mark of result_marks) {
		counts.set(mark, (counts.get(mark) || 0) - 1)
	}

	const missing	= []
	const added		= []
	for (const [mark, delta] of counts) {
		for (let i = 0; i < delta; i++) {
			missing.push(mark)
		}
		for (let i = 0; i < -delta; i++) {
			added.push(mark)
		}
	}

	const report = {
		missing			: missing,
		added			: added,
		duplicated		: extra.duplicated || [],
		residual		: extra.residual || [],
		repaired		: extra.repaired || [],
		unrepairable	: extra.unrepairable || [],
		reordered		: extra.reordered || [],
		failed_blocks	: extra.failed_blocks || [],
		emphasis_lost	: count_emphasis_lost(source_text, restored_text),
		degenerate		: is_degenerate(source_text, restored_text),
		total_marks		: source_marks.length
	}

	// marks whose position in the translation we chose, rather than the model — including
	// paired marks the model inverted, which we put back in order (see reorder_inverted_pairs)
	report.uncertain_count =
		report.missing.length +
		report.added.length +
		report.duplicated.length +
		report.residual.length +
		report.repaired.length +
		report.unrepairable.length +
		report.reordered.length

	// emphasis_lost is REPORTED but deliberately does not gate the save. Losing an <em> is a
	// cosmetic downgrade; losing an [index-…] mark silently breaks a thesaurus link. Treating
	// them alike would fire the review prompt on nearly every translation and train the user
	// to click through it — which would cost us the one case that actually matters.
	//
	// `degenerate` DOES gate it. A repetition loop is not a degraded translation, it is
	// garbage, and it must never be written to a record unseen.
	report.ok =
		report.uncertain_count===0 &&
		report.failed_blocks.length===0 &&
		report.degenerate===false

	return report
}//end validate_translation



/**
* GET_SOURCE_TEXT
* Extract the first source HTML string from a component instance (v6 data model).
*
* v6 components store data as `data.value[]` — a plain array of strings.
* A scalar (non-array) value is also accepted and wrapped in an array.
*
* @param {Object} source_component - A fully initialised component instance with `data.value`.
* @returns {{ source_text: string, first_entry: string|null }}
*/
const get_source_text = function(source_component) {

	const raw_value = source_component.data.value
	const source_entries = Array.isArray(raw_value)
		? raw_value
		: (raw_value ? [raw_value] : [])

	if (source_entries.length<1) {
		return { source_text : '', first_entry : null }
	}

	const first_entry = source_entries[0]
	const source_text = (typeof first_entry==='string')
		? first_entry
		: (first_entry?.value || '')

	return { source_text, first_entry }
}//end get_source_text



/**
* TRANSLATE_COMPONENT_BROWSER
* Translate one source component into one target component fully client-side,
* streaming partial results into a preview overlay and persisting the final result
* via component.save() + component.refresh().
*
* The target component's data.value is left untouched until the result has been
* validated (or explicitly accepted), so cancelling or rejecting a translation cannot
* leave a half-translated or mark-corrupted value behind.
*
* Uses v6 data model: data.value[] with save protocol { action:'update', key:0, value:string }.
*
* Worker communication (see browser_transformer.js for the full protocol):
*   Main → Worker: { options: { blocks[], sourceLangCode, targetLangCode, device } }
*   Worker → Main: 'init' | 'on_chunk' | 'end' | 'on_block_error' | 'cancelled' | 'error'
*
* @param {Object} options
* @param {Object}        options.source_component           - Component supplying the source text.
* @param {Object}        options.target_component           - Component that will receive the translated text.
* @param {string}        options.source_lang                - Dédalo lang code, e.g. 'lg-eng'.
* @param {string}        options.target_lang                - Dédalo lang code, e.g. 'lg-spa'.
* @param {string}        [options.device='webgpu']          - ONNX backend: 'webgpu' or 'wasm'.
* @param {HTMLElement}   options.status_container           - Element for status/progress text.
* @param {HTMLElement|null} [options.streaming_overlay]     - Overlay element shown during streaming.
* @param {HTMLElement|null} [options.streaming_overlay_content] - Inner element receiving incremental HTML.
* @param {Array|null}    [options.json_langs]               - Pre-fetched lang-registry array.
* @param {Function}      [options.get_label]                - Tool label resolver: (key) => string.
* @param {Function}      [options.on_uncertain]             - (report) => Promise<boolean>. Called when the
*   translation could not be verified intact; resolve true to save anyway. Defaults to refusing the save,
*   so a caller that does not implement a review UI fails safe rather than persisting a damaged value.
* @returns {Promise<{result: boolean, msg: string}>}
*/
export const translate_component_browser = async function(options) {

	// options
		const source_component			= options.source_component
		const target_component			= options.target_component
		const source_lang				= options.source_lang
		const target_lang				= options.target_lang
		const device					= options.device || 'webgpu'
		const dtype						= options.dtype || null
		const engine					= options.engine || 'translategemma'
		const status_container			= options.status_container
		const streaming_overlay			= options.streaming_overlay || null
		const streaming_overlay_content	= options.streaming_overlay_content || null
		const get_label					= typeof options.get_label==='function'
			? options.get_label
			: (key) => key
		const on_uncertain				= typeof options.on_uncertain==='function'
			? options.on_uncertain
			: () => Promise.resolve(false)

	// mode guard.
	// Only in 'edit' mode does component_text_area expose the raw bracket marks that this
	// whole pipeline reads and writes. In 'list'/'tm' mode data.value is rendered <img> HTML
	// TRUNCATED to 130 chars (get_list_value, class.component_text_area.php) — the mark
	// regexes would find nothing, and saving that truncated string back would destroy the
	// record. Refuse rather than corrupt.
		for (const component of [source_component, target_component]) {
			const mode = component?.mode || component?.context?.mode
			if (mode && mode!=='edit') {
				return Promise.reject(
					`Translation requires components in 'edit' mode; got '${mode}'. `
					+ `In list/tm mode data.value is truncated HTML, not the raw marks.`
				)
			}
		}

	// source text
		const { source_text } = get_source_text(source_component)
		if (!source_text) {
			return Promise.reject('Empty source text')
		}

	// language mapping
		const json_langs = options.json_langs || await get_json_langs() || []

		const source_lang_code = dedalo_to_locale(source_lang, json_langs)
		const target_lang_code = dedalo_to_locale(target_lang, json_langs)

	// clean hard coded spaces
	// &nbsp; entities confuse the markdown converter and appear verbatim in the
	// model input; replace them with regular spaces before further processing.
		const clean_source_text = source_text.replace(/&nbsp;/g, ' ')

	// shield the Dédalo marks from the model
		const { safe_source_text, placeholders, descriptors } = replace_dedalo_marks_with_placeholders(clean_source_text)

	// convert HTML to markdown for the LLM
		const md_source_text = html_to_markdown(safe_source_text)

	// parse markdown into chunks, then renumber each chunk's tokens locally
	//
	// SEGMENT_MAX_CHARS is small on purpose. TranslateGemma is a *sentence-level*
	// translation model; handing it 1000-char multi-sentence blocks is off-distribution and
	// is the dominant cause of the repetition loops seen on long, low-resource translations.
	// Short segments are what it was trained on. They also mean nearly every Dédalo mark
	// ends up at a segment edge, where build_blocks can hoist it out of the model's way.
	//
	// The cost is more model calls per record. That is the trade being bought.
		const segments = segment_markdown(md_source_text, SEGMENT_MAX_CHARS)
		const blocks   = build_blocks(segments, descriptors)

		if(SHOW_DEBUG===true) {
			console.log('--> translate_component_browser marks:', descriptors.length, 'blocks:', blocks.length)
		}

	// reusable worker (model cached across calls)
		const translate_worker = get_browser_worker()

	// wrap in a Promise to allow the caller to await completion
	return new Promise(function(resolve, reject){

		if (status_container) {
			status_container.classList.remove('hide')
			status_container.classList.add('loading_status')
		}

		// show streaming overlay over the target component
		if (streaming_overlay) {
			streaming_overlay.classList.remove('hide')
			if (streaming_overlay_content) {
				streaming_overlay_content.innerHTML = ''
			}
		}

		const hide_overlay = function() {
			if (streaming_overlay) {
				streaming_overlay.classList.add('hide')
			}
		}

		// APPLY_AND_SAVE
		// The only place the target component is mutated. Reached once the result is
		// known intact, or once the user has accepted an imperfect one.
		const apply_and_save = function(restored_text) {

			if (!target_component.data.value) {
				target_component.data.value = []
			}
			target_component.data.value[0] = restored_text

			// v6 save protocol: { action:'update', key:0, value:string }
			return target_component.save([{
				action	: 'update',
				key		: 0,
				value	: restored_text
			}])
			.then(function(){
				return target_component.refresh({
					build_autoload : false
				})
			})
		}

		// handle messages sent back from the worker
		translate_worker.onmessage = function(e) {

			const status			= e.data.status
			const data				= e.data.data
			const remaining			= data.remaining
			const accumulated_text	= data.accumulated_text

			switch (status) {

				// model is being downloaded and initialised; show progress percentage
				case 'init': {

					const progress		= data.progress
					const status_text	= data.status
					const device_text	= data.device

					const process_label = device_text==='webgpu' ? 'setting_up' : 'procesing'

					const label = status_text==='ready'
						? get_label( process_label )
						: (status_text==='fallback_to_wasm')
							? (get_label('gpu_unavailable') || 'GPU unavailable, switching to CPU')
							: get_label( 'initializing' )

					const loaded = (progress)
						? ` : ${parseInt(progress).toString().padStart(2, 0)}%`
						: (status_text==='ready')
							? ''
							: ' : 00%'
					if (status_container) {
						status_container.innerHTML = `${label}${loaded}`
					}
					break;
				}

				// translation chunk received; preview it in the overlay.
				// The component's own data is deliberately not touched yet.
				case 'on_chunk': {

					if (status_container) {
						status_container.classList.remove('loading_status')
						const procesing_label = get_label('procesing') || 'Procesing'
						const remaining_label = get_label('remaining') || 'remaining'
						status_container.innerText = `${procesing_label} (${remaining} ${remaining_label})`
					}

					if (streaming_overlay_content) {
						const preview = restore_placeholders(markdown_to_html(accumulated_text), placeholders)
						streaming_overlay_content.innerHTML = preview.text
					}
					break;
				}

				// all chunks translated; restore marks, validate, then save or ask
				case 'end': {

					if (status_container) {
						status_container.classList.remove('loading_status')
					}

					// Prefer accumulated_text (streaming model); fall back to stringifying
					// the raw data payload for non-streaming worker implementations.
					const translated_md		= accumulated_text ?? String(data)
					const translated_html	= markdown_to_html(translated_md)

					const restored		= restore_placeholders(translated_html, placeholders)
					const repair_stats	= data.repair_stats || { repaired : [], unrepairable : [] }

					// translation can reverse a paired mark (close before open) — put it back in
					// order before validating and saving, and count it as uncertain
					const ordered		= reorder_inverted_pairs(restored.text)

					const report = validate_translation(clean_source_text, ordered.text, {
						duplicated		: restored.duplicated,
						residual		: restored.residual,
						repaired		: repair_stats.repaired,
						unrepairable	: repair_stats.unrepairable,
						reordered		: ordered.reordered,
						failed_blocks	: data.failed_blocks || []
					})

					if(SHOW_DEBUG===true) {
						console.log('--> translate_component_browser report:', report)
					}

					if (report.ok) {

						if (status_container) {
							status_container.innerHTML = get_label('translation_completed') || 'Translation completed'
						}
						hide_overlay()

						apply_and_save(ordered.text)
						.then(function(){
							resolve({result: true, msg: 'OK. Translation completed'})
						})
						.catch(function(save_error){
							console.error('Save failed after translation:', save_error)
							reject(save_error)
						})
						break;
					}

					// the marks could not be verified intact — the user decides, with the
					// translated text still on screen in the overlay
					Promise.resolve(on_uncertain(report))
					.then(function(accepted){

						hide_overlay()

						if (!accepted) {
							if (status_container) {
								status_container.innerHTML = get_label('translation_discarded') || 'Translation discarded'
							}
							resolve({result: false, msg: 'Translation discarded'})
							return null
						}

						if (status_container) {
							const warn = get_label('translation_saved_with_warnings') || 'Translation saved — check the marks'
							status_container.innerHTML = `<div class="warning">${warn}</div>`
						}

						return apply_and_save(ordered.text).then(function(){
							resolve({result: true, msg: 'OK. Translation saved with warnings'})
						})
					})
					.catch(function(save_error){
						console.error('Save failed after translation:', save_error)
						reject(save_error)
					})
					break;
				}

				// non-fatal per-block error; show warning and continue
				case 'on_block_error': {
					console.warn(`Block ${data.block}/${data.total} failed: ${data.message}`)
					if (status_container) {
						const block_warn_label = get_label('block_error') || 'Block error'
						status_container.innerHTML = `<div class="warning">${block_warn_label}: ${data.block}/${data.total}</div>`
					}
					if (data.accumulated_text && streaming_overlay_content) {
						const preview = restore_placeholders(markdown_to_html(data.accumulated_text), placeholders)
						streaming_overlay_content.innerHTML = preview.text
					}
					break;
				}

				// translation cancelled by user
				case 'cancelled': {
					hide_overlay()
					if (status_container) {
						status_container.classList.remove('loading_status')
						status_container.innerHTML = get_label('translation_cancelled') || 'Translation cancelled'
					}
					resolve({result: false, msg: 'Translation cancelled'})
					break;
				}

				// error from the worker
				case 'error': {

					// Soft errors are the user's problem to fix (wrong model for this pair, a
					// model that needs a GPU they do not have), NOT a crash. Show a plain
					// notice, keep the still-fine worker, and RESOLVE rather than reject so they
					// do not surface as red console errors.
					const soft_codes = ['unsupported_pair', 'needs_webgpu']
					if (soft_codes.includes(data.code)) {
						hide_overlay()
						if (status_container) {
							status_container.classList.remove('loading_status')
							status_container.innerHTML = `<div class="warning">${data.message}</div>`
						}
						resolve({result: false, msg: data.message})
						break;
					}

					// genuine fatal error — dispose the broken worker and reject
					dispose_browser_worker()
					hide_overlay()
					if (status_container) {
						status_container.classList.remove('loading_status')
					}
					const error_msg = data.message || data.name || String(data)
					console.error('Worker error details:', data)
					if (status_container) {
						status_container.innerHTML = `<div class="error">${error_msg}</div>`
					}
					reject(new Error(error_msg))
					break;
				}
			}
		}

		// handle uncaught runtime errors from the worker
		// onerror fires for script-level failures (parse errors, missing imports)
		// that the worker itself cannot catch. These are always fatal — dispose
		// the broken worker so a fresh one is created on the next call.
		translate_worker.onerror = function(e) {
			const msg = e.message || e.filename || 'Unknown worker error'
			console.error('Worker error [browser_transformer]:', msg, e)
			dispose_browser_worker()
			hide_overlay()
			if (status_container) {
				status_container.classList.remove('loading_status')
				status_container.innerHTML = `<div class="error">${msg}</div>`
			}
			reject(e)
		}

		// init the worker for translation
		translate_worker.postMessage({
			options : {
				blocks			: blocks,
				sourceLangCode	: source_lang_code,
				targetLangCode	: target_lang_code,
				device			: device,
				dtype			: dtype,
				engine			: engine
			}
		})
	})
}//end translate_component_browser



// @license-end
