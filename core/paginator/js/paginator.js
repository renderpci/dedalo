/* global get_label, Promise, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_paginator} from './render_paginator.js'
	import {render_paginator_mini} from './render_paginator_mini.js'
	import {render_paginator_micro} from './render_paginator_micro.js'


/**
* PAGINATOR
*/
export const paginator = function() {

	this.id					= null

	this.model				= null
	this.mode				= null
	this.events_tokens		= null
	this.node				= null

	this.caller				= null

	this.total_pages		= null
	this.page_number		= null
	this.prev_page_offset	= null
	this.next_page_offset	= null

	this.page_row_begin		= null
	this.page_row_end		= null

	this.offset_first		= null
	this.offset_prev		= null
	this.offset_next		= null
	this.offset_last		= null

	this.status				= null

	this.id_variant			= null

	return true
}//end paginator



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	paginator.prototype.edit			= render_paginator.prototype.edit
	paginator.prototype.tm				= render_paginator.prototype.edit
	paginator.prototype.edit_in_list	= render_paginator.prototype.edit
	paginator.prototype.list			= render_paginator.prototype.edit // same as edit
	paginator.prototype.mini			= render_paginator_mini.prototype.mini
	paginator.prototype.micro			= render_paginator_micro.prototype.micro
	paginator.prototype.render			= common.prototype.render
	paginator.prototype.refresh			= common.prototype.refresh



/**
* INIT
* @param object options
* @return bool true
*/
paginator.prototype.init = function(options) {

	const self = this

	if (!options.caller) {
		console.error("Paginator options caller not found:", options);
	}

	// set vars
		self.model			= 'paginator'
		self.mode			= options.mode || options.caller.mode
		self.caller			= options.caller
		self.events_tokens	= []
		self.node			= []

	// serialize the paginator.Create the unique token
		self.id = 'paginator_'+self.caller.id

	// status update
		self.status = 'initied'


	return true
}//end init



/**
* BUILD
* @return promise
* 	resolve bool true
*/
paginator.prototype.build = async function(){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// short vars
		const total		= await self.get_total();
		const limit		= self.caller.rqo.sqo.limit // self.get_limit()
		const offset	= self.get_offset()

	// pages fix vars
		self.limit				= limit
		self.total_pages		= limit>0 ? Math.ceil(total / limit) : 0
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


	// debug
		if(SHOW_DEBUG===true) {
			// console.log("paginator [build] self:",self);
			// console.log("paginator total:",total);
			const time = performance.now()-t0
			if (time>2) {
				console.log("__Time to build [paginator.build]:", self.model, self.caller.model, self.caller.tipo, time);
			}
		}

	// status update
		self.status = 'builded'


	// event publish
		event_manager.publish('builded_'+self.id)


	return true
}//end build



/**
* DESTROY
* @return promise
* 	resolve object result
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
}//end destroy



/**
* GET_TOTAL
* Exec a API call to count the current sqo records
* @return promise
* 	resolve int total
*/
paginator.loading_total_status = null
paginator.prototype.get_total = async function() {

	const self = this

	// queue. Prevent double resolution calls to API
		if (paginator.loading_total_status==='resolving') {
			return new Promise(function(resolve){
				setTimeout(function(){
					resolve( self.get_total() )
				}, 100)
			})
		}

	paginator.loading_total_status = 'resolving'

	// const total = (Boolean(this.caller.total && typeof this.caller.total.then==="function"))
	const total = (this.caller.total && typeof this.caller.total==="function")
		? await this.caller.total()
		: this.caller.total

	paginator.loading_total_status = 'resolved'

	// console.warn(`++++++++++++++++++++++++++++++++ RESOLVED ${self.caller.tipo} total:`,total);
	return total
}//end get_total



/**
* GET_LIMIT
* @return int limit
*/
paginator.prototype.get_limit = function() {

	const limit = this.caller.rqo.sqo.limit

	return limit
}//end get_limit



/**
* GET_OFFSET
* @return int offset
*/
paginator.prototype.get_offset = function() {

	const offset = this.caller.rqo.sqo.offset

	return offset
}//end get_offset



/**
* PAGINATE
* Update self offset and publish a public event 'paginator_goto_' that is listened by section/portal to load another record data
* @param int offset
* @return promise
*	bool (true on successful, false on error)
*/
paginator.prototype.paginate = async function(offset) {

	const self = this

	// avoid overlap section calls if not ready
		if (self.caller.model !== 'time_machine' && self.caller.status!=='rendered') {
			console.warn(`/// [paginator.paginate] Ignored (1) paginate offset (element is not ready status: ${self.caller.status}) :`, offset);
			return false
		}

	// avoid overlap section calls if not ready
		if (self.status!=='rendered') {
			console.warn(`/// [paginator.paginate] Ignored (2) paginate offset (element is not ready status: ${self.status}) :`, offset);
			return false
		}

	// preserve caller wrapper height to prevent blink
		// if(self.caller.node){
		// 	self.caller.node[0].style.minHeight = self.caller.node[0].offsetHeight + 'px'
		// }

	// set the new offset to the current paginator
		// self.offset = offset

	// publish event (section is listen this event to refresh)
		event_manager.publish('paginator_goto_'+self.id, offset)

		// self.status = 'rendered'
	// paginator content data update
		self.refresh()


	return true
}//end paginate




/**
* GET_PAGE_NUMBER
* @return int page_number
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
* @return int page_row_end
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
* GO_TO_PAGE_JSON
* Receive page value from input text and calculate offset and exec search_paginated
* @param int page_number
* @return bool
*/
paginator.prototype.go_to_page_json = function(page) {

	const self = this

	// short vars
		const total_pages	= self.total_pages
		const item_per_page	= self.limit
		const current_page	= self.page_number

	// check valid page
		if (page==current_page || page<1 || page>total_pages) {
			console.log("[go_to_page_json] Invalid page:", page);
			return false
		}

	// new offset
		const new_offset = ((page -1) * item_per_page)
			//console.log("new_offset:",new_offset);

	// search with new offset
		self.paginate(new_offset)


	return true
}//end go_to_page_json



/**
* NAVIGATE_TO_NEXT_PAGE
* Navigates current list forward
* @return bool
*/
paginator.prototype.navigate_to_next_page = function() {

	const self = this

	// short vars
		const current_page	= self.page_number
		const page			= current_page + 1

	return self.go_to_page_json(page)
}//end navigate_to_next_page



/**
* NAVIGATE_TO_PREVIOUS_PAGE
* Navigates current list backwards
* @return bool
*/
paginator.prototype.navigate_to_previous_page = function() {

	const self = this

	// short vars
		const current_page	= self.page_number
		const page			= current_page - 1

	return self.go_to_page_json(page)
}//end navigate_to_previous_page
