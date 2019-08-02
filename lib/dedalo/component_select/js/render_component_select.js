// import
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_select = function(component) {

	return true
}//end render_component_select



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_select.prototype.list = async function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		
	// Value as string 
		const value_string = data.value

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
render_component_select.prototype.edit = async function() {
	
	const self = this
	
	const value 	= self.data.value || []
	const datalist 	= JSON.parse(JSON.stringify(self.data.datalist)) || []
		

	// content_data	
		const content_data = document.createElement("div")
		
	// select
		const select = common.create_dom_element({
			element_type	: 'select',
			parent 			: content_data
		})	
	
	// add empty option at begining of array
		const empty_option = {
			label : '',
			value : null
		}
		datalist.unshift(empty_option);
	
	// build options
		const value_compare = value.length>0 ? value[0] : null		
		const length = datalist.length
		for (let i = 0; i < length; i++) {
			
			const datalist_item = datalist[i]
			const option = common.create_dom_element({
				element_type	: 'option',
				value 			: JSON.stringify(datalist_item.value),
				text_content 	: datalist_item.label,
				parent 			: select
			})
			// selected options set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				option.selected = true
			}			
		
		}
		/// events 
			// subscribe to 'update_dom': if the dom was changed by other dom elements the value will be changed
				self.events_tokens.push(
					event_manager.subscribe('update_dom_'+self.id, self.selector, (value) => {
						// change the value of the current dom element
						select.value = value
					})
				)

			// change. saves value on change the value
				select.addEventListener('change', (e) => {
					// set the selected node for change the css
					self.selected_node = wrapper
					// set the changed_data for replace it in the instance data

					// value
						let value = null
						
						if (select.value.length>0) {
							value = JSON.parse(select.value)
						}

					self.changed_data = { key	: 0, 
										  value : value }
					// event for save the component
					event_manager.publish('component_save_'+self.id, self)
					//event to update the dom elements of the instance
					event_manager.publish('update_dom_'+self.id, select.value)
				}, false)

			// focus. activate on focus with tab
				select.addEventListener('focus', (e) => {
					event_manager.publish('component_active', self)
				}, false)

			// click. only prevent click propagation to wrapper 
				select.addEventListener('click', (e) => {
					e.stopPropagation()
				}, false)


	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

	return wrapper
}//end edit


