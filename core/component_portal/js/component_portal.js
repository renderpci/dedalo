/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {render_component_portal} from '../../component_portal/js/render_component_portal.js'



/**
* COMPONENT_PORTAL
*/
export const component_portal = function(){

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

	this.modal

	this.autocomplete
	this.autocomplete_active

	return true
}//end component_portal



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	// component_portal.prototype.init 				= component_common.prototype.init
	// component_portal.prototype.build 			= component_common.prototype.build
	component_portal.prototype.render				= common.prototype.render
	component_portal.prototype.refresh				= common.prototype.refresh
	component_portal.prototype.destroy				= common.prototype.destroy

	// change data
	component_portal.prototype.save					= component_common.prototype.save
	// component_portal.prototype.load_data 		= component_common.prototype.load_data
	// component_portal.prototype.load_datum 		= component_common.prototype.load_datum
	// component_portal.prototype.get_value 		= component_common.prototype.get_value
	// component_portal.prototype.set_value 		= component_common.prototype.set_value
	component_portal.prototype.update_data_value	= component_common.prototype.update_data_value
	component_portal.prototype.update_datum			= component_common.prototype.update_datum
	component_portal.prototype.change_value			= component_common.prototype.change_value
	component_portal.prototype.get_ar_instances		= component_common.prototype.get_ar_instances

	// render
	component_portal.prototype.list					= render_component_portal.prototype.list
	component_portal.prototype.edit					= render_component_portal.prototype.edit
	component_portal.prototype.edit_in_list			= render_component_portal.prototype.edit
	component_portal.prototype.tm					= render_component_portal.prototype.edit
	component_portal.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
*/
component_portal.prototype.init = async function(options) {
	
	const self = this

	// autocomplete. set default values of service autocomplete
		self.autocomplete		= null
		self.autocomplete_active= false

	// call the generic commom tool init
		const common_init = component_common.prototype.init.call(this, options);

	// events subscribe
		self.events_tokens.push(
			// user click over list record
			event_manager.subscribe('initiator_link_' + self.id, async (locator)=>{

				// add locator selected
					const result = await self.add_value(locator)
					if (result===false) {
						alert("Value already exists!");
						return
					}
				// modal close
					if (self.modal) {
						self.modal.close()
					}
			})
		)


	return common_init
}//end init



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_portal.prototype.build  = async function(autoload){
	const t0 = performance.now()

	const self = this

	autoload = typeof autoload==="undefined" ? false : autoload

	// status update
		self.status = 'building'

	// load data if not yet received as an option
		if (autoload===true) {

			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)

			if(SHOW_DEBUG===true) {
				console.log("portal build api_response:", api_response)
			}			
			
			// Update the self.data into the datum and self instance
				if (api_response.result) self.update_datum(api_response) // (!) is not the common update_datum

			// fix data
				// self.data = self.datum.data.find(item => item.tipo===self.tipo && item.section_id===self.section_id) || {}
		}

	// pagination vars only in edit mode
		if (self.mode==="edit") {
		
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

			// autocomplete destroy. change the autocomplete service to false and desactive it.
				if(self.autocomplete && self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null			
				}
		}//end if (self.mode==="edit")
	
	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			//console.log("component_portal self +++++++++++ :",self);
			//console.log("========= build self.pagination.total:",self.pagination.total);				
		}

	// status update
		self.status = 'builded'

	
	return true
}//end component_portal.prototype.build



/**
* UPDATE_DATUM
* Update component data value with changed_data send by the dom element
* Update the datum and the data of the instance with the data changed and saved.
* changed_data format:
*	{
		action : insert,
*		key	: i,
*		value : input.value
*	}
* @param object api_response
*	api_response contains fresh calculated context and data of saved component
* @return bool true
*/
component_portal.prototype.update_datum = function(api_response) {

	const self = this

	//const changed_data = self.data.changed_data
	
	// self.datum. On building, if datum is not created, creation is needed
		if (!self.datum) self.datum = {data:[]}

	// data_to_change
		const new_data			= api_response.result.data		
		const new_data_length	= new_data.length			
			// console.log("update_datum --------------------------- new_data:",JSON.parse(JSON.stringify(new_data)) );
			// console.log("update_datum --------------------------- first self.datum.data:",JSON.parse(JSON.stringify(self.datum.data))); 
			// console.trace();

	// datum
		// replace old data with the new one from api
			self.datum.data = new_data
				// console.log("update_datum --------------------------- final self.datum.data:",JSON.parse(JSON.stringify(self.datum.data)));

	// data
		// update current element data
			self.data = self.datum.data.find(item => item.tipo===self.tipo && item.section_id===self.section_id) || {}
				//console.log("=======self.data:",JSON.parse( JSON.stringify(self.data)));		
	
	// update element pagination vars when are used
		if (self.data.pagination && typeof self.pagination.total!=="undefined") {
			self.pagination.total = self.data.pagination.total
		}

	// dispatch event
		event_manager.publish('update_data_'+ self.id_base, '')
	

	return true
}//end update_datum



/**
* ADD_VALUE
* @param object value (locator)
* @return bool
*/
component_portal.prototype.add_value = async function(value) {

	const self = this

	// check if value lready exists
		// const current_value = self.data.value
		// const exists 		= current_value.find(item => item.section_tipo===value.section_tipo && item.section_id===value.section_id)
		// if (typeof exists!=="undefined") {
		// 	console.log("[add_value] Value already exists !");
		// 	return false
		// }


	const key = self.pagination.total || 0

	const changed_data = Object.freeze({
		action	: 'insert',
		key		: key,
		value	: value
	})

	if(SHOW_DEBUG===true) {
		console.log("[component_portal.add_value] value:", value, " - changed_data:", changed_data);
	}

	// change_value
		const api_response = await self.change_value({
			changed_data : changed_data,
			refresh		 : false
		})

	// update pagination offset
		self.update_pagination_values('add')

	// refresh self component
		self.refresh()


	return true
}//end add_value



/**
* UPDATE_PAGINATION_VALUES
*/
component_portal.prototype.update_pagination_values = function(action) {

	const self = this

	// update self.data.pagination
		switch(action) {
			case 'remove' :
				// update pagination total
				if(self.data.pagination.total && self.data.pagination.total>0) {
					self.data.pagination.total-- 
				}
				break;
			case 'add' :
				// update self.data.pagination
				if(self.data.pagination.total && self.data.pagination.total>=0) {
					self.data.pagination.total++ 
				}
				break;
		}

	// last_offset
		const last_offset = (()=>{

			const total = self.pagination.total
			const limit = self.pagination.limit

			if (total>0 && limit>0) {

				const total_pages = Math.ceil(total / limit)

				return parseInt( limit * (total_pages -1) )
			}

			return 0
		})()

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
	// component_portal.prototype.get_last_offset = function() {
	// 	//console.log("[get_last_offset] self:",self);

	// 	const self = this

	// 	const total = self.pagination.total
	// 	const limit = self.pagination.limit

	// 	const _calculate = () => {

	// 		if (total>0 && limit>0) {

	// 			const total_pages = Math.ceil(total / limit)

	// 			return parseInt( limit * (total_pages -1) )

	// 		}else{

	// 			return 0
	// 		}
	// 	}
	// 	const offset_last = _calculate()

	// 	if(SHOW_DEBUG===true) {
	// 		console.log("====get_last_offset offset_last:",offset_last, "total",total, "limit",limit);
	// 	}

	// 	return offset_last
	// }//end get_last_offset


