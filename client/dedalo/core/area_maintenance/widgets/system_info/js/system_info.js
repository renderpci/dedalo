// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* SYSTEM_INFO
* Maintenance-area widget that collects and displays server environment
* information: API health, PHP/extension requirements, and OS/hardware
* resources (RAM, CPU, disk, etc.).
*
* Architecture
* ------------
* system_info follows the standard Dédalo widget lifecycle:
*
*   init()  → (inherited from widget_common) seeds all instance properties.
*   build() → overridden here; delegates to widget_common.prototype.build for
*             the base autoload path but explicitly defers value resolution
*             until the widget enters the viewport, because collecting system
*             resources is an expensive server-side operation.
*   render() → (inherited from widget_common) dispatches to this.edit() or
*              this.list() based on this.mode.
*   edit / list → both alias render_system_info.prototype.list, which builds
*                 three sub-panels:
*                   1. Health list   — N repeated check_server_health calls +
*                      one get_environment call, rendered with timing info.
*                   2. Requirements list — PHP extensions, config flags, etc.
*                      (populated from self.value.requeriments_list).
*                   3. System list  — OS version, RAM, CPU, disk stats
*                      (populated from self.value.system_list).
*
* Value loading is intentionally lazy:
*   The actual get_value() request (routed through area_maintenance.prototype.get_value
*   via a long-lived worker) is NOT fired during build().  Instead, the
*   datalist_container shows a "please wait" placeholder and the widget body
*   triggers the load when it becomes visible (via widget_common.load /
*   when_in_viewport in render_system_info).  This prevents the system-info
*   request from blocking the rest of the maintenance-area dashboard.
*
* Prototype chain
* ---------------
* system_info inherits from three sources:
*   - widget_common  — lifecycle (init, render, destroy) and build base.
*   - area_maintenance — get_value (the long-lived worker request that calls
*     dd_area_maintenance_api::get_widget_value on the server).
*   - render_system_info — the concrete DOM-building methods (list).
*
* Server peer:
*   core/area_maintenance/widgets/system_info/class.system_info.php
*
* Main exports: `system_info` (constructor).
*
* @see core/area_maintenance/js/area_maintenance.js   — get_value contract
* @see core/widgets/widget_common/js/widget_common.js — base lifecycle
* @see core/area_maintenance/widgets/system_info/js/render_system_info.js — DOM rendering
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_system_info} from './render_system_info.js'



/**
* SYSTEM_INFO
* Constructor for the system_info widget instance.
*
* All properties are declared here as undefined/empty so that downstream
* lifecycle methods can rely on their existence without guard checks.
* Actual values are populated by init() (identity fields) and build() (data).
*
* @property {string}      id             - Unique instance identifier, set by init().
* @property {string}      section_tipo   - Ontology tipo of the parent section.
* @property {string|number} section_id   - Record id within the parent section.
* @property {string}      lang           - Active UI language tag (e.g. 'lg-eng').
* @property {string}      mode           - Render mode: 'edit' | 'list'.
* @property {Object|null} value          - Server payload with system_list,
*   requeriments_list, and errors arrays.  Null until the lazy load fires.
* @property {HTMLElement} node           - Root DOM node after render().
* @property {Array}       events_tokens  - Event-manager subscription tokens;
*   drained by destroy() to prevent leaks.
* @property {Array}       ar_instances   - Child widget instances (unused here
*   but required by the common destroy contract).
* @property {string}      status         - Lifecycle state progression:
*   'initializing' → 'initialized' → 'building' → 'built'.
*/
export const system_info = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end system_info



/**
* COMMON FUNCTIONS
* Prototype assignments that wire inherited lifecycle and render methods into
* system_info without duplicating code.
*
* Lifecycle (from widget_common):
*   init    — seeds all instance properties from the options bag.
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes events_tokens and removes the DOM node.
*
* Data (from area_maintenance):
*   get_value — fires a long-lived worker request to
*     dd_area_maintenance_api::get_widget_value and returns the result payload.
*     Used by widget_common.load (triggered on viewport entry) to populate
*     self.value, after which a content-level re-render replaces the placeholder.
*
* Render (from render_system_info):
*   edit / list — both alias render_system_info.prototype.list, which builds
*     the full three-panel system-info DOM (health, requirements, system).
*
* Note: widget_common.prototype.build is NOT assigned here because system_info
* defines its own build() override below.
*/
// prototypes assign
	// // lifecycle
	system_info.prototype.init		= widget_common.prototype.init
	// system_info.prototype.build	= widget_common.prototype.build
	system_info.prototype.render	= widget_common.prototype.render
	system_info.prototype.destroy	= widget_common.prototype.destroy
	system_info.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	system_info.prototype.edit		= render_system_info.prototype.list
	system_info.prototype.list		= render_system_info.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
*
* Extends widget_common.prototype.build with system_info-specific deferral
* behaviour.  The common base handles the component_info autoload path
* (setting self.value when caller === 'component_info'); the try/catch block
* here is reserved for any future pre-render setup that should not block the
* dashboard.
*
* Why defer value resolution?
* System-info data collection is a potentially long server-side operation
* (spawning PHP shell commands, reading /proc, etc.).  Firing it during build()
* would block the widget from reaching the DOM and would compete with every
* other widget being built in parallel.  Instead, value resolution is triggered
* by widget_common.load() when the widget enters the viewport (via
* when_in_viewport in render_system_info.list), and the result is merged via a
* content-level re-render.
*
* @param {boolean} [autoload=false] - When true, widget_common.prototype.build
*   fires the standard component_info 'get_widget_data' request and stores the
*   result in self.value.  For system_info the typical value is false (the
*   parent area_maintenance drives loading via get_value instead).
* @returns {Promise<boolean>} Resolves to the return value of
*   widget_common.prototype.build (true on success, false on error).
*/
system_info.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// delay value resolution to avoid blocking other widgets
		// note that system info has a lower priority because could be
		// a long request collecting the system resources info
		// value will be fixed at render, when datalist_container is in view port

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



// @license-end
