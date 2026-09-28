// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* SERVE_ONTOLOGY (module)
* Area-maintenance widget for the PROVIDER side of the ontology exchange: can
* other installations pull their ontology from THIS one?
*
* Split out of update_ontology (2026-09-28), which is the CONSUMER side (pull a
* snapshot, overwrite the local ontology). DISPLAY-ONLY: the answer lives in three
* ../private/.env keys, so the panel reports them and the endpoint clients
* register; it registers NO action of its own.
*
* Data flow
* ---------
*   init() → build() → load() [widget_common, on accordion open]
*     → get_value() [area_maintenance] → get_widget_value
*     → {enabled, has_server_code, cors_enabled, url}
*
* Server peer: src/core/area_maintenance/widgets/serve_ontology.ts
* Wire ledger: engineering/wire_contract/WC-2026-09-28-maintenance-serve-ontology-widget.md
*/



// imports
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_serve_ontology} from './render_serve_ontology.js'



/**
* SERVE_ONTOLOGY
* Constructor for the serve-ontology widget instance.
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
export const serve_ontology = function() {

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
}//end serve_ontology



/**
* COMMON FUNCTIONS
* The whole lifecycle is widget_common's + area_maintenance's get_value; a
* read-only status panel needs nothing else. edit/list both render the one view.
*/
// prototypes assign
	// lifecycle
	serve_ontology.prototype.init		= widget_common.prototype.init
	serve_ontology.prototype.build		= widget_common.prototype.build
	serve_ontology.prototype.render		= widget_common.prototype.render
	serve_ontology.prototype.refresh		= widget_common.prototype.refresh
	serve_ontology.prototype.destroy		= widget_common.prototype.destroy
	serve_ontology.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	serve_ontology.prototype.edit		= render_serve_ontology.prototype.list
	serve_ontology.prototype.list		= render_serve_ontology.prototype.list



// @license-end
