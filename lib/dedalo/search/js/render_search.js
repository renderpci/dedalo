// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH
* Manages the component's logic and apperance in client side
*/
export const render_search = function() {

	return true	
}//end render_section



/**
* render
* Render nodes
* @return DOM node
*/
render_search.prototype.render = async function() {

	const self = this

	const section_tipo = self.section_tipo

	// dummy
		// const search_wrap = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	inner_html 		: "Hello search",
		// 	class_name		: 'full_width'
		// })
		// return search_wrap


	// wrapper . Top div where elements are placed
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_search full_width'
		})

	// filter button . Show and hide all search elements 
		const filter_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter_button',
			parent 			: wrapper
		})


	// search_global_container . Main search div
		const search_global_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_global_container hide99',
			parent 			: wrapper
		})

	// thesaurus add ons
		//if (self.mode==='thesaurus') {
			const thesaurus_options_node = thesaurus_options(self)
			search_global_container.appendChild(thesaurus_options_node)
		//}

	// button_save_preset . Hidden by default
		const button_save_preset = ui.create_dom_element({				
			element_type		: 'button',			
			class_name			: 'button_save_preset hide',
			text_content		: get_label["salvar"]+' '+get_label["cambios"],
			parent				: search_global_container
		})
		//add the Even onchage to the select, whe it change the section selected will be loaded
		button_save_preset.addEventListener('click',function(){
			self.save_preset(this)
		},false)
	
	// toggle_container_selector (Show/hide where section fields list are loaded)
		const toggle_container_selector = ui.create_dom_element({
			element_type		: 'div',
			class_name			: 'toggle_container_selector',
			text_content		: get_label["campos"],
			parent				: search_global_container			
		})
		//add the Even onchage to the select, whe it change the section selected will be loaded
		toggle_container_selector.addEventListener('click',function(){
			self.toggle_fields(this)
		},false)

	// search_container_selector
		const search_container_selector = ui.create_dom_element({
			element_type		: 'div',
			class_name			: 'search_container_selector',				
			parent				: search_global_container
		})


	// search_container_selection
	// CANVAS SELECTION search_container_selection. Where dragged fields are dragged and stored
		const search_container_selection = ui.create_dom_element({
				element_type		: 'div',
				class_name			: 'search_container_selection',
				parent				: search_global_container
			})
			const search_group_container = ui.create_dom_element({
					element_type		: 'div',
					class_name			: 'search_group_container',
					parent				: search_container_selection
			})
			console.log("search_container_selection:",search_container_selection);

		//build_search_group(self, search_global_container)
	

		//create the search_container_selection_presets
		//PRESETS SELECTION_PRESETS search_container_selection_presets. List of stored selection presets
			const search_container_selection_presets = ui.create_dom_element({
						element_type		: 'div',
						class_name			: 'search_container_selection_presets',
						parent				: search_global_container,
						dataset 			: {'section_tipo':section_tipo},
				})
				const component_presets_label = ui.create_dom_element({
						element_type		: 'div',
						parent				: search_container_selection_presets,
						class_name 			: 'component_presets_label',
						inner_html			: get_label["presets_de_busqueda"],
					})
					const button_new_preset = ui.create_dom_element({
							element_type		: 'span',
							class_name			: 'button_new_preset',
							parent				: component_presets_label,
							class_name 			: 'button_plus',
							inner_html			: '+',
					})
					button_new_preset.addEventListener('click',function(){
						self.new_preset(this)
					},false)
			//create the  new_preset_div
				const new_preset_div = ui.create_dom_element({
								element_type		: 'div',
								class_name			: 'new_preset_div',
								parent				: search_container_selection_presets,
								class_name 			: 'div_edit',
				})
			//create the  component_presets_list
				const component_presets_list = ui.create_dom_element({
								element_type		: 'ul',
								class_name			: 'component_presets_list',
								parent				: search_container_selection_presets,
				})
		//create the toggle_container_selection_presets
			const toggle_container_selection_presets = ui.create_dom_element({
								class_name			: 'toggle_container_selection_presets',
								element_type		: 'div',
								parent				: search_global_container,
								inner_html			: get_label["preset"],
				})
				toggle_container_selection_presets.addEventListener('click',function(){
					self.toggle_presets(this)
				},false)


	return wrapper
}//end render



/**
* BUILD_SEARCH_GROUP
* @return dom object
*/
const build_search_group = function(self, parent_div, options) {

	// Create defaults when no received options
		if (typeof options==="undefined") {
			options = {
				operator : '$and',
				is_root  : false
			}
		}

	// Check already created root_search_group
		//if (options.is_root===true && document.getElementById("root_search_group")) {
		//	return false
		//}

	const counter 			  = self.calculate_search_group_counter()		 
	const event_function 	  = [{'type':'dragstart','name':'search2.on_dragstart'}
								,{'type':'dragend','name':'search2.on_drag_end'}
								,{'type':'drop','name':'search2.on_drop'}
								,{'type':'dragenter','name':'search2.on_dragenter'}
								,{'type':'dragover','name':'search2.on_dragover'}
								,{'type':'dragleave','name':'search2.on_dragleave'}]								  

	// search_group
		const search_group = ui.create_dom_element({
			element_type 			: 'div',
			//id 					: options.is_root ? 'root_search_group' : null
			id 						: 'root_search_group',
			class_name 	 			: "search_group",
			data_set 				: {id:counter},
			custom_function_events	: event_function,			
			parent 		 			: parent_div
		})

	// Add operator
		const search_group_operator = ui.create_dom_element({
			element_type 			: 'div',
			parent 		 			: search_group,
			//text_content 			: options.operator.slice(1) + " "+counter,
			text_content 			: self.localize_operator(options.operator)+ " ["+counter+"]",
			data_set 				: { value : options.operator },
			class_name 	 			: "operator search_group_operator" + (options.operator==="$and" ? " and" : " or")
		})
		search_group_operator.addEventListener("click",function(e){
			//console.log("Clicked search_group_operator:",search_group_operator );
			self.toggle_operator_value(this)
			// Set initial state as unchanged
			self.update_state({state:'changed'})
		},false)

	// Add button close
		if (options.is_root===false) {
		const search_group_button_close = ui.create_dom_element({
			element_type 			: 'span',
			parent 		 			: search_group,
			//text_content 			: "X",
			class_name 	 			: "button_close"
		})
		search_group_button_close.addEventListener("click",function(e){
			self.remove_dom_component(search_group)
			// Set as changed
			self.update_state({state:'changed'})
		},false)
		}

	// Add button + group
		const search_group_button_plus = ui.create_dom_element({
			element_type 			: 'span',
			parent 		 			: search_group,
			//text_content 			: "X",
			class_name 	 			: "button_plus"
		})
		search_group_button_plus.addEventListener("click",function(e){
			self.add_search_group_to_dom(this, search_group)
			// Set as changed
			self.update_state({state:'changed'})
		},false)


	if (options.is_root===true) {
		
		// Add Send and reset buttons
			//const search_group_container = document.getElementById("search_group_container")			
			const search_group_container = parent_div.querySelector(".search_group_container")

			// max group
				const max_group = ui.create_dom_element({
					element_type 			: "div",
					parent 		 			: search_group_container,
					class_name 	 			: "max_group"
				})
			// max label
				const max_input_label = ui.create_dom_element({
					element_type 			: "span",
					parent 		 			: max_group,
					text_content 			: "max", // get_label["max"]
					class_name 	 			: "max_input_label"
				})	
			// max input
				const max_default = (SHOW_DEBUG===true) ? 10 : 10
				const max_input = ui.create_dom_element({
					element_type 			: "input",
					parent 		 			: max_group,
					value 					: max_default, // default 10
					class_name 	 			: "max_input" // btn css_max_rows
				})
			// load_rows event updates max_input value from search_options in dataset
				window.addEventListener('load_rows',function(){
					max_input.value = self.get_limit()
				})				
			// resert group
				const reset_group = ui.create_dom_element({
					element_type 			: "div",
					parent 		 			: search_group_container,
					class_name 	 			: "reset_group"
				})
			// Reset button
				const reset_button = ui.create_dom_element({
					element_type 			: "button",
					parent 		 			: reset_group,
					text_content 			: get_label["recargar"], //"Reset",
					class_name 	 			: "btn btn-warning button_reset",					
				})
				reset_button.addEventListener("click", function(e){
					self.reset()
				}, false)
			// Show all
				const show_all_button = ui.create_dom_element({
					element_type 			: "button",
					parent 		 			: reset_group,
					text_content 			: get_label["mostrar_todos"], //"mostrar_todos",
					class_name 	 			: "btn btn-warning button_reset button_show_all",					
				})
				show_all_button.addEventListener("click", function(e){
					self.show_all(this)
				}, false)
			// Submit button
				const submit_button = ui.create_dom_element({
					id 						: "button_submit",
					element_type 			: "button",
					parent 		 			: search_group_container,
					text_content 			: get_label["aplicar"], //"Submit",
					class_name 	 			: "btn btn-success button_submit"
				})
				submit_button.addEventListener("click", function(e){
					const search_json_object = self.get_search_json_object()
					search2.search(this, search_json_object).then(function(){
						// Close search div
						self.toggle_search_panel()
					})
				},false)
	}//end if (options.is_root===true)

	return search_group
};//end build_search_group




/**
* THESAURUS_OPTIONS
* Render and insert nodes into wrapper
*/
const thesaurus_options = function(self) {

	const thesaurus_search_selector = ui.create_dom_element({
		class_name 		: 'thesaurus_search_selector',
		element_type	: 'div'
	})

	// selector (list of thesaurus typologies)
		const thesaurus_typology_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: 'thesaurus_typology_selector',					
			parent			: thesaurus_search_selector					
		})
		//add the Even onchage to the select, whe it change the section selected will be loaded
		thesaurus_typology_selector.addEventListener('change',function(){						
			event_manager.publish('show_sections_checkboxes_'+self.id, {select_value : this.value})
		},false)

		// update_thesaurus_typology_selector
			self.events_tokens.push(
				event_manager.subscribe('update_thesaurus_typology_selector_'+self.id, (ar_sections_by_type) => {
					
					// set
					self.ar_sections_by_type = ar_sections_by_type

					// asign the options to the select
					for (const property in ar_sections_by_type) {

						const typology_id 	= ar_sections_by_type[property][0].typology;				
						const typology_name = ar_sections_by_type[property][0].typology_name;

						const select_option = ui.create_dom_element({
								element_type	: 'option',
								parent			: thesaurus_typology_selector,
								value			: typology_id,
								inner_html		: typology_name
						})
					}
				})
			)
		
	// checkbox list (sections of current selected thesaurus typology, like 'thematic')
		const thesaurus_search_selector_ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'thesaurus_search_selector_ul',					
			parent			: thesaurus_search_selector
		})

		// update_thesaurus_typology_selector
			self.events_tokens.push(
				event_manager.subscribe('show_sections_checkboxes_'+self.id, (options) => {

					const select_value 	= options.select_value
					const ar_data 		= self.ar_sections_by_type	
					const ul 			= thesaurus_search_selector_ul						
					
					// clean thesaurus_search_selector_ul
						while (ul.hasChildNodes()) {
							ul.removeChild(ul.lastChild);
						}

					const ar_items 		= ar_data[select_value]
					const ar_items_len 	= ar_items.length
					for (let i = 0; i < ar_items_len; i++) {
						
						const item = ar_items[i]

						// li
							const li = ui.create_dom_element({
								element_type 	: 'li',
								parent 		 	: ul
							})

						// checkbox
							const input = ui.create_dom_element({
								element_type 	: 'input',
								parent 		 	: li,				
								id 				: item.hierarchy_target_section_tipo,
								name 			: item.hierarchy_target_section_tipo,
								value 			: item.hierarchy_target_section_tipo,
							})
							input.type = "checkbox"
							input.checked = true

						// label
							const label = ui.create_dom_element({
								element_type 	: 'label',
								parent 		 	: li,
								inner_html 		: item.hierarchy_target_section_name,
								//class_name 		: "checkbox-inline"
							})
							label.setAttribute("for", item.hierarchy_target_section_tipo)
					}

					// Store selected value as cookie to recover later
					const cookie_name  = "selected_tipology"
					createCookie(cookie_name, select_value, 365)
				})
			)//end self.events_tokens.push

	return thesaurus_search_selector
}//end thesaurus_options