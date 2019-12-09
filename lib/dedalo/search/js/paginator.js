/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_paginator} from './render_paginator.js'



/**
* PAGINATOR
*/
export const paginator = function() {

	this.id

	this.model
	this.mode
	this.events_tokens
	this.node
	this.offset
	this.limit
	this.total

	this.status

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
paginator.prototype.init = function(options) {

	const self = this

	if (!options.caller) {
		console.error("Paginator options caller not found:", options);
	}

	// set vars
		self.model 				= 'paginator'
		self.caller				= options.caller
		self.mode 				= options.caller.mode
		self.events_tokens		= []
		self.node 				= []

	// build vars
		self.total 	= self.caller.pagination.total
		self.offset = self.caller.pagination.offset || 0
		self.limit 	= self.caller.pagination.limit  || 10


	// serialize the paginator.Create the unique token
		self.id = 'paginator_'+self.caller.id

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

	// status update
		self.status = 'initied'

	return true
}//end init



/**
* BUILD
* @return bool true
*/
paginator.prototype.build = async function(){

	const self = this

	const total		= await self.total
	const offset	= self.offset || 0
	const limit		= self.limit || 10

	self.total_pages = Math.ceil(total / limit)

	if(SHOW_DEBUG===true) {
		//console.log("===== paginator self.total_pages, total, limit:", self.total_pages, total, limit);
	}

	self.page_number 		= self.get_page_number(limit, offset)
	self.prev_page_offset 	= offset - limit
	self.next_page_offset 	= offset + limit

	self.page_row_begin 	= (total===0) ? 0 : offset + 1;
	self.page_row_end 		= self.get_page_row_end(self.page_row_begin, limit, total);

	self.offset_first 	= 0;
	self.offset_prev 	= (offset>limit) ? offset - limit : 0
	self.offset_next 	= offset + limit
	self.offset_last 	= limit * (self.total_pages -1)


	// status update
		self.status = 'builded'

	if(SHOW_DEBUG===true) {
		console.log("===== paginator self:",self);
	}


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

	if(SHOW_DEBUG===true) {
		//console.log("page_row_begin:",page_row_begin);
		//console.log("item_per_page:",item_per_page);
		//console.log("total_records:",total_records);
	}

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

	//set the new offset to the current paginator
	self.offset = offset

	event_manager.publish('paginator_goto_'+self.id, offset)

	//if (self.instance_caller.status!=='rendered') {
	//	return false
	//}

	/*

		// Update value offset
				self.instance_caller.pagination.offset = offset

		// loading css add
				self.instance_caller.node[0].classList.add("loading")
				const pepe = self.instance_caller

		//console.log("-----------self:",JSON.parse(JSON.stringify(pepe)))
		// refresh caller instance
			self.instance_caller.refresh()
			.then(()=>{
				// loading css remove
					self.instance_caller.node[0].classList.remove("loading")
			})
		*/

	// content data update
		await self.render({
			render_level : 'content'
		})


	return true
}//end search_paginated



/**
* GO_TO_PAGE_JSON
* Receive page value from input text and calculate offset and exec search_paginated
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


