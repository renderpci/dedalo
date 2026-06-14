// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* INSTALL
* Controller class for the Dédalo first-run installation wizard.
*
* This module is the client-side entry point for the pre-authentication
* installation flow. Its sole purpose is to bootstrap the wizard UI:
*
*   1. On `init()`:  seed instance properties from the supplied `options` bag.
*   2. On `build()`: optionally fetch the install context from the server via
*      the `get_install_context` API action (which intentionally bypasses the
*      normal authentication gate — the user is not yet logged in).
*   3. On `render()` / `install()` / `list()` / `edit()`: delegate immediately
*      to `render_install.prototype.render`, which constructs the multi-step
*      wizard DOM (database init tests, config check, DB install, root-password
*      setting, login, hierarchy import, and finish).
*
* The class follows the standard Dédalo UI lifecycle:
*   `init → build → render → destroy`
*
* Prototype methods are provided by mixing in `common.prototype` and
* `render_install.prototype`. No additional instance methods are defined
* directly on `install.prototype` beyond the lifecycle overrides below.
*
* Security note: `get_install_context` runs WITHOUT a prior login; the server
* must enforce that this action is unavailable once installation is complete.
*
* Exported symbols: `install` (constructor)
*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {render_install} from './render_install.js'



/**
* INSTALL
* Constructor — seeds all well-known instance properties to a safe baseline.
*
* Properties declared here (all assigned concrete values by `init()`):
*   id       — unique DOM/instance identifier (populated externally before init)
*   model    — class name string, e.g. 'install'
*   type     — fixed to 'install' (set in init)
*   tipo     — ontology tipo for this element
*   mode     — active render mode ('list', 'edit', 'install', …)
*   lang     — active language tag, e.g. 'lg-eng'
*   datum    — full datum array (usually null for install; no record context)
*   context  — server-resolved context object from `get_install_context`
*   data     — resolved data for the current record (set to {} after build)
*   node     — root HTMLElement created by render(); null until then
*   ar_instances — child instances managed by this element (starts empty)
*   status   — lifecycle state string: 'initializing' → 'initialized' → …
*
* @returns {boolean} true — constructors in this codebase conventionally return true
*/
export const install = function() {

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

	this.node
	this.ar_instances = []

	this.status

	return true
}//end install



/**
* COMMON FUNCTIONS
* extend component functions from component common
*
* Prototype assignments wire the standard Dédalo UI contracts onto `install`:
*   render   — common.prototype.render (lifecycle entry; resolves mode → method)
*   install  — delegates to render_install.prototype.render (install-wizard DOM)
*   list     — also render_install.prototype.render (same view for list context)
*   edit     — also render_install.prototype.render (same view for edit context)
*   destroy  — common.prototype.destroy (tears down events and child instances)
*   refresh  — common.prototype.refresh (destroy deps → build → re-render)
*
* All three mode variants (install, list, edit) map to the same render function
* because the install wizard has a single unified view regardless of mode.
*/
// prototypes assign
	install.prototype.render	= common.prototype.render
	install.prototype.install	= render_install.prototype.render
	install.prototype.list		= render_install.prototype.render
	install.prototype.edit		= render_install.prototype.render
	install.prototype.destroy	= common.prototype.destroy
	install.prototype.refresh	= common.prototype.refresh



/**
* INIT
* Seeds all instance properties from the supplied `options` bag and sets the
* one-shot `is_init` guard that prevents duplicate initialization.
*
* Must be called exactly once per instance. If called a second time on the
* same instance (e.g., due to a duplicated DOM event firing), an error is
* logged and `false` is returned immediately — the existing state is preserved.
*
* After a successful call:
*   - `this.status` is 'initialized'
*   - `this.is_init` is `true`
*   - `this.node` is `null` (populated only after render())
*   - `this.events_tokens` is a new empty array
*   - `this.context`, `this.data`, `this.datum` hold the values from `options`
*     (or `null` if not supplied)
*
* (!) `alert()` is shown in SHOW_DEBUG mode on a duplicate-init error. This is
* a developer diagnostic tool only and is intentional.
*
* @param {Object} options - Initialization options bag
* @param {string} options.model - Instance class name, e.g. 'install'
* @param {string} options.tipo - Ontology tipo of this element
* @param {string} options.mode - Render mode: 'install', 'edit', 'list', etc.
* @param {string} options.lang - Active language tag, e.g. 'lg-eng'
* @param {Object|null} [options.context=null] - Pre-fetched install context (omit to let build() fetch it)
* @param {Object|null} [options.data=null] - Pre-resolved data (normally null for install)
* @param {Array|null} [options.datum=null] - Full datum array (normally null for install)
* @returns {Promise<boolean>} Resolves to true on success; false if the instance was already initialized
*/
install.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	// instance key used vars
	self.model			= options.model
	self.tipo			= options.tipo
	self.mode			= options.mode
	self.lang			= options.lang

	// DOM
	self.node			= null

	self.events_tokens	= []
	self.context		= options.context	|| null
	self.data			= options.data		|| null
	self.datum			= options.datum		|| null

	self.type			= 'install'
	self.label			= null


	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Prepares the instance for rendering by optionally loading the install context
* from the server.
*
* When `autoload` is `true` (the typical production path), this method sends a
* `get_install_context` request to `dd_utils_api` and stores the matching result
* entry on `self.context`. Unlike the normal `get_element_context` action used
* by authenticated components, `get_install_context` does not require a session
* token — the install wizard runs before any user is logged in.
*
* Response shape expected from `api_response.result`:
*   An array of context objects (one per model). This method filters for the
*   entry where `element.model === self.model` and stores it as `self.context`.
*   `self.data` is then set to an empty object `{}` (no record-level data exists
*   at install time).
*
* When `autoload` is `false`, the caller is responsible for populating
* `self.context` and `self.data` before calling `render()`.
*
* The `create_source(self, null)` call builds the standard Dédalo source object
* that identifies this instance to the server (model, tipo, mode, lang, etc.).
* Passing `null` as the action means no specific data action is requested —
* context retrieval is the sole purpose of this call.
*
* @param {boolean} [autoload=false] - When true, fetches install context from the API
* @returns {Promise<boolean>} Resolves to true once the build phase is complete
*/
install.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// autoload
		if (autoload===true) {

			// rqo build.
			// Note that get_install_context does not need a previous login action as similar call get_element_context
				const rqo = {
					action	: 'get_install_context',
					dd_api	: 'dd_utils_api',
					source	: create_source(self, null)
				}

			// load data. get context and data
				const api_response = await data_manager.request({
					body : rqo
				})

				if (SHOW_DEBUG) {
					console.log('----> install build api_response', api_response);
				}

			// set context and data to current instance
				self.context	= api_response.result.find(element => element.model===self.model);
				self.data		= {}
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



// @license-end
