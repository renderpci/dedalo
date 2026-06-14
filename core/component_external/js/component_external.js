// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_EXTERNAL
* Dédalo client-side component for fields that display data fetched on-demand
* from a remote external API (e.g. ZENON library catalog, museum databases).
*
* Unlike standard Dédalo components, component_external does not own its data
* locally. The server-side class (class.component_external.php) resolves the
* configured `api_config` from the section ontology, issues the remote HTTP
* request, applies the `fields_map` / `response_map` transformation, and returns
* the result as a plain entries array. The client simply renders whatever
* value arrives in `this.data.entries` — it never writes new data back to the
* remote API.
*
* Rendering is fully delegated to per-mode sub-modules:
*   - `render_list_component_external`   → list / tm (read-only list and time-machine)
*   - `render_edit_component_external`   → edit / line / mini / print
*   - `render_search_component_external` → search (free-text SQO filter)
*
* The component inherits the full Dédalo lifecycle (init → build → render →
* save → destroy) from `component_common` and `common` without overriding any
* step, since no component-specific behaviour is required beyond what the
* shared prototypes provide.
*
* Data shape (`this.data`):
*   `{ entries: [string, …] }` — one or more resolved string values from the
*   remote record (formatted server-side according to `fields_map.format`).
*
* Search data shape (`this.data`):
*   `{ q_operator: string|null, entries: [string|null] }` — SQO filter values
*   maintained by `render_search_component_external`.
*
* @see component_common          Shared lifecycle, save, change_value, build_rqo.
* @see common                    Generic render, refresh, destroy, build_rqo.
* @see render_list_component_external   List / TM view dispatch.
* @see render_edit_component_external   Edit-mode view dispatch.
* @see render_search_component_external Search-mode view and SQO wiring.
* @see class.component_external.php     Server-side API fetch, fields_map, caching.
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_list_component_external} from '../../component_external/js/render_list_component_external.js'
	import {render_edit_component_external} from '../../component_external/js/render_edit_component_external.js'
	import {render_search_component_external} from '../../component_external/js/render_search_component_external.js'



/**
* COMPONENT_EXTERNAL
* Constructor. Declares all instance properties used throughout the lifecycle.
* All fields are initialised to null (or a sensible default); `component_common.init()`
* populates them from the options object passed at mount time.
*
* Property notes:
* - `id`            – unique DOM/instance identifier assigned by the instance registry.
* - `model`         – ontology model name, always `'component_external'`.
* - `tipo`          – ontology tipo key of this component instance (e.g. `'dd123'`).
* - `section_tipo`  – ontology tipo of the containing section (e.g. `'dd456'`).
* - `section_id`    – record identifier within the section (integer).
* - `mode`          – current render mode: `'edit'`, `'list'`, `'search'`, `'tm'`.
* - `lang`          – active UI language code (e.g. `'lg-eng'`).
* - `section_lang`  – language in which the parent section is rendered.
* - `context`       – server-provided context object containing properties, tools,
*                     permissions, label, etc. for this component.
* - `data`          – server-provided data object; shape is `{ entries: string[] }`
*                     in list/edit mode, or the SQO filter state in search mode.
* - `parent`        – tipo of the containing section/group instance.
* - `node`          – reference to the root DOM element once rendered.
* - `tools`         – array of tool descriptors when the component exposes toolbar
*                     actions (e.g. history, copy). Null when no tools are configured.
* - `duplicates`    – flag indicating whether duplicate values are permitted; always
*                     false for this component because uniqueness is not enforced
*                     client-side (external data is read-only and server-authoritative).
*/
export const component_external = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	this.duplicates		= false
}//end component_external



/**
* COMMON FUNCTIONS
* Extend component_external with shared prototype methods from component_common
* and common. No own implementations are needed for this component — all lifecycle
* and data-change logic is handled by the inherited prototypes without modification.
*
* The `tm` (Time Machine) render mode intentionally reuses the standard list
* renderer because external data is read-only and does not require a separate
* historical-diff view.
*/
// prototypes assign
	// lifecycle
	component_external.prototype.init				= component_common.prototype.init
	component_external.prototype.build				= component_common.prototype.build
	component_external.prototype.render				= common.prototype.render
	component_external.prototype.refresh			= common.prototype.refresh
	component_external.prototype.destroy			= common.prototype.destroy

	// change data
	component_external.prototype.save				= component_common.prototype.save
	component_external.prototype.update_data_value	= component_common.prototype.update_data_value
	component_external.prototype.update_datum		= component_common.prototype.update_datum
	component_external.prototype.change_value		= component_common.prototype.change_value
	component_external.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_external.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_external.prototype.list				= render_list_component_external.prototype.list
	component_external.prototype.tm					= render_list_component_external.prototype.list
	component_external.prototype.edit				= render_edit_component_external.prototype.edit
	component_external.prototype.search				= render_search_component_external.prototype.search


// @license-end
