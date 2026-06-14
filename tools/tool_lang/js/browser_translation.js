// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* SHARED BROWSER TRANSLATION ENGINE
* Client-side AI translation orchestration shared by tool_lang and tool_lang_multi.
*
* Runs the TranslateGemma 4B model entirely in the browser through the
* Web Worker at tools/tool_lang/translators/browser_transformer/browser_transformer.js
* (HuggingFace Transformers + ONNX runtime).
*
* Design:
* - A single module-level worker is reused across calls so the (heavy) model
*   is downloaded/compiled once and cached inside the worker. This is critical
*   for the tool_lang_multi "translate to all languages" loop where many target
*   langs are translated sequentially.
* - The worker is NOT terminated on a normal 'end'; use dispose_browser_worker()
*   to free resources (on tool destroy, fatal error or cancel).
*/

// imports
	import {get_json_langs} from '../../../core/common/js/utils/index.js'
	import {tr} from '../../../core/common/js/tr.js'
	import {html_to_markdown, markdown_to_html, group_markdown_into_chunks} from './markdown_utils.js'



/**
* Module-level reusable worker. Lazy created.
* @type {Worker|null}
*/
let shared_worker = null



/**
* GET_BROWSER_WORKER
* Lazily create (or reuse) the shared translation worker.
* The worker path is resolved against the page URL (not this module), so it
* must stay identical to the original tool_lang path.
* @return Worker
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
* Terminate and clear the shared worker, freeing the cached model.
* @return bool
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
* @return bool
*/
export const cancel_browser_translation = function() {

	if (shared_worker) {
		shared_worker.postMessage({ cancel : true })
	}

	return true
}//end cancel_browser_translation



/**
* DEDALO_TO_LOCALE
* Convert a Dédalo lang code (e.g. 'lg-eng') to a locale code (e.g. 'en').
* @param string dedalo_lang
* @param array json_langs
* @return string
*/
const dedalo_to_locale = function(dedalo_lang, json_langs) {

	const lang_obj = json_langs.find(item => item.dd_lang===dedalo_lang)
	if (!lang_obj || !lang_obj.locale) {
		return 'en'
	}

	return lang_obj.locale.split('-')[0]
}//end dedalo_to_locale



/**
* REPLACE_DEDALO_TAGS_WITH_PLACEHOLDERS
* Replace Dédalo tags with [[n]] placeholders to avoid translating them.
* @param string source_text - Full HTML string
* @return object { safe_source_text, placeholders }
*/
const replace_dedalo_tags_with_placeholders = function(source_text) {

	const tags = [
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

	let safe_source_text = source_text
	const placeholders = {}
	let counter = 1
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i]
		const pattern = tr.get_mark_pattern(tag)

		safe_source_text = safe_source_text.replace(pattern, (match) => {
			const key = `[[${counter}]]`
			placeholders[key] = match
			counter++
			return key
		})
	}

	return { safe_source_text, placeholders }
}//end replace_dedalo_tags_with_placeholders



/**
* RESTORE_PLACEHOLDERS
* Reverse replace_dedalo_tags_with_placeholders, restoring original Dédalo tags.
* @param string translated_text
* @param object placeholders
* @return string
*/
const restore_placeholders = function(translated_text, placeholders) {

	return Object.entries(placeholders).reduce(
		(text, [key, original]) => text.replaceAll(key, () => original),
		translated_text
	)
}//end restore_placeholders



/**
* GET_SOURCE_TEXT
* Extract the first source HTML string from a component instance.
* @param object source_component
* @return object { source_text, first_entry }
*/
const get_source_text = function(source_component) {

	const raw_value = source_component.data.entries || source_component.data.value
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
* streaming partial results into the target component and saving on completion.
*
* @param object options
* {
* 	source_component		: component instance (provides the source text)
* 	target_component		: component instance (receives the translation)
* 	source_lang				: string (like 'lg-eng')
* 	target_lang				: string (like 'lg-spa')
* 	device					: string ('webgpu' | 'wasm')
* 	status_container		: HTMLElement (progress messages)
* 	streaming_overlay		: HTMLElement|null (overlay shown while streaming)
* 	streaming_overlay_content : HTMLElement|null
* 	json_langs				: array|null (cached lang map; fetched if absent)
* 	get_label				: function(key) -> string (tool label resolver)
* }
* @return Promise
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

	// source text
		const { source_text, first_entry } = get_source_text(source_component)
		if (!source_text) {
			return Promise.reject('Empty source text')
		}

	// language mapping
		const json_langs = options.json_langs || await get_json_langs() || []

		const source_lang_code = dedalo_to_locale(source_lang, json_langs)
		const target_lang_code = dedalo_to_locale(target_lang, json_langs)

	// clean hard coded spaces
		const clean_source_text = source_text.replace(/&nbsp;/g, ' ')

	// create placeholders to avoid translating Dédalo tags
		const { safe_source_text, placeholders } = replace_dedalo_tags_with_placeholders(clean_source_text)

	// convert HTML to markdown for the LLM
		const md_source_text = html_to_markdown(safe_source_text)

	// parse markdown into chunks
		const blocks = group_markdown_into_chunks(md_source_text, 1000)

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

				// translation chunk received; stream into the target component
				case 'on_chunk': {

					if (status_container) {
						status_container.classList.remove('loading_status')
						const procesing_label = get_label('procesing') || 'Procesing'
						const remaining_label = get_label('remaining') || 'remaining'
						status_container.innerText = `${procesing_label} (${remaining} ${remaining_label})`
					}

					const html_accumulated = markdown_to_html(accumulated_text)
					if (!target_component.data.value) {
						target_component.data.value = []
					}
					target_component.data.value[0] = html_accumulated
					if (streaming_overlay_content) {
						streaming_overlay_content.innerHTML = html_accumulated
					}
					break;
				}

				// all chunks translated; restore placeholders, save, resolve
				case 'end': {

					if (streaming_overlay) {
						streaming_overlay.classList.add('hide')
					}
					if (status_container) {
						status_container.classList.remove('loading_status')
						status_container.innerHTML = get_label('translation_completed') || 'Translation completed'
					}

					const translated_md = accumulated_text ?? String(data)

					// markdown -> HTML, then restore Dédalo tag placeholders
					const translated_html = markdown_to_html(translated_md)
					const restored_text = restore_placeholders(translated_html, placeholders)

					// shared cross-language id from source entry
					const source_id = (typeof first_entry==='object' && first_entry!==null)
						? (first_entry.id ?? null)
						: null

					// use target's own id if it exists, else fall back to source id
					const target_entries = target_component.data.entries || []
					const existing_target_id = target_entries.length > 0 && target_entries[0]?.id !== undefined
						? target_entries[0].id
						: null
					const entry_id = existing_target_id ?? source_id

					// build v7 entry object
					const entry = (entry_id !== null)
						? { id: entry_id, value: restored_text }
						: { value: restored_text }

					// update legacy value array
						if (!target_component.data.value) {
							target_component.data.value = []
						}
						target_component.data.value[0] = restored_text

					// update entries array (v7 data model)
						if (!target_component.data.entries) {
							target_component.data.entries = []
						}
						if (target_component.data.entries.length === 0) {
							target_component.data.entries.push(entry)
						} else {
							target_component.data.entries[0] = entry
						}

					// save and resolve after save completes
					const save_item = {
						action	: 'update',
						id		: entry_id,
						value	: entry
					}
					target_component.save([save_item])
					.then(function(){
						return target_component.refresh({
							build_autoload : false
						})
					})
					.then(function(){
						resolve({result: true, msg: 'OK. Translation completed'})
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
						streaming_overlay_content.innerHTML = markdown_to_html(data.accumulated_text)
					}
					break;
				}

				// translation cancelled by user
				case 'cancelled': {
					if (streaming_overlay) {
						streaming_overlay.classList.add('hide')
					}
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
					if (streaming_overlay) {
						streaming_overlay.classList.add('hide')
					}
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
		translate_worker.onerror = function(e) {
			const msg = e.message || e.filename || 'Unknown worker error'
			console.error('Worker error [browser_transformer]:', msg, e)
			dispose_browser_worker()
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
