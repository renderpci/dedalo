// imports
	import {component_common} from '../../common/js/component_common.js'
	//import {prueba} from '../../common/js/component_common.js'

	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import {ui} from '../../common/js/ui.js'	



export const component_autocomplete = function(){
	
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
		this.id

	return true
}//end component_autocomplete



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_autocomplete.prototype.init 	 			= component_common.prototype.init
	component_autocomplete.prototype.destroy 			= component_common.prototype.destroy
	component_autocomplete.prototype.save 	 			= component_common.prototype.save
	component_autocomplete.prototype.load_data 			= component_common.prototype.load_data
	component_autocomplete.prototype.load_datum 		= component_common.prototype.load_datum
	component_autocomplete.prototype.get_value 			= component_common.prototype.get_value
	component_autocomplete.prototype.set_value 			= component_common.prototype.set_value
	component_autocomplete.prototype.update_data_value	= component_common.prototype.update_data_value

	// render
	component_autocomplete.prototype.list 			= render_component_autocomplete.prototype.list
	component_autocomplete.prototype.edit 			= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.render 		= component_common.prototype.deep_render
	component_autocomplete.prototype.change_mode 	= component_common.prototype.change_mode



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.build  = async function(){

	const self = this

	// load data if is not already received as option
		if (!self.data || !self.data.value) {

			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)

			self.update_data_value(api_response)
		}


	const sqo_context 	= self.sqo_context
	const data_value 	= self.data.value
	const max_records 	= self.context.properties.max_records || 10
	const total_records = self.data.total_records
	
	// total records set
		self.total_records	= {
			result :{
				total : total_records
			}
		}

	if(total_records>max_records){

		const show 	= sqo_context.show
		const sqo 	= show.find(item => item.typo==='sqo')

		sqo.filter_by_locators = data_value
	}//end if(total_records>max_records)


	return true
}//end component_autocomplete.prototype.build


/**
* ADD_VALUE
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.add_value = async function(value) {
	
	const self = this

	const key = self.data.total_records

	// changed_data update
		self.data.changed_data = {
			action	: 'insert',
			key	  	: key,		
			value 	: value
		}

	// rebuild and save the component
		self.save().then(async api_response =>{
		
			//event_manager.publish('add_element_'+self.id, current_section_record)

			//change the autocomplete service to false and desactive it.
			if(self.autocomplete_active  === true){
				self.autocomplete.destroy()
				self.autocomplete_active = false
				self.autocomplete = null
			}
			

			const sqo = self.sqo_context.show.find(element => element.typo === 'sqo')
			const limit 		= sqo.limit
			const total 		= self.total_records
			const total_pages  	= Math.ceil(total / limit)
			const offset_last 	= limit * (total_pages -1)

			sqo.offset = offset_last

			self.total_records	= {
				result :{
					total : total
				}
			}

			self.render_paginator()
		})
}

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
		//self.update_data_value()
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
* RENDER_PAGINATOR
* @return promise
*/
component_autocomplete.prototype.render_paginator = async function() {

	const self = this

	// main container
	//const main = document.getElementById("main")
	//	  main.classList.add("loading")

	//const value = JSON.parse(JSON.stringify(self.data.value))

	// sqo_context
		const source = {
			typo 				: 'source',
			model 				: self.model,
			tipo 				: self.tipo,
			section_tipo 		: self.section_tipo,
			section_id 			: self.section_id,
			mode 				: self.mode,
			lang 				: self.lang,
			from_component_tipo	: self.tipo,
			//value 				: value
		}	
		self.sqo_context.show.push(source)

		
		const ar_node = self.node

		// clean and replace old dom nodes

		const ar_node_length = ar_node.length 

		for (var i = ar_node_length - 1; i >= 0; i--) {
			const current_node = ar_node[i]
			const parent_node = ar_node[i].parentNode

			// remove the all child nodes of the node
				while (current_node.firstChild) {
					current_node.removeChild(current_node.firstChild)
				}
		}

	// destroy the own instance for build the new one	
		self.destroy(false,true);

	//change the instance with the new data
		self.data = false
		await self.build()

	// empty instance nodes
		self.node = []
	
	// render
		const node = await self.render()
	
	// clean and replace old dom nodes
		for (var i = ar_node_length - 1; i >= 0; i--) {

			const current_node = ar_node[i]
			const parent_node = ar_node[i].parentNode

			// replace the node with the new render
				parent_node.replaceChild(node, current_node)
		 		//parent_node.classList.remove("loading", "hide")	 		
	 	}

 	return true
}//end render_paginator


