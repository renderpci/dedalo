// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* REGISTER_TOOLS
* Maintenance widget controller for the Dédalo tool-registration panel.
*
* This widget lets system administrators scan all tool directories, compare
* each tool's register.json version against the version persisted in the
* ontology database, detect outdated registrations, and trigger a bulk
* re-import via the "Register tools" action button.
*
* Architecture
* ------------
* This module is the controller half of the register_tools widget.  It follows
* the standard Dédalo maintenance-widget pattern:
*
*   Constructor  — declares instance properties.
*   Prototypes   — lifecycle methods delegated to widget_common (init/build/render/
*                  destroy) and render methods delegated to render_register_tools (edit/list).
*                  `get_value` is delegated to area_maintenance so the widget fetches
*                  its server-side value through the unified
*                  `dd_area_maintenance_api::get_widget_value` endpoint.
*   Own methods  — `build` overrides the common build to opt out of the
*                  standalone widget autoload (data is loaded on-open by the
*                  area_maintenance shell).
*
* Value shape (from class.register_tools.php::get_value)
* -------------------------------------------------------
* this.value = {
*   datalist : Array<{
*     name              : string,  // tool directory basename (e.g. 'tool_export')
*     version           : string,  // version declared in register.json
*     developer         : string,  // developer declared in register.json
*     installed_version : string,  // version stored in ontology (dd1645)
*     warning           : string|null // missing-file / read-error message
*   }>,
*   errors : Array<string>|null     // e.g. missing ontology term dd1644
* }
*
* Server counterpart: core/area_maintenance/widgets/register_tools/class.register_tools.php
*   API_ACTIONS: 'register_tools'  (triggers tools_register::import_tools)
*
* DOM rendering is fully delegated to render_register_tools.js.
*
* Main export: `register_tools` (constructor).
*
* @see core/area_maintenance/widgets/register_tools/class.register_tools.php — PHP backend
* @see core/area_maintenance/widgets/register_tools/js/render_register_tools.js — DOM layer
* @see core/widgets/widget_common/js/widget_common.js — shared widget lifecycle
* @see core/area_maintenance/js/area_maintenance.js — get_value delegation source
* @see core/tools_common/class.tools_register.php — server-side tool scanner / importer
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_register_tools} from './render_register_tools.js'



/**
* REGISTER_TOOLS
* Constructor for the register_tools widget controller.
*
* All properties are declared here (undefined / empty-array defaults); they are
* populated by the standard widget lifecycle invoked by the area_maintenance
* shell: init → build → render.
*
* @property {string}        id            - Unique instance identifier, set by
*                                           widget_common.prototype.init.
* @property {string}        section_tipo  - Ontology tipo of the owning section.
* @property {string}        section_id    - Record id within the owning section.
* @property {string}        lang          - Active UI language code (e.g. 'lg-eng').
* @property {string}        mode          - Render mode: 'edit' or 'list'.
* @property {Object}        value         - Widget value payload from the server.
*                                           See module doc-block for shape details.
* @property {HTMLElement}   node          - Root DOM node after render.
* @property {Array}         events_tokens - Event subscription tokens collected
*                                           during the lifecycle; released by destroy().
* @property {Array}         ar_instances  - Child widget/component instances
*                                           (reserved for sub-widgets, currently unused).
* @property {string}        status        - Lifecycle state string (e.g. 'building').
*/
export const register_tools = function() {

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
}//end register_tools



/**
* COMMON FUNCTIONS
* Prototype assignments that wire standard lifecycle and render methods into
* register_tools, avoiding code duplication.
*
* Lifecycle (from widget_common):
*   init     — resolves instance identity from options; sets id, section_tipo, lang, mode.
*   build    — overridden below with a custom implementation that defers data loading
*              to the area_maintenance open-event flow.
*   render   — selects and calls the correct render-mode method (edit or list).
*   destroy  — unsubscribes all event tokens and removes the DOM node.
*
* Value retrieval (from area_maintenance):
*   get_value — fires a worker request to dd_area_maintenance_api::get_widget_value,
*               which dispatches to class.register_tools.php::get_value.  Returns
*               { datalist, errors } — see module doc-block for the full shape.
*
* Render modes (from render_register_tools):
*   edit / list — both delegate to render_register_tools.prototype.list, which builds
*                 the header row, tool datalist, error banner, and the action form
*                 wired to the 'register_tools' backend action.
*/
// prototypes assign
	// // lifecycle
	register_tools.prototype.init		= widget_common.prototype.init
	register_tools.prototype.build		= widget_common.prototype.build
	register_tools.prototype.render		= widget_common.prototype.render
	register_tools.prototype.refresh	= widget_common.prototype.refresh
	register_tools.prototype.destroy	= widget_common.prototype.destroy
	register_tools.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	register_tools.prototype.edit		= render_register_tools.prototype.list
	register_tools.prototype.list		= render_register_tools.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param {boolean} autoload - Whether to auto-load widget data on build. Defaults to false
*                             because data is loaded on-open by area_maintenance.
* @returns {boolean} Result from widget_common.prototype.build
*/
register_tools.prototype.build = async function(autoload=false) {

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
}//end build



// @license-end
