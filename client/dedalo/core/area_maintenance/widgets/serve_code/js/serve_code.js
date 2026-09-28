// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* SERVE_CODE (module)
* Area-maintenance widget for the PROVIDER side of the code exchange: this
* installation as a CODE SERVER — build releases from git, serve them.
*
* Split out of update_code (2026-09-28), which is the CONSUMER side. Served only
* on a code server or the development entity (registry.ts).
*
* Data flow
* ---------
*   init() → build() → load() [widget_common]
*     → get_value() [area_maintenance] → get_widget_value
*     → {is_a_code_server, code_server}
*   build buttons → caller.init_form → widget_request
*     serve_code.build_version_from_git_master
*
* Server peer: src/core/area_maintenance/widgets/serve_code.ts
* Wire ledger: engineering/wire_contract/WC-2026-09-28-maintenance-serve-code-widget.md
*/



// imports
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_serve_code} from './render_serve_code.js'



/**
* SERVE_CODE
* Constructor for the serve-code widget instance.
*
* Instance properties
* -------------------
* @property {string}        id             - Widget identifier; set during init().
* @property {string}        section_tipo   - Ontology tipo of the parent section.
* @property {string|number} section_id     - Parent section record id.
* @property {string}        lang           - Active UI language code.
* @property {string}        mode           - Display mode: 'list' | 'edit'.
* @property {Object}        value          - Loaded widget value; shape mirrors the
*                                            server panel (see module header).
* @property {HTMLElement}   node           - Root DOM node rendered by the view.
* @property {Array}         events_tokens  - Subscribed event tokens; cleared by destroy().
* @property {Array}         ar_instances   - Child widget or component instances.
* @property {*}             status         - Lifecycle status string set by widget_common.
*/
export const serve_code = function() {

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
}//end serve_code



/**
* COMMON FUNCTIONS
* The whole lifecycle is widget_common's + area_maintenance's get_value; a
* read-only status panel needs nothing else. edit/list both render the one view.
*/
// prototypes assign
	// lifecycle
	serve_code.prototype.init		= widget_common.prototype.init
	serve_code.prototype.build		= widget_common.prototype.build
	serve_code.prototype.render		= widget_common.prototype.render
	serve_code.prototype.refresh		= widget_common.prototype.refresh
	serve_code.prototype.destroy		= widget_common.prototype.destroy
	serve_code.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	serve_code.prototype.edit		= render_serve_code.prototype.list
	serve_code.prototype.list		= render_serve_code.prototype.list



// @license-end
