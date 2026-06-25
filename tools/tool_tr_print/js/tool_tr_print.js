// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* TOOL_TR_PRINT
* Tool that renders a print-ready view of a transcription component's text and
* associated metadata (timecodes, indexations, annotations, speaker names, etc.).
*
* This tool is opened from a component_text_area (the "transcription component")
* and gives the user a read-only, printable layout with configurable visibility
* toggles for each element class (header, time codes, persons, indexations, notes,
* languages, dividing lines).  Three display modes are available:
*
*   - Original  — raw text converted to HTML via `tr.add_tag_img_on_the_fly`,
*                 preserving the inline tag images as-is (default on open).
*   - Default   — structured table layout built by `render_default` in
*                 `render_tool_tr_print.js`, resolving index/note/person tags
*                 into human-readable labels and cross-links.
*   - Source    — plain raw text content displayed as plain text (no tag expansion).
*
* The header panel aggregates metadata from sections related to the transcription
* (e.g. the interview session, interviewees, camera operators) by fetching the
* `related_sections` context that the transcription component already carries.
*
* Exported symbols:
*   tool_tr_print — constructor; prototype methods assigned below.
*/

// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_tr_print} from './render_tool_tr_print.js'
	import {tr} from '../../../core/common/js/tr.js'



/**
* TOOL_TR_PRINT
* Constructor for the transcription print tool.
*
* All properties are seeded to null/empty here and populated by `init` and
* `build` following the standard Dédalo tool lifecycle.
*
* Notable properties beyond the common tool baseline:
*   source_lang            — language code of the calling component at the time
*                            the tool was opened; used as the initial display lang.
*   target_lang            — reserved for a future translation target; currently
*                            left null (translation workflow not yet implemented).
*   langs                  — full array of project-level languages drawn from
*                            `page_globals.dedalo_projects_default_langs`.
*   transcription_component — the live component_text_area instance whose content
*                            this tool renders; resolved during `build` from
*                            `self.caller.tipo` inside `self.ar_instances`.
*/
export const tool_tr_print = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null
	this.transcription_component	= null // component text area where we are working into the tool
}//end tool_tr_print



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the standard Dédalo tool/component lifecycle
* into tool_tr_print.
*
* - render  — generic tool render from tool_common (handles error fallback).
* - destroy — generic component teardown from common (removes DOM node, clears
*             event tokens, nullifies properties).
* - refresh — generic component refresh from common (re-builds and re-renders
*             using the already-loaded instance state).
* - edit    — concrete render implementation from render_tool_tr_print; builds
*             the print-layout UI with the left control panel and right text area.
*/
// prototypes assign
	tool_tr_print.prototype.render	= tool_common.prototype.render
	tool_tr_print.prototype.destroy	= common.prototype.destroy
	tool_tr_print.prototype.refresh	= common.prototype.refresh
	tool_tr_print.prototype.edit	= render_tool_tr_print.prototype.edit



/**
* INIT
* Initialises the tool instance by delegating to `tool_common.prototype.init`
* and then setting the transcription-print–specific language properties.
*
* After the common init resolves:
*   - `self.langs` is populated from `page_globals.dedalo_projects_default_langs`
*     (all languages available in this Dédalo installation).
*   - `self.source_lang` is taken from the caller component's own `lang` property
*     so the initial display language matches what the editor was viewing.
*     Falls back to null when no caller or caller has no lang (e.g. new-window path
*     before the caller has been fully reconstructed).
*   - `self.target_lang` is explicitly set to null; it is reserved for a future
*     translation-comparison mode and is not used by the current render code.
*
* @param {Object} options - Standard tool init options object (see tool_common.init
*   for the full shape: caller, lang, mode, model, section_tipo, section_id, etc.)
* @returns {Promise<boolean>} Resolves to the value returned by tool_common.init
*   (true on success, false when already initialised).
*/
tool_tr_print.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller && self.caller.lang
			? self.caller.lang
			: null
		self.target_lang	= null


	return common_init
}//end init



/**
* BUILD
* Builds the tool instance by delegating to `tool_common.prototype.build` and
* then resolving the transcription-specific state needed by the render layer.
*
* After the common build resolves, this method:
*   1. Locates `self.transcription_component` — the component_text_area instance
*      whose `tipo` matches `self.caller.tipo` inside `self.ar_instances`.  This
*      is the component that was active when the user opened the print tool.
*   2. Snapshots `self.ar_raw_data` from `transcription_component.data.value`.
*      Each element is a plain object with at minimum a `value` string property
*      containing the raw Dédalo tag markup for one language/variant block.
*   3. Pre-fetches tag resolution data via `get_tags_info(['index','note','reference'])`,
*      storing the result in `self.tags_info`.  This is an asynchronous API call
*      that returns resolved index term labels, note bodies, and reference data so
*      the render layer can expand tag IDs without hitting the server again.
*
* Any error during the transcription-specific setup is caught, stored on
* `self.error` (so the generic render can show an error view), and logged.
* The common_build return value is still propagated so callers see the outcome
* of the base build step.
*
* @param {boolean} [autoload=false] - When true, the common build also triggers
*   an automatic data load for every ddo_map entry (passed through to tool_common).
* @returns {Promise<Object>} Resolves to the return value of tool_common.build
*   (the tool_common instance or a falsy error sentinel).
*/
tool_tr_print.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// transcription_component. fix transcription_component for convenience
			const transcription_component_tipo	= self.caller.tipo
			self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_tipo)
			self.ar_raw_data					= self.transcription_component.data.value

			self.tags_info	= await self.transcription_component.get_tags_info(['index','note','reference'])
	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* LOAD_RELATION_LIST
* Fetches the list of sections that are related to the current transcription
* component's parent section.  The result is used by the header rendering logic
* to display metadata from linked sections (e.g. the interview session, archive
* documents, or other resources associated with the transcription).
*
* The request uses `action: 'related_search'` with `mode: 'related_list'`, which
* instructs the API to return both context (section labels, component labels) and
* data (component values) for all section types (`section_tipo: ['all']`).
*
* SQO notes:
*   - `filter_by_locators` limits results to sections already linked to the
*     transcription component's own section (section_tipo + section_id pair).
*   - `full_count: false` skips the expensive COUNT query since pagination is
*     not needed here.
*   - The `limit` key is intentionally commented out — removing the default limit
*     ensures all related sections are returned regardless of list size.
*
* (!) This method is defined on the prototype but is NOT called from `build` or
* any render path in the current codebase.  The header render in
* `render_tool_tr_print.js` reads `transcription_component.data.related_sections`
* directly (pre-loaded by the component's own API call).  This method may be a
* remnant of an earlier design or reserved for a future explicit reload path.
*
* @returns {Promise<Object>} Resolves to `api_response.result`, which contains
*   `{ context: Array, data: Array }` matching the standard Dédalo read-result
*   shape, or undefined/null if the API response has no result.
*/
tool_tr_print.prototype.load_relation_list = async function() {

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
* TAGS_TO_HTML
* Converts a raw Dédalo transcription text string (containing embedded tag
* markup) into an HTML string suitable for `insertAdjacentHTML` injection.
*
* Delegates to `tr.add_tag_img_on_the_fly`, which expands every known tag type
* (timecodes, index markers, person markers, etc.) into their `<img>` or inline
* HTML equivalents for browser display.
*
* Example conversion:
*   Input:  '[TC_00:15:12:01.000]'
*   Output: '<img id="[TC_00:00:25.684_TC]" class="tc" src="" ... />'
*
* A null/falsy `value` short-circuits to null without calling into `tr`, matching
* the guard pattern used throughout the render layer to handle empty data slots.
*
* @param {string|null} value - Raw transcription text with embedded Dédalo tags,
*   or null/undefined/empty string for empty slots.
* @returns {string|null} HTML string with tags expanded, or null when `value` is
*   falsy.
*/
tool_tr_print.prototype.tags_to_html = function(value) {

	const html = (value)
		? tr.add_tag_img_on_the_fly(value)
		: null

	return html
}//end tags_to_html



/**
* BUILD_SUBTITLES
* Instantiates and builds a `service_subtitles` child instance attached to this
* tool.  The subtitle service consumes the transcription component's timecoded
* text to generate subtitle output (e.g. SRT, WebVTT).
*
* Resolution order for the underlying text area:
*   1. `self.transcription_component` — already resolved during `build` (preferred).
*   2. `self.get_component(self.lang)` — async fallback that fetches the component
*      from the API when `transcription_component` is not yet available.
*
* The new instance is pushed into `self.ar_instances` so the common lifecycle
* (destroy, refresh) can reach it.
*
* (!) `self` is used bare inside this method body (not `const self = this`).
* This means the method relies on the call-site always being invoked as a method
* on the tool instance — if ever called as a detached function it will throw a
* ReferenceError.  Do not destructure or detach this method.
*
* (!) This method is defined on the prototype but appears to have no call site in
* the current codebase.  It may be reserved for a planned subtitle-export feature
* or left over from an earlier iteration.
*
* @returns {Promise<Object>} Resolves to the fully-built `service_subtitles`
*   instance (`self.service_subtitles`).
*/
tool_tr_print.prototype.build_subtitles = async function() {

	const self = this

	const component_text_area = self.transcription_component || await self.get_component(self.lang)

	// get instance and init
		self.service_subtitles = await get_instance({
			model				: 'service_subtitles',
			mode				: 'edit',
			caller				: self,
			component_text_area	: component_text_area
		})

	self.ar_instances.push(self.service_subtitles)

	await self.service_subtitles.build()


	return self.service_subtitles
}//end build_subtitles



// @license-end
