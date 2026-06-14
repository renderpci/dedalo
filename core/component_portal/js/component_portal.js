// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, SHOW_DEBUG, SHOW_DEVELOPER, DD_TIPOS, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



/**
* MODULE component_portal
*
* Client-side class for `component_portal` — the relational workhorse of Dédalo.
* A portal links one host record to one or more target records in another (or the same) section
* and presents those linked records as a paginated, drag-reorderable list.  It is the v7 successor
* of the old `component_autocomplete` / `component_autocomplete_hi` components.
*
* This module defines the `component_portal` constructor, all prototype methods that are
* specific to the portal (init, build, link_record, unlink_record, add_new_element,
* sort_data, sort_by_column, navigate, filter_data_by_tag_id, …), and the private
* helper `data_limit_reached`.
*
* Prototype methods are mixed in from three sources:
*   - `common`            — lifecycle: render, refresh, destroy, rqo builders.
*   - `component_common`  — change-data pipeline: save, change_value, update_datum, …
*   - Per-mode render classes (`render_edit_component_portal`, `render_list_component_portal`,
*     `render_search_component_portal`) — view dispatch.
*
* Data shape stored in `self.data.entries`: an array of locator objects, e.g.
*   { id, type, section_tipo, section_id, from_component_tipo }
*
* Event bus tokens used by this module (all stored in `self.events_tokens` for cleanup):
*   `initiator_link_<id>`    — user selects a record from the picker modal.
*   `initiator_unlink_<id>`  — user removes a linked record from the picker modal.
*   `link_term_<id>`         — thesaurus tree link button click (tree/indexation views).
*   `deactivate_component`   — portal loses focus; destroys any live autocomplete service.
*   `paginator_goto_<pid>`   — paginator emits a new offset.
*   `paginator_show_all_<pid>` — show-all button resets limit to 0.
*   `reset_paginator_<pid>`  — reset button restores the configured limit.
*
* @see docs/core/components/component_portal.md for the full specification.
* @see render_edit_component_portal.js, render_list_component_portal.js,
*      render_search_component_portal.js for per-mode DOM rendering.
*/



// imports
	import {clone,object_to_url_vars, open_window, get_section_id_from_tipo} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {get_instance} from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		common,
		set_context_vars,
		get_columns_map,
		build_autoload,
		create_source
	} from '../../common/js/common.js'
	import {component_common, init_events_subscription} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {render_edit_component_portal} from '../../component_portal/js/render_edit_component_portal.js'
	import {render_list_component_portal} from '../../component_portal/js/render_list_component_portal.js'
	import {render_search_component_portal} from '../../component_portal/js/render_search_component_portal.js'



/**
* COMPONENT_PORTAL
* Constructor for the portal component, which stores and manages ordered arrays of
* locators that point at records in target sections.
*
* Only declares the property skeleton; all meaningful values are set by `init()` and
* `build()`.  Prototype methods from `common`, `component_common`, and the three
* per-mode render classes are mixed in below the constructor.
*
* Key properties (set during lifecycle):
*   @var {string|null} id                    - Unique instance identifier (from common.init).
*   @var {string|null} model                 - Class name, always 'component_portal'.
*   @var {string|null} tipo                  - Ontology tipo of this component, e.g. 'oh24'.
*   @var {string|null} section_tipo          - Ontology tipo of the host section, e.g. 'oh1'.
*   @var {string|number|null} section_id     - Record id within the host section.
*   @var {string|null} mode                  - Render mode: 'edit'|'list'|'tm'|'search'.
*   @var {string|null} lang                  - Active language tag, always 'lg-nolan' for portals
*                                              (portals are non-translatable).
*   @var {string|null} section_lang          - Language of the parent section UI.
*   @var {string|null} column_id             - Column instance id when rendered as a list column.
*   @var {*|null} parent                     - Ontology parent tipo of this component node.
*   @var {HTMLElement|null} node             - Root DOM element, populated by render().
*   @var {object|null} modal                 - Reference to the modal instance that hosts this
*                                              portal, if opened in a picker modal; null otherwise.
*   @var {object|null} caller               - Parent instance (section, tool, etc.) that owns
*                                              this portal instance.
*   @var {object|null} caller_dataframe     - The dataframe component instance that paired with
*                                              this portal (used by component_dataframe).
*   @var {boolean|null} standalone          - When true the portal owns its datum independently
*                                              rather than sharing it with the parent section.
*   @var {object|null} datum                - Full datum {data:[], context:[]} including any
*                                              sub-datums from target sections.
*   @var {object|null} context              - Server-resolved component context (properties,
*                                              tools, permissions, request_config, view, …).
*   @var {object|null} data                 - Resolved component data for the current record;
*                                              `data.entries` holds the locator array.
*   @var {number|null} total                - Total number of linked records (server-authoritative).
*   @var {object|null} paginator            - Paginator child instance; null in list/search mode.
*   @var {object|null} autocomplete         - Live service_autocomplete instance, if active.
*   @var {boolean|null} autocomplete_active - True while an autocomplete service is mounted.
*   @var {object|null} request_config_object - The `api_engine:'dedalo' + type:'main'` item
*                                              extracted from context.request_config; used to
*                                              build the RQO.
*   @var {object|null} rqo                  - The current Request Query Object sent to the API.
*   @var {boolean|null} fixed_columns_map   - False after each build; true once
*                                              rebuild_columns_map has run to prevent double
*                                              application.
*   @var {boolean|null} delete_diffusion_records - When true, deleting a linked record also
*                                              triggers diffusion record deletion (default true
*                                              in delete_linked_record).
*/
export const component_portal = function() {

	this.id						= null

	// element properties declare
	this.model					= null
	this.tipo					= null
	this.section_tipo			= null
	this.section_id				= null
	this.mode					= null
	this.lang					= null
	this.section_lang			= null
	this.column_id				= null
	this.parent					= null
	this.node					= null
	this.modal					= null
	this.caller					= null
	this.caller_dataframe		= null

	this.standalone				= null

	// context - data
	this.datum					= null
	this.context				= null
	this.data					= null

	// pagination
	this.total					= null
	this.paginator				= null

	// autocomplete service
	this.autocomplete			= null
	this.autocomplete_active	= null

	// rqo
	this.request_config_object	= null
	this.rqo					= null

	this.fixed_columns_map		= null

	// delete_diffusion_records bool (on delete record, check this value)
	this.delete_diffusion_records = null
}//end component_portal



/**
* COMMON FUNCTIONS
* Prototype assignments that mix inherited behaviour into component_portal.
*
* Lifecycle (from common):
*   render, refresh, destroy
*
* Change-data pipeline (from component_common):
*   save, update_data_value, update_datum, change_value, set_changed_data,
*   change_mode
*
* RQO builders (from common):
*   build_rqo_show, build_rqo_search, build_rqo_choose
*
* Per-mode rendering (from the dedicated render classes):
*   list / tm  → render_list_component_portal.prototype.list
*   edit       → render_edit_component_portal.prototype.edit
*   search     → render_search_component_portal.prototype.search
*
* Note: `tm` (Time Machine) reuses the list render with limit=1 per row.
*/
// prototypes assign
	// life-cycle
	component_portal.prototype.render				= common.prototype.render
	component_portal.prototype.refresh				= common.prototype.refresh
	component_portal.prototype.destroy				= common.prototype.destroy

	// change data
	component_portal.prototype.save					= component_common.prototype.save
	component_portal.prototype.update_data_value	= component_common.prototype.update_data_value
	component_portal.prototype.update_datum			= component_common.prototype.update_datum
	component_portal.prototype.change_value			= component_common.prototype.change_value
	component_portal.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_portal.prototype.build_rqo_show		= common.prototype.build_rqo_show
	component_portal.prototype.build_rqo_search		= common.prototype.build_rqo_search
	component_portal.prototype.build_rqo_choose		= common.prototype.build_rqo_choose

	// render
	component_portal.prototype.list					= render_list_component_portal.prototype.list
	component_portal.prototype.tm					= render_list_component_portal.prototype.list
	component_portal.prototype.edit					= render_edit_component_portal.prototype.edit
	component_portal.prototype.search				= render_search_component_portal.prototype.search

	component_portal.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* Initializes the portal instance: seeds portal-specific properties, registers all
* event-bus subscriptions that last for the lifetime of the instance, and populates
* the `render_views` registry.
*
* Delegates base property setup (id, tipo, section_tipo, mode, lang, caller, …) to
* `component_common.prototype.init`, which in turn calls `common.prototype.init`.
* All three event tokens are pushed into `self.events_tokens` so they are cleaned
* up during `destroy()`.
*
* Event subscriptions registered here:
*   `initiator_link_<id>`   — user confirms selection in picker; calls `link_record`.
*   `initiator_unlink_<id>` — user removes a record from picker; calls `unlink_record`.
*   `link_term_<id>`        — thesaurus tree or indexation view link button; enriches
*                             the locator with tag_id / tag_component_tipo / top_locator
*                             before delegating to `link_record`.
*   `deactivate_component`  — any component blur; tears down the live autocomplete
*                             service when this portal loses focus.
*
* @param {Object} options                          - Initialization options bag.
* @param {string} options.model                    - Class name, e.g. 'component_portal'.
* @param {string} options.tipo                     - Ontology tipo of this component.
* @param {string} options.section_tipo             - Ontology tipo of the host section.
* @param {string|number} options.section_id        - Host record identifier.
* @param {string} options.mode                     - Render mode: 'edit'|'list'|'tm'|'search'.
* @param {string} options.lang                     - Active language tag.
* @param {object|null} [options.columns_map]       - Pre-built columns map; if supplied it is
*                                                    used as-is and rebuilt from context otherwise.
* @param {object|null} [options.caller_dataframe]  - The dataframe component that paired with
*                                                    this portal, if any.
* @param {Array|null} [options.request_config]     - Request config array used when no server
*                                                    context is available yet (first build).
* @returns {Promise<boolean>} Resolves to the result of `component_common.prototype.init`,
*                             which is `true` on success or `false` on duplicate-init guard.
*/
component_portal.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(self, options);

	// autocomplete. set default values of service autocomplete
		self.autocomplete			= null
		self.autocomplete_active	= false

	// columns
		self.columns_map			= options.columns_map
		self.add_component_info		= false

	// caller_dataframe
		self.caller_dataframe		= options.caller_dataframe

	// request_config
		self.request_config			= options.request_config || null

	// events subscribe

		// initiator_link. Observes user click over list record_
			const initiator_link_handler = async (locator) => {
				// debug
					if(SHOW_DEBUG===true) {
						console.log('-> event fn_initiator_link locator:', locator);
					}
				// add locator selected
					const result = await self.link_record(locator)
					if (result===false) {
						return
					}
				// modal close
					if (self.modal && locator.close_modal !== false) {
						self.modal.close()
					}
			}
			self.events_tokens.push(
				event_manager.subscribe('initiator_link_' + self.id, initiator_link_handler)
			)

		// initiator_unlink. Observes user click over list record to remove from portal
			const initiator_unlink_handler = async (locator) => {
				// debug
					if (SHOW_DEBUG===true) {
						console.log('-> event fn_initiator_unlink locator:', locator);
					}

					if (!locator.id) {
						console.warn('Value to unlink not found in current entries');
						return
					}

				// remove locator selected
					const result = await self.unlink_record(locator)
					if (result===false) {
						return
					}
				// modal close
					if (self.modal && locator.close_modal !== false) {
						self.modal.close()
					}
			}
			self.events_tokens.push(
				event_manager.subscribe('initiator_unlink_' + self.id, initiator_unlink_handler)
			)

		// link_term. Observes thesaurus tree link index button click
		// Published by area_thesaurus / tool_indexation when the user clicks a term's link button.
		// The handler enriches the incoming locator with view-specific metadata before
		// delegating to link_record().
			const link_term_handler = async (locator) => {

				switch (self.view) {
					case 'indexation': {
						// empty tag_id is allowed too
						// add tag_id. Note that 'self.active_tag' is an object with 3 properties (caller, text_editor and tag)
							const tag_id = self.active_tag && self.active_tag.tag
								? self.active_tag.tag.tag_id || null
								: null
							if (tag_id) {
								// overwrite/set tag_id
								locator.tag_id	= tag_id
							}else{
								// No tag is selected yet; confirm whether to index the whole record
								// (i.e. tag the relation at record level rather than at an inline tag).
								if (!confirm(get_label.no_hay_etiqueta_seleccionada ||
									'No tag selected. If you continue, the entire record will be indexed.')) {
									return
								}
							}

						// tag_component_tipo
						// Mandatory for indexation portals: identifies which text component
						// carries the inline tag.  Defined in properties->config_relation.
							const tag_component_tipo = self.context.properties?.config_relation?.tag_component_tipo
							if (tag_component_tipo) {
								locator.tag_component_tipo = tag_component_tipo
							}else{
								console.error('tag_component_tipo is not defined into component properties->config_relation . This is mandatory in v6', self.context.properties);
								return
							}

						// top_locator add
						// top_locator is injected by tool_indexation onto self.caller; it carries
						// the section locator of the record currently open in the indexation tool.
							const top_locator = self.caller.top_locator // property from tool_indexation
							// check active tag is already set
							if (!top_locator) {
								alert("Error. No top_locator exists");
								return
							}
							Object.assign(locator, top_locator)
						break;
					}
					case 'tree':
						// set relation type standard portal (dd151)
						// Tree view always uses the generic link type; no tag metadata needed.
						locator.type = DD_TIPOS.DEDALO_RELATION_TYPE_LINK ?? 'dd151'
						break;

					default:
						console.warn('Warning: this view do not have custom manager', self.view);
						break;
				}

				// debug
					if(SHOW_DEBUG===true) {
						console.log("-->> fn_link_term. Set locator to add:", locator);
					}

				// add locator selected
					const result = await self.link_record(locator)
					if (result===false) {
						// (!) alert() used here deliberately to notify the user of a duplicate.
						// The duplicate check in link_record() already logged to console (level 1).
						alert("Value already exists! "+ JSON.stringify(locator));
						return
					}
			}
			self.events_tokens.push(
				event_manager.subscribe('link_term_' + self.id, link_term_handler)
			)

		// deactivate_component. Observes current component deactivation event
		// The global 'deactivate_component' event fires whenever any component loses focus.
		// We check if it is this portal's own id before tearing down the autocomplete service,
		// so that sibling portals on the same page are unaffected.
			const deactivate_component_handler = (component) => {
				if (component.id===self.id) {
					if(SHOW_DEBUG===true) {
						console.log('self.autocomplete_active:', self.autocomplete_active);
					}
					if(self.autocomplete_active===true){
						// Defer to the idle callback so the autocomplete can finish any
						// in-flight selection before it is torn down.
						dd_request_idle_callback(
							() => {
								self.autocomplete.destroy(
									true, // bool delete_self
									true, // bool delete_dependencies
									true // bool remove_dom
								)
								self.autocomplete_active	= false
								self.autocomplete			= null
							}
						)
					}
				}
			}
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', deactivate_component_handler)
			)

	// render_views
	// Maps {view, mode} pairs to the render module name (and optional dynamic-import path).
	// Used by common.render() to dispatch the correct render function.
	// Tools or external components may push additional entries here at runtime to add custom views.
	// Sample structure for a dynamically-added entry:
	// {
	// 		view	: 'default',
	// 		mode	: 'edit',
	// 		render	: 'view_default_edit_portal'
	// 		path 	: './view_default_edit_portal.js'
	// }
		self.render_views = [
			{
				view	: 'text',
				mode	: 'edit',
				render	: 'view_text_list_portal'
			},
			{
				view	: 'line',
				mode	: 'edit',
				render	: 'view_line_edit_portal'
			},
			{
				view	: 'tree',
				mode	: 'edit',
				render	: 'view_tree_edit_portal'
			},
			{
				view	: 'mosaic',
				mode	: 'edit',
				render	: 'view_mosaic_edit_portal'
			},
			{
				view	: 'indexation',
				mode	: 'edit',
				render	: 'view_indexation_edit_portal'
			},
			{
				view	: 'content',
				mode	: 'edit',
				render	: 'view_content_edit_portal'
			},
			{
				view	: 'default',
				mode	: 'edit',
				render	: 'view_default_edit_portal',
				path 	: './view_default_edit_portal.js'
			},
			{
				view	: 'line',
				mode	: 'list',
				render	: 'view_line_list_portal'
			},
			{
				view	: 'mini',
				mode	: 'list',
				render	: 'view_mini_portal'
			},
			{
				view	: 'text',
				mode	: 'list',
				render	: 'view_text_list_portal'
			},
			{
				view	: 'default',
				mode	: 'list',
				render	: 'view_default_list_portal'
			}
		]


	return common_init
}//end init



/**
* BUILD
* Loads server data (context + data) when `autoload=true`, then resolves all
* instance state that depends on context: RQO, columns_map, paginator, show_interface
* flags, separators, and data_limit guards.
*
* Called once after `init()` and again on every `refresh()` cycle.  Follows the
* Dédalo lifecycle contract: transitions `self.status` from 'building' → 'built'.
*
* When `autoload=true`:
*  1. Calls `build_autoload()` to fetch context + data from the API in one round-trip.
*  2. Preserves an existing `self.context` (context may have been customised by a ddo_map
*     override injected by section_record.js, which must not be overwritten by the raw
*     server context).
*  3. Calls `self.destroy(false, true, false)` to tear down child instances before
*     rebuilding, so stale sub-component nodes are not left in the DOM.
*  4. Sets `self.data` from the API result for the matching tipo+section_id.
*  5. Updates `self.datum` (shared datum) unless the portal is standalone.
*  6. Synchronises `self.rqo.sqo.limit` from the updated request_config (the server
*     may have adjusted the limit at resolve time).
*
* After (optional) autoload, regardless of `autoload` flag:
*  - `generate_rqo()` builds or reuses `self.rqo`.
*  - `set_context_vars()` copies shorthand properties from context to self.
*  - `init_events_subscription()` wires observe/observable hooks (idempotent; only
*    fires once per instance).
*  - Paginator is created (edit/tm mode only) or updated if already exists.
*  - `show_interface` flags are adjusted for multi-target sections and external mode.
*  - `self.add_component_info` is set from the ddo_map `value_with_parents` marker, used
*    by service_autocomplete to decide whether to request ddinfo for autocomplete entries.
*
* @param {boolean} [autoload=false] - When true, fetches context+data from the API.
*                                     Pass false when the caller already injected
*                                     `self.context` and `self.data` (e.g. section_record
*                                     embedding context, or refresh with tmp_api_response).
* @returns {Promise<boolean>} Resolves to `true` when build completes successfully.
*                             Returns `false` if the API call fails or returns no context.
*/
component_portal.prototype.build = async function(autoload=false) {
	// const t0 = performance.now()

	const self = this

	// previous status
		const previous_status = clone(self.status)

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}
		// changed_data. Set as empty array always
		self.data.changed_data = []

	// rqo
	// generate_rqo is defined as an inner async function and called twice:
	// once here (pre-autoload, to build the initial RQO) and again after autoload
	// (to regenerate the RQO with the refreshed context and correct limit).
		const generate_rqo = async function() {

			if (!self.context) {
				// No context yet (first build before API response): read from options.request_config.
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// Context is available: use the server-resolved request_config from context.
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// rqo build
			// In search mode the portal acts as a filter input; it sends 'resolve_data'
			// with the current locator entries as the source value so the search engine
			// can identify matching records.
			const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
			const add_show	= false
			self.rqo = self.rqo || await self.build_rqo_show(
				self.request_config_object, // object request_config_object
				action,  // string action like 'get_data' or 'resolve_data'
				add_show // bool add_show
			)
			if(self.mode==='search') {
				// Inject current entries as the RQO source value so the server knows
				// which records to resolve for the search filter.
				self.rqo.source.value = self.data.entries || []
			}
		}
		await generate_rqo()

	// debug check
		// if(SHOW_DEBUG===true) {
		// 	// console.log("portal generate_rqo 1 self.request_config_object:", clone(self.request_config_object) );
		// 	// console.log("portal generate_rqo 1 self.rqo:", clone(self.rqo) );
		// 	const ar_used = []
		// 	for(const element of self.datum.data) {

		// 		if (element.matrix_id) { continue; } // skip verification in matrix data

		// 		const index = ar_used.findIndex(item => item.tipo===element.tipo &&
		// 												item.section_tipo===element.section_tipo &&
		// 												item.section_id==element.section_id &&
		// 												item.from_component_tipo===element.from_component_tipo &&
		// 												item.parent_section_id==element.parent_section_id &&
		// 												item.row_section_id==element.row_section_id
		// 												// && (item.matrix_id && item.matrix_id==element.matrix_id)
		// 												// && (item.tag_id && item.tag_id==element.tag_id)
		// 												)
		// 		if (index!==-1) {
		// 			console.error("PORTAL ERROR. self.datum.data contains duplicated elements:", ar_used[index]);
		// 		}else{
		// 			ar_used.push(element)
		// 		}
		// 	}
		// }

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Unified loader: sends the RQO to the API, handles login-expired and
			// network-error cases, and returns the raw api_response or null/false.
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, component without context:", api_response);
					return false
				}

			// destroy dependencies
			// Tear down child instances before re-building so stale nodes are removed.
			// delete_self=false keeps the portal itself alive; remove_dom=false avoids
			// a flash because the DOM will be repopulated during the upcoming render.
				await self.destroy(
					false, // bool delete_self
					true, // bool delete_dependencies
					false // bool remove_dom
				)

			// set Context
				// Context is preserved when it was already set before this build cycle.
				// Reason: a ddo_map override (e.g. oh27 defines a custom mode/view/children_view
				// for rsc368) is injected by section_record.js into self.context *before* the
				// first build.  The raw API context for rsc368 uses the default config, so if we
				// overwrote self.context here we would lose the ddo_map customisation on every
				// refresh.  Context is therefore treated as write-once from the outside.
				if(!self.context){
					const context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}

			// set Data
			// Match by tipo + section_tipo + section_id (string-coerced).
				const data = api_response.result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && String(el.section_id) === String(self.section_id))
				if(!data){
					console.warn("data not found in api_response:",api_response);
				}
				self.data = data || {}

			// Update datum when the component is not standalone, it's dependent of section or others with common datum
			// In non-standalone mode, update_datum merges this response into the shared
			// datum that the parent section instance also holds, so sub-component
			// instances that share the same datum are all kept in sync.
				if(!self.standalone){
					await self.update_datum(api_response.result)
				}else{
					// Standalone portals own their datum independently; assign directly.
					self.datum.context	= api_response.result.context
					self.datum.data		= api_response.result.data
				}

			// // context. update instance properties from context (type, label, tools, fields_separator, permissions)
			// 	self.context		= api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
			// 	self.datum.context	= api_response.result.context

			// force re-assign self.total
			// Reset so that the post-build logic reads total from the fresh data.pagination.
				self.total = null

			// rqo regenerate
			// Regenerate now that self.context is populated with the freshly-loaded context.
				await generate_rqo()
				// console.log("portal generate_rqo 2 self.rqo:",self.rqo);

			// update rqo.sqo.limit. Note that it may have been updated from the API response
			// The server may have clamped or overridden the limit in the resolved request_config.
			// Paginator takes limit from: self.rqo.sqo.limit
			// (!) Two possible locations for the limit: sqo.limit (newer) and show.sqo_config.limit (legacy).
				const request_config_item = self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				if (request_config_item) {
					// Updated self.rqo.sqo.limit. Try sqo and show.sqo_config
					if (request_config_item.sqo &&
						(request_config_item.sqo.limit || request_config_item.sqo.limit===0)) {

						self.rqo.sqo.limit = request_config_item.sqo.limit
					}
					else if (request_config_item.show && request_config_item.show.sqo_config &&
							(request_config_item.show.sqo_config.limit || request_config_item.show.sqo_config.limit===0)) {

						self.rqo.sqo.limit = request_config_item.show.sqo_config.limit
					}
				}
		}//end if (autoload===true)


	// update instance properties from context
	// Copies shorthand properties from the resolved context to self
	// (e.g. self.label, self.permissions, self.view, self.type, …).
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
	// Registers any observe/observable wiring declared in the ontology properties.
	// The function is idempotent: it guards against double-subscription internally.
		init_events_subscription(self)

	// mode cases
		if (self.mode==='edit' || self.mode==='tm') {
			// Pagination state is only meaningful in edit / tm mode.
			// In list and search modes the paginator is not shown.

			// pagination. update element pagination vars when are used
			// Sync local offset/total from the data.pagination object that the
			// API returns together with the entries array.
				if (self.data.pagination && !self.total) {
					self.total			= self.data.pagination.total
					self.rqo.sqo.offset	= self.data.pagination.offset
					self.rqo.sqo.total	= self.data.pagination.total
				}

			// paginator
				if (!self.paginator) {

					// create new one
					// 'micro' mode renders a compact paginator bar (prev/next/page count).
					self.paginator = new paginator()
					self.paginator.init({
						caller	: self,
						mode	: 'micro'
					})
					await self.paginator.build()

					// paginator_goto_ event
					// The paginator publishes this event when the user clicks a page number or
					// prev/next.  The callback updates self.rqo.sqo.offset then calls navigate().
						const paginator_goto_handler = function(offset) {
							// navigate
							self.navigate({
								callback : () => {
									self.rqo.sqo.offset = offset
								}
							})
						}
						self.events_tokens.push(
							event_manager.subscribe('paginator_goto_'+self.paginator.id, paginator_goto_handler)
						)


					// paginator_show_all_
					// Published when the user clicks the "show all" button.
					// limit=0 tells the server to return all records without pagination.
						const paginator_show_all_handler = function() {
							// navigate
							self.navigate({
								callback : async () => {
									// rqo and request_config_object set offset and limit
									self.rqo.sqo.offset	= self.request_config_object.sqo.offset	= 0
									self.rqo.sqo.limit	= self.request_config_object.sqo.limit	= 0 // (limit + 1000)
								}
							})
						}
						self.events_tokens.push(
							event_manager.subscribe('paginator_show_all_'+self.paginator.id, paginator_show_all_handler)
						)

					// reset_paginator_
					// Published by the paginator when the user resets from "show all" back to
					// paged mode.  `limit` is the page size to restore.
						const reset_paginator_handler = function(limit) {
							// navigate
							self.navigate({
								callback : async () => {
									// rqo and request_config_object set offset and limit
									self.rqo.sqo.offset	= self.request_config_object.sqo.offset	= 0
									self.rqo.sqo.limit	= self.request_config_object.sqo.limit	= limit
								}
							})
						}
						self.events_tokens.push(
							event_manager.subscribe('reset_paginator_'+self.paginator.id, reset_paginator_handler)
						)

				}else{
					// Paginator already exists (subsequent refresh): sync its state with the
					// new offset and total without fully rebuilding it.
					self.paginator.offset = self.rqo.sqo.offset
					self.paginator.total  = self.total
					// self.paginator.refresh()
					// await self.paginator.build()
					// self.paginator.render()
				}

		}else if(self.mode==='search') {

			// active / prepare the autocomplete in search mode
			// (placeholder for future search-mode autocomplete setup if needed)

		}// end if(self.mode==="edit")

	// check self.context.request_config
	// A missing request_config is a fatal misconfiguration: the portal cannot build
	// its RQO or render anything useful without it.
		if (!self.context.request_config) {
			console.error('Error. context.request_config not found. self:', self);
			throw 'Error';
		}

	// target_section
	// The ontology tipo(s) of the target section(s) this portal links to.
	// May be a single string or an array of strings (multi-target portal).
		self.target_section = self.request_config_object && self.request_config_object.sqo
			? self.request_config_object.sqo.section_tipo
			: null

	// reset fixed_columns_map (prevents to apply rebuild_columns_map more than once)
		self.fixed_columns_map = false

	// columns
	// @see common.get_columns_map ddo_map_sequence
	// Note that default ddo_map_sequence is [show], but in search mode is [search,show]
	// datum_context allows to resolve column 'sortable' from the children contexts
	// (used by the sort_by_column property to add column sort buttons)
		self.columns_map = get_columns_map({
			context			: self.context,
			datum_context	: self.datum.context
		})

	// self.add_component_info. Indicates if exists any ddinfo (value_with_parents) in the ddo_map items list
	// When true, service_autocomplete will request ddinfo (ancestor chain) for each
	// autocomplete option so the user sees the full hierarchy path in the picker.
		// (!) This is used by service_autocomplete to decide whether to add ddinfo or not
		// sample item
		// {
		//	 "tipo": "hierarchy25",
		//	 "parent": "self",
		//	 "section_tipo": "self",
		//	 "value_with_parents": true
		// }
		const show_ddo_map				= self.request_config_object?.show?.ddo_map || []
		const ddo_value_with_parents	= show_ddo_map.find(el => el.value_with_parents)
		self.add_component_info			= ddo_value_with_parents
			? ddo_value_with_parents.value_with_parents
			: false

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("/// component_portal build self.datum.data:",self.datum.data);
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			// console.log("component_portal self +++++++++++ :",self);
			//console.log("========= build self.pagination.total:",self.pagination.total);
		}

	// set the server data to preserve the data that is saved in DDBB
	// db_data is a deep clone used to detect whether data has changed since the last save.
		self.db_data = clone(self.data)

	// set fields_separator
	// Controls how multiple column values within a single linked record are joined
	// (e.g. "Title | Author" in the default view row).
	// Priority: context.fields_separator > request_config show.fields_separator > default ' | '
		self.context.fields_separator = self.context?.fields_separator
									|| self.request_config_object?.show.fields_separator
									|| ' | '

	// set records_separator
	// Controls how multiple linked records are joined in text/list views.
	// Priority: context.records_separator > request_config show.records_separator > default ' | '
		self.context.records_separator = self.context?.records_separator
									|| self.request_config_object?.show.records_separator
									|| ' | '

	// check if the target section is multiple to remove the add button
	// Multi-target portals cannot offer the "add new record" button because the server
	// would not know which target section to create the new record in.
		self.show_interface.button_add = (Array.isArray(self.target_section) && self.target_section.length > 1)
			? false
			: self.show_interface.button_add ?? true

	// check if the target section is multiple to remove the open_section_list
		self.show_interface.button_list = (Array.isArray(self.target_section) && self.target_section.length > 1)
			? false
			: self.show_interface.button_list ?? true

	// self.show_interface is defined in component_common init()
	// Override show_interface buttons based on source.mode and caller type.
	// If show.interface is defined in properties it takes precedence; this switch sets
	// safe defaults when it is not.
		switch (true) {

			// External mode: portal data is computed server-side (inverse / dependent relations).
			// The user can view but not add/link/edit — only the external button and list are shown.
			case (self.context.properties?.source?.mode==='external'):
				self.show_interface.button_add			= false
				self.show_interface.button_link			= false
				self.show_interface.tools				= false
				self.show_interface.button_external		= true
				self.show_interface.button_tree			= false
				self.show_interface.button_list			= self.show_interface.button_list ?? true
				self.show_interface.show_autocomplete	= self.show_interface.show_autocomplete ?? false
				break;

			// Tool caller: the portal is embedded inside a tool (e.g. tool_indexation).
			// Strip all action buttons; the tool controls the interaction itself.
			case (self.caller && self.caller.type==='tool'):
				self.show_interface.button_add		= false
				self.show_interface.button_link		= false
				self.show_interface.tools			= false
				self.show_interface.button_external	= false
				self.show_interface.button_tree		= false
				self.show_interface.button_list		= false
				break;

			default:
				break;
		}


	// status update
		self.status = 'built'


	return true
}//end component_portal.prototype.build



/**
* LINK_RECORD
* Inserts a new locator into the portal, persisting the change via the API.
*
* Entry points:
*  - `service_autocomplete` when the user picks an option from the datalist.
*  - `initiator_link_<id>` event handler (picker modal confirm).
*  - `link_term_handler` (thesaurus tree / indexation view link button).
*
* Duplicate detection is performed at two levels:
*  1. Client-side fast path (level 1): scans `current_entries` (the currently loaded
*     paginated page only) for an entry with the same section_tipo + section_id.
*  2. Server-side authoritative check (level 2): after `change_value`, compares the
*     new `total` against `total_before`.  If the server total did not increase, the
*     locator already existed in the full (non-paginated) dataset.
*
* For `component_dataframe` models, pairing keys (`type`, `id_key`, `section_id_key`,
* `section_tipo_key`, `main_component_tipo`) are copied from `self.data` into the
* locator before the API call so the server can attach the correct dataframe stub.
*
* (!) `self.data.pagination.limit` is explicitly set before calling `change_value` so
* the server uses the paginator's current page size when refreshing the portal data.
* This is critical for `component_relation_index` portals (e.g. 'rsc860' in Oral History)
* which have small page limits and would otherwise receive the wrong page slice.
*
* @param {Object} value                      - Locator to insert.  Will be mutated:
*                                             `from_component_tipo` is always added.
* @param {string} value.section_tipo         - Target section tipo.
* @param {string|number} value.section_id    - Target record id.
* @param {string} [value.type]               - Relation type, e.g. 'dd151'.
* @param {string} [value.tag_id]             - Inline tag id (indexation portals).
* @param {string} [value.tag_component_tipo] - Component tipo carrying the tag (indexation).
* @returns {Promise<boolean>} `false` if the locator already exists or the API fails;
*                             `true` after a successful insert and refresh.
*/
component_portal.prototype.link_record = async function(value) {

	const self = this

	// current_value. Get the current_value of the component
		const current_entries = self.data.entries || []

	// data_limit. Maximum records allowed by this portal
		if (data_limit_reached(self)) {
			// alert and stop the process
			return false
		}

	// exists. Check if value already exists.
	// (!) Only the currently loaded paginated page is available for this check; the
	// server performs the authoritative full-dataset check after the insert (level 2 below).
		const exists = current_entries.find(item => item.section_tipo===value.section_tipo && String(item.section_id) === String(value.section_id))
		if (typeof exists!=='undefined') {
			console.log('[link_record] Value already exists (1) !');
			if(SHOW_DEBUG===true) {
				console.log('link_record current_entries:', current_entries);
				console.log('link_record value:', value);
			}
			return false
		}

	// adds its own tipo as 'from_component_tipo' to the new locator
	// This property is used by the section's relations bag to partition locators
	// per component.  Without it the server cannot assign the locator to this portal.
		value.from_component_tipo = self.tipo

	// dataframe case
	// pairing keys are copied from the instance data stub (built by get_dataframe):
	// type + id_key are the unified contract; legacy keys are kept until the
	// data migration runs
		if(self.model === 'component_dataframe'){
			value.type					= self.data.type ?? value.type
			value.id_key				= self.data.id_key ?? self.data.section_id_key
			value.section_id_key		= self.data.section_id_key
			value.section_tipo_key		= self.data.section_tipo_key
			value.main_component_tipo	= self.data.main_component_tipo
		}

	// changed_data
	// Frozen to prevent accidental mutation after this point.
		const changed_data	= [Object.freeze({
			action	: 'insert',
			id		: null,
			value	: value
		})]

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[component_portal.link_record] value:", value, " - changed_data:", changed_data);
		}

	// total_before
	// Snapshot the current total before the insert so we can detect duplicates at level 2.
		const total_before = clone(self.total)

	// (!) fix pagination limit in data to force server to use it. Important
	// This value is get from API save $data->pagination and set to the component->pagination->limit
	// This is used frequently in component_relation_index like 'rsc860' in Oral History indexation terms
		self.data.pagination = {
			limit : self.paginator
				? self.paginator.limit
				: null
		}

	// api_response : change_value (and save)
	// refresh:false — we handle the refresh manually below after the total check.
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

		if (!api_response || !api_response.result) {
			console.error('Invalid API response on link_record:', api_response);
			return false
		}

	// total check (after save) — server-authoritative duplicate detection (level 2)
		const current_data	= api_response.result.data.find(el => el.tipo===self.tipo)
		const total			= current_data?.pagination?.total ?? 0
		// error on add value case
		if (total===0) {
			console.warn("// link_record api_response.result.data (unexpected total):", api_response.result.data);
			return false
		}
		// value already exists case. Check if value already exist.
		// (!) Note that here, the whole portal data has been compared in server
		if (parseInt(total) <= parseInt(total_before)) {
			// self.update_pagination_values('remove') // remove added pagination value
			console.log("[link_record] Value already exists (2) !");
			return false
		}

	// refresh self component
	// Pass tmp_api_response so build() reuses the save response instead of
	// issuing a second API call for the same data.
		await self.refresh({
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})

	// filter data. check if the caller has tag_id
	// If the portal is in indexation mode with an active tag, re-apply the tag
	// filter so the newly-inserted locator appears in the correct tag subset.
		if(self.active_tag){
			self.node.classList.add('hide')
			// filter component data by tag_id and re-render content
			self.filter_data_by_tag_id(self.active_tag)
			.then(()=>{
				self.node.classList.remove('hide')
			})
		}

	// mode specifics
		switch(self.mode) {

			case 'search' :
				// publish change. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
				self.node.classList.remove('active')
				break;

			default:

				break;
		}


	return true
}//end link_record



/**
* ADD_NEW_ELEMENT
* Creates a new blank record in the target section and immediately links it to this portal.
*
* Called by the "add" button rendered by the portal's edit view.  Combines two operations
* in a single API call: section record creation + portal locator insertion.  The server
* assigns the new record a section_id, writes the locator into the portal data, and
* returns the updated portal datum so the client can refresh without a second request.
*
* The server also assigns the new record to the correct project based on the current
* user's privileges and the section's project configuration.
*
* Unlike `link_record` (which links an *existing* record), this function always creates
* a *new* record.  The duplicate-detection step in `link_record` does not apply here.
*
* (!) Respects the `data_limit` property: if the portal is already at capacity the
* action is blocked before the API call.
*
* @verified 07-09-2023 Paco
* @param {string} target_section_tipo - Ontology tipo of the section in which the new
*                                       record should be created (e.g. 'rsc197').
* @returns {Promise<boolean>} `true` after a successful create+link and refresh;
*                             `false` if the data limit is reached or the API fails.
*/
component_portal.prototype.add_new_element = async function(target_section_tipo) {

	const self = this

	// data_limit. Maximum records allowed by this portal
		if (data_limit_reached(self)) {
			// alert and stop the process
			return false
		}

	// source
		const source = create_source(self, null)

	// data
	// Clone self.data to avoid mutating the live data before the server confirms.
		const data = clone(self.data)
		data.changed_data = [{
			action	: 'add_new_element',
			id		: null,
			value	: target_section_tipo
		}]

	// rqo
		const rqo = {
			action	: 'save',
			source	: source,
			data	: data
		}

	// data_manager. create new record
	// Short timeout (10 s) and a single retry: record creation must not be retried
	// silently because a retry could create a duplicate record.
		const api_response = await data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 10 * 1000 // 10 secs waiting response
		})
		// add value to current data
		if (api_response.result) {

			// save return the datum of the component
			// Inject the save response as tmp_api_response so the build phase uses it
			// directly rather than issuing a redundant API read.
				await self.refresh({
					destroy				: false,
					build_autoload		: true,
					tmp_api_response	: api_response
				})

		}else{
			console.error('Error on api_response on try to create new row:', api_response);
			return false
		}


	return true
}//end add_new_element



/**
* DATA_LIMIT_REACHED
* Module-private guard that checks whether the portal has reached the maximum
* number of linked records allowed by `context.properties.data_limit`.
*
* Called at the start of `link_record` and `add_new_element` before any API call.
* If the limit is exceeded, it alerts the user (using the localised `exceeded_limit`
* label when available) and returns `true` so the caller can bail out early.
*
* The check compares `self.data.entries.length` against `data_limit`, so it only
* counts entries on the **currently loaded page**.  This is a soft client-side cap;
* a server-side check would be needed for strict enforcement across pages.
*
* @param {Object} self - The component_portal instance (not `this`; called as a
*                        module-level function, not a method).
* @returns {boolean} `true` if the portal is at or above its limit and the action
*                    should be blocked; `false` if the insert may proceed.
*/
const data_limit_reached = function (self) {

	// current_value. Get the current_value of the component
		const current_value	= self.data.entries || []

	// data_limit. Maximum records allowed by this portal
	// Check if the component has a data_limit (it could be defined in properties as data_limit with int value)
		const data_limit = self.context.properties.data_limit
		if(data_limit && current_value.length>=data_limit){

			console.log("[data_limit_reached] Data limit is reached!");

			// notify to user about the limit
			const data_limit_label = (
				get_label.exceeded_limit || 'The maximum number of values for this field has been reached. Limit ='
			) + ' ' + data_limit
			window.alert(data_limit_label)

			return true
		}


	return false
}//end data_limit_reached



/**
* UPDATE_PAGINATION_VALUES
* Synchronises `self.total`, `self.rqo.sqo.offset/total`, `self.data.pagination`, and
* the paginator child instance after a local data change (insert or remove).
*
* This method is used when the portal wants to adjust pagination state *without*
* making a new API call — specifically to keep the paginator showing the correct
* page after an insert or remove operation that has already been confirmed by the
* server.
*
* The `last_offset` IIFE calculates the offset of the *last page* so that after an
* insert the paginator navigates to the page where the new entry appears (the end),
* and after a remove it navigates to the last valid page.
*
* A one-shot `render_<id>` subscription triggers `self.paginator.refresh()` after the
* next render cycle to avoid updating the paginator DOM before the portal content is
* ready (which would cause visual artifacts).
*
* Note: the commented-out `self.data.pagination.total++/--` lines are intentionally
* preserved — the live adjustment is done via `self.total` only; `self.data.pagination`
* is synced afterwards.
*
* @param {string} action - 'add' increments `self.total`; 'remove' decrements it.
*                          Any other value leaves the total unchanged.
* @returns {boolean} Always `true`.
*/
component_portal.prototype.update_pagination_values = function(action) {

	const self = this

	// update self.data.pagination
		switch(action) {
			case 'remove' :
				// update pagination total
				if(self.data.pagination && self.data.pagination.total && self.data.pagination.total>0) {
					// self.data.pagination.total--
					self.total--
				}
				break;
			case 'add' :
				// update self.data.pagination
				if(self.data.pagination && self.data.pagination.total && self.data.pagination.total>=0) {
					// self.data.pagination.total++
					self.total++
				}
				break;
			default:
				// Nothing to add or remove
		}
		// self.total = self.data.pagination.total


	// last_offset
	// Compute the offset of the last page so the paginator navigates there.
	// Returns 0 when total or limit is 0 (no pagination needed).
		const last_offset = (()=>{

			const total	= self.total
			const limit	= self.rqo.sqo.limit

			if (total>0 && limit>0) {

				const total_pages = Math.ceil(total / limit)

				return parseInt( limit * (total_pages -1) )
			}

			return 0
		})()

	// self pagination update
		self.rqo.sqo.offset	= last_offset

		if (!self.data.pagination) {
			self.data.pagination = {}
		}
		self.data.pagination.offset	= last_offset
		self.data.pagination.total	= self.total// sync pagination info
	// paginator object update
		self.paginator.offset	= self.rqo.sqo.offset
		self.paginator.total	= self.total

	// paginator content data update (after self update to avoid artifacts (!))
	// Subscribe to the next render_<id> event to defer the paginator DOM refresh
	// until the portal content has finished rendering.
		let token
		const render_handler = () => {
			// remove the event to prevent multiple equal events
			event_manager.unsubscribe(token)
			// refresh paginator if already exists
			if (self.paginator) {
				self.paginator.refresh()
			}
		}
		token = event_manager.subscribe('render_'+self.id, render_handler)
		self.events_tokens.push(token)


	return true
}//end update_pagination_values



/**
* FILTER_DATA_BY_TAG_ID
* Filters the portal's displayed entries to only those whose `tag_id` matches the
* given tag, then re-renders the portal content without a server round-trip.
*
* Used in the `indexation` view: when the user clicks on an inline text tag in the
* text editor, the portal should show only the thesaurus terms that are indexed against
* that specific tag.  Clicking a different tag calls this function again; clicking away
* calls `reset_filter_data`.
*
* The function always re-reads `full_data` from `self.datum` (the unfiltered server-
* authoritative data) so that switching between tags does not progressively narrow the
* dataset — without this, the second tag click would filter the already-filtered subset.
* A deep clone of `full_data` is assigned to `self.data` to protect `self.datum` from
* mutation.
*
* Also called after `link_record` / `unlink_record` when `self.active_tag` is set, so
* the post-save display reflects the current tag filter.
*
* Fired by:
*  - Direct call from `link_record` / `unlink_record` when `self.active_tag` is set.
*  - Event handler defined in ontology properties (e.g. `rsc860` in Oral History).
*
* @param {Object} options               - Active-tag descriptor (stored in `self.active_tag`).
* @param {Object} options.tag           - Tag metadata object from the text editor.
* @param {string} options.tag.node_name - DOM node name of the tag element (e.g. 'img').
* @param {string} options.tag.type      - Tag type string (e.g. 'indexOut').
* @param {string} options.tag.tag_id    - The tag's unique id; used as the filter key.
* @param {string} options.tag.state     - Tag state (e.g. 'd' for default).
* @param {string} options.tag.label     - Display label of the tag.
* @param {string} options.tag.data      - Additional tag data payload.
* @returns {Promise<HTMLElement|null>} The result of `self.render({render_level:'content'})`.
*/
component_portal.prototype.filter_data_by_tag_id = function(options) {

	const self = this

	// options
		const tag = options.tag // object

	// Fix received options from event as 'active_tag'
	// Store the full options object as self.active_tag so subsequent operations
	// (link_record, unlink_record, reset_filter_data) know the current filter state.
		self.active_tag = options

	// short vars
		const tag_id = tag?.tag_id

	// get all data from datum because if the user select one tag the portal data is filtered by the tag_id,
	// in the next tag selection by user the data doesn't have all locators and is necessary get the original data
	// the full_data is clone to a new object because need to preserve the datum from these changes.
		const full_data	= self.datum.data.find(el =>
				el.tipo===self.tipo &&
				el.section_tipo===self.section_tipo &&
				String(el.section_id) === String(self.section_id)
		) || {}
		self.data = clone(full_data)

	// the portal will use the filtered data value to render it with the tag_id locators.
		self.data.entries = self.data.entries
			? self.data.entries.filter(el => el.tag_id === tag_id)
			: []

	// reset status to enable re-render
		self.status = 'built'

	// re-render always the content
		return self.render({
			render_level : 'content'
		})
}//end filter_data_by_tag_id



/**
* RESET_FILTER_DATA
* Clears the active tag filter and restores `self.data` to the full, unfiltered
* server-authoritative dataset from `self.datum`.
*
* Counterpart of `filter_data_by_tag_id`: called when the user deselects a tag or
* navigates away from the tag-filtered view so the full list of linked records is shown again.
*
* Directly assigns from `self.datum.data` (no clone needed here because there is no
* partial mutation of the datum — self.data simply points at the matching entry).
*
* @returns {Promise<HTMLElement|null>} The result of `self.render({render_level:'content'})`.
*/
component_portal.prototype.reset_filter_data = function() {

	const self = this

	// reset self.active_tag (important)
	// Clearing self.active_tag tells link_record / unlink_record not to re-apply
	// the filter after the next save.
		self.active_tag = null

	// refresh the data with the full data from datum and render portal.
		self.data = self.datum.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && String(el.section_id) === String(self.section_id)) || {}

	// reset status to able re-render
		self.status = 'built'

	// reset instances status
		// self.ar_instances = null
		// for (let i = 0; i < self.ar_instances.length; i++) {
		// 	self.ar_instances[i].status = 'built'
		// }

	// re-render content
		return self.render({
			render_level : 'content'
		})
}//end reset_filter_data



/**
* GET_SEARCH_VALUE
* Returns a stripped copy of the portal's current entries for use as an SQO filter value.
*
* In search mode the portal acts as an SQO filter input; each locator the user has added
* to the portal is sent to the server as part of the filter so the search engine can find
* records that match any of those linked records.  Only the properties required by the
* search engine are included; all other locator metadata (tag_id, type, matrix_id, …) is
* intentionally stripped to keep the filter payload small and unambiguous.
*
* @returns {Array<Object>} Array of minimal locator objects, each with:
*   `id`, `section_tipo`, `section_id`, `from_component_tipo`.
*   Returns an empty array if the portal has no entries.
*/
component_portal.prototype.get_search_value = function() {

	const self = this

	const data			= self.data || {}
	const current_value	= data.entries || []

	const new_value = [];
	const value_len = current_value.length
	for (let i = 0; i < value_len; i++) {
		new_value.push({
			id 					: current_value[i].id,
			section_tipo		: current_value[i].section_tipo,
			section_id			: current_value[i].section_id,
			from_component_tipo	: current_value[i].from_component_tipo
		})
	}

	return new_value
}//end get_search_value



/**
* NAVIGATE
* Executes a paginator-driven navigation or sort by refreshing the portal with updated
* SQO parameters (offset, limit, order).
*
* The caller supplies an async `callback` that mutates `self.rqo.sqo` (and optionally
* `self.request_config_object.sqo`) *before* the refresh is triggered.  This approach
* keeps the SQO mutation logic close to the event handler that initiated the navigation
* (see the paginator event subscriptions in `build()`).
*
* The `container` reference — `list_body` for the table view or `content_data` for the
* line view — receives the 'loading' CSS class during the fetch so the user sees a visual
* indicator.  `destroy:false` is passed to `refresh` to preserve the portal node and
* allow recovery from login-expiry scenarios without a full re-mount.
*
* @param {Object} options              - Navigation options.
* @param {Function} [options.callback] - Async function that updates `self.rqo.sqo`
*                                        before the refresh.  Called and awaited before
*                                        fetching new data.
* @returns {Promise<boolean>} `false` if the container node is not found in the DOM;
*                             `true` after a successful refresh.
*/
component_portal.prototype.navigate = async function(options) {

	const self = this

	// options
		const callback = options.callback

	// callback execute
	// The callback mutates self.rqo.sqo (offset, limit, etc.) before the refresh
	// so the API call uses the updated parameters.
		if (callback) {
			await callback()
		}

	// container
	// Prefer list_body (table / default view) or fall back to content_data (line view).
	// If neither exists the portal DOM is not in the expected state.
		const container = self.node?.list_body // view table
					   || self.node?.content_data // view line

		if (!container) {
			console.error('Error on navigate: container not found. self.node:', self.node);
			return false
		}

	// loading
		container.classList.add('loading')

	// refresh
		await self.refresh({
			destroy : false // avoid to destroy here to allow component to recover from loosed login scenarios
		})

	// loading
		container.classList.remove('loading')


	return true
}//end navigate



/**
* DELETE_LOCATOR
* Deletes one or more portal locators that match a partial locator specification.
*
* Unlike `unlink_record` (which removes by the locator's `id`) this function removes by
* **property match**: the server compares the stored locators against the `locator` object
* using only the properties listed in `ar_properties`, so it is suitable for bulk removes
* (e.g. delete all indexation locators for a given `tag_id` + `type` combination).
*
* Uses the `dd_component_portal_api` action handler (`action: 'delete_locator'`) directly
* via `data_manager.request`, bypassing the normal `change_value` path.  The caller is
* responsible for refreshing the portal after this call.
*
* Note: the `source` comments inside the body still reference 'component_text_area'; that
* is a copy-paste artefact in the original code — the actual source values are correctly
* taken from `self` (this component_portal instance).
*
* @param {Object} locator              - Partial locator used as the match template.
*                                        Only the properties named in `ar_properties`
*                                        are compared by the server.
* @param {string} [locator.tag_id]     - Tag id to match (indexation use case).
* @param {string} [locator.type]       - Relation type to match
*                                        (e.g. DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO // dd96).
* @param {Array<string>} ar_properties - Names of the locator properties to use for
*                                        matching, e.g. ['tag_id', 'type'].
* @returns {Promise<Object>} Raw `data_manager.request` response from the API.
*/
component_portal.prototype.delete_locator = function(locator, ar_properties) {

	const self = this

	return data_manager.request({
		body : {
			action	: 'delete_locator',
			dd_api	: 'dd_component_portal_api', // component_portal
			source	: {
				section_tipo	: self.section_tipo, // current component_text_area section_tipo
				section_id		: self.section_id, // component_text_area section_id
				tipo			: self.tipo, // component_text_area tipo
				lang			: self.lang // component_text_area lang
			},
			options : {
				locator			: locator,
				ar_properties	: ar_properties
			}
		},
		retries : 1, // one try only
		timeout : 10 * 1000 // 10 secs waiting response
	})
}//end delete_locator



/**
* SORT_DATA
* Persists a manual drag-and-drop reorder of portal entries.
*
* Called by `on_drop` in `drag_and_drop.js` after the user drops a row at a new
* position.  Sends a `sort_data` changed_data action to the server, which reorders
* the locator array in storage and returns the updated data.
*
* Clears `self.column_order_state` (FEJS-02) because a manual reorder supersedes any
* previously applied column sort — the advisory sort indicator in the column header
* would be misleading after a drag reorder.
*
* Uses `refresh:false` in `change_value` then manually calls `self.refresh` with the
* API response to avoid an extra round-trip.
*
* @see on_drop (drag_and_drop.js)
* @verified 07-09-2023 Paco
* @param {Object} options              - Reorder parameters.
* @param {Object} options.value        - The locator object that was dragged.
* @param {string|number} options.source_key - The position key of the dragged entry
*                                             before the drop.
* @param {string|number} options.target_key - The position key of the drop target
*                                             (the entry the dragged item was dropped onto).
* @returns {Promise<Object>} Raw API response from `change_value`.
*/
component_portal.prototype.sort_data = async function(options) {

	const self = this

	// FEJS-02: a manual drag-and-drop reorder diverges from the last column sort,
	// so clear the (advisory) column-order indicator state.
	self.column_order_state = null

	// options
		const value			= options.value
		const source_key	= options.source_key
		const target_key	= options.target_key

	// sort_data
		const changed_data = [Object.freeze({
			action		: 'sort_data',
			source_key	: source_key,
			target_key	: target_key,
			value		: value
		})]

	// api_response : change_value (and save)
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

	// refresh self component
		await self.refresh({
			destroy				: false,
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})


	return api_response
}//end sort_data



/**
* SORT_BY_COLUMN
* Persistently reorders the **full** portal locator array (all pages) by the resolved
* value of a target-section component, then saves the new order to the database.
*
* The server sorts the set of linked `section_id`s by querying the target section's
* matrix for the named `component_tipo` value, ordered ASC/DESC with NULLS LAST, and
* writes the resulting ordered locator array back to the portal's relation data.  This
* is a real data change and is recorded by Time Machine.
*
* Available only when `properties.sort_by_column` is enabled in the ontology node
* (see `component_portal.md` for configuration details).
*
* `self.column_order_state` records the last successfully applied column sort as an
* advisory indicator so the column header can show a sort arrow.  It is cleared to
* `null` by `sort_data` when the user does a drag-and-drop reorder that overrides the
* column order.
*
* (!) `value: null` in `changed_data` is intentional: the client's `update_data_value`
* skips null-value items with no id, so only the server performs the actual reorder.
*
* @see ui.add_column_order_set (render files) for column-header sort button setup.
* @param {Object} column          - A `columns_map` entry (from `get_columns_map`).
*                                   Only `column.tipo` is used by the server.
* @param {string} direction       - Sort direction: 'ASC' or 'DESC'.
* @returns {Promise<Object>} Raw API response from `change_value`.
*/
component_portal.prototype.sort_by_column = async function(column, direction) {

	const self = this

	// sort_by_column changed_data
	// (!) value must stay null: with null value and no id, the client
	// update_data_value is a no-op and the server resolves the new order
		const changed_data = [Object.freeze({
			action			: 'sort_by_column',
			component_tipo	: column.tipo,
			direction		: direction, // 'ASC'|'DESC'
			value			: null
		})]

	// api_response : change_value (and save)
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

	// column_order_state. Ephemeral indicator of the last applied column order
	// (advisory only: manual drag and drop can change the order at any time)
		if (api_response && api_response.result!==false) {
			self.column_order_state = {
				tipo		: column.tipo,
				direction	: direction
			}
		}

	// refresh self component
		await self.refresh({
			destroy				: false,
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})


	return api_response
}//end sort_by_column



/**
* GET_TOTAL
* Returns the total number of records in the portal (across all pages).
*
* `self.total` is set from `data.pagination.total` during `build()`, where the server
* provides the authoritative count alongside each data page.  No API call is needed;
* the value is already in memory.
*
* The method is async to satisfy a uniform interface across components that may need
* to compute their total asynchronously (e.g. via a count query).
*
* @returns {Promise<number|null>} The total record count, or `null` if the portal has
*                                  not been built yet.
*/
component_portal.prototype.get_total = async function() {

	const self = this

	return self.total
}//end get_total



/**
* UNLINK_RECORD
* Removes a locator from the portal by its `id` (the per-item counter id), persists
* the change via the API, and refreshes the portal.
*
* The `remove_dialog` callback is supplied as `() => true` (auto-confirm) because the
* delete confirmation was already shown to the user by the remove button handler that
* published the `initiator_unlink_<id>` event.  Passing the callback here prevents a
* second confirmation dialog from appearing.
*
* Publishes `remove_element_<id>` after the refresh so that any sibling UI elements
* (e.g. an open picker modal showing the now-unlinked record) can update themselves.
*
* If the portal is in indexation mode with an active tag filter, the filter is
* re-applied after the refresh so the display remains consistent.
*
* @param {Object} locator           - The locator to remove.  Must have `id` set (the
*                                     portal item's per-record counter id, not the section_id).
* @param {number|string} locator.id - Per-item counter id used to identify the entry to remove.
* @param {string} [locator.section_id] - Used only as the label in the delete dialog
*                                        (passed as `label` to `change_value`).
* @returns {Promise<boolean>} `false` if the API call fails or the user cancelled;
*                             `true` after a successful unlink and refresh.
*/
component_portal.prototype.unlink_record = async function(locator) {

	const self = this

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			id		: locator.id,
			value	: null
		})]

	// change_value (implies saves too)
	// The remove confirmation dialog is controlled by the button that called this function
	// (via the initiator_unlink event); supplying remove_dialog:()=>true here prevents
	// a second confirmation from appearing.
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false,
			label			: locator.section_id,
			remove_dialog	: ()=>{
				return true
			}
		})

	// the user has selected cancel from delete dialog
		if (api_response===false || api_response.result===false) {
			console.warn("// unlink_record api_response failed ", api_response);
			return false
		}

	// refresh self component
		await self.refresh({
			build_autoload		: true,
			tmp_api_response	: api_response // pass api_response before build to avoid call API again
		})

	// check if the caller has active a tag_id
	// Re-apply the tag filter so the portal does not show entries from other tags.
		if(self.active_tag){
			self.node.classList.add('hide')
			// filter component data by tag_id and re-render content
			self.filter_data_by_tag_id(self.active_tag)
			.then(()=>{
				self.node.classList.remove('hide')
			})
		}

	// event to update the DOM elements of the instance
	// Allows external listeners (e.g. picker modals, sibling portals) to react
	// to the removal without polling or re-building.
		event_manager.publish('remove_element_'+self.id, locator.id)


	return true
}//end unlink_record



/**
* DELETE_LINKED_RECORD
* Hard-deletes a target section record that is linked in this portal, then returns
* the result of the section's `delete_section` call.
*
* This is a destructive operation distinct from `unlink_record`: it permanently
* deletes the **target record** itself (not just the portal's locator).  Calling this
* requires write/delete permission on the *target* section (REL-06), not just on the
* host record.
*
* Implementation: a lightweight section instance is spun up in 'list' mode (`id_variant:
* 'delete_section'` ensures a unique instance key so it does not collide with any
* existing editor instance for the same section_id).  The section's `delete_section`
* method handles the SQO-based record lookup, confirmation dialog, and diffusion
* propagation.  The temporary section instance is destroyed immediately after.
*
* `delete_diffusion_records` defaults to `true` (propagates to the diffusion/MariaDB
* layer) unless overridden via `self.delete_diffusion_records`.
*
* @param {Object} options                - Delete parameters.
* @param {string} options.section_tipo   - Ontology tipo of the target section.
* @param {string|number} options.section_id - Record id of the target record to delete.
* @returns {Promise<boolean|Object>} The result of `section.delete_section()`; typically
*                                    `false` if the user cancelled or `true` on success.
*/
component_portal.prototype.delete_linked_record = async function(options) {

	const self = this

	// options
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		// const caller_dataframe	= options.caller_dataframe || null

	// delete_diffusion_records
	// Defaults to true so that deleting a linked record also cleans up its diffusion entries.
		const delete_diffusion_records = self.delete_diffusion_records ?? true

	// create the instance of the section called by the row of the portal,
	// section will be in list because it's not necessary get all data, only the instance context to be deleted it.
	// 'id_variant: delete_section' prevents collision with any live editor instance for the same record.
		const instance_options = {
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'list',
			lang			: self.lang,
			caller			: self,
			inspector		: false,
			filter			: false,
			id_variant		: 'delete_section'
		}
	// get the instance
		const section =	await get_instance(instance_options)

	// create the sqo to be used to find the section will be deleted
		const sqo = {
			section_tipo		: [section_tipo],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id
			}],
			limit				: 1
		}

	// call to the section and delete it
		const delete_section_result = await section.delete_section({
			sqo							: sqo,
			delete_mode					: 'delete_record',
			// caller_dataframe			: caller_dataframe,
			delete_diffusion_records	: delete_diffusion_records
		})

	// destroy section after use it
		section.destroy()


	return delete_section_result
}//end delete_linked_record



/**
* EDIT_RECORD_HANDLER
* Opens a linked target record for viewing/editing in a separate browser window.
*
* The URL and window name depend on whether the target record belongs to a Dédalo
* section or an external system (e.g. Zenon bibliographic catalog):
*
*   - **External engine** (`api_engine !== 'dedalo'`): opens `api_config.ui_base_url +
*     section_id` directly.  The portal has no way to refresh after an external-engine
*     edit, so no `on_blur` handler is registered.
*
*   - **Dédalo engine**: opens the record's edit page via `DEDALO_CORE_URL/page/?tipo=…`.
*     `session_save: false` prevents the new window from overwriting the calling
*     window's section navigation session.  The `on_blur` handler fires when the edit
*     window loses focus (i.e. the user returns to the original window) and triggers
*     a portal refresh so changes are reflected immediately.
*
* The `fn_window_blur` / `get_edit_caller` inner function climbs the caller chain to
* find the nearest edit-mode component instance to refresh.  It was deliberately limited
* to 2 levels (self → caller → caller.caller) to avoid an infinite recursion that was
* observed in some tool-hosted portal configurations (see comment dated 21-12-2023).
*
* Publishes `button_edit_click` so the mosaic-view modal can close itself when the
* user navigates to a full-screen edit.
*
* @param {Object} options              - Edit parameters.
* @param {string} options.section_tipo - Ontology tipo of the target section.
* @param {string|number} options.section_id - Record id of the target record.
* @returns {Promise<Window|undefined>} The native `Window` object of the opened window,
*                                      or `undefined` if no `engine_request_config` is
*                                      found for the given `section_tipo`.
*/
component_portal.prototype.edit_record_handler = async function(options) {

	const self = this

	// options
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

	// engine_request_config. Get current section engine
	// Determine which API engine owns this section_tipo by matching against the
	// sqo.section_tipo list in each request_config entry.
		const request_config		= self.context.request_config
		const engine_request_config	= request_config.find(el => {
			const sections_tipo = el.sqo.section_tipo.map(item => {
				return item.tipo
			})
			return sections_tipo.includes(section_tipo)
		})
		if (!engine_request_config) {
			// no engine is detected in request_config for section_tipo
			if(SHOW_DEBUG===true) {
				console.warn(')) NO engine_request_config found. edit_record_handler - section_tipo:', section_tipo);
				console.warn(')) edit_record_handler - request_config:', request_config);
			}
			return
		}

	// short vars
		let new_window

	// open window
		if (engine_request_config.api_engine!=='dedalo') {

			// external engines: zenon etc.

			const url = engine_request_config.api_config.ui_base_url + section_id

			// open a new window from external source to view record
			new_window	= open_window({
				url		: url,
				name	: 'external_' + section_id
			})

		}else{

			// dedalo engine

			// open a new window from Dédalo to view/edit record
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				id				: section_id,
				mode			: 'edit',
				session_save	: false, // prevent to overwrite current section session
				menu			: false
			})

			const fn_window_blur = function() {
				// refresh. Get the proper element to refresh based on some criteria.
				// Note that portals in text view are not self refresh able
				// Climbs the caller chain to find the nearest edit-mode component to refresh.
				// Capped at 2 levels to avoid infinite recursion in tool-hosted portals
				// (see removed recursive branch below, dated 21-12-2023).
				function get_edit_caller(instance) {
					if(instance && instance.mode==='edit' && instance.type==='component') {
						return instance
					}
					if(instance.caller && instance.caller.mode==='edit' && instance.caller.type==='component') {
						return instance.caller
					}
					if(instance.caller.caller && instance.caller.caller.mode==='edit' && instance.caller.caller.type==='component') {
						return instance.caller.caller
					}
					// removed 21-12-2023, it create a infinite loop in some cases as component_portal "numisdata77"
					// in numisdata_order_coins tool, when edit the original section
					// else if(instance.caller) {
					// 	return get_edit_caller(instance.caller)
					// }
					return self
				}
				const edit_caller = get_edit_caller(self)
				if (edit_caller) {
					edit_caller.refresh({
						destroy			: false,
						build_autoload	: true
					})
					.then(function(){
						// fire window_blur event
						event_manager.publish('window_blur_'+self.id, self)
					})
				}
			}//end fn_window_blur
			new_window = open_window({
				url		: url,
				name	: 'record_view_' + section_tipo +'_'+ section_id,
				on_blur : fn_window_blur
			})
		}

	// button_edit_click event. Subscribed to close current modal if exists (mosaic view case)
		event_manager.publish('button_edit_click', this)


	return new_window
}//end edit_record_handler



/**
* FOCUS_FIRST_INPUT
* No-op focus stub for the portal component.
*
* `common` calls `focus_first_input()` on the active component when the user
* activates a record.  Most components use this to move keyboard focus to their
* first text input.  Portals have no meaningful single input to focus — the
* autocomplete is opened explicitly by a button click — so this method simply
* returns `true` to satisfy the interface without changing focus.
*
* @returns {boolean} Always `true`.
*/
component_portal.prototype.focus_first_input = function() {

	return true
}//end focus_first_input



/**
* OPEN_ONTOLOGY_WINDOW
* Opens the ontology (area_ontology) or thesaurus (area_thesaurus) picker window and
* returns a reference to it.
*
* The opened window listens for a `link_term_<caller_id>` event (published by the
* thesaurus/ontology tree when the user clicks a term's link button); that event is
* handled by `link_term_handler` registered in `init()`.
*
* Routing logic:
*  - If the portal's `section_tipo` has `section_id === '0'` (i.e. an ontology node),
*    the ontology area (`tipo: 'dd5'`) is opened with optional `search_tipos` to
*    highlight specific nodes.
*  - Otherwise, the thesaurus area (`tipo: 'dd100'`) is opened with:
*    - `hierarchy_sections` — the target section tipo(s) from `self.rqo.sqo.section_tipo`,
*      telling the thesaurus which section branches to show.
*    - `hierarchy_terms` — an optional `fixed_filter` of type `hierarchy_terms` from the
*      portal's `source.request_config[0].sqo.fixed_filter`, restricting which top-level
*      thesaurus branches are shown.
*
* The window name `'tree_window'` is fixed so that re-clicking the button reuses the
* existing window (browser brings it to front) instead of opening a duplicate.
*
* @param {string} thesaurus_mode          - Mode passed as a URL parameter to the opened
*                                           window (e.g. 'relation', 'search').
* @param {Array<string>} [search_tipos]   - Array of ontology tipos to highlight/search in
*                                           area_ontology; ignored in area_thesaurus mode.
* @returns {Window} The native `Window` object for the opened/reused picker window.
*/
component_portal.prototype.open_ontology_window = function (thesaurus_mode, search_tipos) {

	const self = this

	// url vars
		const url_vars = {}

		// tipo
		// Distinguish between ontology nodes (section_id='0') and thesaurus records.
		const is_ontology	= get_section_id_from_tipo(self.section_tipo) === '0'
		const tipo			= is_ontology
			? 'dd5' // ONTOLOGY_TIPO
			: 'dd100' // THESAURUS_TIPO
		url_vars.tipo = tipo

		// menu
		url_vars.menu = false

		// thesaurus_mode
		url_vars.thesaurus_mode = thesaurus_mode

		if (is_ontology) {

			// only for area_ontology

			url_vars.search_tipos = search_tipos

		}else{

			// only for area_thesaurus

			// hierarchy_sections. Add to url if present
			// Informs the thesaurus which section tipo branches should be shown as roots.
			const hierarchy_sections = self.rqo.sqo.section_tipo || null
			if (hierarchy_sections) {
				url_vars.hierarchy_sections = JSON.stringify(hierarchy_sections)
			}

			// hierarchy_terms optional. Add to url if present
			// Extracted from properties.source.request_config[0].sqo.fixed_filter items
			// whose source is 'hierarchy_terms'.  Restricts visible top-level branches.
			const hierarchy_terms = self.context?.properties?.source
			&& self.context.properties.source.request_config
			&& self.context.properties.source.request_config[0]
			&& self.context.properties.source.request_config[0].sqo
			&& Array.isArray(self.context.properties.source.request_config[0].sqo.fixed_filter)
				? self.context.properties.source.request_config[0].sqo.fixed_filter.filter(el => el.source === 'hierarchy_terms')
				: null
			if (hierarchy_terms) {
				url_vars.hierarchy_terms = JSON.stringify(hierarchy_terms)
			}
		}

		// caller_id
		// Passed to the tree window so it knows which `link_term_<id>` event to publish
		// when the user confirms a term selection.
		const caller_id = self.id || null
		if(caller_id){
			url_vars.initiator = JSON.stringify(caller_id)
		}

	// url
	const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)

	// open window
	// Fixed name 'tree_window' so the browser reuses an existing window if already open.
	const tree_window = open_window({
		url		: url,
		name	: 'tree_window',
		width	: 1025,
		height	: 800
	})


	return tree_window
}//end open_ontology_window



/**
* IS_EMPTY
* Returns whether the portal currently has no linked entries.
*
* Used primarily in search mode: when the portal is part of an SQO filter, the
* component wrapper receives an 'active' / highlighted CSS class only when the user
* has picked at least one locator.  `is_empty` drives that highlight logic.
*
* Checks `this.data.entries.length` first (the fast path), then verifies that
* `entries[0]` is truthy as a safety guard against sparse arrays or entries containing
* falsy stub values.
*
* Note: only the currently loaded pagination page is inspected; an empty page does
* not necessarily mean the full portal dataset is empty across all pages.
*
* @returns {boolean} `true` if the portal has no entries on the current page;
*                    `false` if at least one entry exists and is truthy.
*/
component_portal.prototype.is_empty = function() {

	const entries = this.data?.entries || []

	if(entries.length === 0) {
		return true
	}

	// Double check first entry exists (safety)
	if(entries[0]) {
		return false
	}

	return true
}//end is_empty



// @license-end
