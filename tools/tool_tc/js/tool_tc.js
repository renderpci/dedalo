// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_TC (module)
* Client-side controller for the Dédalo timecode-offset tool (tool_tc).
*
* tool_tc lets users shift all timecode tags embedded in a transcription component
* forward or backward by an arbitrary number of seconds. Timecodes follow the format
* `[TC_HH:MM:SS.mmm_TC]`. The tool is restricted to section type rsc36
* (audio-visual transcription) as declared in register.json (dd1350).
*
* Lifecycle — identical to every Dédalo tool:
*   1. `init(options)`  — extends tool_common.prototype.init; seeds language vars.
*   2. `build(autoload)` — extends tool_common.prototype.build; resolves the
*        `main_element` shortcut from the ddo_map role "main_element".
*   3. `render(options)` — delegated to tool_common.prototype.render (error-guarded).
*   4. `edit(options)`   — delegated to render_tool_tc.prototype.edit; builds the
*        two-panel UI: a read-only preview of the transcription component on the left,
*        and a language-selector + offset-input + apply-button on the right.
*
* Key methods:
*   `init`               — seeds self.langs and self.source_lang after generic init
*   `build`              — resolves self.main_element from ddo_map
*   `get_component`      — (re)loads the transcription component for a given language
*   `change_all_time_codes` — sends an RPC to the server-side `change_all_timecodes`
*                          PHP action and resolves with the replacement map
*
* Server-side handler: class.tool_tc.php → `change_all_timecodes(object $options)`.
*
* Exported symbols:
*   tool_tc — tool constructor; use via open_tool / view_modal from tool_common.
*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_tc} from './render_tool_tc.js'




/**
* TOOL_TC
* Constructor for the timecode-offset tool.
*
* Instance properties are seeded to null/undefined here; the concrete values are
* assigned during `init()` (base properties) and `build()` (resolved elements).
* All instance state declared here follows the shared Dédalo tool contract
* (see tool_common for the full property set).
*
* Additional properties specific to tool_tc:
*   @var {string|null} source_lang  - The lang tag active in the caller component
*     when the tool was opened (e.g. 'lg-eng'); used as the default language in the
*     language selector rendered by render_tool_tc.
*   @var {Array|null}  langs        - All project languages from
*     page_globals.dedalo_projects_default_langs; populates the language-selector
*     dropdown so users can preview timecodes for any available language.
*   @var {Object|null} caller       - The component instance (e.g. component_input_text
*     or component_text_area inside section rsc36) that launched the tool; carries
*     the section_tipo, section_id, and lang needed to issue the server RPC.
*   @var {Object|null} main_element - Shortcut to the ar_instances entry whose
*     ddo_map `role` is "main_element"; resolved in build() after the generic
*     tool_common build has populated ar_instances.
*/
export const tool_tc = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null

	this.source_lang	= null
	//this.target_lang
	this.langs			= null
	this.caller			= null
}//end tool_tc



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared Dédalo lifecycle methods into tool_tc.
*
* render  — from tool_common: error-guarded entry point that delegates to
*            common.prototype.render on the happy path, or surfaces a formatted
*            error panel when self.error is set during init/build.
* destroy — from common: tears down DOM nodes, unregisters event tokens, and
*            marks the instance as 'destroyed' so it can be garbage-collected.
* refresh — from common: destroys child instances and re-runs build → render,
*            optionally constraining to 'content'-level re-render.
* edit    — from render_tool_tc: builds the two-panel edit UI (transcription
*            component preview + language selector + offset controls).
*/
// prototypes assign
	tool_tc.prototype.render	= tool_common.prototype.render
	tool_tc.prototype.destroy	= common.prototype.destroy
	tool_tc.prototype.refresh	= common.prototype.refresh
	tool_tc.prototype.edit		= render_tool_tc.prototype.edit



/**
* INIT
* Initialises the tool_tc instance.
*
* Delegates to tool_common.prototype.init for the standard Dédalo tool
* bootstrapping (caller resolution, tool_config cascading, instance property
* seeding), then appends two properties that are specific to this tool:
*
*   - `self.langs` — full ordered list of project languages used to populate the
*     language-selector dropdown in the edit UI.
*   - `self.source_lang` — the language that was active in the caller component
*     when the tool was opened; becomes the initially-selected language so the
*     user sees the transcription in the same language they were editing.
*
* Note: `self.caller` must be non-null at this point. If the generic init fails
* to resolve a caller (e.g. missing raw_data in the URL), `self.caller.lang`
* will throw. The generic init already warns via console.warn in that case, but
* this method does not add a secondary guard.
*
* @param {Object} options - Standard tool init options forwarded verbatim to
*   tool_common.prototype.init (see tool_common.js for the full option shape).
* @returns {Promise<boolean>} Resolves with the value returned by
*   tool_common.prototype.init (true on success, false on double-init).
*/
tool_tc.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller.lang


	return common_init
}//end init



/**
* BUILD
* Builds the tool_tc instance by loading all ddo_map elements and resolving
* the `main_element` shortcut convenience reference.
*
* Delegates to tool_common.prototype.build (with the given `autoload` flag) to
* load the tool CSS and instantiate every entry in `tool_config.ddo_map` into
* `self.ar_instances`. After the generic build completes, this method resolves
* `self.main_element` — the transcription component instance that the tool
* operates on — by:
*   1. Finding the ddo_map entry whose `role` equals `"main_element"`.
*   2. Locating the corresponding live instance in `self.ar_instances` by tipo.
*
* `self.main_element` is used heavily by render_tool_tc (preview rendering) and
* by `change_all_time_codes` (supplying section_tipo, section_id, and lang to
* the server RPC).
*
* Any exception thrown during main_element resolution is caught, stored as
* `self.error`, and logged; the tool_common render pipeline will then display an
* error panel instead of the normal UI.
*
* @param {boolean} [autoload=false] - When true, fetches the tool's registered
*   context from the API via `get_element_context` (dd1353 / dd1324).
*   Set to true on the normal open path; false when rebuilding after a language
*   switch where the context is already cached.
* @returns {Promise<boolean>} Resolves with the value returned by
*   tool_common.prototype.build (true on success).
*/
tool_tc.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* Loads (or reloads) the main transcription component for the specified language.
*
* Called by render_tool_tc when the user switches the language in the language
* selector dropdown. The flow is:
*   1. Collect every instance in `self.ar_instances` whose lang differs from the
*      target `lang` into `to_delete_instances` so `load_component` can destroy
*      and deregister them before registering the new instance.
*   2. Build the options object by cloning `self.main_element.context` (which
*      carries the tipo, section_tipo, model, and other ddo fields) and
*      overriding `lang`, `mode`, `section_id`, and `to_delete_instances`.
*   3. Delegate to `load_component` which handles instance lifecycle: destroy
*      stale instances, get_instance for the new lang, add to ar_instances,
*      and call build(true) to fetch data.
*
* The `mode` is forced to 'edit' regardless of the tool's own mode because the
* transcription component must be in edit mode for the offset apply to be able
* to refresh it correctly after saving.
*
* (!) Passing `clone(self.main_element.context)` as the base options means all
* fields from the server context (tipo, section_tipo, model, view, properties…)
* are inherited; only the fields explicitly overridden below differ.
*
* @param {string} lang - Language tag to load the component for (e.g. 'lg-eng').
* @returns {Promise<Object>} The fully initialised and built component instance
*   for the requested language.
*/
tool_tc.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to the desired
		const to_delete_instances = self.ar_instances.filter(el => el.lang!==lang)

	// options (clone context and edit)
		const options = Object.assign(clone(self.main_element.context),{
			self				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.main_element.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);


	return component_instance
}//end get_component



/**
* CHANGE_ALL_TIME_CODES
* Sends an RPC to the server to shift every `[TC_HH:MM:SS.mmm_TC]` tag in the
* transcription component data by `offset_seconds`, then resolves with the
* replacement map returned by the PHP handler.
*
* The RPC targets `dd_tools_api / tool_request`, which routes the call to the
* PHP static method `tool_tc::change_all_timecodes(object $options)`. That method
* is listed in the PHP class's `API_ACTIONS` constant, satisfying the
* SEC-024 / tool_security allowlist requirement.
*
* Request options forwarded to the PHP method:
*   - component_tipo  — tipo of the main transcription component
*   - section_tipo    — section tipo (rsc36 for AV transcriptions)
*   - section_id      — record ID
*   - lang            — language whose data column is being mutated
*   - offset_seconds  — signed integer; positive shifts timecodes later,
*                       negative shifts them earlier (server clamps to 0)
*   - key             — null here (process all data keys); could be a numeric
*                       key to limit processing to a single paragraph
*
* Timeout is set to 120 seconds because transcriptions can be very long and
* the regex-based replace loop on the server may be slow for large documents.
* `retries: 1` means the request is attempted only once to avoid duplicate
* writes if the first attempt partially succeeded.
*
* (!) SHOW_DEVELOPER is referenced inside the .then callback but is absent from
* the file-level global declarations (the @global eslint comment at the top).
* This will cause an eslint no-undef warning. Do NOT alter the reference — flag only.
*
* @param {number|string} offset_seconds - The number of seconds to add to every
*   timecode. May be a string (input value) because it comes directly from an
*   <input> element; the server casts it to int.
* @returns {Promise<Array|null>} Resolves with the array/map of original →
*   transformed timecode pairs returned by the PHP handler (`response.result`),
*   or null/undefined when the response carries no result.
*/
tool_tc.prototype.change_all_time_codes = function(offset_seconds) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
	// create_source builds the routing descriptor: { model, tipo, section_tipo, section_id, action }
		const source = create_source(self, 'change_all_timecodes')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				component_tipo	: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				lang			: self.main_element.lang,
				offset_seconds	: offset_seconds,
				key				: null
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
				dd_console("-> change_all_time_codes API response:",'DEBUG',response);
			}

			const result = response.result // array of changed tc

			resolve(result)
		})
	});
}//end change_all_time_codes



/**
* ADD_TIME_CODE_OFFSET
* (dead code — retained for historical reference; superseded by the server-side
* `tool_tc::replace_tc_codes` in class.tool_tc.php which handles edge cases such
* as millisecond precision, negative offset clamping, and large transcription texts
* more robustly. Do not remove without confirming no other caller depends on it.)
*
* Original purpose: given a single raw timecode tag string (e.g. '[TC_00:01:37.960_TC]')
* and a second offset, compute and return the shifted timecode tag string.
* The client-side implementation parsed hours/minutes/seconds manually and
* reassembled the tag; it did NOT handle negative total_secs (would produce
* a negative new_hours value) and did NOT preserve millisecond zero-padding.
*/
	// tool_tc.prototype.add_time_code_offset = function (tc_tag, offset) {

	// 	tc_tag = tc_tag.replace('[TC_','').replace('_TC]','')

	// 	const ar_tag_tc 	= tc_tag.split(':')
	// 	const ar_seconds 	= ar_tag_tc[2].split('.')

	// 	const hours 	= (ar_tag_tc[0])	? Number(ar_tag_tc[0])	: 0
	// 	const minutes 	= (ar_tag_tc[1]) 	? Number(ar_tag_tc[1]) 	: 0
	// 	const seconds 	= (ar_seconds[0]) 	? Number(ar_seconds[0])	: 0
	// 	const mseconds 	= (ar_seconds[1]) 	? ar_seconds[1]			: 0

	// 	const total_secs = (hours * 3600) + (minutes * 60) + seconds + Number(offset)

	// 	const new_hours 	= parseInt(total_secs / 3600)
	// 	const new_minutes 	= parseInt((total_secs % 3600) / 60)
	// 	const new_seconds	= total_secs - (new_hours * 3600 + new_minutes * 60)

	// 	const new_tag = '[TC_'.concat(new_hours.toString().padStart(2, '0'), ':', new_minutes.toString().padStart(2, '0'), ':', new_seconds.toString().padStart(2, '0'), '.', mseconds, '_TC]')

	// 	return new_tag
	// }//end add_time_code_offset



// @license-end
