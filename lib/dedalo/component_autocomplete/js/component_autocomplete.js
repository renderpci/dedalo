// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'



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
	component_autocomplete.prototype.list 		= render_component_autocomplete.prototype.list
	component_autocomplete.prototype.edit 		= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.render 	= component_common.prototype.deep_render




/**
* ADD_VALUE
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.add_value = async function(value) {

	const self = this

	const ar_found = self.data.value.filter(item => item.section_id===value.section_id && item.section_tipo===value.section_tipo)
	if (ar_found.length>0) {
		console.log("Ignored to add value because already exists:", value);
		return false
	}

	const key = self.data.value.length

	// changed_data update
		self.data.changed_data = {
			key	  : key,
			value : value
		}
		self.update_data_value()
	// get the locator values
		const current_section_tipo 	= value.section_tipo
		const current_section_id 	= value.section_id

	// get and clone full the sqo_context of the main object
		const search_sqo_context = JSON.parse(JSON.stringify(self.sqo_context))
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
	// set the filter to the sqo
		current_sqo.filter = filter
	// get the context to show the fields (the components that will see as data can be others that find components in the sqo_context)
		const current_sqo_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
	// set the current_sqo_context witht the context and sqo
		current_sqo_context.push(current_sqo,current_sqo_section)
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
		})
	// create new locator element for send to the add_element event
		const new_locator_element = {
			key: key,
			current_section_record: current_section_record
		}

	
	event_manager.publish('save_component_'+self.id, self)
	//event_manager.publish('update_dom_'+self.id, select.value)
	event_manager.publish('add_element_'+self.id, new_locator_element)

	return true
}//end add_value



/**
* REMOVE_VALUE
* @param object value (locator)
* @return bool
*/
component_autocomplete.prototype.remove_value = function(value) {

	const self = this

	let deleted = false
	
	const key = self.data.value.findIndex( (item) => {		
		return (item.section_id===value.section_id && item.section_tipo===value.section_tipo)
	})

	if (key===-1) {
		console.error("Error. item not found in values:", value);
	}else{
		// changed_data update
		self.data.changed_data = {
			key	  : key,
			value : null //value
		}
		//self.data.value.splice(key, 1)
		self.update_data_value()
		deleted = true
	}	
	

	return deleted
}//end remove_value

