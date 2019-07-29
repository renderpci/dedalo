// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_publication = function() {
		
	return true
}//end render_component_publication



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_publication.prototype.list = async function() {

	const self = this

	// Options vars 
		const context 	= self.context
		const data 		= self.data
	
	// Value as string 
		const value_string = data.value //'component_publication not finish yet!' //data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_publication.prototype.edit = async function() {
	
	const self 	= this
	const value = self.data.value

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)	
		
			
			// events 
			//	// change. saves value on change
			//		input.addEventListener('change', (e) => {
			//			console.log("e:",e); return
			//			event_manager.publish('component_save', self)
			//		}, false)
			//	// focus. activate on focus with tab
			//		input.addEventListener('focus', (e) => {
			//			event_manager.publish('component_active', self)
			//		}, false)
			//	// click. only prevent click propagation to wrapper 
			//		input.addEventListener('click', (e) => {
			//				console.log("e:",e);
			//			e.stopPropagation()
			//		}, false)
		


	// events delegated
		// // click
 		// 	wrapper.addEventListener("click", e => {
 		// 		e.stopPropagation()
		// 
		// 		// selected_node. fix selected node
		// 		self.selected_node = wrapper
		// 	},false)

		// change
			wrapper.addEventListener("change", e => {
				e.stopPropagation()
	
				if (e.target.matches('input[type="checkbox"]')) {

					// selected_node. fix selected node
					self.selected_node = wrapper				
					
					const input 		 = e.target					
					const checked 		 = input.checked	
					const selected_value = (checked===true) ? self.data.datalist.filter(item => item.section_id==1)[0].value : self.data.datalist.filter(item => item.section_id==2)[0].value

					// changed_data update
					self.data.changed_data = {
						key	  : 0, 
						value : selected_value
					}
					self.update_data_value()

					// event for save the component
					event_manager.publish('save_component_'+self.id, self)
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, self)				
					
					return true
				}
			},false)

			
	return wrapper
}//end edit



/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = async function(self) {

	const value = self.data.value


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")
	
	// inputs_container 
		const inputs_container = common.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})
	
	// build values
		const inputs_value = (value.length<1) ? [] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {			
			input_element(i, inputs_value[i], inputs_container, self)
		}

	// buttons 
		const buttons_container = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})
	

	return content_data
}//end render_content_data



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	const input_id = self.id + "_" + new Date().getUTCMilliseconds()
			
	// li 
		const li = common.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// div_switcher
		const div_switcher = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'switcher_publication text_unselectable',
			parent 			: li
		})

	// input checkbox
		const input = common.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'ios-toggle',
			id 				: input_id,
			dataset 	 	: { key : i },
			value 			: JSON.stringify(current_value),
			parent 			: div_switcher
		})
			console.log("current_value:",current_value);
		if (current_value.section_id==1) {
			input.setAttribute("checked", true)
		}

	// switch_label
		const switch_label = common.create_dom_element({
			element_type	: 'label',
			class_name 		: 'checkbox-label',
			parent 			: div_switcher
		})
		switch_label.setAttribute("for",input_id)


	return li
}//end input_element



