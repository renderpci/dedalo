// import
	import {common} from '../../common/js/common.js'
	import {render_paginator} from './render_paginator.js'



/**
* PAGINATOR
*/
export const paginator = function() {

	return true
}//end paginator



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	paginator.prototype.edit 	= render_paginator.prototype.edit
	paginator.prototype.list 	= render_paginator.prototype.edit // same as edit
	paginator.prototype.render 	= common.prototype.render
	paginator.prototype.refresh = common.prototype.refresh


/**
* INIT
* @return bool true
*/
paginator.prototype.init = async function(options) {

	const self = this

	// set vars
		self.model 				= 'paginator'
		self.instance_caller	= options.caller
		self.mode 				= options.caller.mode
		self.events_tokens		= []
		//self.parent_node 		= null
		self.node 				= []

		self.id = 'paginator_' + options.caller.id

	// events subscription
		// render. launched when instance render finish
			//self.events_tokens.push(
			//	event_manager.subscribe('render_'+self.instance_caller.id , async (instance_wrapper) => {
			//		const wrapper		= (instance_wrapper instanceof Promise) ? await instance_wrapper : instance_wrapper
			//		// fix
			//		self.parent_node	= wrapper.querySelector('.paginator')
			//		// render
			//		const current_paginator = await self.render()
			//		// dom add
			//		self.parent_node.appendChild(current_paginator)
			//
			//	})
			//)//end events push


	return true
}//end init



/**
* BUILD
* @return bool true
*/
paginator.prototype.build = async function(){

	const self = this

	// Nothing to do now

	return true
}//end build



/**
* DESTROY
*/
paginator.prototype.destroy = async function(){

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
paginator.prototype.get_page_number = function(item_per_page, offset) {

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
paginator.prototype.get_page_row_end = function(page_row_begin, item_per_page, total_records) {

	let page_row_end = page_row_begin + item_per_page -1;
	if (page_row_end > total_records) {
		page_row_end = total_records;
	}


	return page_row_end;
}//end get_page_row_end



/**
* SEARCH_PAGINATED
* @return promise
*	bool true
*/
paginator.prototype.search_paginated = async function(offset) {

	const self = this

	if (self.instance_caller.status!=='rendered') {
		return false
	}

	// Update value offset
		self.instance_caller.pagination.offset = offset

	// loading css add
			self.instance_caller.node[0].classList.add("loading")

	// refresh caller instance
		self.instance_caller.refresh()
		.then(()=>{
			// loading css remove
				self.instance_caller.node[0].classList.remove("loading")
		})

	// content data update
		await self.render({
			render_level : 'content'
		})


	return true
}//end search_paginated



/**
* GO_TO_PAGE_JSON
* @return bool true
*/
paginator.prototype.go_to_page_json = function(input_obj, e, total_pages, item_per_page) {

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


