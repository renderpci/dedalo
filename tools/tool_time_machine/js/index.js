// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_TIME_MACHINE / INDEX
* Public barrel entry-point for the tool_time_machine ES module.
*
* Re-exports the entire public surface of tool_time_machine.js so that
* callers can import from this single path (tools/tool_time_machine/js/index.js)
* without coupling themselves to the internal file layout.
*
* Main export: {tool_time_machine} — the constructor function whose prototype
* provides the full TM lifecycle (init → build → render → apply_value /
* bulk_revert_process). The tool opens against the virtual section dd15
* (matrix_time_machine table) and lets the user browse historical snapshots
* of a component's data, preview a past version in read-only TM mode, and
* restore it by calling apply_value back to dd_tools_api.
*
* @module tool_time_machine/index
*/
export * from './tool_time_machine.js'


// @license-end