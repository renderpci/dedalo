// import
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_PAGINATOR
* Manages the component's logic and apperance in client side
*/
export const render_paginator = function() {

	return true
}//end render_paginator



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_paginator.prototype.edit = async function(options={
	render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'full_width css_wrap_rows_paginator text_unselectable',
		})

	// add paginator_content
		wrapper.appendChild(current_content_data)

	// events
		add_wrapper_events(wrapper, self)


	return wrapper
}//end edit



/**
* ADD_WRAPPER_EVENTS
* Attach element generic events to wrapper
*/
const add_wrapper_events = (wrapper, self) => {

	// mousedown
		wrapper.addEventListener("mousedown", function(e){
			e.stopPropagation()
			//e.preventDefault()
			// prevent buble event to container element
			return false
		})


	return true
}//end add_wrapper_events



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	// build vars
		const offset 			= self.instance_caller.pagination.offset || 0
		const limit 			= self.instance_caller.pagination.limit  || 10
		const total 			= await self.instance_caller.pagination.total

		const total_pages  		= Math.ceil(total / limit)

		const page_number 		= self.get_page_number(limit, offset)
		const prev_page_offset 	= offset - limit
		const next_page_offset 	= offset + limit

		const page_row_begin 	= (total===0) ? 0 : offset + 1;
		const page_row_end 		= self.get_page_row_end(page_row_begin, limit, total);

		const offset_first 	= 0;
		const offset_prev 	= (offset>limit) ? offset - limit : 0
		const offset_next 	= offset + limit
		const offset_last 	= limit * (total_pages -1)

		if (total<=limit) {
			const wrap_rows_paginator = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content_data hide'
			})
			return wrap_rows_paginator
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data css_rows_paginator_content'
		})

	// paginator_div_links. create the paginator_div_links
		const paginator_div_links = ui.create_dom_element({
			element_type	: 'div',
			parent			: content_data,
			class_name		: 'css_rows_paginator_div_links',
		})

		// first . create the paginator_first
			const paginator_first = ui.create_dom_element({
				element_type	: 'div',
				parent			: paginator_div_links,
				class_name		: 'icon_bs paginator_first_icon link',
			})
			if(page_number>1) {

				paginator_first.addEventListener("click",function(){
					self.search_paginated(offset_first)
				},false)
			}else{
				paginator_first.classList.add("unactive")
			}

		// previous . create the paginator_prev
			const paginator_prev = ui.create_dom_element({
				element_type	: 'div',
				parent			: paginator_div_links,
				class_name		: 'icon_bs paginator_prev_icon link',
			})
			if(prev_page_offset>=0) {

				paginator_prev.addEventListener("click",function(){
					self.search_paginated(offset_prev)
				},false)
			}else{
				paginator_prev.classList.add("unactive")
			}

		// next . create the paginator_next
			const paginator_next = ui.create_dom_element({
				element_type	: 'div',
				parent			: paginator_div_links,
				class_name		: 'icon_bs paginator_next_icon',
			})
			if(next_page_offset<total) {
				paginator_next.addEventListener("click",function(){
					self.search_paginated(offset_next)
				},false)
			}else{
				paginator_next.classList.add("unactive")
			}

		// last . create the paginator_last
			const paginator_last = ui.create_dom_element({
				element_type	: 'div',
				parent			: paginator_div_links,
				class_name		: 'icon_bs paginator_last_icon',
			})
			if(page_number<total_pages) {
				paginator_last.addEventListener("click",function(){
					self.search_paginated(offset_last)
				},false)
			}else{
				paginator_last.classList.add("unactive")
			}

	// paginator_info. create the paginator_info
		let text = ""
			text += get_label["pagina"] || "Page"
			text += " " + page_number + " "
			text += get_label["de"] || "of"
			text += " " + total_pages
		//if (modo==="edit") {
		//	text += '. ' + get_label['go_to_record']  + ' '
		//}else{
			text += '. Displayed records from ' + page_row_begin + ' to ' + page_row_end + ' of ' + total
			text += '. ' + get_label["go_to_page"] + ' '
		//}
		const paginator_info = ui.create_dom_element({
			element_type	: 'div',
			text_content 	: text,
			class_name		: 'css_rows_paginator_info',
			parent			: content_data,
		})

	// input_go_to_page
		const input_go_to_page = ui.create_dom_element({
			id				: 'go_to_page',
			element_type	: 'input',
			class_name		: '',
			parent			: paginator_info
		})
		input_go_to_page.placeholder = page_number
		// add the Even onchage to the select, whe it change the section selected will be loaded
		input_go_to_page.addEventListener('keyup',function(event){
			self.go_to_page_json(this, event, total_pages, limit)
		},false)


	return content_data
}//end content_data


