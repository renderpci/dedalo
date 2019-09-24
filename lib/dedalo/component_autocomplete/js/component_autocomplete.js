// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'
	//import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {paginator} from '../../search/js/paginator.js'



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
	component_autocomplete.prototype.init 	 				= component_common.prototype.init
	component_autocomplete.prototype.destroy 				= common.prototype.destroy
	component_autocomplete.prototype.save 	 				= component_common.prototype.save
	component_autocomplete.prototype.refresh 				= common.prototype.refresh
	component_autocomplete.prototype.load_data 				= component_common.prototype.load_data
	component_autocomplete.prototype.load_datum 			= component_common.prototype.load_datum
	component_autocomplete.prototype.get_value 				= component_common.prototype.get_value
	component_autocomplete.prototype.set_value 				= component_common.prototype.set_value
	component_autocomplete.prototype.update_data_value		= component_common.prototype.update_data_value
	component_autocomplete.prototype.update_datum			= component_common.prototype.update_datum

	// render
	component_autocomplete.prototype.list 					= render_component_autocomplete.prototype.list
	component_autocomplete.prototype.edit 					= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.render 				= common.prototype.render
	component_autocomplete.prototype.change_mode 			= component_common.prototype.change_mode
	component_autocomplete.prototype.get_ar_instances 		= component_common.prototype.get_ar_instances



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.build  = async function(autoload=false){
	const t0 = performance.now()

	const self = this

	self.status = 'loading'

	// load data if is not already received as option
		if (autoload===true) {
			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)
			// Update the self.data into the datum and own instance
			self.update_datum(api_response)
		}

	const data_value 	= self.data.value
	const max_records 	= self.context.properties.max_records
	const total 		= self.pagination.total || 0

	if(total>max_records){

		const show 	= self.sqo_context.show
		const sqo 	= show.find(item => item.typo==='sqo')

		sqo.filter_by_locators = data_value
	}//end if(total_records>max_records)

	// component pagination info
		self.pagination.total = total

	// paginator
		if (!self.paginator) {
			// create new
			const current_paginator = new paginator()
			current_paginator.init({
				caller : self
			})
			current_paginator.build()
			self.paginator = current_paginator // current_paginator.build()
		}else{
			// refresh existing
			self.paginator.refresh()
		}


	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to build",self.model, ":", performance.now()-t0);
		}

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

	const key = parseInt(self.pagination.total)

	// changed_data update
		const changed_data = {
			action	: 'insert',
			key	  	: key,
			value 	: value
		}
	// update the data in the instance previous to save
		self.update_data_value(changed_data)
		self.data.changed_data = changed_data

	// rebuild and save the component
		const js_promise = await self.save(changed_data)//.then(async api_response => {

			// destroy. change the autocomplete service to false and desactive it.
				if(self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null
				}

			// update total
				//console.log("--self.pagination before:",JSON.parse(JSON.stringify(self.pagination)));

				//self.pagination.total = parseInt(self.pagination.total) + 1;
				self.pagination.total = parseInt(self.data.value.length);

			// update offset
				self.pagination.offset = get_last_offset(self)
				//console.log("--self.pagination after:",JSON.parse(JSON.stringify(self.pagination)));

			// refresh
				self.refresh()

			// pubilsh event (refresh all identical components)
				//event_manager.publish('add_element_'+self.id, key)
		//})

	return js_promise
}//end add_value



/**
* REMOVE_VALUE
* @param object value (locator)
* @return bool
*/
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

			// destroy. change the autocomplete service to false and desactive it.
				if(self.autocomplete_active===true){
					self.autocomplete.destroy()
					self.autocomplete_active = false
					self.autocomplete 		 = null
				}

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



/**
* ADD_VALUE
* @param object value (locator)
* @return bool
*/
/*
component_autocomplete.prototype.add_value = async function(value) {

	const self = this

	const ar_found = self.data.value.filter(item => item.section_id===value.section_id && item.section_tipo===value.section_tipo)
	if (ar_found.length>0) {
		console.log("Ignored to add value because already exists:", value);
		return false
	}

	const key = self.data.total_records

	// changed_data update
		self.data.changed_data = {
			action	: 'insert',
			key	  	: key,
			value 	: value
		}
		//self.update_datum()
	// get the locator values
		const current_section_tipo 	= value.section_tipo
		const current_section_id 	= value.section_id

	// get and clone full the sqo_context of the main object
		const search_sqo_context = JSON.parse(JSON.stringify(self.sqo_context.search))
	// cretate the new filter to load data
		const filter = {
				"$and": [{
							q: current_section_id,
							path: [{
									section_tipo : current_section_tipo,
									modelo 		 : "component_section_id"
							}]
						}]
		}
	// find the sqo in the current_sqo_context
		const current_sqo 			= search_sqo_context.find((item)=> item.typo === 'sqo')
		const current_sqo_section 	= search_sqo_context.find((item)=> item.tipo === current_section_tipo)
		const source ={
				typo 			: 'source',
				tipo 			: self.tipo,
				model 			: 'section',
				lang 			: self.lang,
				mode 			: 'list',
			}
	// set the filter to the sqo
		current_sqo.filter = filter
		current_sqo.section_tipo = [current_section_tipo]
	// get the context to show the fields (the components that will see as data can be others that find components in the sqo_context)
		const current_sqo_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
	// set the current_sqo_context witht the context and sqo
		current_sqo_context.push(current_sqo,current_sqo_section,source)
	// section_record instance
		const current_section_record = await instances.get_instance({
				model 				: 'section_record',
				tipo 				: current_section_tipo,
				section_tipo		: current_section_tipo,
				section_id			: current_section_id,
				mode				: self.mode,
				lang				: self.section_lang,
				//context 			: current_context,
				sqo_context 		: current_sqo_context,
				paginated_key		: key,
		})


	//event_manager.publish('save_component_'+self.id, self)

			//event_manager.publish('update_dom_'+self.id, select.value)
	//event_manager.publish('add_element_'+self.id, new_locator_element)

	// rebuild and save the component
		self.save().then(api_response =>{
			event_manager.publish('add_element_'+self.id, current_section_record)
		})

	return true
}//end add_value
*/



/**
* GET_LAST_OFFSET
*/
const get_last_offset = function(self) {
	//console.log("[get_last_offset] self:",self);

	const pagination 	= self.pagination
	const total 		= pagination.total
	const limit 		= pagination.limit

	const _calculate = () => {

		if (total>0 && limit>0) {

			const total_pages = Math.ceil(total / limit)

			return parseInt( limit * (total_pages -1) )

		}else{

			return 0
		}
	}
	const offset_last = _calculate()
	console.log("++++ offset_last:",offset_last);

	return offset_last
}//end get_last_offset


