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
	import {html_to_markdown, markdown_to_html, group_markdown_into_chunks} from './markdown_utils.js'
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
* @param {string[]} chunks      - Markdown chunks, still carrying document-wide tokens.
* @param {Array}    descriptors - Document-wide descriptors from replace_dedalo_marks_with_placeholders.
* @returns {Array<{text:string, placeholders:Array, restore_map:Object}>}
*/
export const build_blocks = function(chunks, descriptors) {

	const by_token = new Map(descriptors.map(item => [item.token, item]))

	return chunks.map(function(chunk){

		// global token → local token, in order of appearance within this chunk
		const local_of = new Map()
		const tokens = extract_placeholders(chunk)
		for (let i = 0; i < tokens.length; i++) {
			if (!local_of.has(tokens[i])) {
				local_of.set(tokens[i], make_placeholder(local_of.size + 1))
			}
		}

		// single pass, so a rewritten token can never be rewritten again
		const text = chunk.replace(placeholder_re(), (match) => local_of.get(match) || match)

		const block_placeholders	= []
		const restore_map			= {}
		for (const [global_token, local_token] of local_of) {

			restore_map[local_token] = global_token

			const descriptor = by_token.get(global_token)
			// the other half of a pair may have landed in a different chunk; within this
			// block it has no anchor, so it behaves as an atom
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
			restore_map		: restore_map
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
* @param {string} source_text   - The original HTML value (marks intact).
* @param {string} restored_text - The translated HTML value after restore_placeholders().
* @param {Object} extra         - { duplicated, residual, repaired, unrepairable }
* @returns {Object} report; `ok` is true only when every list is empty.
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
		total_marks		: source_marks.length
	}

	report.uncertain_count =
		report.missing.length +
		report.added.length +
		report.duplicated.length +
		report.residual.length +
		report.repaired.length +
		report.unrepairable.length

	report.ok = report.uncertain_count===0

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
		const status_container			= options.status_container
		const streaming_overlay			= options.streaming_overlay || null
		const streaming_overlay_content	= options.streaming_overlay_content || null
		const get_label					= typeof options.get_label==='function'
			? options.get_label
			: (key) => key
		const on_uncertain				= typeof options.on_uncertain==='function'
			? options.on_uncertain
			: () => Promise.resolve(false)

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
	// The worker translates one chunk at a time; the 1000-char limit keeps each
	// block well within the model's MAX_NEW_TOKENS budget.
		const chunks = group_markdown_into_chunks(md_source_text, 1000)
		const blocks = build_blocks(chunks, descriptors)

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

					const report = validate_translation(clean_source_text, restored.text, {
						duplicated		: restored.duplicated,
						residual		: restored.residual,
						repaired		: repair_stats.repaired,
						unrepairable	: repair_stats.unrepairable
					})

					if(SHOW_DEBUG===true) {
						console.log('--> translate_component_browser report:', report)
					}

					if (report.ok) {

						if (status_container) {
							status_container.innerHTML = get_label('translation_completed') || 'Translation completed'
						}
						hide_overlay()

						apply_and_save(restored.text)
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

						return apply_and_save(restored.text).then(function(){
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

				// fatal worker error; dispose worker and reject
				case 'error': {
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
				device			: device
			}
		})
	})
}//end translate_component_browser



// @license-end
