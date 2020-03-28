/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'



/**
* COMPONENT_AUTOCOMPLETE
*/
export const component_autocomplete = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang

	this.datum
	this.context
	this.data
	this.parent
	this.node
	this.pagination

	return true
}//end component_autocomplete



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_autocomplete.prototype.init 	 			= component_common.prototype.init
	component_autocomplete.prototype.destroy 			= common.prototype.destroy
	component_autocomplete.prototype.save 	 			= component_common.prototype.save
	component_autocomplete.prototype.refresh 			= common.prototype.refresh
	component_autocomplete.prototype.load_data 			= component_common.prototype.load_data
	component_autocomplete.prototype.load_datum 		= component_common.prototype.load_datum
	component_autocomplete.prototype.get_value 			= component_common.prototype.get_value
	component_autocomplete.prototype.set_value 			= component_common.prototype.set_value
	component_autocomplete.prototype.update_data_value	= component_common.prototype.update_data_value
	component_autocomplete.prototype.update_datum		= component_common.prototype.update_datum
	component_autocomplete.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_autocomplete.prototype.render 			= common.prototype.render
	component_autocomplete.prototype.list 				= render_component_autocomplete.prototype.list
	component_autocomplete.prototype.edit 				= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.edit_in_list		= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.change_mode 		= component_common.prototype.change_mode
	component_autocomplete.prototype.get_ar_instances 	= component_common.prototype.get_ar_instances



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.build  = async function(autoload=false){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// load data if not yet received as an option
		if (autoload===true) {

			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)

			// Update the self.data into the datum and self instance
			self.update_datum(api_response)
		}

	// pagination safe defaults
		self.pagination.total 	= self.pagination.total  || 0
		self.pagination.offset 	= self.pagination.offset || 0
		self.pagination.limit 	= self.pagination.limit  || self.context.properties.max_records || 3

	// sqo update filter_by_locators
		if(self.pagination.total>self.pagination.limit){

			const show 	= self.sqo_context.show
			const sqo 	= show.find(item => item.typo==='sqo')

			const data_value = self.data.value

			sqo.filter_by_locators = data_value
		}//end if(self.pagination.total>self.pagination.limit)

	// paginator
		if (!self.paginator) {
			// create new
			const current_paginator = new paginator()
			current_paginator.init({
				caller : self
			})
			await current_paginator.build()
			self.paginator = current_paginator

			self.events_tokens.push(
				event_manager.subscribe('paginator_goto_'+current_paginator.id , async (offset) => {
					self.pagination.offset = offset
					self.refresh()
				})
			)//end events push

		}else{
			// refresh existing
			self.paginator.offset = self.pagination.offset
			self.paginator.total  = self.pagination.total
			self.paginator.refresh()
		}

	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions

	// debug
		if(SHOW_DEBUG===true) {
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			//console.log("component_autocomplete self +++++++++++ :",self);
			//console.log("========= build self.pagination.total:",self.pagination.total);
		}

	// status update
		self.status = 'builded'


	return true
}//end component_autocomplete.prototype.build



/**
* ADD_VALUE
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.add_value = async function(value) {

	const self = this

	// update pagination total
	//self.pagination.total = self.data.value ? self.data.value.length : 0

	const key = (self.data.value ? self.data.value.length : 0) + self.pagination.offset

	const changed_data = Object.freeze({
		action	: 'insert',
		key		: key,
		value	: value
	})

	if(SHOW_DEBUG===true) {
		console.log("==== add_value - value - changed_data:", value, changed_data);
	}

	// des
		// const js_promise = self.change_value({
		// 	changed_data : changed_data,
		// 	refresh 	 : false
		// })
		// .then(async (api_response)=>{

		// 	// destroy. change the autocomplete service to false and desactive it.
		// 		if(self.autocomplete_active===true){
		// 			self.autocomplete.destroy()
		// 			self.autocomplete_active = false
		// 			self.autocomplete 		 = null
		// 		}

		// 	// update pagination offset and total
		// 		self.update_pagination_values()
		// 		await self.paginator.build()

		// 	// refresh
		// 		self.refresh()

		// 	return true
		// })

	// change_value
		const api_response = await self.change_value({
			changed_data : changed_data,
			refresh 	 : false
		})

	// autocomplete destroy. change the autocomplete service to false and desactive it.
		if(self.autocomplete_active===true){
			self.autocomplete.destroy()
			self.autocomplete_active = false
			self.autocomplete 		 = null
		}

	// update pagination offset
		self.update_pagination_values()

	// refresh self component
		self.refresh()


	return true
}//end add_value



/**
* UPDATE_PAGINATION_VALUES
*/
component_autocomplete.prototype.update_pagination_values = function() {

	const self = this

	// update pagination offset and total
		const last_offset 	= self.get_last_offset()
		//const current_total = self.pagination.total

	// self pagination update
		self.pagination.offset 	= last_offset
		//self.pagination.total = current_total

	// // paginator object update
	// 	self.paginator.offset 	= last_offset
	// 	self.paginator.total 	= current_total

	return true
}//end update_pagination_values



/**
* GET_LAST_OFFSET
*/
component_autocomplete.prototype.get_last_offset = function() {
	//console.log("[get_last_offset] self:",self);

	const self = this

	const total = self.pagination.total
	const limit = self.pagination.limit

	const _calculate = () => {

		if (total>0 && limit>0) {

			const total_pages = Math.ceil(total / limit)

			return parseInt( limit * (total_pages -1) )

		}else{

			return 0
		}
	}
	const offset_last = _calculate()

	if(SHOW_DEBUG===true) {
		console.log("====get_last_offset offset_last:",offset_last, "total",total, "limit",limit);
	}

	return offset_last
}//end get_last_offset



/**
* REMOVE_VALUE
* @param object value (locator)
* @return bool
*//*
component_autocomplete.prototype.remove_value = async function(target) {

	const self = this

	// user confirmation prevents remove accidentally
		if (!confirm(`Sure to remove value: ${target.previousElementSibling.textContent} ?`)) return false

	const key = parseInt(target.dataset.key)

	// update_data_value.
		const changed_data = {
			action	: 'remove',
			key		: key,
			value	: null
		}

	// update the data in the instance previous to save
		self.update_data_value(changed_data)
		self.data.changed_data = changed_data

	// rebuild and save the component
		const js_promise = self.save(self.data.changed_data).then(async api_response => {

			// update offset
				//self.pagination.offset = get_last_offset(self)

			// update total
				//self.pagination.total--;

			// refresh self
				self.refresh()

			// publish event (refresh all identical components)
				//event_manager.publish('remove_element_'+self.id, key)

		})

	return js_promise
}//end remove_value
*/


