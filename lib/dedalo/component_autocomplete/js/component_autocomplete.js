// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'
	import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
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
	component_autocomplete.prototype.init 	 	= component_common.prototype.init
	component_autocomplete.prototype.save 	 	= component_common.prototype.save
	component_autocomplete.prototype.load_data 	= component_common.prototype.load_data
	component_autocomplete.prototype.load_datum = component_common.prototype.load_datum
	component_autocomplete.prototype.get_value 	= component_common.prototype.get_value
	component_autocomplete.prototype.set_value 	= component_common.prototype.set_value



/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_autocomplete.prototype.render = async function() {
		
	const self = this

	// load data before render
		await self.load_data()
		//self.node = document.createElement("div"); return self
	// load datum before render
		await self.load_datum()

	// iterate values
		const value 		  = self.data.value || []
		const value_length 	  = value.length
		const render_promises = []
		
		const group_by = key => array =>
		  array.reduce((objectsByKeyValue, obj) => {
		    const value = obj[key];
		    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
		    return objectsByKeyValue;
		}, {});
		const group_section_tipo = group_by('section_tipo')		
		const grouped_sections 	 = group_section_tipo(value)
			//console.log("--grouped_sections:",grouped_sections);
		// iterate sections
		for(const current_section_tipo in grouped_sections) {
			
			const current_value		= grouped_sections[current_section_tipo]
			const current_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo)
				//console.log("---current_value:",current_value);
				//console.log("---current_context:",current_context);
			const current_value_length = current_value.length
			for (let i = 0; i < current_value_length; i++) {

				const locator 			 = current_value[i]; 	console.log("locator:",locator);
				const current_section_id = locator.section_id
				const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
					console.log("---current_data:",current_data);
				const current_section_record = await instances.get_instance({
						model 			: 'section_record',
						tipo 			: current_section_tipo,
						section_tipo	: current_section_tipo,
						section_id		: current_section_id,
						mode			: self.mode,
						lang			: self.section_lang,
						context 		: current_context,
						data			: current_data,
						datum 			: self.datum
					})					

					const render_promise = current_section_record.render()					
					render_promises.push(render_promise)
			}

			// // section instance
			// 	const current_section = await instances.get_instance({
			// 		model 			: 'section',
			// 		tipo 			: current_section_tipo,
			// 		section_tipo	: current_section_tipo,
			// 		section_id		: self.section_id,
			// 		mode			: self.mode,
			// 		lang			: self.lang,
			// 		context 		: self.context,
			// 		datum 			: datum
			// 	})			

		}//end for(const current_section_tipo in grouped_sections)

 	// promise all 
		return Promise.all(render_promises).then( async function(ar_section_record){

			// render using external proptotypes of 'render_component_autocomplete'
				const mode = self.mode
				switch (mode){
					case 'list':
						// add prototype list function from render_component_autocomplete
						component_autocomplete.prototype.list = render_component_autocomplete.prototype.list			
						const list_node = await self.list(ar_section_record)
						if (self.node) {
							// replace old node
							self.node.parentNode.replaceChild(list_node, self.node)
						}
						// set
						self.node = list_node
						break
				
					case 'edit':
					default :
						// add prototype edit function from render_component_autocomplete
						component_autocomplete.prototype.edit = render_component_autocomplete.prototype.edit
						const edit_node = await self.edit(ar_section_record)
						if (self.node) {	
							// replace old node contents
							self.node.parentNode.replaceChild(edit_node, self.node)
						}else{
							// set
							self.node = edit_node
						}												
						// const edit_node = await self.edit(ar_section_record)
						// if (self.node) {							
						// 	// clean
						// 		while (self.node.firstChild) {
						// 			self.node.removeChild(self.node.firstChild);
						// 		}
						// 	// set children nodes
						// 		while (edit_node.firstChild) {
						// 			self.node.appendChild(edit_node.firstChild);
						// 		}
						// }else{
						// 	// set
						// 		self.node = edit_node
						// }
						break
				}

			return self
		})
}//end render







/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*/
component_autocomplete.prototype.update_data_value_from_dom = function() {

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


