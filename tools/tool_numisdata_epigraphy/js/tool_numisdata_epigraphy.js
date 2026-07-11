// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* TOOL_NUMISDATA_EPIGRAPHY (module)
*
* Dédalo tool for epigraphic transcription of numismatic objects (coins, medallions, etc.).
*
* The tool exposes structured access to all epigraphic facets of a coin record:
*   - Obverse / reverse legends (inscriptions running along the rim)
*   - Obverse / reverse designs (decorative motifs described via epigraphy terms)
*   - Obverse / reverse symbols
*   - Obverse / reverse marks (mintmarks, control marks, countermarks)
*   - Edge design and edge legend
*
* Each facet is resolved through the tool's `ddo_map` (declared in the ontology) to a live
* component instance stored on `self[role]`.  The paired epigraphy thesaurus portal
* (`self.epigraphy`) provides the glyph picker used by the text-area components.
*
* Lifecycle:
*   1. `init(options)` — delegates to `tool_common.prototype.init`, then seeds language vars.
*   2. `build(autoload)` — delegates to `tool_common.prototype.build`, then resolves each
*       role from `ddo_map` → live instance via `self.ar_instances`.
*   3. `edit` (from `render_tool_numisdata_epigraphy`) — builds the two-column DOM layout.
*
* Exports: `tool_numisdata_epigraphy` (constructor)
*/

// import
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_numisdata_epigraphy} from './render_tool_numisdata_epigraphy.js'



/**
* TOOL_NUMISDATA_EPIGRAPHY
* Constructor for the numismatic-epigraphy tool instance.
*
* Declares every instance property to `null` / empty so that the shape is
* predictable before `init` and `build` are called.  Prototype methods then
* populate these properties during the normal tool lifecycle.
*
* Coin-face properties (`coins`, `epigraphy`, `obverse_legend`, …) are set by
* `build()` from `ddo_map` roles; they are `null` until that point and callers
* must guard against `null` before rendering.
*/
export const tool_numisdata_epigraphy = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= []
	this.type				= null
	this.source_lang		= null
	this.target_lang		= null
	this.langs				= null
	this.caller				= null
	this.media_component	= null // component av that will be transcribed (it could be the caller)
	this.epigraphy			= null // component text area where we are working into the tool
	this.relation_list		= null // datum of relation_list (to obtain list of top_section_tipo/id)
}//end page



/**
* COMMON FUNCTIONS
* Prototype methods delegated to shared base classes.
*
* - `render`   — from tool_common: builds the root wrapper and calls the mode method (edit/list/…).
* - `destroy`  — from common: tears down event subscriptions stored in `events_tokens`.
* - `refresh`  — from common: re-runs the current render mode in place.
* - `edit`     — from render_tool_numisdata_epigraphy: two-column numismatic layout.
*/
// prototypes assign
	tool_numisdata_epigraphy.prototype.render	= tool_common.prototype.render
	tool_numisdata_epigraphy.prototype.destroy	= common.prototype.destroy
	tool_numisdata_epigraphy.prototype.refresh	= common.prototype.refresh
	tool_numisdata_epigraphy.prototype.edit		= render_tool_numisdata_epigraphy.prototype.edit



/**
* INIT
* Initialises the tool instance by delegating to `tool_common.prototype.init` and then
* seeding the language-related properties that are specific to this tool.
*
* `source_lang` is taken from the caller's current lang when the tool is opened from a
* component context (e.g. triggered from a text_area inside the coin record).
* `target_lang` remains `null` after init; it is not used by this tool (no translation
* workflow), but is kept for API parity with other tools.
*
* @param {Object} options - Initialisation options forwarded verbatim to `tool_common.prototype.init`.
*   Expected by tool_common: `{ caller, mode, tool_config, … }` — see tool_common for full shape.
* @returns {Promise<boolean>} Resolves to the boolean returned by `tool_common.prototype.init`
*   (`true` on success, `false` on failure).
*/
tool_numisdata_epigraphy.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Builds the tool by delegating to `tool_common.prototype.build` and then resolving
* each numismatic-face role from the `ddo_map` to a live component instance.
*
* The full list of expected roles is declared in `roles[]`.  For each role the method:
*   1. Looks up the matching `ddo_map` entry (keyed on `el.role === role`).
*   2. Warns and skips if the role is absent from the ontology configuration.
*   3. Resolves the corresponding live instance from `self.ar_instances` (populated by
*      `tool_common.prototype.build`) and assigns it to `self[role]`.
*
* After `build` returns, callers may safely read `self.coins`, `self.obverse_legend`,
* `self.reverse_legend`, etc. — though each may still be `undefined` if the ontology
* ddo_map did not contain that role.
*
* Note: 'desing' is an intentional (legacy) spelling in the ontology role names; do not
* rename without a matching ontology migration.
*
* @param {boolean} [autoload=false] - When `true`, triggers an automatic data load after
*   the ddo_map instances are built. Forwarded to `tool_common.prototype.build`.
* @returns {Promise<boolean>} Resolves to the boolean returned by `tool_common.prototype.build`.
*/
tool_numisdata_epigraphy.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {
		const roles = [
			'coins',
			'epigraphy',
			'obverse_legend',
			'reverse_legend',
			'obverse_desing',
			'reverse_desing',
			'obverse_symbol',
			'reverse_symbol',
			'obverse_mark',
			'reverse_mark',
			'edge_desing',
			'edge_legend'
		];
		const roles_length = roles.length
		for (let i = 0; i < roles_length; i++) {
			const role = roles[i]

			// fix media_component for convenience
			const ddo = self.tool_config.ddo_map.find(el => el.role===role)
			if (!ddo) {
				// Role is not configured in the ontology ddo_map for this tool instance;
				// this is non-fatal — the render layer guards every `self[role]` with a
				// null-check before attempting to render it.
				console.warn(`Warning: \n\tThe role '${role}' it's not defined in Ontology and will be ignored`);
				continue;
			}
			self[role] = self.ar_instances.find(el => el.tipo===ddo.tipo)
		}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* Loads (or reloads) the text-area component for a specific numismatic facet and coin
* record, resolving its configuration from the tool's `ddo_map` by `role`.
*
* This method is called by the render layer's `update_text_nodes` helper whenever the
* user selects a different coin (i.e. when the autocomplete component fires a save
* event), so existing nodes are replaced rather than accumulated.
*
* The lang for the created component is resolved as follows:
*   - If the ddo entry has `translatable: false`, the non-language slot `lg-nolan` is used.
*   - Otherwise `page_globals.dedalo_data_lang` (current UI language) is used.
*
* The previous instance stored at `self[name]` is passed as `to_delete_instances` so that
* `load_component` can tear it down before building the replacement.
*
* @param {Object} options - Options bag.
* @param {Object} options.data - Coin-record locator: `{ section_tipo, section_id }`.
* @param {string} options.role - The ddo_map role key (e.g. `'obverse_legend'`, `'obverse_mark'`).
* @param {string} options.name - Property name on `self` where the instance is stored
*   (e.g. `'obverse_legend_text'`).  May differ from `role` for text sub-components.
* @returns {Promise<Object>} The newly built component instance, already stored at `self[name]`.
*/
tool_numisdata_epigraphy.prototype.get_component = async function(options) {

	const self = this

	const data	= options.data
	const role	= options.role
	const name	= options.name

	const ddo	= self.tool_config.ddo_map.find(el => el.role===role)

	const component_options	= {
		self 			: self,
		model			: ddo.model,
		mode 			: ddo.mode,
		tipo			: ddo.tipo,
		section_tipo	: data.section_tipo,
		section_id		: data.section_id,
		type			: ddo.type || 'component',
		lang 			: (typeof ddo.translatable!=='undefined' && ddo.translatable===false)
			? page_globals.dedalo_data_nolan // lg-nolan
			: page_globals.dedalo_data_lang,
		to_delete_instances	: self.ar_instances.filter(el => el===self[name])
	}

	// call generic common tool build
		const component_instance = await load_component(component_options);

	// set auto_init_editor if the ddo has his definition
		if(ddo.auto_init_editor){
			component_instance.auto_init_editor = ddo.auto_init_editor
		}

	// fix instance (overwrite)
		self[name] = component_instance


	return component_instance
}//end get_component



/**
* GET_RELATIONS
* Fetches the list of sections related to the given coin record using the Dédalo
* `related_search` API action.
*
* When `count` is `true` (the default), the server returns only a count object
* `{ total: number }` rather than full records.  The render layer uses this to display
* a "Used in: N" badge next to each text node, so the count-only path is the common case.
*
* The SQO uses `filter_by_locators` pointing at the coin's own section_tipo/section_id,
* which resolves all relation types in a single request.
*
* `retries: 5` means the request is retried up to 5 times before giving up.
*
* @param {Object} options - Options bag.
* @param {Object} options.data - Coin-record locator: `{ section_tipo, section_id }`.
* @param {string} options.role - Role key (currently unused inside this method; reserved for callers).
* @param {string} options.name - Instance property name (currently unused inside this method).
* @param {boolean} [options.count=true] - When `true`, issues a `count` action; when `false`,
*   issues a `read` action and returns full relation records.
* @returns {Promise<Object>} Resolves to `api_response.result`:
*   `{ total: number }` when count is true, or an array of relation records otherwise.
*/
tool_numisdata_epigraphy.prototype.get_relations = async function(options) {

	const self = this

	const data	= options.data
	const role	= options.role
	const name	= options.name
	const count = options.count ?? true

	// const ddo	= self.tool_config.ddo_map.find(el => el.role===role)

	const source = {
		action			: 'related_search',
		model			: 'section',
		tipo			: data.section_tipo,
		section_tipo	: data.section_tipo,
		section_id		: data.section_id,
		lang			: page_globals.dedalo_data_lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		filter_by_locators	: [{
			section_tipo	: data.section_tipo,
			section_id		: data.section_id
		}]
	}

	const rqo = {
		action	: (count)
			? 'count'
			: 'read',
		source	: source,
		sqo		: sqo,
		retries : 5, // retry up to 5 times
		timeout : 20 * 1000 // 20 secs waiting response
	}

	// get context and data
		const api_response = await data_manager.request({
			body : rqo
		})

	const datum = api_response.result


	return datum
}//end get_relations



/**
* GET_USER_TOOLS
* Checks which of the requested tools the current user is authorised to access,
* by calling the `dd_tools_api` with action `user_tools`.
*
* The returned array contains the `tool_simple_context` object for each requested
* tool that passes the server-side access check.  Tools the user cannot access are
* simply absent from the result.
*
* Note: `SHOW_DEVELOPER` is referenced here but is NOT declared in the file-level
* global-directive comment — it is declared in `tool_common.js` where this pattern
* originates.  The guard therefore relies on the browser treating an undeclared
* global as `undefined` (falsy), which silences the log branch rather than throwing.
* (!) This is a pre-existing issue — do not change the code; see flags.
*
* @param {Array<string>} ar_requested_tools - Tool identifiers to check, e.g.
*   `['tool_time_machine', 'tool_export']`.
* @returns {Promise<Array<Object>>} Resolves to an array of `tool_simple_context`
*   objects for tools the user is allowed to use.
*/
tool_numisdata_epigraphy.prototype.get_user_tools = async function(ar_requested_tools) {

	const self = this

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'user_tools')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'user_tools',
			source	: source,
			options	: {
				ar_requested_tools	: ar_requested_tools
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("[tool_numisdata_epigraphy.get_user_tools] api_response:",'DEBUG',api_response);
				}

				const result = api_response.result // array of objects

				resolve(result)
			})
		})
}//end get_user_tools



// @license-end
