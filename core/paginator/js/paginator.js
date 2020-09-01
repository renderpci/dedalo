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

	this.caller

	this.total_pages
	this.page_number
	this.prev_page_offset
	this.next_page_offset

	this.page_row_begin
	this.page_row_end

	this.offset_first
	this.offset_prev
	this.offset_next
	this.offset_last

	this.status

	this.id_variant

	return true
};//end paginator



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	paginator.prototype.edit	= render_paginator.prototype.edit
	paginator.prototype.list	= render_paginator.prototype.edit // same as edit
	paginator.prototype.tm		= render_paginator.prototype.edit // same as edit
	paginator.prototype.render	= common.prototype.render
	paginator.prototype.refresh	= common.prototype.refresh



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
		self.model			= 'paginator'
		self.mode			= options.caller.mode
		self.caller			= options.caller
		self.events_tokens	= []
		self.node			= []

	// serialize the paginator.Create the unique token
		self.id = 'paginator_'+self.caller.id

	// status update
		self.status = 'initied'


	return true
};//end init



/**
* BUILD
* @return bool true
*/
paginator.prototype.build = async function(){

	const self = this

	const total		= await self.get_total()
	const limit		= self.get_limit()
	const offset	= self.get_offset()

	// pages fix vars
		self.limit				= limit
		self.total_pages		= Math.ceil(total / limit)
		self.page_number		= self.get_page_number(limit, offset)
		self.prev_page_offset	= offset - limit
		self.next_page_offset	= offset + limit

		self.page_row_begin		= (total===0) ? 0 : offset + 1;
		self.page_row_end		= self.get_page_row_end(self.page_row_begin, limit, total);

	// offset fix
		self.offset_first		= 0;
		self.offset_prev		= (offset>limit) ? offset - limit : 0
		self.offset_next		= offset + limit
		self.offset_last		= limit * (self.total_pages -1)


	// status update
		self.status = 'builded'



			if(SHOW_DEBUG===true)
			{
		// console.log("paginator [build] self:",self);
		// console.log("paginator total:",total);
	}


	return true
};//end build



/**
* DESTROY
*/
paginator.prototype.destroy = async function(){

	const self = this

	const result = {}

	// get the events that the instance was created
		const events_tokens = self.events_tokens

	// delete the registred events
		const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

	result.delete_self = delete_events

	return result
};//end destroy



/**
* GET_TOTAL
*/
paginator.prototype.get_total = async function() {

	const total = await this.caller.pagination.total

	return total
};//end get_total



/**
* GET_LIMIT
*/
paginator.prototype.get_limit = function() {

	const limit = this.caller.pagination.limit

	return limit
};//end get_limit



/**
* GET_OFFSET
*/
paginator.prototype.get_offset = function() {

	const offset = this.caller.pagination.offset

	return offset
};//end get_offset



/**
* PAGINATE
* @return promise
*	bool true on successfull, false on error
* Upadate self offset and publish a public event 'paginator_goto_' that is listened by section/portal to load another record data
*/
paginator.prototype.paginate = async function(offset) {

	const self = this

	// avoid overlap section calls if not ready
		if (self.caller.status!=='rendered') {
			console.warn(`/// [paginator.paginate] Ignored paginate offset (element is not ready status: ${self.caller.status}) :`, offset);
			return false
		}

	// set the new offset to the current paginator
		// self.offset = offset

	// publish event (section is listen this event to refresh)
		event_manager.publish('paginator_goto_'+self.id, offset)

	// paginator content data update
		const build  = await self.build()
		const render = await self.render({render_level : 'content'})


	return true
};//end paginate




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
};//end get_page_number



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
};//end get_page_row_end



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
};//end go_to_page_json
