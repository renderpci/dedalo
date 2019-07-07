/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_section_record = function(options) {

	this.model = "section_record"

	this.context 			= options.context
	this.data 				= options.data

}//end render_section_record



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_record.prototype.edit = function(ar_instances) {
	
	const self = this

	// section_record wrapper
		const wrapper = common.create_dom_element({
			element_type	: 'div',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})
			
		// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			const current_instance 		= ar_instances[i]
			const current_instance_node = current_instance.node
			// get the parent node inside the context
			const parent_tipo 			= current_instance.parent

			// if the item has the parent the section_tipo is direct children of the section_record
			// else we has other item parent
			if(parent_tipo===self.section_tipo){
				
				wrapper.appendChild(current_instance_node)
			
			}else{
				// get the parent instace like section group or others
				const parent_instance = ar_instances.filter(instance => instance.tipo===parent_tipo && instance.section_id===current_instance.section_id && instance.section_tipo===current_instance.section_tipo)
				// if parent_istance exist go to apped the current instace to it.
				if(parent_instance.length>0){
					const parent_node = parent_instance[0].node
					// move the node to his father
					parent_node.appendChild(current_instance_node)
				}
			}
		}


	return wrapper
}//end edit



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_section_record.prototype.list = render_section_record.prototype.edit


