// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'



/**
* AREA_COMMON
* Base constructor shared by every `area_*` module (area, area_thesaurus,
* area_ontology, area_tool, etc.).  It is never instantiated directly; each
* concrete area assigns `area_common.prototype.init` to its own prototype and
* calls it via `area_common.prototype.init.call(this, options)` from its own
* `build()` or `init()`.
*
* Responsibilities:
*  - Declares the canonical set of instance properties that every area needs
*    (identity, state, data, DOM anchor, event tokens, child instances).
*  - Implements `init()`, the shared lifecycle phase that runs before `build()`.
*    `init()` wires up the 'render_<id>' event subscription that keeps the page
*    menu's section-label in sync after each render.
*
* Property declarations below are intentionally left `undefined` at construction
* time — their initial values are set in `init()` from the caller-supplied
* `options` object.
*
* Concrete subclasses must also prototype-assign at minimum:
*   build()   — load data from the API and populate context/data
*   render()  — paint the DOM node from loaded context/data
*
* @see area_common.prototype.init for the full initialization contract.
*/
export const area_common = function() {

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

	this.id_variant
}//end area_common



/**
* INIT
* Shared initialization phase for all area instances.
*
* Copies all well-known fields from `options` onto `this`, sets up infrastructure
* arrays/objects (`events_tokens`, `ar_instances`, `dd_request`, `pagination`),
* and installs the 'render_<id>' event subscription that triggers a menu
* section-label update after every render cycle.
*
* Called by concrete area subclasses via:
*   `area_common.prototype.init.call(this, options)`
* immediately at the start of their own `build()` method, before any API calls.
*
* After `init()` returns, `self.status` is `'initialized'`.  The subclass is then
* responsible for advancing the status to `'built'` once its `build()` completes.
*
* Key side-effects:
*  - Subscribes a handler to the namespaced event `'render_' + self.id` on the
*    global `event_manager` singleton.  The token is pushed into `events_tokens`
*    so that `common.prototype.destroy` can unsubscribe it cleanly.
*  - The render handler calls `menu.update_section_label()` to keep the top-bar
*    menu in sync with the area's human-readable label.  This only fires when the
*    area was created directly by a `page` caller (i.e. `self.caller.model === 'page'`);
*    nested/tool-embedded areas skip the menu update.
*
* @param {Object} options - Initialization bag supplied by the concrete area's `build()`.
*   @param {string}   options.model      - Component model name, e.g. `'area'`, `'area_thesaurus'`.
*   @param {string}   options.tipo       - Ontology tipo that identifies this area, e.g. `'oh27'`.
*   @param {string}   [options.section_tipo] - Section-level tipo; falls back to `options.tipo`.
*   @param {string}   options.mode       - Display/edit mode, e.g. `'edit'`, `'list'`, `'tm'`.
*   @param {string}   options.lang       - Active language code, e.g. `'lg-spa'`.
*   @param {Object}   [options.properties]  - Additional configuration from the ontology context.
*   @param {Object}   [options.parent]   - Parent DOM element or instance reference.
*   @param {Object}   [options.caller]   - The owning page/tool instance; used to locate the menu.
*   @param {Object}   [options.datum]    - Pre-loaded datum (context+data envelope); null if not yet fetched.
*   @param {Object}   [options.context]  - Pre-loaded context record; null if not yet fetched.
*   @param {Object}   [options.data]     - Pre-loaded data record; null if not yet fetched.
*   @param {Object}   [options.widgets]  - Widget context descriptors for this area.
*   @param {number}   [options.permissions] - Permission level integer (e.g. 1=read-only, 2=full).
* @returns {Promise<boolean>} Resolves to `true` on success.
*/
area_common.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model			= options.model
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo || self.tipo
	self.mode			= options.mode
	self.lang			= options.lang
	self.properties		= options.properties

	// DOM
	self.node			= null

	self.parent			= options.parent

	self.events_tokens	= []
	self.ar_instances	= []

	self.caller			= options.caller || null

	// dd_request holds the resolved request-config objects for each interaction
	// mode (show, search, select).  Populated later in build() by build_rqo_show().
	self.dd_request		= {
		show	: null,
		search	: null,
		select	: null
	}

	self.datum		= options.datum   		|| null
	self.context	= options.context 		|| null
	self.data		= options.data 	  		|| null
	self.pagination	= { // pagination info
		total : 0,
		offset: 0
	}

	self.type	= 'area'
	self.label	= null

	self.widgets		= options.widgets 	  	|| null
	self.permissions	= options.permissions 	|| null


	// events subscription

		// render_ event
		// Subscribe once per instance to the namespaced render event published by
		// common.prototype.render() after the DOM node is ready.  When the area lives
		// directly under a page (caller.model === 'page'), the handler locates the
		// sibling menu instance and updates its section-label widget so the top bar
		// always reflects the current area name.
			const render_handler = () => {

				// menu label control
				const update_menu = (menu) => {

					// menu instance check. Get from caller page
					if (!menu) {
						if(SHOW_DEBUG===true) {
							console.log('menu is not available from area.');
						}
						return
					}

					// update_section_label
					menu.update_section_label({
						value					: self.label,
						mode					: self.mode,
						section_label_on_click	: null
					})
				}

				// call only for direct page created sections
				// Areas embedded inside a tool or another component skip this block;
				// only top-level page children need to sync the menu label.
				if (self.caller && self.caller.model==='page') {
					// menu. Get from caller page
					// Walk the caller page's ar_instances to find the menu sibling.
					// ar_instances is populated during the page's own build/render phase,
					// so it may be empty if the page is still initializing — `find`
					// will return undefined in that case and update_menu() will bail safely.
					const menu_instance = self.caller && self.caller.ar_instances
						? self.caller.ar_instances.find(el => el.model==='menu')
						: null
					update_menu( menu_instance )
				}
			}
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.id, render_handler)
			)

	// status update
		self.status = 'initialized'


	return true
}//end init



// @license-end
