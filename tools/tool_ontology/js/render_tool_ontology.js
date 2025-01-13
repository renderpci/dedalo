// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {dd_request_idle_callback} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_ONTOLOGY
* Manages the component's logic and appearance in client side
*/
export const render_tool_ontology = function() {

	return true
}//end render_tool_ontology



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_ontology.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// user_info
		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'user_info',
			inner_html		: (self.get_tool_label('export_to_jer_dd') || 'Export to jer_dd') + ': ',
			parent			: fragment
		})
		try {
			const tld			= self.caller.datum.data.find(el => el.tipo==='ontology7').value[0]
			const section_id	= self.caller.data.value[0].section_id
			const info			=  `${tld}${section_id}`
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'user_info term_id',
				inner_html		: info,
				parent			: fragment
			})
		} catch (error) {
			console.error(error)
			ui.create_dom_element({
				element_type	: 'h2',
				class_name		: 'user_info',
				inner_html		: 'Invalid source',
				parent			: fragment
			})
		}

	// components container
		ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		});

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// button_generate
		const button_generate = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning gear',
			inner_html		: self.get_tool_label('process') || 'Process',
			parent			: buttons_container
		})
		// click event
		const click_handler = async (e) => {
			e.stopPropagation();

			// messages clean
				[
					messages_container
				]
				.map(el => el.classList.remove('error'))

			// loading
				content_data.classList.add('loading')
				messages_container.innerHTML = ''
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: content_data.parentNode
				})

			// call API
				const api_response = await self.set_records_in_jer_dd()

			// user messages
				const msg = api_response.msg
					? (Array.isArray(api_response.msg) ? api_response.msg.join('<br>') : api_response.msg)
					: 'Unknown error'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg',
					inner_html		: msg,
					parent			: messages_container
				})

			// errors
				if (api_response.errors && api_response.errors.length) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'error',
						inner_html		: api_response.errors.join('<br>'),
						parent			: messages_container
					})
				}

			// add error class on result false
				if (api_response.result==false) {
					messages_container.classList.add('error')
				}

			content_data.classList.remove('loading')
			spinner.remove()
		}
		button_generate.addEventListener('click', click_handler)
		// focus buttons
		dd_request_idle_callback(
			() => {
				button_generate.focus()
			}
		)

	// messages_container
		const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



// @license-end
