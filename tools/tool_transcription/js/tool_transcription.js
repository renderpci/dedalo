// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* TOOL_TRANSCRIPTION (module)
*
* Dédalo tool that provides a side-by-side audiovisual player + text-area workspace
* for creating and editing transcriptions of media resources. The tool surfaces in a
* new browser window (`open_as: "window"` in register.json) launched from a section
* toolbar button.
*
* Architectural overview
* ----------------------
* The tool follows the standard Dédalo tool lifecycle (tool_common):
*   init(options) → build(autoload) → render() → edit()
*
* After `build()`, five named component roles are resolved from `tool_config.ddo_map`
* and attached as direct properties (see `build` for the role list).  The two primary
* roles are:
*   - `media_component`          — a component_av (or compatible) rendered in 'player'
*                                   view on the right side; the audio source for all
*                                   transcription operations.
*   - `transcription_component`  — a component_text_area rendered in edit mode on the
*                                   left; receives and stores the transcription text.
*
* Transcription engines
* ---------------------
* Two engine paths exist, selected at runtime by the user via a drop-down:
*
*   browser  (default) — runs OpenAI Whisper ONNX entirely in the client via a
*                         Web Worker (`browser_whisper.js`).  The server only prepares
*                         the audio file; all neural-network inference happens client-side
*                         using WebGPU (preferred) or WASM (fallback / compatibility
*                         mode, limited to small models due to RAM constraints).
*
*   server             — delegates the entire transcription job to a remote service
*                         (e.g. Babel); the client polls for completion via
*                         `check_server_transcriber_status`.
*
* Both paths resolve to a `dd_format` array of paragraph objects:
*   [ { dd_format: '[TC_00:00:05.600_TC] My transcription' }, … ]
* which `parse_dedalo_format` converts to the `component_text_area` value shape
* (an array containing a single HTML string).
*
* Subtitle generation
* -------------------
* `build_subtitles_file` requests the server to compute a WebVTT file from the current
* transcription text.  On success it publishes `updated_subtitles_file_<media_id>` so
* any open component_av player immediately reloads its captions track.
*
* Persistence
* -----------
* The transcription text is saved through the normal component_text_area save flow
* (no tool-specific persistence).  The selected transcriber engine and quality level
* are persisted in the client-side IndexedDB `status` table via `data_manager.set_local_db_data`
* so user preferences survive page reloads.
*
* Exported symbols
* ----------------
*   tool_transcription    — tool constructor (prototype methods below)
*   get_current_lang_info — utility that formats a lang code as "Label | tld3 | tld2"
*/



// import
	import { dd_console, get_json_langs } from '../../../core/common/js/utils/index.js'
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { common, create_source } from '../../../core/common/js/common.js'
	import { tool_common } from '../../tool_common/js/tool_common.js'
	import { render_tool_transcription } from './render_tool_transcription.js'



/**
* TOOL_TRANSCRIPTION
* Tool to translate contents from one language to other in any text component
*/
export const tool_transcription = function () {

	// @var {string|null} id - Instance identifier assigned by get_instance.
	this.id							= null
	// @var {string|null} model - Always 'tool_transcription'; set by tool_common.init.
	this.model						= null
	// @var {string|null} mode - Render mode (typically 'edit').
	this.mode						= null
	// @var {HTMLElement|null} node - Root DOM node once rendered.
	this.node						= null
	// @var {Array} ar_instances - Component instances built from tool_config.ddo_map.
	this.ar_instances				= null
	// @var {string|null} status - Lifecycle state: 'initializing' | 'initialized' | 'building' | 'built'.
	this.status						= null
	// @var {Array} events_tokens - Subscription tokens returned by event_manager.subscribe;
	//   collected here so destroy() can unsubscribe them all.
	this.events_tokens				= []
	// @var {string|null} type - Always 'tool'; set by tool_common.init.
	this.type						= null
	// @var {string|null} source_lang - Language code of the source transcription (e.g. 'lg-spa');
	//   derived from transcription_component.lang after build resolves related_component_lang.
	this.source_lang				= null
	// @var {string|null} target_lang - Reserved for future translation target; currently unused.
	this.target_lang				= null
	// @var {Array|null} langs - Array of language objects from page_globals.dedalo_projects_default_langs.
	this.langs						= null
	// @var {Object|null} caller - The section or component instance that opened this tool.
	this.caller						= null
	// @var {Object|null} media_component - component_av (or compatible) to be transcribed;
	//   matched from ar_instances via the 'media_component' role in tool_config.ddo_map.
	this.media_component			= null // component av that will be transcribed (it could be the caller)
	// @var {Object|null} transcription_component - component_text_area where the transcription
	//   text is authored; matched via the 'transcription_component' role in tool_config.ddo_map.
	this.transcription_component	= null // component text area where we are working into the tool
	// @var {Object|null} relation_list - API datum from load_relation_list; contains the list
	//   of top-section locators (section_tipo / section_id pairs) that reference the current record.
	this.relation_list				= null // datum of relation_list (to obtaim list of top_section_tipo/id)

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_transcription.prototype.render		= tool_common.prototype.render
	tool_transcription.prototype.destroy	= common.prototype.destroy
	tool_transcription.prototype.refresh	= common.prototype.refresh
	tool_transcription.prototype.edit		= render_tool_transcription.prototype.edit



/**
* INIT
* Initialises the tool instance by delegating to `tool_common.prototype.init` and then
* setting tool-specific properties that are not handled by the generic init.
*
* After the generic init resolves:
*   - `self.langs` is populated from `page_globals.dedalo_projects_default_langs`.
*   - `self.target_lang` is reset to null (translation target; not used in the current
*     release but reserved for future machine-translation integration).
*   - The previously selected transcriber engine is restored from the client-side
*     IndexedDB `status` table under the key `'transcriber_engine_select'`, so the
*     user's last choice is applied on the next open.
*
* The commented-out `self.source_lang` block below is intentionally preserved (dead code);
* source_lang is now derived inside `build` from `transcription_component.context.options`.
*
* @param {Object} options - Standard tool_common init options (caller, model, lang, etc.)
* @returns {Promise<boolean>} Result from tool_common.prototype.init (true on success).
*/
tool_transcription.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			// self.source_lang	= self.caller && self.caller.lang
			// 	? self.caller.lang
			// 	: null
			self.target_lang	= null

		// target transcriber. When user changes it, a local DB var is stored as 'transcriber_engine_select' in table 'status'
			const transcriber_engine_select_object = await data_manager.get_local_db_data(
				'transcriber_engine_select',
				'status'
			)
			if (transcriber_engine_select_object) {
				self.target_transcriber = transcriber_engine_select_object.value
			}


	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Builds the tool by delegating to `tool_common.prototype.build` and then resolving
* the five named component roles from `self.ar_instances`.
*
* Role resolution
* ---------------
* After the generic build populates `self.ar_instances` from `tool_config.ddo_map`,
* each of the following role names is looked up in the ddo_map and matched to the
* corresponding live instance:
*   'media_component'          — component_av (or compatible media player)
*   'transcription_component'  — component_text_area receiving the transcription text
*   'status_user_component'    — component for user-facing workflow status (e.g. mini select)
*   'status_admin_component'   — component for admin-facing workflow status
*   'references_component'     — component listing related references
*
* If a role is not declared in the ontology ddo_map, a warning is logged and that role
* is skipped (the property remains null on self).
*
* Language override
* -----------------
* When `transcription_component.context.options.related_component_lang` is defined and
* differs from the component's current lang, the component is re-built under the correct
* language.  This ensures the transcription text is loaded for the source language even
* when the tool was opened from a component displaying a different translation.
*
* Relation list
* -------------
* After roles are resolved, `self.load_relation_list()` is called to fetch the list of
* parent sections that link to the current transcription record.  The result is stored
* in `self.relation_list` and consumed by `render_tool_transcription` to populate the
* parent-section selector in the toolbar.
*
* @param {boolean} [autoload=false] - When true, fetches the tool's registered context
*   from the API (tool_common.build behaviour).
* @returns {Promise<boolean>} Result from tool_common.prototype.build (true on success).
*/
tool_transcription.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// fix components instances for convenience
			const roles = [
				'media_component',
				'transcription_component',
				'status_user_component',
				'status_admin_component',
				'references_component'
			];
			const roles_length = roles.length
			for (let i = 0; i < roles_length; i++) {

				const role	= roles[i]
				const ddo	= self.tool_config.ddo_map.find(el => el.role===role)
				if (!ddo) {
					console.warn(`Warning: \n\tThe role '${role}' it's not defined in Ontology and will be ignored`);
					continue;
				}
				self[role] = self.ar_instances.find(el => el.tipo===ddo.tipo)

				if(role === 'transcription_component'){
					// force change lang if related_component_lang is defined (original lang)
					if (self.transcription_component.context.options && self.transcription_component.context.options.related_component_lang) {
						if (self.transcription_component.lang !== self.transcription_component.context.options.related_component_lang) {
							self.transcription_component.lang = self.transcription_component.context.options.related_component_lang
							// set source land
							self.source_lang = self.transcription_component.lang
							// build again to force download data
							await self.transcription_component.build(true)
							if(SHOW_DEBUG===true) {
								console.log('Changed transcription_component lang to related_component_lang:', self.transcription_component.lang);
							}
						}
					}
				}
			}

		// relation_list. Load relation_list from API
			// This is used to build a select element to allow
			// user to select the top_section_tipo and top_section_id of current transcription
			self.relation_list = await self.load_relation_list()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_RELATION_LIST
* Fetches the list of parent sections that relate to the current transcription record
* via a `related_search` API call on the transcription component.
*
* The API is called with `mode: 'related_list'` and a filter that constrains results
* to the single record identified by the transcription component's own section_tipo and
* section_id.  The `section_tipo: ['all']` SQO parameter requests all section types
* rather than limiting to a specific ontology branch.
*
* The returned datum is stored in `self.relation_list` and later consumed by
* `render_related_list` (in render_tool_transcription.js) to build the parent-section
* `<select>` element in the toolbar.
*
* Datum shape (api_response.result):
* {
*   context : Array  — per-section_tipo label/tipo metadata
*   data    : Array  — flat list of component values keyed by section_tipo + section_id
* }
*
* @returns {Promise<Object>} The API result datum (context + data arrays), or undefined
*   if the API call fails.
*/
tool_transcription.prototype.load_relation_list = async function() {

	const self = this

	const transcription_component = self.transcription_component

	const source = {
		action			: 'related_search',
		model			: transcription_component.model,
		tipo			: transcription_component.tipo,
		section_tipo	: transcription_component.section_tipo,
		section_id		: transcription_component.section_id,
		lang			: transcription_component.lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		// limit				: 1,
		offset				: 0,
		full_count			: false,
		filter_by_locators	: [{
			section_tipo	: transcription_component.section_tipo,
			section_id		: transcription_component.section_id
		}]
	}

	const rqo = {
		action	: 'read',
		source	: source,
		sqo		: sqo
	}

	// get context and data
		const api_response = await data_manager.request({
			body : rqo
		})

	const datum = api_response.result


	return datum
}//end load_relation_list



/**
* GET_USER_TOOLS
* Queries the dd_tools_api to determine which of the requested tools are accessible
* to the current user.  Used by the render layer to conditionally show optional toolbar
* buttons (e.g. 'tool_time_machine', 'tool_tr_print').
*
* The result array contains one tool_simple_context object per accessible tool, each
* with properties: name, model, label, icon, css, properties, etc.  Tools that the
* user does not have permission to access are omitted from the array entirely.
*
* (!) `create_source(self, 'user_tools')` passes the action name as the second argument
* to generate a source descriptor; the action string itself has no routing significance
* here — only `dd_api: 'dd_tools_api'` and `action: 'user_tools'` in the rqo matter.
*
* (!) Note: `self` in the body of this function refers to the outer window `self`
* (the global WorkerGlobalScope / Window), NOT the tool instance, because this method
* does not capture `const self = this`. This is a pre-existing code pattern that works
* because `create_source` extracts the needed properties from whatever object is passed.
*
* @param {Array} ar_requested_tools - Names of tools to check, e.g. ['tool_time_machine']
* @returns {Promise<Array>} Array of tool_simple_context objects for each accessible tool.
*/
tool_transcription.prototype.get_user_tools = async function(ar_requested_tools) {

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'user_tools')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'user_tools',
			source	: source,
			options	: {
				ar_requested_tools : ar_requested_tools
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("[tool_transcription.get_user_tools] api_response:",'DEBUG',api_response);
				}

				const result = api_response.result // array of objects

				resolve(result)
			})
		})
}//end get_user_tools



/**
* BUILD_SUBTITLES_FILE
* Call to API to calculate current subtitles from the transcription
* and save it to a normalized file path like '/httpdocs/dedalo/media/av/subtitles/rsc35_rsc167_1_lg-spa.vtt'
* @see Note that component_av (in view 'player') is subscribed to event 'updated_subtitles_file_' + self.id
* and must be publish the change to force the load of new file in the player captions track
*
* The server-side handler reads the transcription component's stored value, parses the
* Dédalo timecode tag format (`[TC_HH:MM:SS.mmm_TC]`), wraps each paragraph as a WebVTT
* cue, and writes the file under the canonical media path.
*
* `max_charline` controls subtitle line-wrapping width (characters per line); the value
* is read from `self.characters_per_line`, which is set by the characters-per-line input
* in the render layer and persisted in localStorage as 'subtitles_characters_per_line'.
*
* The request uses `key: 0` to target the first (and only) datum item of the
* transcription component — multi-item transcription components are not supported.
*
* Timeout is extended to 120 seconds; subtitle generation on long recordings may require
* server-side parsing of large HTML strings.
*
* @returns {Promise<Object>} API response shape:
*   {
*     result : {boolean}  — true on success
*     url    : {string}   — absolute URL of the generated .vtt file
*     msg    : {string}   — human-readable status or error description
*   }
*/
tool_transcription.prototype.build_subtitles_file = async function() {

	const self = this

	// short vars
		const component_text_area	= self.transcription_component // component_text_area instance
		const lang					= component_text_area.data.lang // !important : get from data, not from context
		const max_charline			= self.characters_per_line // fixed from input 'input_characters_per_line'

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'build_subtitles_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				component_tipo	: component_text_area.tipo,
				section_tipo	: component_text_area.section_tipo,
				section_id		: component_text_area.section_id,
				lang			: lang,
				max_charline	: max_charline,
				key				: 0	// fixed component dato key as zero
			}
		}

	// call to the API, fetch data and get response
	return new Promise(function(resolve){

		data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 120 * 1000 // 120 secs waiting response
		})
		.then(function(response){
			if(SHOW_DEVELOPER===true) {
				dd_console("-> build_subtitles_file API response:",'DEBUG', response);
			}

			resolve(response)
		})
	});
}//end build_subtitles_file



/**
* AUTOMATIC_TRANSCRIPTION
* Create a transformer pipeline with Whisper
* using a browser WASM transcribe and save the resulting value
*
* This is the client-side (browser) transcription path.  It:
*   1. Requests the server to produce a 16 kHz mono WAV file suitable for Whisper
*      (action `create_transcribable_audio_file`) via dd_tools_api.
*   2. Fetches the resulting audio file, decodes it with the Web Audio API at 16 kHz,
*      and extracts the Float32Array from channel 0.
*   3. Spawns a Web Worker (`browser_whisper.js`) that loads the chosen ONNX Whisper
*      model and processes the audio.  The worker communicates back via `onmessage`
*      with a status field:
*        'init'              — model loading progress (0–100 %) or 'ready'
*        'on_chunk_start'    — a new audio chunk is about to be decoded
*        'callback_function' — intermediate word/phrase results (streaming display)
*        'end'               — final transcription array; triggers parse_dedalo_format
*   4. After the worker finishes, sends a cleanup request to delete the server-side
*      temporary audio file (`delete_transcribable_audio_file`).
*   5. Resolves the outer Promise with the `parse_dedalo_format` result — an array
*      containing a single HTML string ready to be passed to
*      `transcription_component.set_value(0, response[0])`.
*
* Device selection: when `nodes.transcriber_device_checkbox` is checked, the worker
* runs in WASM mode (CPU-only); unchecked = WebGPU.  WASM mode only supports small
* models because large ONNX models exceed the browser RAM limit for ArrayBuffer transfers.
*
* The server-preparation request uses a 3600-second timeout because large video files
* may take significant time to re-encode.  The same timeout is applied to the cleanup
* request (fire-and-forget: the Promise is not awaited).
*
* (!) Status container DOM output uses `textContent` throughout to prevent XSS from
* worker-supplied transcription fragments (SEC-031 markers in render_tool_transcription.js).
*
* @param {Object} options - Transcription configuration
* @param {string} options.transcriber_engine - Engine name selected by the user (e.g. 'local')
* @param {string} options.transcriber_quality - ONNX model identifier (e.g. 'Xenova/whisper-small')
* @param {string} options.source_lang - Dédalo language tag of the audio, e.g. 'lg-spa'; mapped
*   to a two-letter ISO 639-1 code (tld2) before being passed to the Whisper worker
* @param {Object} options.nodes - DOM node references held by the render layer:
*   nodes.status_container             {HTMLElement} — status display area
*   nodes.button_automatic_transcription {HTMLElement} — the trigger button (disabled during job)
*   nodes.transcriber_device_checkbox  {HTMLInputElement} — WASM mode toggle
* @returns {Promise<Array>} Resolves with the parse_dedalo_format result: an array of one
*   HTML string, e.g. ['<p>[TC_00:00:01.000_TC] Hello world</p>'].
*/
tool_transcription.prototype.automatic_transcription = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const transcriber_quality	= options.transcriber_quality
		const nodes					= options.nodes

	// source lang
		const source_lang 			= options.source_lang // self.transcription_component.lang

	// transcribe worker
		const transcribe_worker = new Worker( '../../tools/tool_transcription/transcribers/browser_whisper/browser_whisper.js', {
			type : 'module'
		})

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'create_transcribable_audio_file')

		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				media_ddo : {
					component_tipo		: self.media_component.tipo,
					section_id			: self.media_component.section_id,
					section_tipo		: self.media_component.section_tipo
				}
			}
		}
	// call to the API, fetch data and get response
		return new Promise(function(resolve){
			nodes.status_container.classList.remove('hide')
			nodes.status_container.classList.add('loading_status')
			// SEC-XSS-007: i18n label is plain text; textContent avoids HTML parsing.
			nodes.status_container.textContent = self.get_tool_label('processing_audio') || 'Processing audio...'
			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(async function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> transcription_component API response:",'DEBUG',response);
				}

				// error converting audio file
					if (!response?.result) {
						const msg = response?.msg || 'Error converting audio'
						console.error(msg);
						// SEC-031: build error node via DOM, msg may include attacker-controlled file/path
						nodes.status_container.replaceChildren()
						const err_div = document.createElement('div')
						err_div.className = 'error'
						err_div.textContent = msg
						nodes.status_container.appendChild(err_div)
						nodes.button_automatic_transcription.classList.remove('disable');
						return false;
					}

				// set the lang of the transcription
					const json_langs = self.json_langs || await get_json_langs() || []
					if (json_langs.length<1) {
						const msg = 'Error. Expected array of json_langs but empty result is obtained'
						console.error(msg + ' :', json_langs);
						// SEC-031: same as above
						nodes.status_container.replaceChildren()
						const err_div = document.createElement('div')
						err_div.className = 'error'
						err_div.textContent = msg
						nodes.status_container.appendChild(err_div)
					}
					// Map the Dédalo lang tag (e.g. 'lg-spa') to a two-letter ISO code
					// ('es') that the Whisper model accepts as its `language` hint.
					const lang_obj	= json_langs.find(item => item.dd_lang===source_lang)
					const lang		= lang_obj
						? lang_obj.tld2
						: 'en'

					if(SHOW_DEBUG===true) {
						console.log('Automatic_transcription source lang:', lang);
					}

				// Manage the worker answers
				// it could be the status of the process or the final transcription data
				transcribe_worker.onmessage = function(e) {
					const status	= e.data.status
					const data		= e.data.data

					switch (status) {
						case 'init':

							const progress	= data.progress;
							const status	= data.status;
							const device	= data.device;

							// 'webgpu' path uses 'setting_up' label; 'wasm' (CPU) uses 'procesing'
							const procesing_label = device==='webgpu' ? 'setting_up' : 'procesing';

							// set the label for all status as initializing and the ready to Setting_up
							// both labels are translated into the tool config.
							const label = status==='ready'
								? self.get_tool_label( procesing_label )
								: self.get_tool_label( 'initializing' )

							// Show download progress as percentage; omit when not available
							const loaded = (progress)
								? ` : ${parseInt(progress).toString().padStart(2, 0)}%`
								: (status==='ready')
									? ''
									: ' : 00%'
							const procesing = `${label}${loaded}`;
							// SEC-031: label is i18n; status text only.
							nodes.status_container.textContent = procesing;

							break;
						// on new chunk start empty the status_container, new phrase will be processed
						case 'on_chunk_start':
							nodes.status_container.textContent = '';
							nodes.status_container.classList.remove('loading_status')

							break;
						//every time that a word is processed and ready it is set at end of the phrase
						case 'callback_function':
							nodes.status_container.classList.remove('loading_status')
							// SEC-031: worker output may contain HTML chars from speech recognition.
							nodes.status_container.textContent = data;

							break;
						// final data as returned as array of objects with a dd_format parameter.
						case 'end':
							transcribe_worker.terminate()

								// Parse the final dedalo format
								// join all paragraphs into a valid value for component_text_area
								const final_tr_response = parse_dedalo_format(data)

							// delete audio file
								rqo.source.action = 'delete_transcribable_audio_file'

								data_manager.request({
									body : rqo,
									retries : 1, // one try only
									timeout : 3600 * 1000 // 3600 secs waiting final_tr_response
								})

							resolve( final_tr_response )
							break;
					}
				}
				transcribe_worker.onerror = function(e) {
					console.error('Worker error [transcribe]:', e);
					// SEC-031: static error label; built via DOM for consistency.
					nodes.status_container.replaceChildren()
					const err_div = document.createElement('div')
					err_div.className = 'error'
					err_div.textContent = 'Worker error [transcribe]'
					nodes.status_container.appendChild(err_div)
				}

				// Process the audio file to be sent to Worker
				// Used as module is possible send the URI, but as worker the AudioContext is not available
				// Re-sample the audio to exactly 16 kHz (Whisper's required sample rate) using
				// the Web Audio API; then extract the mono Float32Array from channel 0.
				const audio_buffer	= await fetch(response.result).then(res => res.arrayBuffer());
				const audio_ctx		= new AudioContext({ sampleRate: 16000 });
				const audio_data	= await audio_ctx.decodeAudioData(audio_buffer);
				const audio_chanel	= audio_data.getChannelData(0)

				const options = {
					audio_file	: audio_chanel,
					language	: lang,
					model		: transcriber_quality, //'onnx-community/whisper-large-v3-ONNX',// Xenova/whisper-small',
					device		: nodes.transcriber_device_checkbox.checked ? 'wasm' : 'webgpu'
				}

				// init the worker for transcription
				transcribe_worker.postMessage({
					options	: options
				})
			})
		})

}//end automatic_transcription



/**
* PARSE_DEDALO_FORMAT
* Process the segments into the HTML format supported by Dédalo with the time code tag format
* every segment is enclosed by a paragraph a <p> element
*
* Converts an array of Whisper segment objects into the value shape expected by
* `component_text_area.set_value`: an array with a single HTML string element.
*
* Each segment's `dd_format` string already contains the Dédalo timecode tag:
*   '[TC_HH:MM:SS.mmm_TC] transcribed text'
* This function wraps each such string in a `<p>` element and concatenates all
* paragraphs into a single `innerHTML` string.
*
* A DocumentFragment + temporary div are used to build the DOM safely before
* serialising to HTML; this avoids string concatenation XSS risks when `dd_format`
* values contain special characters from recognised speech.
*
* @param {Array} transcripts - Array of segment objects from the Whisper worker 'end' event:
*   [ { dd_format: '[TC_00:00:05.600_TC] My transcription' }, … ]
* @returns {Array} data - Single-element array containing the complete HTML string:
*   [ '<p>[TC_00:00:05.600_TC] My transcription</p><p>…</p>' ]
* Dédalo transcription format as HTML:
* <p>
* 	[TC_00:00:05.600_TC] My transcription
* <\p>
*/
const parse_dedalo_format = function( transcripts ){

	const transcripts_length = transcripts.length;

	// creating a fragment to storage all nodes
	const fragment = new DocumentFragment();

	for (let i = 0; i < transcripts_length; i++) {
		// create the text node with the transcription
		const current_text_node = document.createTextNode(transcripts[i].dd_format)

		// create the paragraph to enclose the text fragment
		const current_node = document.createElement("p");

		// add the text to the paragraph
		current_node.appendChild(current_text_node)
		// add to the fragment
		fragment.appendChild(current_node)
	}

	// Create a temporary container to insert the fragment and get the final HTML
	const temp_div = document.createElement('div');
	temp_div.appendChild(fragment);

	// create a valid data for the component_text_area
	const data = [ temp_div.innerHTML ]

	return data;
}// end parse_dedalo_format



/**
* AUTOMATIC_TRANSCRIPTION_SERVER
* Call the API to transcribe the audiovisual component with the source lang
* using a online service like babel or Google transcribe and save the resulting value
* (!) Tool transcription config transcriber must to be exists in register_tools section
*
* This is the server-side transcription path.  Unlike the browser path, this method
* only dispatches the job request and receives an immediate response containing a
* process ID (`pid`).  The caller is then responsible for polling via
* `check_server_transcriber_status` until the job completes.
*
* The PHP handler (`class.tool_transcription.php::automatic_transcription`) is resolved
* by `create_source(self, 'automatic_transcription')`.  That method must be listed in
* the tool's `API_ACTIONS` constant on the server.
*
* The request carries both the transcription and media DDO locators so the server can:
*   1. Read the media file path from the media component record.
*   2. Submit it to the remote transcription service.
*   3. Save the response text into the transcription component's section record.
*
* `self.context.config` is forwarded as-is so the PHP class can read installation-specific
* settings (API keys, endpoint URLs) stored in the tool's registered config component.
*
* Timeout: 3600 seconds.  The response is immediate (the server kicks off a background
* job and returns the pid), but network latency on slow connections can still be high.
*
* @param {Object} options - Server transcription options
* @param {string} options.transcriber_engine - Engine name identifier (e.g. 'babel')
* @param {string} options.transcriber_quality - Quality/model identifier (engine-specific)
* @param {string} options.source_lang - Dédalo language tag of the audio, e.g. 'lg-spa'
* @param {Object} options.nodes - DOM node references (same as automatic_transcription)
* @returns {Promise<Object>} API response shape:
*   {
*     result : { pid: string }  — on success; pid used for status polling
*     result : false            — on error
*     msg    : {string}         — human-readable status or error description
*   }
*/
tool_transcription.prototype.automatic_transcription_server = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const transcriber_quality	= options.transcriber_quality
		const nodes					= options.nodes

	// source lang
		const source_lang 			= options.source_lang

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source_server = create_source(self, 'automatic_transcription')

	// rqo
		const rqo_server = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source_server,
			options	: {
				source_lang : source_lang,
				transcription_ddo : {
					component_tipo	: self.transcription_component.tipo,
					section_id		: self.transcription_component.section_id,
					section_tipo	: self.transcription_component.section_tipo
				},
				media_ddo : {
					component_tipo		: self.media_component.tipo,
					section_id			: self.media_component.section_id,
					section_tipo		: self.media_component.section_tipo
				},
				transcriber_engine	: transcriber_engine,
				transcriber_quality	: transcriber_quality,
				config				: self.context.config
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo_server,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> automatic_transcription API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})

}//end automatic_transcription_server



/**
* CHECK_SERVER_TRANSCRIBER_STATUS
* Call the API to check the transcribe server status
* using a online service like babel or Google and check if server has done
* (!) Tool transcription config transcriber must to be exists in register_tools section
*
* Polls the server for the current state of a previously submitted server transcription
* job.  The `pid` value was returned by `automatic_transcription_server` and stored in
* the client-side IndexedDB under the key `'transcriber_process_<section_tipo>_<section_id>'`.
*
* The server responds with a numeric status code that maps to one of three states:
*   1 — No active process matching the pid (job vanished or was never started).
*   2 — Job is still running; the caller should poll again after a delay.
*   3 — Job completed; the transcription result has been written to the record.
*
* The `render_tool_transcription.get_server_status` helper wraps this method in a
* recursive setTimeout loop (4-second interval) that stops on status 1 or 3.
*
* `self.context.config` is forwarded so the PHP handler can locate the correct remote
* service connection settings (same as in `automatic_transcription_server`).
*
* @param {Object} options - Status check options
* @param {string} options.transcriber_engine - Engine name (must match the job's engine)
* @param {string|number} options.pid - Process ID returned by automatic_transcription_server
* @returns {Promise<Object>} API response shape:
*   {
*     result : { status: number }  — 1 (inactive) | 2 (running) | 3 (done)
*     msg    : {string}
*   }
*/
tool_transcription.prototype.check_server_transcriber_status = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const pid					= options.pid

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'check_server_transcriber_status')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				media_ddo : {
					component_tipo	: self.media_component.tipo,
					section_id		: self.media_component.section_id,
					section_tipo	: self.media_component.section_tipo
				},
				transcriber_engine	: transcriber_engine,
				config				: self.context.config,
				pid					: pid
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> check_server_transcriber_status API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end check_server_transcriber_status



/**
* GET_CURRENT_LANG_INFO
* Resolve the current tool selected lang in this format:
* 	Label | tld3 | tld2
* 	Greek | lg-ell | el
*
* Looks up `lang` in `page_globals.dedalo_projects_default_langs` (an array of lang
* objects with `value`, `label`, and `tld2` properties) and formats a human-readable
* descriptor string.  Returns 'Unknown lang' when the code is not found in the project
* langs array, so the display always has a fallback.
*
* Exported and consumed by `render_tool_transcription.js` to update the lang info
* display in the transcriber configuration panel whenever the user switches the active
* transcription language.
*
* @param {string} lang - Dédalo language tag, e.g. 'lg-ell'
* @returns {string} Formatted string 'Label | tld3 | tld2' (e.g. 'Greek | lg-ell | el'),
*   or 'Unknown lang' if the lang code is not present in the project langs list.
*/
export const get_current_lang_info = function( lang ) {

	const found = (page_globals.dedalo_projects_default_langs || []).find(el => el.value === lang)
	const current_lang_info = found
		? `${found.label} | ${found.value} | ${found.tld2}`
		: 'Unknown lang';

	return current_lang_info
}//end get_current_lang_info



// @license-end
