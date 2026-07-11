// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_DATAFRAME_CONTROL
* Client-side render module for the dataframe_control maintenance widget.
*
* This widget surfaces the dataframe pairing integrity scanner to administrators.
* It renders two actions in the maintenance area:
*   - "Check"  → calls server action `run_check` (read-only scan via
*                 dataframe_v7_migration::integrity_check) and displays the report.
*   - "Remove orphans" → calls `run_fix` (destructive: removes orphan frame
*                 locators; frame TARGET records are never deleted so Time Machine
*                 history is preserved).
*
* Architecture note: this file follows the standard Dédalo widget render split.
* `render_dataframe_control.prototype.list` is aliased to both `.edit` and `.list`
* on the `dataframe_control` prototype (see dataframe_control.js), so this single
* method handles every render-mode the maintenance area requests.
*
* Server response shape (api_response.result):
* {
*   scanned          : number,   // section records visited
*   frames_checked   : number,   // individual frame locators evaluated
*   orphans          : number,   // locators whose main data item is missing
*   orphan_items     : string[], // human-readable locator strings (capped server-side)
*   legacy_unmigrated: number,   // pre-migration frames still in v6 format
*   orphans_fixed    : number    // locators removed (only > 0 after run_fix)
* }
*
* @module render_dataframe_control
*/
export const render_dataframe_control = function() {

	return true
}//end render_dataframe_control



/**
* LIST
* Builds and returns the full widget DOM tree for the dataframe_control widget.
* Aliased as both `.edit` and `.list` on the `dataframe_control` prototype so it
* handles all render modes that area_maintenance may request.
*
* When `options.render_level === 'content'`, returns only the inner content_data
* node (used by area_maintenance for partial DOM updates without re-wrapping).
* Otherwise, wraps the content inside the standard widget wrapper produced by
* `ui.widget.build_wrapper_edit` and attaches a `content_data` pointer to it for
* later access by the refresh path.
*
* @param {Object} options - render options passed by area_maintenance
* @param {string} [options.render_level='full'] - 'full' to return the wrapped
*   widget node; 'content' to return only the inner content_data node
* @returns {Promise<HTMLElement>} wrapper node (render_level==='full') or
*   content_data node (render_level==='content')
*/
render_dataframe_control.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA
* Builds the inner content node for the dataframe_control widget.
*
* Renders three elements inside a container div:
*   1. A summary div, initially populated with the cached report stored in
*      `self.value` (the result of get_value on the server, which runs a
*      read-only integrity check at widget-load time).
*   2. A "Check" button that triggers a fresh read-only scan (`run_check`).
*   3. A "Remove orphans" button that triggers the destructive fix (`run_fix`)
*      after a browser confirm() guard. This button removes orphan frame locators
*      but never deletes the frame target records themselves (TM safety rule).
*
* Both action buttons toggle a CSS `loading` class on content_data while the
* server request is in flight (integrity scans can take many seconds on large
* databases — the server timeout is set to 1 hour in run_action).
*
* @param {Object} self - the dataframe_control widget instance (provides
*   `self.value` with the pre-loaded integrity report and `self.run_action`)
* @returns {HTMLElement} content_data div containing summary + action buttons
*/
const get_content_data = function(self) {

	// short vars. self.value comes from dataframe_control::get_value (run_check report)
		const report = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// summary
		const summary = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'summary',
			parent			: content_data
		})
		render_report(summary, report)

	// button check
		const button_check = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			text_content	: get_label.check || 'Check',
			parent			: content_data
		})
		button_check.addEventListener('click', async function(e) {
			e.stopPropagation()
			content_data.classList.add('loading')
			const api_response = await self.run_action({action: 'run_check'})
			content_data.classList.remove('loading')
			render_report(summary, api_response?.result || {}, api_response?.msg)
		})

	// button fix (removes orphan frame locators; frame target records are never deleted)
		const button_fix = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning',
			text_content	: get_label.delete ? (get_label.delete + ' orphans') : 'Remove orphans',
			parent			: content_data
		})
		button_fix.addEventListener('click', async function(e) {
			e.stopPropagation()
			// double user confirmation: this writes data
			if (!confirm(get_label.sure || 'Sure?')) {
				return
			}
			content_data.classList.add('loading')
			const api_response = await self.run_action({action: 'run_fix'})
			content_data.classList.remove('loading')
			render_report(summary, api_response?.result || {}, api_response?.msg)
		})


	return content_data
}//end get_content_data



/**
* RENDER_REPORT
* Clears and re-renders the summary container with the values from the latest
* integrity scan report.
*
* Called both on initial render (with the cached self.value report) and after
* every button click (with the fresh api_response.result). Passing `msg` prepends
* it as the first line — the server sends a human-readable outcome string
* (e.g. "OK. Integrity scan done. Orphans found: 3").
*
* Renders two sections:
*   1. A fixed set of metric lines (scanned, frames_checked, orphans, legacy,
*      orphans_fixed). Missing values display as '-'.
*   2. An optional <pre class="orphan_items"> block listing orphan locator strings
*      when the report contains any (the server caps this list to avoid huge payloads).
*
* (!) All user-facing text is set via `textContent`, never `innerHTML`, to prevent
* XSS from database-sourced locator strings appearing in the orphan_items list.
*
* @param {HTMLElement} container - the summary div to clear and repopulate
* @param {Object} report - integrity scan result object from api_response.result
*   (see module doc for full shape; any property may be missing — nullish coalesce
*   to '-' is applied throughout)
* @param {string|null} [msg=null] - optional human-readable outcome message from
*   api_response.msg; prepended as the first line when present
* @returns {void}
*/
const render_report = function(container, report, msg=null) {

	// reset
	while (container.firstChild) {
		container.removeChild(container.firstChild)
	}

	// SEC-XSS: report values may contain DB text; textContent avoids HTML parsing
	const lines = [
		'Records scanned: '				+ (report.scanned ?? '-'),
		'Frames checked: '				+ (report.frames_checked ?? '-'),
		'Orphan frames: '				+ (report.orphans ?? '-'),
		'Legacy (pre-migration): '		+ (report.legacy_unmigrated ?? '-'),
		'Orphans removed: '				+ (report.orphans_fixed ?? '-')
	]
	if (msg) {
		lines.unshift(msg)
	}
	for (const line of lines) {
		const node = ui.create_dom_element({
			element_type	: 'div',
			parent			: container
		})
		node.textContent = line
	}

	// orphan detail list (capped server-side)
	const orphan_items = report.orphan_items || []
	if (orphan_items.length > 0) {
		const detail = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'orphan_items',
			parent			: container
		})
		detail.textContent = orphan_items.join('\n')
	}
}//end render_report



// @license-end
