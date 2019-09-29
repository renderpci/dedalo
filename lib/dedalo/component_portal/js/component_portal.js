// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_portal} from '../../component_portal/js/render_component_portal.js'
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'
	//import {data_manager} from '../../common/js/data_manager.js'
	import {component_autocomplete} from '../../component_autocomplete/js/component_autocomplete.js'



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

	return true
}//end component_portal



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_portal.prototype.init 	 			= component_common.prototype.init
	component_portal.prototype.destroy 				= common.prototype.destroy
	component_portal.prototype.save 	 			= component_common.prototype.save
	component_portal.prototype.refresh 				= common.prototype.refresh
	component_portal.prototype.load_data 			= component_common.prototype.load_data
	component_portal.prototype.load_datum 			= component_common.prototype.load_datum
	component_portal.prototype.get_value 			= component_common.prototype.get_value
	component_portal.prototype.set_value 			= component_common.prototype.set_value
	component_portal.prototype.update_data_value 	= component_common.prototype.update_data_value
	component_autocomplete.prototype.update_datum	= component_common.prototype.update_datum
	component_autocomplete.prototype.remove_value	= component_common.prototype.remove_value

	// from component_autocomplete (temp)
	component_portal.prototype.build 				= component_autocomplete.prototype.build
	component_portal.prototype.get_last_offset 		= component_autocomplete.prototype.get_last_offset

	// render
	component_portal.prototype.render 				= common.prototype.render
	component_portal.prototype.list 				= render_component_portal.prototype.list
	component_portal.prototype.edit 				= render_component_portal.prototype.edit
	component_portal.prototype.get_ar_instances 	= component_common.prototype.get_ar_instances




/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*//*
component_portal.prototype.render__DES = async function() {

	const self = this

	// load data before render
		//await self.load_data()
		//self.node = document.createElement("div"); return self
	// load datum before render
		//await self.load_datum()

	// iterate values
		const value = self.data.value || []

		const group_by = key => array =>
		  array.reduce((objectsByKeyValue, obj) => {
		    const value = obj[key];
		    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
		    return objectsByKeyValue;
		}, {});
		const group_section_tipo = group_by('section_tipo')
		const grouped_sections 	 = group_section_tipo(value)

		//if (Object.entries(grouped_sections).length === 0 && grouped_sections.constructor === Object) {
		//	return self
		//}

	// iterate section records
		const ar_section_record = []
		for(const current_section_tipo in grouped_sections) {

			const current_value		= grouped_sections[current_section_tipo]
			const current_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo)
				//console.log("---portal rows value:",current_value);
				//console.log("---current_context:",current_context);

			const process_locators = async function (current_value) {

				for (const item of current_value) {

					const locator 			 = item
					const current_section_id = locator.section_id
					const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)

					// section_record instance
					const current_section_record = await instances.get_instance({
							model 				: 'section_record',
							tipo 				: current_section_tipo,
							section_tipo		: current_section_tipo,
							section_id			: current_section_id,
							mode				: self.mode,
							lang				: self.section_lang,
							key_suffix 			: 'portal_' + self.tipo +'_'+ self.section_id, // note this value affects the instance id

							context 			: current_context,
							data				: current_data,
							datum 				: self.datum
						})

					await current_section_record.render()
					ar_section_record.push(current_section_record)
				}

				return true
			}
			await process_locators(current_value)

			// const current_value_length = current_value.length
 			// for (let i = 0; i < current_value_length; i++) {
 			//
 			// 	const locator 			 = current_value[i];
 			// 	const current_section_id = locator.section_id
 			// 	const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
 			//
 			// 	// section_record instance
 			// 	const current_section_record = await instances.get_instance({
 			// 			model 				: 'section_record',
 			// 			tipo 				: current_section_tipo,
 			// 			section_tipo		: current_section_tipo,
 			// 			section_id			: current_section_id,
 			// 			mode				: self.mode,
 			// 			lang				: self.section_lang,
 			// 			parent_section_id 	: self.section_id, // note this value affects the instance id
 			//
 			// 			context 			: current_context,
 			// 			data				: current_data,
 			// 			datum 				: self.datum
 			// 		})
 			//
			// 		await current_section_record.render()
			// 		ar_section_record.push(current_section_record)
			//
			// }//end for (let i = 0; i < current_value_length; i++)

		}//end for(const current_section_tipo in grouped_sections)
		//console.log("+++portal ar_section_record:",ar_section_record, self.section_id);

	// render using external proptotypes of 'render_component_portal'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_portal
				component_portal.prototype.list = render_component_portal.prototype.list
				const list_node = await self.list(ar_section_record)
				// debug
				if (self.node) {
					console.error("XXX WARN: Already exists node in portal mode list!", self.node, list_node);
				}
				//if (self.node) {
				//	// replace old node
				//	self.node.parentNode.replaceChild(list_node, self.node)
				//}else{
					// set
					self.node = list_node
				//}
				break

			case 'edit':
			default :
				// add prototype edit function from render_component_portal
				component_portal.prototype.edit = render_component_portal.prototype.edit
				const edit_node = await self.edit(ar_section_record)
				if (self.node) {
					// replace old node
					self.node.parentNode.replaceChild(edit_node, self.node)
				}else{
					// set
					self.node = edit_node
				}
				break
		}

	return self
}//end render
*/



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*//*
component_portal.prototype.update_data_value_from_dom = function() {

	const self = this
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value  = []
		for (let i = 0; i < ar_inputs.length; i++) {
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data instance
		self.data.value = ar_value

	return true
}//end update_data_value_from_dom
*/


