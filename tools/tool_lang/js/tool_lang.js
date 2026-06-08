// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console, get_json_langs} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_lang} from './render_tool_lang.js'
	import {tr} from '../../../core/common/js/tr.js'



/**
* TOOL_LANG
* Tool to translate contents from one language to other in any text component
*/
export const tool_lang = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// tool_lang.prototype.render	= common.prototype.render
	tool_lang.prototype.render		= tool_common.prototype.render
	tool_lang.prototype.destroy		= common.prototype.destroy
	tool_lang.prototype.refresh		= common.prototype.refresh
	tool_lang.prototype.edit		= render_tool_lang.prototype.edit



/**
* INIT
* @param object options
* @return bool common_init
*/
tool_lang.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= clone(page_globals.dedalo_projects_default_langs)
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

			// lg-nolan case. If the tool is open from a nolan component, add the
			// component lang to the langs list because is not added by default in the page_globals.dedalo_projects_default_langs.
			const found = self.langs.find(el => el.value===self.source_lang)
			if (!found && self.source_lang==='lg-nolan') {
				const nolan = {
					label	: 'No lang',
					value	: 'lg-nolan',
					tld2	: 'nolan'
				}
				self.langs.push(nolan);
			}

		// target translator. When user changes it, a local DB var is stored as 'translator_engine_select' in table 'status'
			const translator_engine_select_object = await data_manager.get_local_db_data(
				'translator_engine_select',
				'status'
			)
			if (translator_engine_select_object) {
				self.target_translator = translator_engine_select_object.value
			}

		// debug
			if(SHOW_DEBUG===true) {
				console.log('self [tool_lang]:', self);
			}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Custom build
* @param bool autoload
*/
tool_lang.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo = self.tool_config.ddo_map.find(el => el.role==='main_element')
			if (main_element_ddo) {
				self.main_element = self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)
			}
			// overwrite default lang from options.related_component_lang if exists (original lang)
			if (self.main_element.context.options && self.main_element.context.options.related_component_lang) {
				self.source_lang = self.main_element.context.lang = self.main_element.lang = self.main_element.context.options.related_component_lang
				self.target_lang = null
				// rebuilt to force load the new lang
				await self.main_element.build(true)
			}

		// status_user_component. control the tool status process for users
			const status_user_ddo = self.tool_config.ddo_map.find(el => el.role==='status_user_component')
			if (status_user_ddo) {
				self.status_user_component = self.ar_instances.find(el => el.tipo===status_user_ddo.tipo)
			}

		// status_admin_component. control the tool status process for administrators
			const status_admin_ddo = self.tool_config.ddo_map.find(el => el.role==='status_admin_component')
			if (status_admin_ddo) {
				self.status_admin_component	= self.ar_instances.find(el => el.tipo===status_admin_ddo.tipo)
			}

		// target lang. When user changes it, a local DB var is stored as 'tool_lang_target_lang' in table 'status'
			const tool_lang_target_lang_object = await data_manager.get_local_db_data(
				'tool_lang_target_lang',
				'status'
			)
			self.target_lang = (tool_lang_target_lang_object)
				? tool_lang_target_lang_object.value
				: self.lang
			self.target_component = await load_component({
				self 			: self,
				model			: main_element_ddo.model,
				mode			: main_element_ddo.mode,
				tipo			: main_element_ddo.tipo,
				section_tipo	: main_element_ddo.section_tipo,
				section_lang	: main_element_ddo.section_lang,
				lang			: self.target_lang,
				type			: main_element_ddo.type,
				section_id		: main_element_ddo.section_id,
				id_variant		: 'target_component'
			})

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* AUTOMATIC_TRANSLATION_BROWSER
* Run translation entirely client-side using a Web Worker with
* the transformers.js library and the TranslateGemma 4B model
* @param object options
* {
* 	source_lang	: string (like 'lg-eng')
* 	target_lang	: string (like 'lg-spa')
* 	device		: string ('webgpu' | 'wasm')
* 	status_container : HTMLElement
* }
* @return promise response
*/
tool_lang.prototype.automatic_translation_browser = async function(options) {

	const self = this

	// options
		const source_lang	= options.source_lang
		const target_lang	= options.target_lang
		const device		= options.device || 'webgpu'
		const status_container = options.status_container

	// source text
		const source_value = self.main_element.data.value
		if (!source_value || source_value.length<1) {
			return Promise.reject('Empty source text')
		}
		const source_text = source_value[0]

	// language mapping: convert Dédalo lang codes to locale codes
		const json_langs = self.json_langs || await get_json_langs() || []
		self.json_langs = json_langs

		const dedalo_to_locale = (dedalo_lang) => {
			const lang_obj = json_langs.find(item => item.dd_lang===dedalo_lang)
			if (!lang_obj || !lang_obj.locale) {
				return 'en'
			}
			const locale = lang_obj.locale
			return locale.split('-')[0]
		}

		const source_lang_code = dedalo_to_locale(source_lang)
		const target_lang_code = dedalo_to_locale(target_lang)

	// clean hard code spaces
	const clean_source_text = source_text.replace(/&nbsp;/g, ' ')

	// create placeholders for avoid translation of dedalo tags
		const { safe_source_text, placeholders } = replace_dedalo_tags_with_placeholders(clean_source_text)

	// parse HTML into blocks
		const blocks = group_blocks_into_chunks(safe_source_text, 1000)

	// safe target data
		if (!self.target_component.data.value) {
			self.target_component.data.value = []
		}

	// transcribe worker
		const translate_worker = new Worker('../../tools/tool_lang/translators/browser_transformer/browser_transformer.js', {
			type : 'module'
		})

	// wrap in a Promise to allow the caller to await completion
	return new Promise(function(resolve, reject){

		status_container.classList.remove('hide')
		status_container.classList.add('loading_status')

		// show streaming overlay over target component
		if (self.streaming_overlay) {
			self.streaming_overlay.classList.remove('hide')
			self.streaming_overlay_content.innerHTML = ''
		}

	// Handle messages sent back from the Web Worker
	translate_worker.onmessage = function(e) {
		const status			= e.data.status
		const data				= e.data.data
		const remaining			= data.remaining
		const accumulated_text	= data.accumulated_text

		switch (status) {
			// model is being downloaded and initialised; show progress percentage
			case 'init':

					const progress	= data.progress
					const status_text	= data.status
					const device_text	= data.device

					const process_label = device_text==='webgpu' ? 'setting_up' : 'procesing'

					const label = status_text==='ready'
						? self.get_tool_label( process_label )
						: self.get_tool_label( 'initializing' )

					const loaded = (progress)
						? ` : ${parseInt(progress).toString().padStart(2, 0)}%`
						: (status_text==='ready')
							? ''
							: ' : 00%'
					const procesing = `${label}${loaded}`
					status_container.innerHTML = procesing

					break;

				// translation chunk received; stream result to the target component in real time
				case 'on_chunk':
					status_container.classList.remove('loading_status')
					const procesing_label = self.get_tool_label('procesing') || 'Procesing'
					const remaining_label = self.get_tool_label('remaining') || 'remaining'
					status_container.innerText = `${procesing_label} (${remaining} ${remaining_label})`

					// show accumulated streaming text in overlay
					self.target_component.data.value[0] = accumulated_text
					if (self.streaming_overlay_content) {
						self.streaming_overlay_content.innerHTML = accumulated_text
					}

					break;

				// all chunks translated; restore placeholders, save, and resolve
				case 'end':
					translate_worker.terminate()

					// hide streaming overlay
					if (self.streaming_overlay) {
						self.streaming_overlay.classList.add('hide')
					}
					status_container.classList.remove('loading_status')
					status_container.innerHTML = self.get_tool_label('translation_completed')

					const translated_text = accumulated_text ?? String(data)
					console.log('translated_text', translated_text)
					const restored_text = restore_placeholders(translated_text, placeholders)

					self.target_component.data.value[0] = restored_text

					// save value to target component
					self.target_component.save([{
						action	: 'update',
						key		: 0,
						value	: restored_text
					}])
					.then(function(){
						self.target_component.refresh({
							build_autoload : false
						})
					})

					resolve({result: true, msg: 'OK. Translation completed'})

					break;

				// non-fatal per-block error; show warning and continue
				case 'on_block_error':
					console.warn(`Block ${data.block}/${data.total} failed: ${data.message}`)
					const block_warn_label = self.get_tool_label('block_error') || 'Block error'
					status_container.innerHTML = `<div class="warning">${block_warn_label}: ${data.block}/${data.total}</div>`

					// update streaming overlay with partial result so far
					if (data.accumulated_text && self.streaming_overlay_content) {
						self.streaming_overlay_content.innerHTML = data.accumulated_text
					}
					break;

				// translation cancelled by user
				case 'cancelled':
					translate_worker.terminate()
					status_container.classList.remove('loading_status')
					if (self.streaming_overlay) {
						self.streaming_overlay.classList.add('hide')
					}
					status_container.innerHTML = self.get_tool_label('translation_cancelled') || 'Translation cancelled'
					resolve({result: false, msg: 'Translation cancelled'})
					break;

				// fatal worker error; display message and reject the promise
				case 'error':
					translate_worker.terminate()
					status_container.classList.remove('loading_status')

					// hide streaming overlay
					if (self.streaming_overlay) {
						self.streaming_overlay.classList.add('hide')
					}

					const error_msg = data.message || data.name || String(data)
					console.error('Worker error details:', data)
					status_container.innerHTML = `<div class="error">${error_msg}</div>`
					reject(new Error(error_msg))
					break;
			}
		}
		// handle uncaught runtime errors from the worker (e.g. network failures)
		translate_worker.onerror = function(e) {
			const msg = e.message || e.filename || 'Unknown worker error'
			console.error('Worker error [browser_transformer]:', msg, e)
			status_container.classList.remove('loading_status')
			status_container.innerHTML = `<div class="error">${msg}</div>`
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
}//end automatic_translation_browser



/**
* AUTOMATIC_TRANSLATION_SERVER
* Call the API to translate the source lang component data to the target lang component data
* using a online service like babel or Google translator and save the resulting value
* (!) Tool lang config translator must to be exists in register_tools section
*
* @para string translator (name like 'babel' must to be defined in tool config)
* @param string source_lang (like 'lg-eng')
* @param string target_lang (like 'lg-spa')
* @param DOM element buttons_container (where will be place the message response)
*
* @return promise response
*/
tool_lang.prototype.automatic_translation_server = async function(translator, source_lang, target_lang, buttons_container) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'automatic_translation')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				source_lang		: source_lang,
				target_lang		: target_lang,
				component_tipo	: self.main_element.tipo,
				section_id		: self.main_element.section_id,
				section_tipo	: self.main_element.section_tipo,
				translator		: translator,
				config			: self.context.config
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 5, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> automatic_translation API response:",'DEBUG',response);
				}

				// user messages
					const msg_type = (response.result===false) ? 'error' : 'ok'
					ui.show_message(buttons_container, response.msg, msg_type)

				// reload target lang
					const target_component = self.ar_instances.find(el => el.tipo===self.main_element.tipo && el.lang===target_lang)
					target_component.refresh()
					if(SHOW_DEVELOPER===true) {
						dd_console('target_component', 'DEBUG', target_component)
					}

				resolve(response)
			})
		})
}//end automatic_translation_server



/**
 * Replace Dédalo tags with placeholders to avoid translation
 *
 * Uses [[n]] as delimiters. These characters never appear in natural text,
 * HTML, or JSON, so LLMs are far less likely to interpret them as
 * syntax and mutate/drop them compared to the previous {Pn} format.
 *
 * @param {string} source_text - Full HTML string
 * @returns {string} - HTML with Dédalo tags replaced by placeholders
 */
function replace_dedalo_tags_with_placeholders(source_text) {

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
		'lang',
		'html_style'
	];

	let safe_source_text = source_text;
	const placeholders = {};
	let counter = 1;
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		const pattern = tr.get_mark_pattern(tag);

		safe_source_text = safe_source_text.replace(pattern, (match) => {
			const key = `[[${counter}]]`;
			placeholders[key] = match;
			counter++;
			return key;
		});

	}

	return { safe_source_text, placeholders };
}


/**
 * Restore original Dédalo tags from placeholders after translation
 *
 * Reverses the placeholder substitution done by replace_dedalo_tags_with_placeholders.
 * Each placeholder key (e.g. ⟦P0⟧) is replaced back with its original
 * Dédalo tag content in the translated text.
 *
 * @param {string} translated_text - Translated text containing placeholders
 * @param {Object} placeholders    - Map of placeholder keys to original Dédalo tag strings
 * @returns {string}               - Translated text with original Dédalo tags restored
 */
function restore_placeholders(translated_text, placeholders) {
	return Object.entries(placeholders).reduce(
		(text, [key, original]) => text.replaceAll(key, () => original),
		translated_text
	);
}



/**
 * Split an HTML string into individual top-level blocks.
 *
 * Parses the HTML with DOMParser and extracts each direct child
 * of <body> as a separate block:
 *   - Element nodes (nodeType 1) → outerHTML (preserves all tags)
 *   - Text nodes (nodeType 3)    → textContent (bare text, no wrapper)
 *
 * This is the first step before chunking and translation. Each block
 * keeps its own HTML structure so the translator can preserve it.
 *
 * @param {string} html - Full HTML string
 * @returns {string[]}   - Array of HTML fragments / text segments
 */
function split_html_by_paragraph(html) {

	const parser	= new DOMParser();
	const doc		= parser.parseFromString(html, 'text/html');
	const blocks	= [];

	for (const node of doc.body.childNodes) {
		if (node.nodeType === 1) {
			// Element node (e.g. <p>, <div>) → keep full HTML with tags
			blocks.push(node.outerHTML);
		} else if (node.nodeType === 3) {
			// Bare text node (outside any element) → push as plain string
			const text = node.textContent;
			if (text) blocks.push(text);
		}
	}

	// Fallback: if the parser produced nothing, treat the whole input as one block
	if (blocks.length === 0) {
		blocks.push(html);
	}

	return blocks;
}


/**
 * Group HTML blocks into chunks that fit within a character limit.
 *
 * Takes the array of blocks from split_html_by_paragraph and merges
 * adjacent blocks (separated by \n) as long as the combined length
 * stays under maxChars. This reduces the number of calls to the
 * translation model while keeping each chunk short enough for the
 * model's token window and fast inference.
 *
 * @param {string|string[]} html     - Raw HTML string OR array of blocks (pre-split)
 * @param {number}          maxChars - Soft limit per chunk (default 500)
 * @returns {string[]}               - Array of chunk strings, each ≤ maxChars
 *
 * Edge cases:
 *   - A single block larger than maxChars is pushed on its own (no splitting).
 *   - Blocks are concatenated with \n so the model sees paragraph boundaries.
 */
function group_blocks_into_chunks(html, maxChars = 1000) {
	const blocks = split_html_by_paragraph(html);
	const chunks = [];
	let current = ''; // accumulator for the chunk being built

	for (const block of blocks) {
		// Block too large to share a chunk → flush and push solo
		if (block.length > maxChars) {
			if (current) {
				chunks.push(current);
				current = '';
			}
			chunks.push(block);
			continue;
		}

		// attempt to merge this block with the current accumulator using \n as separator
		const candidate = current
			? current + block
			: block;

		if (candidate.length <= maxChars) {
			// fits within the limit → extend the current chunk
			current = candidate;
		} else {
			// too large → flush the current chunk and start a new one with this block
			chunks.push(current);
			current = block;
		}
	}

	// flush any remaining accumulated text
	if (current){
		chunks.push(current);
	}

	return chunks;
}


// @license-end
