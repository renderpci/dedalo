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
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	await self.get_total()

	// short vars
		const total				= self.caller.total
		// const limit			= self.get_limit()
		// const offset			= self.get_offset()
		const total_pages		= self.total_pages
		const page_number		= self.page_number
		const prev_page_offset	= self.prev_page_offset
		const next_page_offset	= self.next_page_offset
		const page_row_begin	= self.page_row_begin
		const page_row_end		= self.page_row_end
		const offset_first		= self.offset_first
		const offset_prev		= self.offset_prev
		const offset_next		= self.offset_next
		const offset_last		= self.offset_last

	// debug
		if(SHOW_DEBUG===true) {
			// const model = self.id.split("_")[1] +" "+ self.id.split("_")[2]
			// console.log(`++++++++++++++++++++++ total_pages: ${total_pages}, page_number: ${page_number}, offset_first: ${offset_first}, model: ${self.caller.model} `);
		}

	// display none with empty case, or when pages are <2
		// if (!total_pages || total_pages<2) {
		// 	const wrap_rows_paginator = ui.create_dom_element({
		// 		element_type	: 'div',
		// 		class_name		: 'content_data paginator display_none ' +total_pages
		// 	})
		// 	return wrap_rows_paginator
		// }

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
				class_name		: 'btn paginator_first_icon',
				parent			: paginator_div_links
			})
			if(page_number>1) {
				paginator_first.addEventListener('mousedown',function(e) {
					e.stopPropagation()
					e.preventDefault()
					self.paginate(offset_first)
				})
			}else{
				paginator_first.classList.add('inactive')
			}

		// btn paginator_prev
			const paginator_prev = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_prev_icon',
				parent			: paginator_div_links
			})
			if(prev_page_offset>=0) {
				paginator_prev.addEventListener('mousedown',function(e) {
					e.stopPropagation()
					e.preventDefault()
					self.paginate(offset_prev)
				})
			}else{
				paginator_prev.classList.add('inactive')
			}

		// btn paginator_next
			const paginator_next = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_next_icon',
				parent			: paginator_div_links
			})
			if(next_page_offset<total) {
				paginator_next.addEventListener('mousedown',function(e) {
					e.stopPropagation()
					e.preventDefault()
					self.paginate(offset_next)
				})
			}else{
				paginator_next.classList.add('inactive')
			}

		// btn paginator_last
			const paginator_last = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'btn paginator_last_icon',
				parent			: paginator_div_links
			})
			if(page_number<total_pages) {
				paginator_last.addEventListener('mousedown',function(e) {
					e.stopPropagation()
					e.preventDefault()
					self.paginate(offset_last)
				})
			}else{
				paginator_last.classList.add('inactive')
			}

	// paginator_info
		const paginator_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_info',
			parent			: fragment
		})

		// const page_info = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'page_info',
		// 	inner_html		: (get_label.page || 'Page') + ` ${page_number} ` + (get_label.of || 'of') + ` ${total_pages} `,
		// 	parent			: paginator_info
		// })

		// page_info
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'page_info',
				inner_html		: (get_label.page || 'Page'),
				parent			: paginator_info
			})

			// input_go_to_page
				const input_go_to_page = ui.create_dom_element({
					element_type	: 'input',
					type			: 'number',
					class_name		: 'input_go_to_page',
					title			: get_label.go_to_page,
					placeholder		: page_number,
					parent			: paginator_info
				})
				// NOTE: this event could open/close filter because page has a global keyup listener
				// see page.js add_events to prevent double fire
				input_go_to_page.addEventListener('keyup', function(e) {
					event.stopPropagation();
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
					fit_input_go_to_page_to_value(input_go_to_page, page_number)
				})
				input_go_to_page.addEventListener('input', function(e) {
					e.preventDefault()
					if (e.key!=='Enter' ) {
						fit_input_go_to_page_to_value(input_go_to_page, this.value)
					}
				})
				fit_input_go_to_page_to_value(input_go_to_page, page_number)

			// page_info label
			const total_pages_label = new Intl.NumberFormat(
				page_globals.locale==='es-ES'
					? 'es-CL' // updated minimumGroupingDigits to 1 ('es' is wrong: 2)
					: page_globals.locale
			).format(total_pages);
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'page_info',
				inner_html		: (get_label.of || 'of') + ` ${total_pages_label}`,
				parent			: paginator_info
			})

		// displayed_records (hidden on edit mode) // page_globals.locale
			const total_label = new Intl.NumberFormat(
				page_globals.locale==='es-ES'
					? 'es-CL' // updated minimumGroupingDigits to 1 ('es' is wrong: 2)
					: page_globals.locale
			).format(total);
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'displayed_records',
				inner_html		: `Showing ${page_row_begin}-${page_row_end} of ${total_label}`,
				parent			: paginator_info
			})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data paginator css_rows_paginator_content'
		})
		content_data.appendChild(fragment)


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