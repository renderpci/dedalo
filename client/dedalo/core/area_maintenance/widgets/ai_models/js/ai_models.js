// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* AI_MODELS (module)
* Area-maintenance widget over the install's LOCAL AI model store: which speech
* models are on this server's disk, and whether each one is actually usable.
*
* Why it exists
* -------------
* In-browser transcription only runs if the model is in THIS install's store.
* A download killed mid-file reported itself installed and then failed inside
* the browser's ONNX runtime minutes later, leaving the administrator with a
* console line in someone else's browser as the only diagnostic.
*
* DISPLAY-ONLY, deliberately
* --------------------------
* Download / verify / repair are admin-gated actions of tool_transcription's own
* server module. This widget reports the truth and names where the remedy is
* performed; it registers NO action of its own, so nothing new is reachable from
* the wire. Hence no api-request prototype methods here — only the lifecycle.
*
* Data flow
* ---------
*   init() → build() → load() [widget_common, on accordion open]
*     → get_value() [area_maintenance] → dd_area_maintenance_api::get_widget_value
*     → {store_path, store_available, hub_allowed,
*        models:[{name,label,state,bytes}], usable_count, total_bytes}
*
* Prototype chain
* ---------------
*   ai_models ← widget_common (lifecycle: init, build, render, load, refresh, destroy)
*             ← area_maintenance (get_value)
*             ← render_ai_models (edit / list views)
*
* Server peer: src/core/area_maintenance/widgets/ai_models.ts
* Wire ledger: engineering/wire_contract/WC-2026-08-13-maintenance-ai-models-widget.md
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_ai_models} from './render_ai_models.js'



/**
* AI_MODELS
* Constructor for the AI model store widget instance.
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
export const ai_models = function() {

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
}//end ai_models



/**
* COMMON FUNCTIONS
* Prototype assignments delegate the whole lifecycle to its canonical
* implementations. No custom logic lives here — a read-only status panel needs
* nothing that widget_common and area_maintenance do not already provide:
*
*   init      — resolves the widget configuration and base instance state.
*   build     — shell construction (no data fetch; load() owns that).
*   render    — dispatches to this.edit() or this.list() per this.mode.
*   load      — one-shot value fetch on accordion open, then repaints the body.
*   refresh   — tears down per-render state and re-runs build() + render().
*   destroy   — unsubscribes event tokens and optionally removes the DOM node.
*   get_value — fires the worker request to dd_area_maintenance_api::get_widget_value.
*   edit/list — both delegate to render_ai_models.prototype.list, the only view
*               this widget needs.
*/
// prototypes assign
	// lifecycle
	ai_models.prototype.init		= widget_common.prototype.init
	ai_models.prototype.build		= widget_common.prototype.build
	ai_models.prototype.render		= widget_common.prototype.render
	ai_models.prototype.refresh		= widget_common.prototype.refresh
	ai_models.prototype.destroy		= widget_common.prototype.destroy
	ai_models.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	ai_models.prototype.edit		= render_ai_models.prototype.list
	ai_models.prototype.list		= render_ai_models.prototype.list



// @license-end
