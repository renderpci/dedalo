// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_sequences_status} from './render_sequences_status.js'



/**
* SEQUENCES_STATUS
* Widget controller for the "DB Sequences Status" panel in the maintenance area.
*
* Purpose:
*   Displays a diagnostic report of every PostgreSQL sequence in the Dédalo
*   database so an administrator can confirm that all sequences are in sync with
*   their corresponding tables' maximum id values.  A sequence can drift below
*   the real maximum id after a bulk import that bypassed the sequence (e.g. a
*   pg_restore with explicit ids) or after a call to `db_tasks::consolidate_table`.
*   When a sequence is behind the real max id the next INSERT on that table will
*   fail with a unique-key violation.
*
* Lifecycle:
*   Follows the standard Dédalo widget lifecycle entirely through inherited
*   widget_common prototypes — no custom overrides are needed:
*     init() → build() → render() → [refresh cycles] → destroy()
*   Both `edit` and `list` modes resolve to `render_sequences_status.prototype.list`,
*   so the widget renders identically regardless of the parent area's display mode.
*
* Data flow:
*   The widget's value payload (stored in `this.value`) is populated by
*   `class.area_maintenance.php` during the initial area build phase.  The server
*   calls `db_tasks::check_sequences()` synchronously and stores its return value
*   directly as `$item->value` before passing the widget descriptor through
*   `widget_factory()`.  No subsequent API calls are made by this widget.
*
*   Payload shape (set by `db_tasks::check_sequences()`):
*     {
*       result : boolean,       // true when all sequences were healthy; false if any needed repair
*       msg    : string,        // HTML-formatted diagnostic output, one line per table
*       values : Array<{        // one entry per audited table
*         table_name  : string, // PostgreSQL table name
*         start_value : number, // sequence start_value (anomalous if !== 1)
*         last_value  : number, // current sequence pointer
*         last_id     : number  // actual maximum id found in the table
*       }>,
*       errors : Array<string>  // present only on connection or security failures
*     }
*
*   The render layer (`render_sequences_status.prototype.list`) reads `this.value.msg`
*   and inserts it into the widget's content area as inner HTML.
*
* No maintenance operations:
*   Unlike `counters_status`, this widget is read-only — it exposes no fix/reset
*   actions.  If `result === false` the administrator must take corrective action
*   via a separate tool (e.g. by running `db_tasks::check_sequences()` again from
*   the server, which auto-repairs drifted sequences when it detects them).
*
* Server peer:  core/area_maintenance/class.area_maintenance.php (widget_factory path)
*               core/db/class.db_tasks.php (check_sequences — produces the value payload)
* Render peer:  core/area_maintenance/widgets/sequences_status/js/render_sequences_status.js
*
* Main exports: `sequences_status` (constructor).
*
* @see widget_common            — shared widget base (init/build/render/refresh/destroy)
* @see render_sequences_status  — DOM construction that consumes this.value
*/
export const sequences_status = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	// value: the full check_sequences() response object set by area_maintenance on init
	// Shape: {result: boolean, msg: string, values: Array, errors?: Array}
	this.value

	// node: the root HTMLElement injected into the area_maintenance widget panel
	this.node

	// events_tokens: stores PubSub subscription handles for cleanup in destroy()
	this.events_tokens	= []
	// ar_instances: child widget/component instances (unused by this widget but required by the base contract)
	this.ar_instances	= []

	// status: lifecycle state string ('initializing' | 'initialized' | 'building' | 'built' | 'destroyed')
	this.status
}//end sequences_status



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the full widget lifecycle by delegating to
* widget_common and render_sequences_status.
*
* No custom overrides are needed because this widget is read-only: it simply
* presents the pre-computed `check_sequences()` report that was embedded in the
* widget descriptor during the area build.  All standard lifecycle phases
* (init, build, render, destroy) are handled by widget_common without alteration.
*
* Render note:
*   Both `edit` and `list` are mapped to `render_sequences_status.prototype.list`.
*   This mirrors the pattern used by other read-only maintenance widgets (e.g.
*   `database_info`) and means no conditional render-mode branching is required.
*/
// prototypes assign
	// // lifecycle
	sequences_status.prototype.init		= widget_common.prototype.init
	sequences_status.prototype.build	= widget_common.prototype.build
	sequences_status.prototype.render	= widget_common.prototype.render
	sequences_status.prototype.destroy	= widget_common.prototype.destroy
	// // render
	sequences_status.prototype.edit		= render_sequences_status.prototype.list
	sequences_status.prototype.list		= render_sequences_status.prototype.list



// @license-end
