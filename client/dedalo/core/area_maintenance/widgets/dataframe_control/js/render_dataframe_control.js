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
*   1. A summary div in the NOT-RUN state. No report is fetched on load
*      (WC-068) — this widget's value is a whole-database scan, so it exists
*      only once an operator asks for it.
*   2. A "Check" button that triggers the read-only scan (`run_check`).
*   3. A "Remove orphans" button that triggers the destructive fix (`run_fix`)
*      after a browser confirm() guard. This button removes orphan frame locators
*      but never deletes the frame target records themselves (TM safety rule).
*
* Both action buttons toggle a CSS `loading` class while the server request is
* in flight (integrity scans can take many minutes on large databases — the
* client timeout is 1 hour in run_action, but the SERVER's per-statement
* timeout may cancel a batch first, which surfaces through render_error).
*
* This builder is fully synchronous: with nothing to await, wrapping it in a
* spinner placeholder would only add a frame.
*
* @param {Object} self - the dataframe_control widget instance (provides
*   `self.run_action`; `self.value` is populated by a scan, not by a load)
* @returns {HTMLElement} content_data div containing summary + action buttons
*/
const get_content_data = function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div',
			class_name	 : 'content_data'
		})

	// (!) NOTHING is fetched here (WC-068). This panel used to run the integrity
	// scan on every area_maintenance page load: it claimed the lazy load
	// synchronously (self._load_state='loading') and then awaited its own
	// get_value() inside a spinner placeholder. That scan walks EVERY matrix%
	// table end to end — minutes of DB work on a scale install, for a cosmetic
	// gain (it avoided a "-" report flashing before a second spinner). The
	// widget now renders a NOT-RUN state and only scans on operator request.

	// summary — the explicit not-run state, NEVER a zeroed report: showing
	// 0 orphans for a scan that never ran would read as "clean".
	// `self.value` is set ONLY by a scan the operator ran (below), so when it
	// is present we repaint that report — a re-render (render_level 'content',
	// or the Alt-click refresh, which rebuilds the shell) must not silently
	// discard a result the operator is still reading.
		const summary = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'summary',
			parent			: content_data
		})
		if (self.value) {
			render_report(summary, self.value)
		} else {
			render_not_run(summary)
		}

	// button check
		const button_check = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			text_content	: get_label.check || 'Check',
			parent			: content_data
		})
		button_check.addEventListener('click', async function(e) {
			e.stopPropagation()
			summary.classList.add('loading')
			// button_spinner: self-contained on-button spinner (never escapes the card)
			button_check.classList.add('button_spinner')
			try {
				render_response(self, summary, await self.run_action({action: 'run_check'}))
			} catch (error) {
				self.error = error
				render_error(summary, error?.message || error)
			} finally {
				summary.classList.remove('loading')
				button_check.classList.remove('button_spinner')
			}
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
			// button_spinner: self-contained on-button spinner (never escapes the card)
			button_fix.classList.add('button_spinner')
			try {
				render_response(self, summary, await self.run_action({action: 'run_fix'}))
			} catch (error) {
				self.error = error
				render_error(summary, error?.message || error)
			} finally {
				content_data.classList.remove('loading')
				button_fix.classList.remove('button_spinner')
			}
		})


	return content_data
}//end get_content_data



/**
* RENDER_RESPONSE
* Paints one run_check / run_fix outcome and caches it on the instance.
*
* (!) A FAILED scan does not throw. The server answers `{result:false, msg, errors}`
* — and on a large database that is the EXPECTED failure: the scan walks every
* matrix% table, and a batch that exceeds the server's per-statement timeout is
* cancelled, which surfaces here as result:false. Treating that as a report
* (`api_response?.result || {}`) would print five dashes and read exactly like a
* completed scan that found nothing — the "clean database we never looked at"
* the not-run state exists to prevent. So a falsy `result` paints as an error and
* `self.value` is left alone.
*
* @param {Object} self - widget instance (receives the cached report in self.value)
* @param {HTMLElement} container - the summary div
* @param {Object|null} api_response - raw envelope from run_action
* @returns {void}
*/
const render_response = function(self, container, api_response) {

	const result = api_response?.result

	// failed / refused scan: never a report
	if (!result || typeof result!=='object') {
		self.error = api_response?.msg || 'the server returned no report'
		render_error(container, self.error)
		return
	}

	self.error = null
	self.value = result
	render_report(container, result, api_response?.msg)
}//end render_response



/**
* RENDER_NOT_RUN
* Paints the summary container's initial state: no scan has been run in this
* page session.
*
* (!) This is deliberately NOT `render_report(container, {})`. That would print
* "Orphan frames: -" alongside four other dashes, which reads like a completed
* scan that found nothing. The panel must never imply a clean database it has
* not looked at.
*
* @param {HTMLElement} container - the summary div to clear and repopulate
* @returns {void}
*/
const render_not_run = function(container) {

	// reset
	while (container.firstChild) {
		container.removeChild(container.firstChild)
	}

	// .dd_note: the kit's muted helper note (widget_kit.less) — not a state chip.
	// A not-run panel is neutral information, not a warning.
	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_note',
		parent			: container
	})
	node.textContent = 'No scan has been run. Press Check to scan for orphan dataframe pairings.'
}//end render_not_run



/**
* RENDER_ERROR
* Paints a failed scan. The scan can legitimately fail on large databases (the
* server statement timeout cancels a batch that runs too long), and a silent
* failure here would leave the previous state on screen as if it were current.
*
* @param {HTMLElement} container - the summary div to clear and repopulate
* @param {string} message - already-unwrapped failure text (server msg or error.message)
* @returns {void}
*/
const render_error = function(container, message) {

	// reset
	while (container.firstChild) {
		container.removeChild(container.firstChild)
	}

	// SEC-XSS: error text may echo DB-sourced strings; textContent avoids HTML parsing
	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_note state_danger',
		parent			: container
	})
	node.textContent = 'Scan failed: ' + message
}//end render_error



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

	// (!) INCOMPLETENESS IS RENDERED FIRST, before any count (WC-069). The server
	// sets complete:false when a table was exempted, truncated by a budget, or
	// lost to a failed batch. "Orphan frames: 0" under a partial scan means "none
	// where we looked", not "none" — so the caveat must reach the eye before the
	// number does, not sit below it as a footnote.
	if (report.complete === false) {
		const warn = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note state_warning',
			parent			: container
		})
		warn.textContent = 'INCOMPLETE SCAN — these counts cover only the tables listed as examined below.'
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

	// what was NOT examined, and why — each line already carries table + reason
	const uncovered = report.uncovered || []
	if (uncovered.length > 0) {
		const detail = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'orphan_items',
			parent			: container
		})
		detail.textContent = 'NOT EXAMINED:\n' + uncovered.join('\n')
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
