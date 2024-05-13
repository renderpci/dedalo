// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_PAGINATOR
* Manages the component's logic and appearance in client side
*/
export const render_paginator = function() {

	return true
}//end render_paginator



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_paginator.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// refresh case. Only content data is returned
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			// await self.get_total()
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_paginator paginator edit full_width css_wrap_rows_paginator text_unselectable'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data

		if(SHOW_DEBUG===true) {
			wrapper.addEventListener('click', function(e) {
				if (e.altKey) {
					e.stopPropagation()
					e.preventDefault()
					console.log('/// selected instance:', self);
					return
				}
			})
		}


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// debug
		if(SHOW_DEBUG===true) {
			// const model = self.id.split("_")[1] +" "+ self.id.split("_")[2]
			// console.log(`++++++++++++++++++++++ total_pages: ${total_pages}, page_number: ${page_number}, offset_first: ${offset_first}, model: ${self.caller.model} `);
		}

	// active_values. Storage functions to be called when the total count is available
	// This allows scaffolding to be rendered before getting the result from the DB.
		const active_values = []

	// DOM fragment
		const fragment = new DocumentFragment()

	// nav_buttons
		const paginator_div_links = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'nav_buttons',
			parent			: fragment
		})

		// btn paginator_first
			const paginator_first = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_first_icon inactive',
				parent			: paginator_div_links
			})
			// active_value
			const update_offset_first = (value) => {
				if(self.page_number>1) {
					paginator_first.classList.remove('inactive')
					paginator_first.addEventListener('mousedown', function(e) {
						e.stopPropagation()
						self.paginate(value)
					})
				}else{
					paginator_first.classList.add('inactive')
				}
			}
			active_values.push({
				name		: 'offset_first',
				callback	: update_offset_first
			})

		// btn paginator_prev
			const paginator_prev = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_prev_icon inactive',
				parent			: paginator_div_links
			})
			// active_value
			const update_offset_prev = (value) => {
				if(self.prev_page_offset>=0) {
					paginator_prev.classList.remove('inactive')
					paginator_prev.addEventListener('mousedown', function(e) {
						e.stopPropagation()
						self.paginate(value)
					})
				}else{
					paginator_prev.classList.add('inactive')
				}
			}
			active_values.push({
				name		: 'offset_prev',
				callback	: update_offset_prev
			})

		// btn paginator_next
			const paginator_next = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_next_icon inactive',
				parent			: paginator_div_links
			})
			// active_value
			const update_offset_next = (value) => {
				if(self.next_page_offset<self.total) {
					paginator_next.classList.remove('inactive')
					paginator_next.addEventListener('mousedown', function(e) {
						e.stopPropagation()
						self.paginate(value)
					})
				}else{
					paginator_next.classList.add('inactive')
				}
			}
			active_values.push({
				name		: 'offset_next',
				callback	: update_offset_next
			})

		// btn paginator_last
			const paginator_last = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_last_icon inactive',
				parent			: paginator_div_links
			})
			// active_value
			const update_offset_last = (value) => {
				if(self.page_number<self.total_pages) {
					paginator_last.classList.remove('inactive')
					paginator_last.addEventListener('mousedown', function(e) {
						e.stopPropagation()
						self.paginate(value)
					})
				}else{
					paginator_last.classList.add('inactive')
				}
			}
			active_values.push({
				name		: 'offset_last',
				callback	: update_offset_last
			})

	// paginator_info
		const paginator_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_info',
			parent			: fragment
		})

		// page_info
			const page_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'page_info inactive',
				inner_html		: (get_label.page || 'Page'),
				parent			: paginator_info
			})

			// input_go_to_page
				const input_go_to_page = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					class_name		: 'input_go_to_page',
					title			: get_label.go_to_page,
					// placeholder	: 1,
					parent			: paginator_info
				})
				// NOTE: this event could open/close filter because page has a global keyup listener
				// see page.js add_events to prevent double fire
				input_go_to_page.addEventListener('keyup', function(e) {
					e.stopPropagation();
					e.preventDefault()
					if (e.key==='Enter' && input_go_to_page.value.length>0) {
						const page		= parseInt(input_go_to_page.value)
						const result	= self.go_to_page_json(page) // returns bool
						if (result===false) {
							input_go_to_page.classList.add('invalid')
						}else{
							if (input_go_to_page.classList.contains('invalid')) {
								input_go_to_page.classList.remove('invalid')
							}
						}
					}
				})
				input_go_to_page.addEventListener('blur', function(){
					if (input_go_to_page.classList.contains('invalid')) {
						input_go_to_page.classList.remove('invalid')
					}
					input_go_to_page.value = null
					fit_input_go_to_page_to_value(input_go_to_page, self.page_number)
				})
				input_go_to_page.addEventListener('input', function(e) {
					e.preventDefault()
					if (e.key!=='Enter' ) {
						fit_input_go_to_page_to_value(input_go_to_page, this.value)
					}
				})
				// active_value
				const update_page_number = (value) => {
					input_go_to_page.placeholder = value
					fit_input_go_to_page_to_value(input_go_to_page, value)
				}
				active_values.push({
					name		: 'page_number',
					callback	: update_page_number
				})

			// page_info label
			const locale = 'es-ES' // (page_globals.locale ?? 'es-CL').replace('_', '-')
			const total_pages_node	= ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'page_info inactive',
				inner_html		: ` Loading data ...  `,
				parent			: paginator_info
			})
			// active_value
			const update_total_pages = (value) => {
				const total_pages_label	= new Intl.NumberFormat(locale, {}).format(value);
				total_pages_node.innerHTML = (get_label.of || 'of') + ` ${total_pages_label}`
				total_pages_node.classList.remove('inactive')
			}
			active_values.push({
				name		: 'total_pages',
				callback	: update_total_pages
			})

		// displayed_records (hidden on edit mode) // page_globals.locale
			const displayed_records_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'displayed_records',
				// inner_html	: displayed_records_label,
				parent			: paginator_info
			})
			// active_value
			const update_total = (value) => {
				const total_label = new Intl.NumberFormat(locale, {}).format(value);
				// displayed_records_label . Using legacy format label from v5 in PHP
				const displayed_records_label = get_label.registros_mostrados
					? (() => {
						// ref: Registros mostrados de X a Y de Z.
						const map = {
							X	: new Intl.NumberFormat(locale, {}).format(self.page_row_begin),
							Y	: new Intl.NumberFormat(locale, {}).format(self.page_row_end),
							Z	: total_label
						};
						return get_label.registros_mostrados.replace(/X|Y|Z/g, (matched)=> {
							return map[matched];
						})
				      })()
				     : `Showing ${page_row_begin}-${page_row_end} of ${total_label}`
				displayed_records_node.innerHTML = displayed_records_label
			}
			active_values.push({
				name		: 'total',
				callback	: update_total
			})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data paginator css_rows_paginator_content'
		})
		content_data.appendChild(fragment)

	// total. get from DDBB
		self.get_total()
		.then(() => {
			// fire all active_values functions
			const active_values_length = active_values.length
			for (let i = 0; i < active_values_length; i++) {
				const item = active_values[i]
				// value is from self assigned vars like 'self.total'
				const value = self[item.name]
				// execute function passing selected value as param
				item.callback(value)
			}
			page_node.classList.remove('inactive')
		})


	return content_data
}//end get_content_data



/**
* FIT_INPUT_GO_TO_PAGE_TO_VALUE
* Set input element style width based on number length of chars
* @param DOM node input_node
* @param int page_number
* @return void
*/
const fit_input_go_to_page_to_value = function(input_node, page_number) {

	const chars = page_number
		? page_number.toString().length
		: ''

	input_node.style.width = (chars + 3) + 'ch';
}//end fit_input_go_to_page_to_value



// @license-end
