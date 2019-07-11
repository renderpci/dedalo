// imports
	
	
	
/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_section_record = function() {

	return true
}//end render_section_record



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_record.prototype.edit = async function(ar_instances) {
	
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

			//if (typeof current_instance_node==="undefined") {
			//	continue;
			//}

				
			// portal test
				if (self.mode==="list99" && current_instance.model==='component_portal') {
					//console.log("///////// current_instance_node:",current_instance.node);
					const section_records = current_instance_node.childNodes 
						console.log("section_records:",section_records);
					for (var h = 0; h < section_records.length; h++) {
						const current_sr = section_records[h]
						//if (h===0) {
						//	while (current_sr.firstChild) {
						//		wrapper.appendChild(current_sr.firstChild)
						//	}
						//}
						wrapper.appendChild(current_sr)
					}					
					continue
				}
				

			// get the parent node inside the context
			const parent_tipo = current_instance.parent

			// if the item has the parent the section_tipo is direct children of the section_record
			// else we has other item parent
			if(parent_tipo===self.section_tipo || self.mode==="list"){
				
				wrapper.appendChild(current_instance_node)
			
			}else{
				// get the parent instace like section group or others
				const parent_instance = ar_instances.filter(instance => instance.tipo===parent_tipo 
					&& instance.section_id===current_instance.section_id 
					&& instance.section_tipo===current_instance.section_tipo)[0]
				// if parent_istance exist go to apped the current instace to it.
				if(parent_instance){
					
					const parent_node = parent_instance.node
			
					// move the node to his father					
					if (parent_instance.type==="grouper" && self.mode!=="list") {
						// append inside body div of groupper
						parent_node.children[1].appendChild(current_instance_node)
					}else{
						parent_node.appendChild(current_instance_node)
					}					
				}else{
					// direct attach (list mode and safe fallback)
					wrapper.appendChild(current_instance_node)
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


