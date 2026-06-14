// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_DATAFRAME_CONTROL
* Manages the widget's logic and appearance in client side
*/
export const render_dataframe_control = function() {

	return true
}//end render_dataframe_control



/**
* LIST
* Creates the nodes of current widget.
* @param object options
* @return HTMLElement wrapper
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
* @param object self
* @return HTMLElement content_data
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
			text_content	: get_label.delete + ' orphans' || 'Remove orphans',
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
* @param HTMLElement container
* @param object report
* @param string|null msg
* @return void
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
