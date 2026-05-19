// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {when_in_dom} from '../../../core/common/js/events.js'



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
* Renders the tool body content including:
* - User info header with TLD and section ID or tipo
* - Total records indicator
* - Components container
* - Process button with API integration
* - Messages container for API responses
*
* Handles two caller types:
* - Component: Extracts TLD from section_tipo, uses component's section_id
* - Section: Finds hierarchy data (hierarchy6|ontology7) in datum to get TLD and section_id
*
* @param {object} self - Tool instance
* @param {object} self.caller - Component or section that opened the tool
* @returns {HTMLElement} content_data - The built content container
* @throws {Error} When self or self.caller is invalid
*/
const get_content_data = async function(self) {

	// Input validation
	if (!self || !self.caller) {
		throw new Error('Invalid self parameter: missing caller property');
	}

	// Create content_data (moved up for closure access)
	const content_data = ui.tool.build_content_data(self);

	const fragment = new DocumentFragment()

	// Create user_info header
	const tool_label = self.get_tool_label('export_to_jer_dd') || 'Export to jer_dd';
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'user_info',
		inner_html		: `${tool_label}: `,
		parent			: fragment
	})

	/**
	* Extract TLD and section_id from caller based on type
	* For components: TLD is derived from section_tipo (removing trailing digits)
	* For sections: TLD comes from hierarchy6 or ontology7 data in datum
	*/
	try {

		let tld, section_id

		const caller = self.caller

		// Caller could be a section or a component
		if (caller.type === 'component') {
			// Component caller case (Tool buttons)
			// Extract TLD by removing trailing digits: dmm0 => dmm
			tld = caller.section_tipo.replace(/\d+$/, '')
			section_id = caller.section_id
		} else {
			// Section caller case (Inspector button)
			const data = caller.datum?.data || []
			const hierarchy_data = data.find(el =>
				el.tipo === 'hierarchy6' || el.tipo === 'ontology7'
			)

			if (!hierarchy_data || !hierarchy_data.entries || !hierarchy_data.entries[0] || !hierarchy_data.entries[0].value) {
				throw new Error('No valid hierarchy data found');
			}

			tld = hierarchy_data.entries[0].value
			section_id = caller.data?.entries?.[0]?.section_id
		}

		// Calculate display info based on caller mode
		// In edit mode: show TLD + section_id (e.g., "dmm123")
		// In other modes: show the caller's tipo
		const info = caller.mode === 'edit'
			? `${tld}${section_id || ''}`
			: caller.tipo

		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'user_info term_id',
			text_content	: info,
			parent			: fragment
		})

		// Calculate total records to process
		// Edit mode: always 1 record (single item being edited)
		// Other modes: use caller.total or default to 0
		const total = caller.mode === 'edit'
			? 1
			: (caller.total || 0)

		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'user_info total',
			inner_html		: `${get_label.total}: ${total}`,
			parent			: fragment
		})

	} catch (error) {
		console.error('Error processing hierarchy data:', error);
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'user_info',
			text_content	: 'Invalid source (hierarchy6|ontology7)',
			parent			: fragment
		})
	}

	// components container
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'components_container',
		parent			: fragment
	})

	// buttons container
	const buttons_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'buttons_container',
		parent			: fragment
	})

	// Create messages container (moved up for closure access)
	const messages_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'messages_container',
		parent			: fragment
	})

	// button_generate
	const button_generate = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'warning gear button_generate',
		inner_html		: self.get_tool_label('process') || 'Process',
		parent			: buttons_container
	})
	/**
	* CLICK_HANDLER
	* Handles the process button click event.
	* Manages UI state (spinner, loading class), calls the API method,
	* and displays success/error messages in the messages container.
	*
	* @param {Event} e - Click event
	* @returns {Promise<void>}
	*/
	const click_handler = async (e) => {
		e.stopPropagation()

		// Generating control to avoid duplicate calls
		if (button_generate.generating) {
			return
		}
		button_generate.generating = true

		let spinner = null

		try {
			// Reset UI state
			// Messages clean
			[messages_container].map(el => el.classList.remove('error'))
			// Loading
			content_data.classList.add('loading')
			messages_container.innerHTML = ''

			// Add spinner
			spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner',
				parent			: content_data.parentNode
			})

			// Call API to process records in dd_ontology
			const api_response = await self.set_records_in_dd_ontology()

			// User messages
			const msg = api_response.msg
				? (Array.isArray(api_response.msg) ? api_response.msg.join('<br>') : api_response.msg)
				: 'Unknown error'
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg',
				inner_html		: msg,
				parent			: messages_container
			})

			// Handle API errors
			if (api_response.errors && Array.isArray(api_response.errors) && api_response.errors.length > 0) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: api_response.errors.join('<br>'),
					parent			: messages_container
				})
			}

			// Add error class on result false
			if (api_response.result === false) {
				messages_container.classList.add('error')
			} else {
				// Handle success case
			}

		} catch (error) {
			console.error('Error in click_handler:', error)
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error',
				inner_html		: 'Error: ' + (error.message || 'Unknown error'),
				parent			: messages_container
			})
			messages_container.classList.add('error')
		} finally {
			// Clean up UI state
			content_data.classList.remove('loading')
			if (spinner && spinner.parentNode) {
				spinner.remove()
			}
			button_generate.generating = false
		}
	}
	button_generate.addEventListener('click', click_handler)

	// focus buttons
	when_in_dom(button_generate, () => {
		// Force button to keep focused
		function keep_focus(target) {
		  target.focus({ preventScroll: true });
		  target.addEventListener('blur', () => {
		    // Re-focus if something else tries to steal it
		    setTimeout(() => target.focus({ preventScroll: true }), 1);
		  });
		}
		keep_focus(button_generate);
	})

	// Assemble final content
	content_data.appendChild(fragment);


	return content_data
}//end get_content_data



// @license-end
