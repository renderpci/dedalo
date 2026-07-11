// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, JSONEditor, import */
/*eslint no-undef: "error"*/



// imports
	import {common,load_data_debug, build_autoload} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_area} from './render_area.js'



/**
* AREA
* Top-level container instance that represents a full navigable area within the
* Dédalo application shell (e.g. a thesaurus area, an ontology management area,
* a records area). An area wraps one logical section type and is mounted directly
* inside a page slot.
*
* Lifecycle (inherited from common + area_common):
*   init (area_common) → build (own) → render (own + common) → refresh (common) → destroy (common)
*
* Prototype methods mixed in from shared base classes:
*   - init           ← area_common.prototype.init
*   - refresh        ← common.prototype.refresh
*   - destroy        ← common.prototype.destroy
*   - build_rqo_show ← common.prototype.build_rqo_show
*   - edit           ← render_area.prototype.edit
*   - list           ← render_area.prototype.list
*
* Own methods defined here:
*   - build   : fetches context + data from the API and wires instance properties
*   - render  : delegates to common.render, then fires 'render_instance' event
*/
export const area = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status
}//end area



/**
* COMMON FUNCTIONS
* extend area functions from area common
*/
// prototypes assign
	area.prototype.init				= area_common.prototype.init
	area.prototype.refresh			= common.prototype.refresh
	area.prototype.destroy			= common.prototype.destroy
	area.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area.prototype.edit				= render_area.prototype.edit
	area.prototype.list				= render_area.prototype.list



/**
* BUILD
* Load and parse necessary data to create a full ready instance.
*
* When `autoload` is true (the default), this method:
*   1. Builds the request query object (rqo) from the instance's request_config or
*      from a previously injected context.  The rqo drives the single API round-trip
*      that returns both context and data for this area's section tipo.
*   2. Calls `build_autoload(self)` — the shared helper in common.js — which dispatches
*      the rqo via `data_manager.request()`, handles auth errors (not_logged → waits for
*      login_successful event), and returns the raw API response or `false` on failure.
*   3. Tears down any previously rendered child instances (`destroy(false, true, false)`)
*      before wiring the fresh server response into the instance.
*   4. Resolves `self.context` (area-level context object from `datum.context`).
*      Preserves any existing context already on the instance — this is intentional:
*      a caller (e.g. section_record.js) may have injected a context that carries a
*      custom ddo_map override (e.g. oh27 defines a specific view for rsc368).
*      Overwriting it here would silently revert those overrides to server defaults.
*   5. Resolves `self.data` — the section's own data record from `datum.data`.
*      Identified by `el.tipo === el.section_tipo` (the record where tipo matches
*      the section tipo, i.e. the area's root record).
*   6. Resolves `self.widgets` — context items that are direct children of this area's
*      tipo and flagged with `typo === 'widget'`.
*      (!) Note: the field is `typo`, not `type` — this appears to be a legacy spelling
*      in context objects; do not "correct" it.
*   7. Rebuilds the final rqo from the resolved context.request_config.
*   8. Updates `document.title` via `self.caller.set_document_title()`.
*
* The rqo construction logic:
*   - Priority: use an existing `self.rqo` if already set (avoids duplicate builds
*     across refresh cycles).
*   - `add_show` is forced true when `self.mode === 'tm'` (time-machine mode) so that
*     the request includes the show definition needed for TM rendering.
*   - When `self.context` already exists (re-build after first render), the
*     request_config_object is sourced from `self.context.request_config` rather than
*     `self.request_config` to stay consistent with any ddo_map overrides.
*
* `api_response.result` shape:
*   {
*     context : Array<Object>,  // flat list of context descriptors for this section
*     data    : Array<Object>   // flat list of data records for this section
*   }
*
* @param {boolean} [autoload=true] - When true, fetches fresh data from the server.
*   Pass false only when the caller has pre-populated `self.datum` and a server call
*   is not needed (rare; used by pre-loaded portal paths).
* @returns {Promise<boolean>} true on success, false if the server returned an empty
*   or invalid response (error is logged to console).
*/
area.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data	= self.data || {}

	// rqo
		const generate_rqo = async function(){

			if (!self.context) {
				// request_config_object. get the request_config_object from request_config
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// rqo build
			const action	= 'get_data'
			const add_show	= self.add_show ? self.add_show : self.mode==='tm' ? true : false
			self.rqo = self.rqo || await self.build_rqo_show(
				self.request_config_object, // object request_config_object
				action,  // string action like 'get_data'
				add_show // bool add_show
			)
		}
		await generate_rqo()

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, area without context:", api_response);
					return false
				}

			// destroy dependencies
				await self.destroy(
					false, // bool delete_self
					true, // bool delete_dependencies
					false // bool remove_dom
				)

			// set the result to the datum
				self.datum = api_response.result

			// set context and data to current instance
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context	= self.datum.context.find(el => el.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				self.widgets	= self.datum.context.filter(el => el.parent===self.tipo && el.typo==='widget')

			// rebuild the request_config_object and rqo in the instance
			// request_config_object
				self.request_config_object	= self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')

			// rqo build
				self.rqo = await self.build_rqo_show(self.request_config_object, 'get_data')
		}//end if (autoload===true)

		self.label = self.context.label

		// set the window document.title
			const page_title = `${self.label} - ${self.tipo}`
			self.caller.set_document_title(page_title)


	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* Handles DOM render nodes.
*
* Delegates entirely to `common.prototype.render`, which:
*   - Guards against duplicate concurrent renders (serialises via a waiter Promise)
*   - Dispatches to `self.edit()` or `self.list()` depending on `self.mode`
*     (both are mixed in from render_area.prototype above)
*   - Sets `self.status = 'rendering'` → `'rendered'`
*   - Stores the produced HTMLElement in `self.node`
*
* After the common render returns, publishes the 'render_instance' event with the
* area instance as its payload.  The page layer subscribes to this event to restore
* section-level UI state (e.g. active row selection after pagination navigation).
*
* @param {Object} [options={}] - Render options passed through to common.render
* @param {string} [options.render_level] - Depth of render: 'full' (default, entire
*   wrapper including chrome) or 'content' (inner content nodes only, used by refresh).
* @returns {Promise<HTMLElement>} The first DOM node stored in `self.node` (the wrapper).
*/
area.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render



// @license-end
