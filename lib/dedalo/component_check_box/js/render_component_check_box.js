// import
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_check_box = function() {

	return true
}//end render_component_check_box



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_check_box.prototype.list = function() {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const value 			= data.value || []
		
	// Value as string 
		const value_string = value.join(' , ')

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_check_box.prototype.edit = function() {
	
	const self = this

	const value		= self.data.value || []
	const datalist 	= self.data.datalist || []
	
	/*
	// Options vars 
		const context 			= self.context
		const data 				= self.data || []
		const datalist 			= self.data.datalist || []
		const value 			= data.value || []
		const label 			= context.label		
		const model 			= self.model
		const mode 				= 'edit'
		const tipo 				= context.tipo
		const section_id 		= data.section_id
		const id 				= self.id || 'id is not set'

	// Value as string
		if (data.length > 0) {
			const value_string = value.join(' | ')
		}
	*/	

	// content_data	
		const content_data = document.createElement("div")
		
	// create ul
		const ul = common.create_dom_element({
			element_type	: 'ul',		
			parent 			: content_data
		})

	// build options				
		const datalist_length 	= datalist.length
		const value_length 		= value.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			// create li
				const li = common.create_dom_element({
					element_type	: 'li',
					parent 			: ul
				})
			
			const option = common.create_dom_element({
					element_type	: 'input',
					type 			: 'checkbox',
					id 				: self.id +"_"+ i,
					value 			: JSON.stringify(datalist_item.value),					
					parent 			: li
				})	
				// checked option set on match
				for (let j = 0; j < value_length; j++) {
					if (value[j] && datalist_item.value &&
						value[j].section_id===datalist_item.value.section_id &&
						value[j].section_tipo===datalist_item.value.section_tipo
						) {
							option.checked = 'checked'
					}
				}
				//option.addEventListener('change', ()=> self.component.save(), false);
			const label_string = (SHOW_DEBUG===true) ? datalist_item.label + " [" + datalist_item.section_id + "]" : datalist_item.label

			const option_label = common.create_dom_element({
				element_type	: 'label',
				text_content 	: label_string,
				parent 			: li
			})
			option_label.setAttribute("for", self.id +"_"+ i)

			//if(SHOW_DEBUG===true) {
			//	const notes = common.create_dom_element({
			//		element_type	: 'span',
			//		text_content 	: '[' + datalist_item.section_id + ']',
			//		parent 			: option_label
			//	})
			//}
		}


	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)


	// events delegated
		// change
			wrapper.addEventListener("change", e => {
				e.stopPropagation()

				// selected_node. fix selected node
				self.selected_node = wrapper

				if (e.target.matches('input[type="checkbox"]')) {

					const input = e.target
					const value = JSON.parse(input.value)

					if (input.checked===true) {
						const added = self.add_value(value)
						if (added===true) {
							// event for save the component
							event_manager.publish('rebuild_nodes_'+self.id, self)
							event_manager.publish('component_save_'+self.id, self)
						}
					}else{
						const removed = self.remove_value(value)
						if (removed===true) {
							// event for save the component
							event_manager.publish('rebuild_nodes_'+self.id, self)
							event_manager.publish('component_save_'+self.id, self)
						}
					}
					
					return true
				}
			},false)


	return wrapper
}//end edit


