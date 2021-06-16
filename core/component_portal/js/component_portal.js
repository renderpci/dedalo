/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common, create_source} from '../../common/js/common.js'
	import {component_common, set_context_vars} from '../../component_common/js/component_common.js'
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
	this.column_id

	this.section_lang

	this.datum
	this.context
	this.data
	this.parent
	this.node
	this.total

	this.modal

	this.paginator

	this.autocomplete
	this.autocomplete_active

	this.rqo_config
	this.rqo

	return true
};//end  component_portal



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
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
	component_portal.prototype.get_columns			= common.prototype.get_columns
	component_portal.prototype.build_rqo_show		= common.prototype.build_rqo_show
	component_portal.prototype.build_rqo_search		= common.prototype.build_rqo_search
	component_portal.prototype.build_rqo_choose		= common.prototype.build_rqo_choose

	// render
	component_portal.prototype.mini					= render_component_portal.prototype.mini
	component_portal.prototype.list					= render_component_portal.prototype.list
	component_portal.prototype.edit					= render_component_portal.prototype.edit
	component_portal.prototype.edit_in_list			= render_component_portal.prototype.edit
	component_portal.prototype.tm					= render_component_portal.prototype.edit
	component_portal.prototype.search				= render_component_portal.prototype.search
	component_portal.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
*/
component_portal.prototype.init = async function(options) {
	
	const self = this

	// autocomplete. set default values of service autocomplete
		self.autocomplete			= null
		self.autocomplete_active	= false

	// // columns
		self.columns = options.columns

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

	// rqo_config
		self.context.request_config				= self.context.request_config || await ( async () => {

			const element_context_response	= await current_data_manager.get_element_context({
				tipo			: self.tipo,
				section_tipo	: self.section_tipo,
				section_id		: self.section_id
			})
			if(SHOW_DEBUG===true) {
				console.log("// [component_portal.prototype.build] element_context API response:", element_context_response);
				console.trace();
			}			
			const request_config = element_context_response.result[0].request_config
			return request_config
		})();

		self.rqo_config	= self.context.request_config.find(el => el.api_engine==='dedalo');

	// rqo build
		self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, 'get_data')


	// set dd_request
		// self.dd_request.show = self.dd_request.show || self.build_rqo('show', self.context.request_config, 'get_data')
			// console.log("/// PORTAL BUILD self.dd_request.show:",self.dd_request.show);
	
	// debug check
		if(SHOW_DEBUG===true) {
			// console.log("-- component_portal.prototype.build self.context.request_config", self.context.request_config);
			// console.log("/// update_datum --------------------------- first self.datum.data:",JSON.parse(JSON.stringify(self.datum.data)));
			const ar_used = []
			for(const element of self.datum.data) {
				const index = ar_used.findIndex(item => item.tipo===element.tipo && item.section_tipo===element.section_tipo && item.section_id===element.section_id && item.from_component_tipo===element.from_component_tipo && item.parent_section_id===element.parent_section_id && item.row_section_id===element.row_section_id)
				if (index!==-1) {
					console.error("PORTAL ERROR. self.datum.data contains duplicated elements:", self.datum.data);
				}else{
					ar_used.push(element)
				}
			}
		}
	
	// load data if not yet received as an option
		if (autoload===true) {

			// get context and data
				const api_response = await current_data_manager.request({body:self.rqo})					

			// debug
				if(SHOW_DEBUG===true) {
					console.log("portal api_response:",api_response);
				}

			// set context and data to current instance
				self.update_datum(api_response.result.data) // (!) Updated on save too (add/delete elements)

			// context. update instance properties from context (type, label, tools, divisor, permissions)
				self.context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
				set_context_vars(self, self.context)

				self.datum.context = api_response.result.context				
		}//end if (autoload===true)
		
	
	// pagination vars only in edit mode
		if (self.mode==="edit") {


			// pagination. update element pagination vars when are used
				if (self.data.pagination && !self.total) {
					// console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++ self.data.pagination:",self.data.pagination);
					self.total			= self.data.pagination.total
					self.rqo.sqo.offset	= self.data.pagination.offset
					// set value
					current_data_manager.set_local_db_data(self.rqo, 'rqo')					
				}

			// paginator
				if (!self.paginator) {

					// create new
					const current_paginator = new paginator()
					current_paginator.init({
						caller : self
					})
					await current_paginator.build()
					// fix paginator to current instance
					self.paginator = current_paginator
						console.log("self.paginator:",self.paginator);

					self.events_tokens.push(
						event_manager.subscribe('paginator_goto_'+current_paginator.id , async (offset) => {
							self.rqo.sqo.offset = offset

							// set value
							current_data_manager.set_local_db_data(self.rqo, 'rqo')

							self.refresh()
						})
					)//end events push

				}else{
					// refresh existing
					self.paginator.offset = self.rqo.sqo.offset
					self.paginator.total  = self.total
					// self.paginator.refresh()
					// await self.paginator.build()
					// self.paginator.render()
				}
				// console.log("//////////\\ PORTAL "+self.tipo+" self.paginator:",self.paginator);

			// autocomplete destroy. change the autocomplete service to false and desactive it.
				if(self.autocomplete && self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null
				}
		}//end if (self.mode==="edit")

	// active / prepare the autocomplete in search mode
		if(self.mode ==="search"){
			// autocomplete destroy. change the autocomplete service to false and desactive it.
				if(self.autocomplete && self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null
				}
		}// end if(self.mode ==="search")

	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions

	// target_section
		self.target_section = self.rqo_config.sqo.section_tipo

	// columns
		if(self.mode === 'edit'){
			self.columns = self.get_columns()
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
* @param object value (locator)
* @return bool
*/
component_portal.prototype.add_value = async function(value) {

	const self = this

	// console.log("self", self);

	// check if value already exists
		// const current_value = self.data.value
		// const exists 		= current_value.find(item => item.section_tipo===value.section_tipo && item.section_id===value.section_id)
		// if (typeof exists!=="undefined") {
		// 	console.log("[add_value] Value already exists !");
		// 	return false
		// }

	const key = self.total || 0

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
};//end  add_value



/**
* UPDATE_PAGINATION_VALUES
*/
component_portal.prototype.update_pagination_values = function(action) {

	const self = this

	// console.log("self.data.pagination:",self.data.pagination);
	// console.log("self.rqo.sqo.:",self.rqo.sqo);

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

		self.data.pagination.offset	= last_offset
		self.data.pagination.total	= self.total// sync pagination info

	// // paginator object update
		self.paginator.offset	= self.rqo.sqo.offset
		self.paginator.total	= self.total

	// paginator content data update (after self update to avoid artifacts (!))
		event_manager.subscribe('render_'+self.id, refresh_paginator)
		function refresh_paginator(node) {
			event_manager.unsubscribe('render_'+self.id)
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
* GET_PORTAL_ITEMS
* @return array of components context
*/
	// component_portal.prototype.get_portal_items = function() {

	// 	const self = this

	// 	const portal_items = []

	// 	// ddo map
	// 		const rqo = self.context.request_config.find(item => item.typo==='rqo')
	// 		if (rqo) {
	// 			const ddo_map			= rqo.show.ddo_map
	// 			const ddo_map_length	= ddo_map.length
	// 			for (let j = 0; j < ddo_map_length; j++) {

	// 				const component_tipo = ddo_map[j]
	// 					console.log("component_tipo:",component_tipo);

	// 				const item_context = self.datum.context.find(item => item.tipo===component_tipo && item.parent===self.tipo)

	// 				portal_items.push(item_context)
	// 				// // iterate portal records
	// 				// for (let k = 0; k < portal_data.length; k++) {
	// 				// 	// if (!portal_data[k] || !portal_data[k].section_id) continue;

	// 				// 	const portal_section_id		= portal_data[k].section_id
	// 				// 	const portal_section_tipo	= portal_data[k].section_tipo
	// 				// 		console.log("portal_section_id:",portal_section_id,portal_section_tipo);

	// 				// 	break;
	// 				// }

	// 				// await add_instance(current_context, section_id)

	// 				// const current_data = portal_data.find(item => item.from_component_tipo===component_tipo)
	// 					// console.log("////// current_data "+component_tipo, current_data);
	// 			}
	// 		}


	// 	return portal_items
	// }; //end get_portal_items



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
