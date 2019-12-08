// imports
	import {ui} from '../../common/js/ui.js'
	import event_manager from '../../page/js/page.js'


/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_section_record = function() {

	return true
}//end render_section_record



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_record.prototype.edit = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			label 		 : null,
			content_data : current_content_data
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data_edit
*/
const content_data_edit = async function(self) {

	const ar_instances = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")

	// add all section_record rendered nodes
		// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			if (typeof ar_instances[i]==="undefined") {
				console.warn(`Skipped undefined instance key ${i} from ar_instances:`, ar_instances);
					console.log("self:",self);
				continue;
			}

			const current_instance 		= ar_instances[i]
			const current_instance_node = await current_instance.render()

			// get the parent node inside the context
			const parent_tipo = current_instance.parent

			// if the item has the parent the section_tipo is direct children of the section_record
			// else we has other item parent
			if(parent_tipo===self.section_tipo || self.mode==="list"){

				content_data.appendChild(current_instance_node)

			}else{

				// component_filter case . Send to inspector
					if (current_instance.model==='component_filter') {

						ui.place_element({
							source_node 		: current_instance_node,
							source_instance 	: self,
							target_instance 	: self.caller.inspector,
							container_selector 	: ".project_container",
							target_selector 	: ".wrapper_component.component_filter",
							place_mode 			: 'replace' // add | replace
						})

						continue;
					}

				// get the parent instance like section group or others
				const parent_instance = ar_instances.find(instance => instance.tipo===parent_tipo
					&& instance.section_id===current_instance.section_id
					&& instance.section_tipo===current_instance.section_tipo)
				// if parent_istance exist go to apped the current instace to it.
				if(parent_instance){

					const parent_node = parent_instance.node[0] || await parent_instance.render()

					// move the node to his father
					if (parent_instance.type==="grouper" && self.mode!=="list") {
						// append inside body div of groupper
						if (!parent_node || !current_instance_node) {
							console.log("---error: parent_node:",parent_node, ' - current_instance_node:',current_instance_node);
						}
							//console.log("============== parent_node:",parent_node);
							//console.log("============== parent_node.children[1]:",parent_node.children[1]);
							//console.log("==============  current_instance_node:",current_instance_node);
						parent_node.children[1].appendChild(current_instance_node)
					}else{
						parent_node.appendChild(current_instance_node)
					}
				}else{
					// direct attach (list mode and safe fallback)
					content_data.appendChild(current_instance_node)
				}
			}
		}


	return content_data
}//end content_data_edit



/**
* LIST
* Render node for use in list
* @param array ar_instances
* @return DOM node wrapper
*/
render_section_record.prototype.list = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const ar_instances = await self.get_ar_instances()

	// section_record wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		})

	// add ID column always
		const id_column = ui.create_dom_element({
			element_type	: 'div',
			text_content 	: self.section_id,
			parent			: wrapper
		})

	let n_colums 					= 0
	let n_relation_columns 			= 0
	const ar_grid_columns 			= []
		  ar_grid_columns.push(1) // add id column
	const components_with_relations = get_components_with_subcolumns()

	// loop the instances for select the parent node
		const ar_instances_length = ar_instances.length
		for (let i = 0; i < ar_instances_length; i++) {

			const current_instance = ar_instances[i]

			if (typeof current_instance==="undefined") {
				console.error("Undefined current_instance:", current_instance, i, ar_instances);
				continue;
			}

			const current_instance_node = await current_instance.render()

			// add
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

	// dd_info
		const component_info = self.get_component_info()
		if (component_info){
			const info_value = component_info.value.join('')
			const info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info',
				inner_html		: info_value
			})
			wrapper.appendChild(info)
		}


	// events
		wrapper.addEventListener("click", (e) => {
			e.stopPropagation()

			e.target.classList.add("row_active")
		},false)


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


