// import
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* PAGINATOR
*/
export const paginator = function() {



	/**
	* INIT
	* @return bool true
	*/
	this.init = async function(options) {

		const self = this

		self.instance_caller	= options.caller
		self.events_tokens		= []
		self.parent_node 		= null

		// events subscription
			// render. launched when instance render finish
			/*
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.instance_caller.id , async (instance_wrapper) => {
					const wrapper		= (instance_wrapper instanceof Promise) ? await instance_wrapper : instance_wrapper
					// fix
					self.parent_node	= wrapper.querySelector('.paginator')
					// render
					const current_paginator = await self.render()
					// dom add
					self.parent_node.appendChild(current_paginator)

				})
			)//end events push
			*/

		return true
	}//end init



	/**
	* BUILD
	* @return dom element paginator_wrapper
	*/
	this.build = async function(){

		const self = this

		// Nothing to do now

		//const paginator_wrapper = await self.render()

		//return paginator_wrapper
	}//end build



	/**
	* RENDER
	* Generate dom nodes of all paginato html
	* @return dom lement wrap_rows_paginator
	*/
	this.render = async function() {

		const self = this

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

		// debug
			if(SHOW_DEBUG===true) {
				//console.log("page_number:",page_number,"prev_page_offset",prev_page_offset,"next_page_offset",next_page_offset);
				//console.log("page_row_begin:",page_row_begin,"page_row_end",page_row_end);
				//console.log("offset:",offset,"limit",limit,"total",total,"total_pages",total_pages);
				//console.log("offset_first:",offset_first,"offset_prev",offset_prev,"offset_next",offset_next,"offset_last",offset_last);
			}

		// wrap_rows_paginator
			const wrap_rows_paginator = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'full_width css_wrap_rows_paginator text_unselectable',
			})

			// paginator_content. create the paginator_content
				const paginator_content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'css_rows_paginator_content',
					parent 			: wrap_rows_paginator
				})

			// paginator_div_links. create the paginator_div_links
				const paginator_div_links = ui.create_dom_element({
					element_type	: 'div',
					parent			: paginator_content,
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
				//console.log("text:",text, page_globals.modo);
				const paginator_info = ui.create_dom_element({
					element_type	: 'div',
					text_content 	: text,
					class_name		: 'css_rows_paginator_info',
					parent			: paginator_content,
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

			//wrapper.insertBefore(wrap_rows_paginator, wrapper.firstChild);


		return wrap_rows_paginator
	}//end render



	/**
	* DESTROY
	*/
	this.destroy = async function(){
		const self = this
		// get the events that the instance was created
			const events_tokens = self.events_tokens

		// delete the registred events
			const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

		return true
	}//end destroy



	/**
	* GET_PAGE_NUMBER
	* @return int
	*/
	this.get_page_number = function(item_per_page, offset) {

		if (offset>0) {
			const page_number = Math.ceil(offset/item_per_page)+1 ;
			return page_number;
		}

		return 1;
	}//end get_page_number



	/**
	* GET_PAGE_ROW_END
	* @return int
	*/
	this.get_page_row_end = function(page_row_begin, item_per_page, total_records) {

		let page_row_end = page_row_begin + item_per_page -1;
		if (page_row_end > total_records) {
			page_row_end = total_records;
		}

		return page_row_end;
	}//end get_page_row_end



	/**
	* SEARCH_PAGINATED
	* @return
	*/
	this.search_paginated = async function(offset) {

		const self = this

		if (self.instance_caller.status!=='rendered') {
			return false
		}

		// Update value offset
			self.instance_caller.pagination.offset = offset

		// render
			self.instance_caller.refresh()

		//return js_promise
	}//end search_paginated



	/**
	* GO_TO_PAGE_JSON
	* @return bool true
	*/
	this.go_to_page_json = function(input_obj, e, total_pages, item_per_page) {

		const self = this

		if (e.keyCode===13) {
			e.preventDefault()
			e.stopPropagation();

			const page = parseInt(input_obj.value)
				//console.log("page:",page);

			total_pages   = parseInt(total_pages)
			item_per_page = parseInt(item_per_page)

			if (page<1 || page>total_pages) {
				console.log("Invalid page:",page);
				return false
			}

			// new offset
				const new_offset = ((page -1) * item_per_page)
					//console.log("new_offset:",new_offset);

			self.search_paginated(new_offset)

			return true
		}

		return false
	}//end go_to_page_json



}// end paginator
