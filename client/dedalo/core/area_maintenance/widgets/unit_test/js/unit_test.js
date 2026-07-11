// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_unit_test} from './render_unit_test.js'



/**
* UNIT_TEST
* Widget constructor for the area_maintenance unit-test panel.
*
* Provides a maintenance UI that lets developers:
*   - Browse the registered list of JS client-side unit tests (imported
*     dynamically from test/client/js/list.js).
*   - Open the interactive JS test runner in a new browser tab.
*   - Create a fresh empty test database record (truncates the test table
*     and inserts one blank row via the dd_area_maintenance_api action
*     'create_test_record').
*   - Run a long-running server-side process streamed over Server-Sent
*     Events and monitor its live progress via update_process_status.
*
* Lifecycle: init → build → render → [destroy]
* Status transitions: 'initializing' → 'initialized' → 'building' → 'built'
*
* Both `edit` and `list` render modes delegate to
* render_unit_test.prototype.list, so this widget always renders the
* same panel regardless of the active mode.
*
* Server peer: core/area_maintenance/widgets/unit_test/class.unit_test.php
* Render peer: render_unit_test (render_unit_test.js in this directory)
*
* @property {string|null}    id             - Unique widget instance identifier
* @property {string|null}    section_tipo   - Ontology tipo of the host section
* @property {string|number|null} section_id - Record id of the host section
* @property {string|null}    lang           - Active language code (e.g. 'lg-spa')
* @property {string}         mode           - Render mode: 'edit' or 'list'
* @property {Object}         value          - Server-resolved widget data payload
* @property {HTMLElement|null} node         - Root DOM node for this widget
* @property {Array}          events_tokens  - Subscribed event tokens, drained by destroy()
* @property {Array}          ar_instances   - Child widget/component instances owned by this widget
* @property {string|null}    status         - Current lifecycle status
*/
export const unit_test = function() {

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
}//end unit_test



/**
* COMMON FUNCTIONS
* Extend unit_test with lifecycle and render methods from shared prototypes.
*
* Lifecycle methods are delegated to widget_common, which in turn delegates
* most of them to common (the root prototype shared by all Dédalo UI elements):
*
*   init()    — Seeds instance properties from an options bag and transitions
*               status to 'initialized'. Provided by widget_common.prototype.init.
*   build()   — Fetches server-side widget data (value) via dd_component_info
*               'get_widget_data' when the caller is component_info with
*               autoload:true. Provided by widget_common.prototype.build.
*   render()  — Dispatches to this.edit() or this.list() based on this.mode.
*               Provided by widget_common.prototype.render.
*   destroy() — Drains this.events_tokens, removes the DOM node, and marks
*               status 'destroyed'. Provided by widget_common.prototype.destroy.
*
* Render methods are delegated directly to render_unit_test:
*   edit()    — Aliased to render_unit_test.prototype.list (same UI in both
*               modes — this widget has no distinct edit layout).
*   list()    — Builds the full unit-test panel: long-process runner,
*               "Open JS unit test" button, test list pre-element, and the
*               init-form for creating a new empty test record.
*
* (!) Both edit and list point to the same render_unit_test.prototype.list
* function. Callers that rely on `mode` to distinguish a read-only view from
* an editable one will get the same panel in both cases — this is intentional
* for a maintenance-only widget that always requires interaction.
*/
// prototypes assign
	// // lifecycle
	unit_test.prototype.init	= widget_common.prototype.init
	unit_test.prototype.build	= widget_common.prototype.build
	unit_test.prototype.render	= widget_common.prototype.render
	unit_test.prototype.destroy	= widget_common.prototype.destroy
	// // render
	unit_test.prototype.edit	= render_unit_test.prototype.list
	unit_test.prototype.list	= render_unit_test.prototype.list



// @license-end
