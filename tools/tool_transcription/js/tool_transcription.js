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
* The browser path resolves to the `component_text_area` value shape — an array
* holding one HTML string of TC-tagged paragraphs, built by the shared
* `transcribers/lib/paragraphs.js` (`segments_to_html`); the server path writes
* the same shape server-side. An empty recognition NEVER becomes a value: it
* resolves `false`, so the existing transcript is never overwritten by nothing.
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
	import { tool_common } from '../../../core/tools_common/js/tool_common.js'
	import { render_tool_transcription } from './render_tool_transcription.js'
	import { parse_transcript, segments_to_html } from '../transcribers/lib/paragraphs.js'



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
* @param {Array} ar_requested_tools - Names of tools to check, e.g. ['tool_time_machine']
* @returns {Promise<Array>} Array of tool_simple_context objects for each accessible tool.
*/
tool_transcription.prototype.get_user_tools = async function(ar_requested_tools) {

	const self = this

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
* Transcribe the record's audio IN THE BROWSER and return the text ready for the
* transcription component.
*
* The audio never leaves the machine: the server only extracts a 16 kHz mono WAV
* from the media original, and every step after that happens here. That is what
* makes the tool usable on interviews holding personal data, in institutions with
* no cloud contract and often no outbound internet at all.
*
* The flow:
*   1. ask the server for the transcribable WAV (`create_transcribable_audio_file`);
*   2. fetch it, decode it at 16 kHz through the Web Audio API and TRANSFER the
*      samples to the worker (transferring, not copying — a 90-minute interview is
*      ~350 MB of float samples and copying it doubles that for no reason);
*   3. let the worker plan speech windows, transcribe them and report progress;
*   4. format the result into paragraphs (lib/paragraphs.js) and resolve;
*   5. delete the throwaway WAV — on EVERY exit path, including failure and cancel.
*
* Partial results are written to IndexedDB as they arrive, so closing the window
* mid-job no longer throws the work away: the next run resumes from where it got to.
*
* (!) Status output uses textContent throughout: worker output is recognised
* speech and may contain HTML characters (SEC-031).
*
* @param {Object} options
* @param {string} options.transcriber_quality - model id from the catalog
* @param {string} options.source_lang - Dédalo lang tag ('lg-spa'), mapped to ISO 639-1 here
* @param {Object} [options.format_options] - paragraph/timecode options (lib/paragraphs.js)
* @param {Object} [options.decode] - decoding overrides (lib/browser_whisper DEFAULT_DECODE)
* @param {string} [options.device] - 'auto' (default) | 'webgpu' | 'wasm'
* @param {Object} options.nodes - DOM nodes held by the render layer:
*   nodes.status_container, nodes.button_automatic_transcription
* @returns {Promise<Array>} single-element array with the HTML for component_text_area
*/
tool_transcription.prototype.automatic_transcription = async function(options) {

	const self = this

	// options
		const transcriber_quality	= options.transcriber_quality
		const nodes					= options.nodes
		const source_lang			= options.source_lang // self.transcription_component.lang
		const format_options		= options.format_options || {}

	// The key partial results are stored under. Per record AND per component, so
	// two transcriptions open at once never overwrite each other's progress.
		const resume_id = 'transcription_partial_'
			+ self.media_component.section_tipo + '_'
			+ self.media_component.section_id + '_'
			+ self.transcription_component.tipo

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

	/**
	* SET_STATUS
	* Write a line of plain text into the status area (never HTML — see SEC-031).
	*/
		const set_status = function(text) {
			nodes.status_container.classList.remove('hide')
			nodes.status_container.textContent = text
		}

	/**
	* SET_ERROR
	* Show an error and give the button back, so a failed run can be retried.
	* The message may contain a server path, so it is built as a text node.
	*/
		const set_error = function(message) {
			console.error('[tool_transcription]', message);
			nodes.status_container.classList.remove('loading_status')
			nodes.status_container.replaceChildren()
			const err_div = document.createElement('div')
			err_div.className = 'error'
			err_div.textContent = message
			nodes.status_container.appendChild(err_div)
			if (nodes.button_automatic_transcription) {
				nodes.button_automatic_transcription.classList.remove('disable')
			}
		}

	/**
	* PAGE_CLEANUP
	* Delete the server-side WAV when the tool WINDOW is closed mid-job.
	*
	* Every in-page exit path calls delete_audio below — but a closed tab runs
	* none of them, and the interview audio would sit on the server until someone
	* re-ran and completed a transcription of the same record. `data_manager`
	* cannot be trusted during unload (its promise machinery may never run), so
	* this is a bare `keepalive` fetch: the one request shape browsers promise to
	* finish after the page is gone. Best-effort by nature; the CSRF token rides
	* along because the API requires it (SEC-008).
	*/
		const page_cleanup = function() {
			try {
				const csrf = (typeof page_globals!=='undefined' && page_globals.csrf_token)
					? page_globals.csrf_token
					: null
				fetch('/dedalo/core/api/v1/json/', {
					method		: 'POST',
					credentials	: 'same-origin',
					keepalive	: true,
					headers		: csrf
						? { 'Content-Type': 'application/json', 'X-Dedalo-Csrf-Token': csrf }
						: { 'Content-Type': 'application/json' },
					body		: JSON.stringify({
						dd_api	: 'dd_tools_api',
						action	: 'tool_request',
						source	: create_source(self, 'delete_transcribable_audio_file'),
						options	: rqo.options
					})
				})
			} catch (error) {
				// the tab is going away; nothing left to report to
			}
		}

	/**
	* DELETE_AUDIO
	* Remove the server-side throwaway WAV.
	*
	* This is deliberately called on EVERY exit path. It used to run only on
	* success, which left a copy of the interview audio on disk after any error,
	* cancel or closed tab — the one file in this flow that must not linger.
	*/
		const delete_audio = function() {
			// the in-page exit ran; the unload hook is no longer needed
			window.removeEventListener('pagehide', page_cleanup)

			const cleanup_rqo = {
				dd_api	: 'dd_tools_api',
				action	: 'tool_request',
				source	: create_source(self, 'delete_transcribable_audio_file'),
				options	: rqo.options
			}
			data_manager.request({
				body	: cleanup_rqo,
				retries	: 1,
				timeout	: 3600 * 1000
			})
			.catch(function(error){
				console.error('[tool_transcription] could not delete the temporary audio file:', error);
			})
		}

	// Server-side audio preparation. Long, because a large video has to be
	// re-encoded before anything can be transcribed.
		const response = await data_manager.request({
			body	: rqo,
			retries	: 1, // one try only
			timeout	: 3600 * 1000 // 3600 secs waiting response
		})
		if(SHOW_DEVELOPER===true) {
			dd_console("-> transcription_component API response:",'DEBUG',response);
		}
		if (!response?.result) {
			set_error( response?.msg || 'Error converting audio' )
			return false
		}
		// From here a WAV of the interview exists on the server: arm the unload
		// hook so even a closed window deletes it.
		window.addEventListener('pagehide', page_cleanup)

	// Map the Dédalo lang tag ('lg-spa') to the ISO 639-1 code ('es') the model
	// takes as its language hint.
		const json_langs	= self.json_langs || await get_json_langs() || []
		const lang_obj		= json_langs.find(item => item.dd_lang===source_lang)
		const lang			= lang_obj ? lang_obj.tld2 : 'en'
		if (json_langs.length<1) {
			console.error('Error. Expected array of json_langs but empty result is obtained :', json_langs);
		}
		if(SHOW_DEBUG===true) {
			console.log('Automatic_transcription source lang:', lang);
		}

	// Where the browser may load the model from. The browser cannot read the
	// install's configuration, so it asks: the store URL, whether a public hub is
	// permitted (normally NOT — these are personal recordings), and whether the
	// store actually holds anything. Without that last fact a missing model fails
	// as an opaque 404 from inside the ONNX runtime.
		const sources_response	= await self.get_model_sources()
		const sources			= (sources_response && sources_response.result)
			? sources_response.result
			: { model_host: '/dedalo/ai_models/', allow_hub: false, store_ready: true }

		// Refuse EARLY and specifically when the chosen model is not in the store.
		// Left to the runtime, this fails as "Could not locate file: …/config.json"
		// from inside the ONNX loader — after the audio has been prepared, and with
		// a message that names neither the model nor what to do about it.
		// `installed` absent = an older server that cannot tell (allow, as before);
		// an EMPTY array is a real answer: nothing is installed.
		const model_ready	= !Array.isArray(sources.installed)
			|| sources.installed.includes(transcriber_quality)

		if (sources.allow_hub!==true && (sources.store_ready===false || !model_ready)) {
			const message = (sources.store_ready===false)
				? (self.get_tool_label('model_store_empty')
					|| 'No local speech models are installed. Ask your administrator to seed the model store (scripts/fetch_ai_models.ts).')
				: `${self.get_tool_label('model_not_installed') || 'This model is not installed on this server'}: ${transcriber_quality}`
			set_error( message )
			delete_audio()
			return false
		}

	// Anything already transcribed in a previous, interrupted run.
		const saved_partial	= await data_manager.get_local_db_data( resume_id, 'status' )
		const resume		= (saved_partial && saved_partial.model===transcriber_quality && Array.isArray(saved_partial.segments))
			? saved_partial
			: null

	// The worker. Held on the instance so the cancel button can reach it.
		const transcribe_worker = new Worker(
			'../../tools/tool_transcription/transcribers/browser_whisper/browser_whisper.js',
			{ type : 'module' }
		)
		self.transcribe_worker = transcribe_worker

	return new Promise(async function(resolve){

		set_status( self.get_tool_label('processing_audio') || 'Processing audio...' )
		nodes.status_container.classList.add('loading_status')

		let speech_seconds = 0

		/**
		* FINISH
		* The single exit: stop the worker, delete the audio, drop the saved
		* partial and hand the formatted text back. Written once so no path can
		* forget the clean-up.
		*
		* AN EMPTY RESULT NEVER BECOMES A VALUE. With no segments — a cancel before
		* the first window finished, or a recording in which the detector found no
		* speech — resolving [''] would make the caller set_value('') and SAVE,
		* silently erasing whatever transcript the component already held. Nothing
		* recognised means nothing to write, and the run reports why instead.
		*/
		const finish = function(segments) {

			transcribe_worker.terminate()
			self.transcribe_worker = null
			delete_audio()
			data_manager.set_local_db_data({ id: resume_id, segments: [], model: null }, 'status')

			nodes.status_container.classList.remove('loading_status')

			if (!Array.isArray(segments) || segments.length===0) {
				set_error(
					self.get_tool_label('no_speech_recognized')
					|| 'No speech was recognized — the existing text was left untouched.'
				)
				resolve( false )
				return
			}

			resolve([ segments_to_html( segments, format_options ) ])
		}

		transcribe_worker.onmessage = function(e) {

			const status	= e.data.status
			const data		= e.data.data

			switch (status) {

				// Model download / compilation.
				case 'init': {
					const label = data.status==='ready'
						? self.get_tool_label( data.device==='webgpu' ? 'setting_up' : 'procesing' )
						: self.get_tool_label( 'initializing' )
					const loaded = (data.progress)
						? ` : ${parseInt(data.progress).toString().padStart(2, 0)}%`
						: (data.status==='ready' ? '' : ' : 00%')
					set_status( `${label}${loaded}` )
					break;
				}

				// The window plan: from here on there is a real denominator for
				// progress, instead of "still working".
				case 'plan':
					speech_seconds = data.speech_seconds
					break;

				case 'window_start': {
					nodes.status_container.classList.remove('loading_status')
					const percent = speech_seconds>0
						? Math.min( 99, Math.round((data.done_seconds / speech_seconds) * 100) )
						: 0
					set_status( `${self.get_tool_label('procesing') || 'Processing'} : ${percent}%` )
					break;
				}

				// Live tokens while a window is decoded (greedy decoding only).
				case 'partial':
					nodes.status_container.classList.remove('loading_status')
					// SEC-031: worker output is recognised speech; text only.
					nodes.status_container.textContent = data.text
					break;

				// A window finished: persist so a closed tab can resume.
				case 'progress':
					data_manager.set_local_db_data({
						id			: resume_id,
						segments	: data.segments,
						model		: transcriber_quality,
						updated		: Date.now()
					}, 'status')
					break;

				case 'end':
					finish( data.segments )
					break;

				case 'error':
					transcribe_worker.terminate()
					self.transcribe_worker = null
					delete_audio()
					set_error( data.message )
					resolve( false )
					break;
			}
		}

		transcribe_worker.onerror = function(e) {
			transcribe_worker.terminate()
			self.transcribe_worker = null
			delete_audio()
			set_error( 'Worker error [transcribe]: ' + (e.message || '') )
			resolve( false )
		}

		try {
			// Decode to exactly 16 kHz mono — Whisper's only accepted input rate.
			// AudioContext is unavailable inside a Worker, so this must happen here.
			const audio_buffer	= await fetch_audio( response.result );
			const audio_ctx		= new AudioContext({ sampleRate: 16000 });
			let audio_data
			try {
				audio_data = await audio_ctx.decodeAudioData(audio_buffer);
			} finally {
				// Close the context IMMEDIATELY: the decoded AudioBuffer outlives it,
				// and browsers cap live AudioContexts per page (Chrome: 6) — without
				// this, the sixth transcription in the same tool window fails to
				// construct one at all.
				audio_ctx.close().catch(function(){ /* already closed */ })
			}
			const audio_chanel	= audio_data.getChannelData(0)

			transcribe_worker.postMessage(
				{
					action	: 'transcribe',
					options	: {
						audio			: audio_chanel,
						sample_rate		: 16000,
						language		: lang,
						model			: transcriber_quality,
						device			: options.device || 'auto',
						dtype			: options.dtype,
						decode			: options.decode,
						sources			: sources,
						resume_segments	: resume ? resume.segments : undefined,
						resume_seconds	: resume ? resume_seconds_of( resume.segments ) : 0
					}
				},
				// Transfer the samples instead of copying them: for a long
				// interview the copy alone can exhaust the tab's memory.
				[ audio_chanel.buffer ]
			);
		} catch (error) {
			transcribe_worker.terminate()
			self.transcribe_worker = null
			delete_audio()
			set_error( 'Could not decode the audio: ' + error.message )
			resolve( false )
		}
	});

}//end automatic_transcription



/**
* FETCH_AUDIO
* Read the speech-recognition audio the server just prepared.
*
* THE WEB SERVER SERVES THESE BYTES, never the engine. Installs hold single AV
* files of 16-32 GB, so the media path must stay Apache/nginx `sendfile` with
* Range intact — engineering/MEDIA_PROTECTION.md §1: "never put an application
* process in the media-serving path". A logged-in user already carries the
* `dedalo_media_auth` cookie (Rule A), which is what authorises this read.
*
* The one requirement that follows: the media base must be reachable from the
* application's own page. Same origin is the production layout and needs nothing;
* a media host on a DIFFERENT origin (a separate Apache/CDN, or a dev box with
* the app on one port and media on another) must send CORS headers for the app's
* origin, or the browser refuses the read — the same restriction that makes a
* subtitle track fail with "Domains, protocols and ports must match". The error
* below says so, because the raw failure is an unexplained "Failed to fetch".
*
* @param {string} url - the media URL returned by create_transcribable_audio_file
* @returns {Promise<ArrayBuffer>} the raw audio bytes
*/
const fetch_audio = async function( url ) {

	let response
	try {
		response = await fetch( url, { credentials: 'include' } )
	} catch (error) {
		throw new Error(
			`the audio file could not be read from ${url} (${error.message}). `
			+ 'If the media server is on another host or port than the application, it must allow '
			+ "cross-origin reads from this page's origin."
		)
	}

	if (!response.ok) {
		throw new Error(`the audio file could not be read (HTTP ${response.status}) from ${url}`)
	}

	return await response.arrayBuffer()
}//end fetch_audio



/**
* RESUME_SECONDS_OF
* How far a saved partial transcript reached — the point the worker resumes from.
*
* The end of the last segment, not the count of segments: windows are planned on
* the audio timeline, so seconds are the only meaningful cursor.
*
* @param {Array} segments
* @returns {number} seconds
*/
const resume_seconds_of = function( segments ) {

	if (!Array.isArray(segments) || segments.length===0) {
		return 0
	}

	const last = segments[segments.length - 1]

	return (typeof last.end==='number')
		? last.end
		: (typeof last.start==='number' ? last.start : 0)
}//end resume_seconds_of



/**
* GET_MODEL_SOURCES
* Ask the server where in-browser models may be loaded from.
*
* The answer is install configuration the browser is about to act on: the model
* store URL, whether falling back to a public model hub is allowed (off by
* default — the recordings are personal data and an air-gapped archive must
* work), and whether the store has been seeded at all.
*
* @returns {Promise<Object>} { result: { model_host, allow_hub, store_ready } }
*/
tool_transcription.prototype.get_model_sources = async function() {

	const self = this

	const rqo = {
		dd_api	: 'dd_tools_api',
		action	: 'tool_request',
		source	: create_source(self, 'get_model_sources'),
		options	: {}
	}

	try {
		return await data_manager.request({ body: rqo, retries: 1 })
	} catch (error) {
		console.error('[tool_transcription] could not read the model sources:', error);
		return false
	}
}//end get_model_sources



/**
* DOWNLOAD_MODEL
* Ask the server to download one catalog model into the install's own store.
*
* Admin-gated and validated SERVER-side (global admin, catalog names only); the
* download runs as a background job there. The caller polls get_model_sources
* until the model shows up in `installed`.
*
* @param {string} model - catalog model id (e.g. 'onnx-community/whisper-medium-ONNX')
* @returns {Promise<Object|false>} the API response, or false on transport failure
*/
tool_transcription.prototype.download_model = async function( model ) {

	const self = this

	const rqo = {
		dd_api	: 'dd_tools_api',
		action	: 'tool_request',
		source	: create_source(self, 'download_model'),
		options	: { model: model }
	}

	try {
		return await data_manager.request({ body: rqo, retries: 1 })
	} catch (error) {
		console.error('[tool_transcription] could not start the model download:', error);
		return false
	}
}//end download_model



/**
* SAVE_TRANSCRIPTION
* Persist an automatic-transcription result as THE transcription of the
* component's current language: always item id 1, replacing whatever it held.
*
* This deliberately does NOT go through set_value(0, …): that helper derives
* the target item from `self.data.entries` — the tab's transient state, which
* after an hour of inference can be stale or empty. When it was, the save went
* out id-less, the server (faithfully to the shared-id slice semantics)
* appended a NEW item with a minted id, and the editor — bound to item 1 —
* showed nothing while the transcript sat in item 2 (live: rsc167/528,
* 2026-07-28). A transcription is by contract the lang's single main text, so
* the tool STATES the slot instead of deriving it.
*
* @param {string} html - the TC-tagged paragraph HTML for component_text_area
* @returns {Promise} the component's change_value promise (normal save + refresh)
*/
tool_transcription.prototype.save_transcription = function( html ) {

	const self		= this
	const component	= self.transcription_component

	return component.change_value({
		changed_data : [Object.freeze({
			action	: 'update',
			id		: 1,
			key		: 0,
			value	: {
				id		: 1,
				lang	: component.lang,
				value	: html
			}
		})],
		refresh : true
	})
}//end save_transcription



/**
* REGROUP_PARAGRAPHS
* Re-paragraph the transcription that is ALREADY in the component.
*
* Transcripts made before the paragraph grouper existed (and any transcript whose
* owner wants a different timecode density) are a wall of five-second fragments,
* one per recogniser segment. This reads the stored text back into segments —
* the timecode marks are the only structure needed to do that — and rebuilds it
* with the current paragraph rules. Nothing is re-recognised, so it is instant
* and cannot change a single word.
*
* The value goes back through set_value, i.e. the normal component save: the
* previous text stays in the time machine like any other edit.
*
* @param {Object} [options]
* @param {Object} [options.format_options] - paragraph/timecode options (lib/paragraphs.js)
* @param {number} [options.key=0] - which value of the component to rebuild
* @returns {boolean} false when there is nothing to regroup
*/
tool_transcription.prototype.regroup_paragraphs = function(options) {

	const self		= this
	const opts		= options || {}
	const key		= opts.key || 0
	const entries	= (self.transcription_component.data || {}).entries || []
	const current	= (entries[key] || {}).value || ''

	if (current.trim()===''){
		return false
	}

	const segments = parse_transcript( current )
	if (segments.length===0) {
		return false
	}

	self.transcription_component.set_value(
		key,
		segments_to_html( segments, opts.format_options || {} )
	)

	return true
}//end regroup_paragraphs



/**
* ABORT_TRANSCRIPTION
* Cancel a running browser transcription, keeping what is already done.
*
* The worker cannot be interrupted mid-inference, so it is ASKED to stop: it
* finishes the window it is on and answers with an 'end' message carrying every
* segment recognised so far, which then travels the normal path into the text
* component. Terminating the worker outright would throw that away.
*
* @returns {boolean} true when there was something to cancel
*/
tool_transcription.prototype.abort_transcription = function() {

	const self = this

	if (!self.transcribe_worker) {
		return false
	}

	self.transcribe_worker.postMessage({ action: 'abort' })

	return true
}//end abort_transcription



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
