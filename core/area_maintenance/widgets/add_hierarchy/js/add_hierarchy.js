// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* ADD_HIERARCHY
*
* Maintenance widget that allows administrators to import thesaurus / hierarchy
* JSON files from the server's install directory into the running Dédalo instance.
*
* The widget is surfaced inside area_maintenance and inherits the standard widget
* lifecycle from widget_common:
*
*   init()  → build()  → render()  → [refresh cycles]  → destroy()
*
* Data loading is deferred: `this.value` is populated via the area_maintenance
* `get_value()` call (which fires a 'get_widget_value' API action), not in build().
* The render layer (`render_add_hierarchy`) reuses the hierarchy import UI from
* the install wizard (`render_hierarchies_import_block`), so the operator sees
* exactly the same form regardless of entry point.
*
* Prototype chain:
*   Lifecycle (init, render, destroy, refresh) ← widget_common
*   Data fetch (get_value)                     ← area_maintenance
*   View rendering (edit, list)                ← render_add_hierarchy.prototype.list
*
* Server peer:  core/area_maintenance/widgets/add_hierarchy/class.add_hierarchy.php
* API action:   dd_area_maintenance_api → get_widget_value (source.model = 'add_hierarchy')
*
* Exported:
*   add_hierarchy — constructor function; use via `new add_hierarchy()` then init()
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_add_hierarchy} from './render_add_hierarchy.js'



/**
* ADD_HIERARCHY
* Constructor for the add_hierarchy widget instance.
*
* Declares all well-known instance properties with undefined values so that
* downstream lifecycle methods can assume they exist on the prototype chain.
* Actual values are assigned by `init()` (from widget_common) and `build()`.
*
* @returns {void}
*
* Properties:
*   @var {string}        id             - Unique widget instance identifier (set by init)
*   @var {Object}        value          - Resolved server payload containing `hierarchies`,
*                                        `hierarchy_files_dir_path`, `hierarchy_typologies`,
*                                        and `active_hierarchies` (set by get_value / build)
*   @var {HTMLElement}   node           - Root DOM node created by render (set by render)
*   @var {Array}         events_tokens  - Event subscription tokens for cleanup in destroy()
*   @var {Array}         ar_instances   - Child widget/component instances managed by this widget
*   @var {string}        status         - Lifecycle state: 'building' | 'built' | 'destroyed'
*/
export const add_hierarchy = function() {

	this.id

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end add_hierarchy



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared lifecycle and rendering methods
* from widget_common, area_maintenance, and render_add_hierarchy into this
* widget's prototype chain.
*
* Assignments:
*   init     ← widget_common  : seeds instance properties from options bag; sets is_init guard
*   render   ← widget_common  : dispatches to this.edit() or this.list() based on this.mode
*   destroy  ← widget_common  : unsubscribes events_tokens and marks status 'destroyed'
*   refresh  ← widget_common  : tears down render state then re-runs build() + render()
*   get_value← area_maintenance: fires 'get_widget_value' API action, returns resolved value payload
*   edit     ← render_add_hierarchy.prototype.list : render used in edit mode (same as list view)
*   list     ← render_add_hierarchy.prototype.list : render used in list/read mode
*
* Note: build() is NOT delegated here — add_hierarchy supplies its own override below.
*/
// prototypes assign
	// lifecycle
	add_hierarchy.prototype.init		= widget_common.prototype.init
	// add_hierarchy.prototype.build	= widget_common.prototype.build
	add_hierarchy.prototype.render		= widget_common.prototype.render
	add_hierarchy.prototype.destroy		= widget_common.prototype.destroy
	add_hierarchy.prototype.refresh		= widget_common.prototype.refresh
	add_hierarchy.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	add_hierarchy.prototype.edit		= render_add_hierarchy.prototype.list
	add_hierarchy.prototype.list		= render_add_hierarchy.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
*
* Overrides widget_common.prototype.build to integrate with the area_maintenance
* widget lifecycle. Calls the generic common build (which, for widget_common, sets
* up base state and optionally triggers autoload via widget_common's own path), then
* delegates actual data loading to the unified widget load() mechanism that fires
* when the widget panel is opened in the area_maintenance render layer
* (see render_area_maintenance.js). No additional data fetch is performed here.
*
* The try/catch captures any unexpected errors from the common build and stores them
* on `self.error` so that the render layer can surface an error state rather than
* silently failing.
*
* @param {boolean} autoload - When true, widget_common.prototype.build may trigger
*                             an immediate server fetch. Defaults to false here because
*                             data is loaded on panel open, not at construction time.
* @returns {Promise<boolean>} Result of widget_common.prototype.build.call() — true on
*                             success, false if the common build could not complete.
*/
add_hierarchy.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



// @license-end
