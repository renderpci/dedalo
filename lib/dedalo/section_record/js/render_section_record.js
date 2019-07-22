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
			const current_instance_node = await current_instance.render()

				console.log("current_instance_node-------:",current_instance_node);

			//const current_instance_node = current_instance.node
	
			//if (typeof current_instance_node==="undefined") {
			//	continue;
			//}

				
			// portal test
				if (self.mode==="list99" && current_instance.model==='component_portal') {
					//console.log("///////// current_instance_node:",current_instance.node);
					const section_records = current_instance_node.childNodes 
						console.log("section_records:",section_records);
					const len = section_records.length;
					for (let h = 0; h < len; h++) {
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
* @param array ar_instances
* @return DOM node wrapper
*/
render_section_record.prototype.list = async function(ar_instances) {
	
	const self = this	

	// section_record wrapper
		const wrapper = common.create_dom_element({
			element_type	: 'div',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})

	let n_colums 					= 0
	let n_relation_columns 			= 0
	const ar_grid_columns 			= []
	const components_with_relations = get_components_with_subcolumns()		
		
	// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			const current_instance 		= ar_instances[i]
			//const current_instance_node = current_instance.node
			const current_instance_node = await current_instance.render()

				//console.log("iterated element:",current_instance.section_tipo, current_instance.tipo, current_instance.model);
			
			wrapper.appendChild(current_instance_node)

			// grid . add columns
				if (components_with_relations.indexOf(current_instance.model)!==-1) {
				
					// grid . calculate recursively all children columns to set the total grid fr in current section_record
					n_colums = recursive_relation_columns(current_instance, self.datum)			

				}else{
					
					// grid 
					n_colums = 1
				}

				ar_grid_columns.push(n_colums)

		}//end for (let i = 0; i < ar_instances_length; i++)


	// grid css calculation assign
		const ar_grid_columns_fr = ar_grid_columns.map(n => n + "fr");
		
		Object.assign(
			wrapper.style, 
			{
				"grid-template-columns": ar_grid_columns_fr.join(" ")
			}
		)
	

	return wrapper
}//end render_section_record.prototype.list



/**
* RECURSIVE_RELATION_COLUMNS
* Updates var 'ar_relations_columns' recursively
*/
const recursive_relation_columns = function(current_instance, datum) {

	let n_relation_columns 	  = 0
	const component_childrens = datum.context.filter(instance => instance.parent===current_instance.tipo)

	if(component_childrens.length>0) {

		const components_with_relations = get_components_with_subcolumns()

		component_childrens.forEach(function(element){
	
			if (components_with_relations.indexOf(element.model)!==-1) {
				
				n_relation_columns += recursive_relation_columns(element, datum)
			}else{
				n_relation_columns++
			}
		})
	}else{
		n_relation_columns++
	}

	return n_relation_columns
}//end recursive_relation_columns



/**
* GET_COMPONENTS_WITH_SUBCOLUMNS
* Return an array of component models with relations (equivalent to method class.component_relation_common.php)
*/
const get_components_with_subcolumns = () => {
	return [
			'component_autocomplete',
			//'component_autocomplete_hi',
			//'component_check_box',
			//'component_filter',
			//'component_filter_master',
			'component_portal',
			//'component_publication',
			//'component_radio_button',
			//'component_relation_children',
			//'component_relation_index',
			//'component_relation_model',
			//'component_relation_parent',
			//'component_relation_related',
			//'component_relation_struct',
			//'component_select',
			//'component_select_lang'
	]
}//end get_components_with_subcolumns


