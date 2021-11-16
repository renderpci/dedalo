/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common, set_context_vars, create_source} from '../../common/js/common.js'
	import {component_common, init_events_subscription} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	// import {render_component_portal} from '../../component_portal/js/render_component_portal.js'
	import {render_edit_component_portal} from '../../component_portal/js/render_edit_component_portal.js'
	import {render_list_component_portal} from '../../component_portal/js/render_list_component_portal.js'
	import {render_search_component_portal} from '../../component_portal/js/render_search_component_portal.js'
	import {render_mini_component_portal} from '../../component_portal/js/render_mini_component_portal.js'



/**
* COMPONENT_PORTAL
*/
export const component_portal = function(){

	this.id = null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null
	this.section_lang	= null
	this.column_id		= null
	this.parent			= null
	this.node			= null
	this.modal			= null

	// context - data
	this.datum		= null
	this.context	= null
	this.data		= null

	// pagination
	this.total		= null
	this.paginator	= null

	// autocomplete service
	this.autocomplete			= null
	this.autocomplete_active	= null

	// rqo
	this.rqo_config	= null
	this.rqo		= null

	return true
};//end  component_portal



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// life-cycle
	// component_portal.prototype.init				= component_common.prototype.init
	// component_portal.prototype.build				= component_common.prototype.build
	component_portal.prototype.render				= common.prototype.render
	component_portal.prototype.refresh				= common.prototype.refresh
	component_portal.prototype.destroy				= common.prototype.destroy

	// change data
	component_portal.prototype.save					= component_common.prototype.save
	component_portal.prototype.update_data_value	= component_common.prototype.update_data_value
	component_portal.prototype.update_datum			= component_common.prototype.update_datum
	component_portal.prototype.change_value			= component_common.prototype.change_value
	component_portal.prototype.get_ar_instances		= component_common.prototype.get_ar_instances
	component_portal.prototype.get_columns_map		= common.prototype.get_columns_map
	component_portal.prototype.build_rqo_show		= common.prototype.build_rqo_show
	component_portal.prototype.build_rqo_search		= common.prototype.build_rqo_search
	component_portal.prototype.build_rqo_choose		= common.prototype.build_rqo_choose

	// render
	// component_portal.prototype.mini				= render_component_portal.prototype.mini
	// component_portal.prototype.list				= render_component_portal.prototype.list
	// component_portal.prototype.edit				= render_component_portal.prototype.edit
	// component_portal.prototype.edit_in_list		= render_component_portal.prototype.edit
	// component_portal.prototype.tm				= render_component_portal.prototype.list
	// component_portal.prototype.search			= render_component_portal.prototype.search
	// component_portal.prototype.change_mode		= component_common.prototype.change_mode

	component_portal.prototype.mini					= render_mini_component_portal.prototype.mini
	component_portal.prototype.list					= render_list_component_portal.prototype.list
	component_portal.prototype.edit					= render_edit_component_portal.prototype.edit
	component_portal.prototype.edit_in_list			= render_edit_component_portal.prototype.edit
	component_portal.prototype.tm					= render_list_component_portal.prototype.list
	component_portal.prototype.search				= render_search_component_portal.prototype.search
	component_portal.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* @return bool
*/
component_portal.prototype.init = async function(options) {
	
	const self = this

	// autocomplete. set default values of service autocomplete
		self.autocomplete			= null
		self.autocomplete_active	= false

	// columns
		self.columns_map		= options.columns_map
		self.add_component_info	= false

	// call the generic common tool init
		const common_init = component_common.prototype.init.call(self, options);

	// events subscribe
		// initiator_link. user click over list record_
			self.events_tokens.push(
				event_manager.subscribe('initiator_link_' + self.id, fn_initiator_link)
			)
			async function fn_initiator_link(locator) {
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
			}//end fn_initiator_link


	return common_init
};//end  init



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_portal.prototype.build = async function(autoload=false){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed		
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	const current_data_manager = new data_manager()

	// rqo
		const generate_rqo = async function(){
			// rqo_config. get the rqo_config from context
			self.rqo_config	= self.context && self.context.request_config
				? self.context.request_config.find(el => el.api_engine==='dedalo')
				: {}
			// rqo build
			const action	= (self.mode==='search') ? 'resolve_data' : 'get_data'
			const add_show	= false
			self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, action, add_show)
			if(self.mode==='search') {
				self.rqo.source.value = self.data.value
			}
		}
		await generate_rqo()

	// debug check
		// if(SHOW_DEBUG===true) {
		// 	// console.log("portal generate_rqo 1 self.rqo_config:", JSON.parse( JSON.stringify(self.rqo_config) ));
		// 	// console.log("portal generate_rqo 1 self.rqo:", JSON.parse( JSON.stringify(self.rqo) ));
		// 	const ar_used = []
		// 	for(const element of self.datum.data) {

		// 		if (element.matrix_id) { continue; } // skip verification in matrix data

		// 		const index = ar_used.findIndex(item => item.tipo===element.tipo &&
		// 												item.section_tipo===element.section_tipo &&
		// 												item.section_id==element.section_id &&
		// 												item.from_component_tipo===element.from_component_tipo &&
		// 												item.parent_section_id==element.parent_section_id &&
		// 												item.row_section_id==element.row_section_id
		// 												// && (item.matrix_id && item.matrix_id==element.matrix_id)
		// 												// && (item.tag_id && item.tag_id==element.tag_id)
		// 												)
		// 		if (index!==-1) {
		// 			console.error("PORTAL ERROR. self.datum.data contains duplicated elements:", ar_used[index]);
		// 		}else{
		// 			ar_used.push(element)
		// 		}
		// 	}
		// }
	
	// load data if not yet received as an option
		if (autoload===true) {

			// get context and data
				const api_response = await current_data_manager.request({body:self.rqo})
					// console.log("COMPONENT PORTAL api_response:",self.id, api_response);
					dd_console(`[component_portal.build] COMPONENT ${self.model} build autoload api_response:`, 'DEBUG', [api_response.debug.exec_time, api_response])

			// set context and data to current instance
				await self.update_datum(api_response.result.data) // (!) Updated on save too (add/delete elements)

			// context. update instance properties from context (type, label, tools, divisor, permissions)
				self.context		= api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
				self.datum.context	= api_response.result.context

			// force re-assign self.total
				self.total = null

			// rqo regenerate
				await generate_rqo()
				// console.log("portal generate_rqo 2 self.rqo:",self.rqo);

		}//end if (autoload===true)

	// update instance properties from context
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
		init_events_subscription(self)

	// mode cases
		if (self.mode==="edit") {
			// pagination vars only in edit mode

			// pagination. update element pagination vars when are used
				if (self.data.pagination && !self.total) {
					self.total			= self.data.pagination.total
					self.rqo.sqo.offset	= self.data.pagination.offset
					// set value
					current_data_manager.set_local_db_data(self.rqo, 'rqo')					
				}

			// paginator
				if (!self.paginator) {

					// create new one
					self.paginator = new paginator()
					self.paginator.init({
						caller : self
					})
					await self.paginator.build()

					self.events_tokens.push(
						event_manager.subscribe('paginator_goto_'+self.paginator.id, fn_paginator_goto)
					)//end events push
					function fn_paginator_goto(offset) {

						self.rqo.sqo.offset = offset

						// set value
						current_data_manager.set_local_db_data(self.rqo, 'rqo')

						self.refresh()
					}//end fn_paginator_goto

				}else{
					// refresh existing
					self.paginator.offset = self.rqo.sqo.offset
					self.paginator.total  = self.total
					// self.paginator.refresh()
					// await self.paginator.build()
					// self.paginator.render()
				}
				// console.log("//////////\\ PORTAL "+self.tipo+" self.paginator:",self.paginator);

			// autocomplete destroy. change the autocomplete service to false and deactivates it
				if(self.autocomplete && self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null
				}
		
		}else if(self.mode==="search"){
			// active / prepare the autocomplete in search mode

			// (!) Used ?
			// autocomplete destroy. change the autocomplete service to false and deactivate it.
				// if(self.autocomplete && self.autocomplete_active===true){
				// 	self.autocomplete.destroy()
				// 	self.autocomplete_active = false
				// 	self.autocomplete 		 = null
				// }
		}// end if(self.mode==="edit")


	// target_section
		self.target_section = self.rqo_config.sqo.section_tipo
		// self.target_section = self.rqo.sqo.section_tipo

	// columns
		// if(self.mode!=='list'){
			self.columns_map = self.get_columns_map()
		// }

	// component_info add
		try {
			self.add_component_info = self.context.request_config.find(el => el.api_engine==="dedalo").show.ddo_map[0].value_with_parents || false
		}catch(error){
			console.warn("error:",error);
		}

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("/// component_portal build self.datum.data:",self.datum.data);
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			// console.log("component_portal self +++++++++++ :",self);
			//console.log("========= build self.pagination.total:",self.pagination.total);
		}

	// status update
		self.status = 'builded'


	return true
};//end component_portal.prototype.build



/**
* ADD_VALUE
* Called from service autocomplete when user select an data list option
* @param object value (locator)
* @return bool
*/
component_portal.prototype.add_value = async function(value) {

	const self = this

	// check if value already exists. (!) Note that only current loaded paginated values are available for compare, not the whole portal data
		const current_value	= self.data.value
		const exists		= current_value.find(item => item.section_tipo===value.section_tipo && item.section_id==value.section_id)
		if (typeof exists!=="undefined") {
			console.log("[add_value] Value already exists (1) !");
			return false
		}

	// changed_data
		const key			= self.total || 0
		const changed_data	= Object.freeze({
			action	: 'insert',
			key		: key,
			value	: value
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[component_portal.add_value] value:", value, " - changed_data:", changed_data);
		}

	// total_before
		const total_before = clone(self.total)

	// mode specifics
		switch(self.mode) {
			case 'search' :
				// publish change. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				self.node.map(function(item_node) {
					item_node.classList.remove("active")
				})
				break;

			default:
				// updates pagination values offset and total
				self.update_pagination_values('add')
				break;
		}

	// change_value (and save)
		const api_response = await self.change_value({
			changed_data	: changed_data,
			refresh			: false // not refresh here (!)
		})

	// total (after save)
		const total = api_response.result.data.find(el => el.tipo===self.tipo).pagination.total

	// check if value already existed. (!) Note that here, the whole portal data has been compared in server
		if (parseInt(total) <= parseInt(total_before)) {
			self.update_pagination_values('remove') // remove added pagination value
			console.log("[add_value] Value already exists (2) !");
			return false
		}

	// Update data from save API response (note that build_autoload will be passed as false later -when refresh- to avoid call to the API again)
		// set context and data to current instance
			await self.update_datum(api_response.result.data) // (!) Updated on save too (add/delete elements)

		// context. update instance properties from context (type, label, tools, divisor, permissions)
			self.context		= api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
			self.datum.context	= api_response.result.context

		// force re-assign self.total and pagination values on build
			self.total = null


	// refresh self component
		await self.refresh({
			build_autoload	: (self.mode==='search' ? true : false),
			render_level	: 'content'
		})

	// check if the caller has tag_id
		if(self.active_tag){
			// filter component data by tag_id and re-render content
			self.filter_data_by_tag_id(self.active_tag)
		}
		
	return true
};//end add_value



/**
* UPDATE_PAGINATION_VALUES
* @param string action
* @return bool true
*/
component_portal.prototype.update_pagination_values = function(action) {

	const self = this

	// update self.data.pagination
		switch(action) {
			case 'remove' :
				// update pagination total
				if(self.data.pagination.total && self.data.pagination.total>0) {
					// self.data.pagination.total--
					self.total--
				}
				break;
			case 'add' :
				// update self.data.pagination
				if(self.data.pagination && self.data.pagination.total && self.data.pagination.total>=0) {
					// self.data.pagination.total++
					self.total++
				}
				break;
			default:
				// Nothing to add or remove
		}
		// self.total = self.data.pagination.total


	// last_offset
		const last_offset = (()=>{

			const total	= self.total
			const limit	= self.rqo.sqo.limit

			if (total>0 && limit>0) {

				const total_pages = Math.ceil(total / limit)

				return parseInt( limit * (total_pages -1) )
			}

			return 0
		})()

	// self pagination update
		self.rqo.sqo.offset	= last_offset

		if (!self.data.pagination) {
			self.data.pagination = {}
		}
		self.data.pagination.offset	= last_offset
		self.data.pagination.total	= self.total// sync pagination info

	// paginator object update
		self.paginator.offset	= self.rqo.sqo.offset
		self.paginator.total	= self.total

	// paginator content data update (after self update to avoid artifacts (!))
		self.events_tokens.push(
			event_manager.subscribe('render_'+self.id, fn_refresh_paginator)
		)
		function fn_refresh_paginator(node) {
			// remove the event to prevent multiple equal events
				event_manager.unsubscribe('render_'+self.id)
			// refresh paginator if already exists
				if (self.paginator) {
					self.paginator.refresh()
				}
		}

	// set value
		const current_data_manager = new data_manager()
		current_data_manager.set_local_db_data(self.rqo, 'rqo')


	return true
};//end update_pagination_values



/**
* FILTER_DATA_BY_TAG_ID
* Filtered data with the tag clicked by the user
* The portal will show only the locators for the tag selected
* @return promise self.render
*/
component_portal.prototype.filter_data_by_tag_id = function(options){

	const self = this

	// options
		const tag_element = options.tag // DOM node selected
		
	// Fix received options from event as 'active_tag'
		self.active_tag = options

	// tag_id from node dataset
		const tag_id = tag_element.dataset.tag_id

	// get all data from datum because if the user select one tag the portal data is filtered by the tag_id, 
	// in the next tag selection by user the data doesn't have all locators and is necessary get the original data
	// the full_data is clone to a new object because need to preserve the datum from these changes.
		const full_data	= self.datum.data.find(el => el.tipo===self.tipo
												  && el.section_tipo===self.section_tipo
												  && el.section_id==self.section_id) || {}
		self.data = JSON.parse(JSON.stringify(full_data))

	// the portal will use the filtered data value to render it with the tag_id locators.
		self.data.value = self.data.value
			? self.data.value.filter(el => el.tag_id === tag_id )
			: []

	// reset status to able re-render
		self.status = 'builded'

	// re-render always the content
		return self.render({
			render_level : 'content'
		})
}// end filter_data_by_tag_id



/**
* RESET_FILTER_DATA
* reset filtered data to the original and full server data
* @return promise self.render
*/
component_portal.prototype.reset_filter_data = function(options){

	const self = this

	// refresh the data with the full data from datum and render portal.
		self.data = self.datum.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id) || {}

	// reset status to able re-render
		self.status = 'builded'

	// reset instances status
		// self.ar_instances = null
		// for (let i = 0; i < self.ar_instances.length; i++) {
		// 	self.ar_instances[i].status = 'builded'
		// }
	
	// re-render content
		return self.render({
			render_level : 'content'
		})
}// end reset_filter_data



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
	// };//end  get_last_offset


