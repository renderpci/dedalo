// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_ERROR_REPORT
* Client-side render module for tool_error_report.
*
* Layout (top to bottom):
*  1. intro note — what will be sent and where (the disclosure/consent line:
*     the report goes to the master installation on explicit send only);
*  2. context summary — section locator, page path, captured-errors count,
*     with the captured errors expandable inside a <details> block;
*  3. description <textarea> (required);
*  4. send button + response line.
*
* SECURITY (DS-1): every dynamic string in this UI renders through
* `text_content` / `textContent` — NEVER `inner_html` — so a malicious error
* message captured from the page can not become markup here or anywhere the
* payload is later displayed.
*
* `render_tool_error_report` is a constructor-as-namespace; the single
* prototype method `edit` is mixed into tool_error_report by wire_tool().
*
* @module render_tool_error_report
*/
export const render_tool_error_report = function() {

	return true
}//end render_tool_error_report



/**
* EDIT
* Render tool DOM nodes.
* @param {Object} options
* @param {string} [options.render_level='full']
* @returns {Promise<HTMLElement>}
*/
render_tool_error_report.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Build the report form. All values render via text_content (DS-1).
* @param {Object} self - the tool_error_report instance
* @returns {HTMLElement} content_data node
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// non-admins never get the form (the server refuses regardless).
		if (page_globals.is_global_admin!==true) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error_report_note',
				text_content	: 'This tool is available to administrators only.',
				parent			: fragment
			})
			const content_data_denied = ui.tool.build_content_data(self)
			content_data_denied.appendChild(fragment)
			return content_data_denied
		}

	// collected context (same collector the submit uses — what you see is
	// what is sent).
		const collected = self.collect_report_data()

	// 1. intro / disclosure
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_report_intro',
			text_content	: 'Describe the problem. The page context and the captured JavaScript errors shown below will be attached and sent to the Dédalo master installation when you press send.',
			parent			: fragment
		})

	// 2. context summary
		const summary_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_report_summary',
			parent			: fragment
		})
		const summary_rows = [
			['Section', collected.section_tipo
				? collected.section_tipo + (collected.section_id ? ' / ' + collected.section_id : '')
				: '(none)'],
			['Page', collected.page_url || '(unknown)'],
			['User id', collected.client_globals.user_id!==null ? String(collected.client_globals.user_id) : '(unknown)'],
			['Captured JS errors', String(collected.js_errors.length)]
		]
		for (const [row_label, row_value] of summary_rows) {
			const row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error_report_summary_row',
				parent			: summary_container
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'error_report_summary_label',
				text_content	: row_label + ': ',
				parent			: row
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'error_report_summary_value',
				text_content	: row_value,
				parent			: row
			})
		}

	// 2b. captured errors, expandable. <pre> + textContent only (DS-1).
		if (collected.js_errors.length > 0) {
			const details = ui.create_dom_element({
				element_type	: 'details',
				class_name		: 'error_report_errors',
				parent			: fragment
			})
			ui.create_dom_element({
				element_type	: 'summary',
				text_content	: 'Captured JavaScript errors (' + collected.js_errors.length + ')',
				parent			: details
			})
			for (const item of collected.js_errors) {
				const line = [
					'[' + (item.type || 'error') + ']' + (item.count > 1 ? ' ×' + item.count : ''),
					item.msg || '(no message)',
					item.source ? item.source + (item.line!==null ? ':' + item.line : '') : null,
					item.stack
				].filter(el => el!==null).join('\n')
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'error_report_error_item',
					text_content	: line,
					parent			: details
				})
			}
		}

	// 3. description
		const description_label = get_label.description || 'Description'
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'error_report_description_label',
			text_content	: description_label,
			parent			: fragment
		})
		const description_input = ui.create_dom_element({
			element_type	: 'textarea',
			class_name		: 'error_report_description',
			parent			: fragment
		})
		description_input.setAttribute('maxlength', '8000')
		description_input.setAttribute('rows', '6')
		description_input.setAttribute('placeholder', 'What were you doing, and what went wrong?')

	// 4. send + response line
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_report_footer',
			parent			: fragment
		})
		const send_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'error_report_send light',
			text_content	: get_label.send || 'Send report',
			parent			: footer
		})
		const response_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_report_response',
			parent			: footer
		})

		send_button.addEventListener('click', async function() {
			const description = description_input.value.trim()
			if (description.length===0) {
				response_node.classList.add('error')
				response_node.textContent = 'Please describe the problem before sending.'
				return
			}
			send_button.disabled			= true
			response_node.classList.remove('error','success')
			response_node.textContent		= 'Sending…'
			try {
				const response = await self.send_report(description)
				if (response && response.result && response.result!==false) {
					response_node.classList.add('success')
					response_node.textContent = response.msg || 'Report sent.'
					description_input.value = ''
				} else {
					response_node.classList.add('error')
					response_node.textContent = (response && response.msg) || 'The report could not be sent.'
					send_button.disabled = false
				}
			} catch (error) {
				console.error(error)
				response_node.classList.add('error')
				response_node.textContent	= 'The report could not be sent.'
				send_button.disabled		= false
			}
		})

	// content_data wrapper
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



// @license-end
