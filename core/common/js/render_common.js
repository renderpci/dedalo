/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_COMPONENTS_LIST
* Create dom elements to generate list of components and section groups of current section
* @see this.get_section_elements_context
* @param object options
*	string options.section_tipo (section to load components and render)
*	dom element options.target_div (Target dom element on new data will be added)
*	array path (Cumulative array of component path objects)
*
* @return promise bool
*/
export const render_components_list = async function(options) {
	// console.log("render_components_list options:", options);

	// options
		const self				= options.self
		const section_tipo		= options.section_tipo
		const target_div		= options.target_div
		const path				= options.path
		const section_elements	= options.section_elements

	// load components from api. this function could be defined by the caller or use the standard function in common.js
		// const section_elements = await self.get_section_elements_context({
		// 	section_tipo : section_tipo
		// })

	// clean target_div
		while (target_div.hasChildNodes()) {
			target_div.removeChild(target_div.lastChild);
		}

	// First item check
		if (!section_elements || typeof section_elements[0]==="undefined") {
			console.warn(`[render_components_list] Error. Empty section_elements on get_section_elements_context ${section_tipo}`, section_elements);
			return false
		}

	// list_container
		const list_container = ui.create_dom_element({
			element_type	: 'ul',
			// class_name	: "search_section_container",
			class_name		: "list_container",
			parent			: target_div
		})

	// target_list_container
		const target_list_container = ui.create_dom_element({
			element_type	: 'ul',
			// class_name	: "search_section_container target_container",
			class_name		: "list_container target_list_container",
			parent			: target_div
		})

	let section_group

	const len = section_elements.length
	for (let i = 0; i < len; i++) {
		const element = section_elements[i]

		switch (true) {

			case element.model==='section':
				// section title bar
				const section_bar = ui.create_dom_element({
					element_type	: 'li',
					// class_name	: "search_section_bar_label",
					class_name		: "section_bar_label",
					inner_html		: element.label,
					parent			: list_container,
				})
				if (path.length===0) {
					section_bar.classList.add('close_hide')
				}
				section_bar.addEventListener("click", function(e){
					if (target_div.classList.contains("target_list_container")) {
						target_div.innerHTML = ""
					}
				})
				break;

			case element.model==='section_group' || element.model==='section_tab':
				// Section group container (ul)
				section_group = ui.create_dom_element({
					element_type : 'ul',
					parent 		 : list_container
				})
				// Section group label (li)
				ui.create_dom_element({
					element_type	: 'li',
					parent			: section_group,
					// class_name	: "search_section_group_label",
					class_name		: "section_group_label",
					inner_html		: element.label
				})
				break;

			default:
				// Calculated path (from dom position)
				const calculated_component_path = self.calculate_component_path( element, path )

				// const class_names	= "search_component_label element_draggable"
				const class_names		= "component_label element_draggable"
				const is_draggable		= true
				// if (element.model==="component_portal") {
				// 	// Autocompletes only
				// 	// Pointer to open "children" section (portals and autocompletes)
				// 	// Builds li element
				// 	class_names = "search_component_label element_draggable"
				// }else if (element.model==="component_portal"){
				// 	class_names = "search_component_label"
				// 	is_draggable 		= false
				// }

				const section_id	= self.get_section_id() // defined by the caller, sometimes "tmp_seach_" sometimes "list_" etc
				const component		= ui.create_dom_element({
					element_type	: 'li',
					parent			: section_group,
					class_name		: class_names,
					inner_html		: element.label,
					draggable		: is_draggable,
					data_set		: {
						path			: JSON.stringify(calculated_component_path),
						tipo			: element.tipo,
						section_tipo	: element.section_tipo,
						section_id		: section_id
					}
				})
					component.ddo	= element
					component.path	= calculated_component_path
				// if (element.model!=="component_portal"){
					component.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
					//component.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
					component.addEventListener('drop',function(e){self.on_drop(this,e)})
				// }

				// Portals and autocomplete only
				// Pointer to open "children" target section (portals and autocompletes)
				// Builds li element
					if (element.target_section_tipo){

						component.classList.add('has_subquery')

						// Event on click load "children" section inside target_list_container recursively
						const target_section = element.target_section_tipo[0] // Select first only
						component.addEventListener("click", async function(e){
							// section_elements_context
								const current_section_elements = await self.get_section_elements_context({
									section_tipo : target_section
								})
							// recursion render_components_list
								render_components_list({
									self				: self,
									section_tipo		: target_section,
									target_div			: target_list_container,
									path				: calculated_component_path,
									section_elements	: current_section_elements
								})
							// Reset active in current wrap
								const ar_active_now	= list_container.querySelectorAll("li.active")
								const len			= ar_active_now.length
								for (let i = len - 1; i >= 0; i--) {
									ar_active_now[i].classList.remove('active');
								}
							// Active current
							this.classList.add('active');
						})
					}
				break;
		}//end switch (true)

	}//end for (let i = 0; i < len; i++)

	// Scroll window to top always
		window.scrollTo(0, 0);


	return true
};//end render_components_list
