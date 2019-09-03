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
* RENDER_BASE
* Render basic nodes
* @return DOM node
*/
render_search.prototype.render_base = async function() {

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
			class_name		: 'filter_button button search link',
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
		self.search_container_selector = ui.create_dom_element({
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
			self.search_group_container = ui.create_dom_element({
					element_type		: 'div',
					class_name			: 'search_group_container',
					parent				: search_container_selection
			})
		
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
}//end render_base



/**
* RENDER_COMPONENTS_LIST
* Create dom elements to generate list of components and section groups of current section
* @see this.load_components_from_section
* @param object options
*	string options.section_tipo (section to load components and render)
*	dom element options.target_div (Target dom element on new data will be added)
*	array path (Cumulative array of component path objects)
*
* @return promise
*/
render_search.prototype.render_components_list = async function(options) {

	const self = this

	const section_tipo 	= options.section_tipo
	const target_div 	= options.target_div
	const path 		 	= options.path

	// load components from api
		const ar_elements = await self.load_components_from_section({
			section_tipo : section_tipo
		})
		//console.log("ar_elements:",ar_elements);

	// Clean target_div
		while (target_div.hasChildNodes()) {
			target_div.removeChild(target_div.lastChild);
		}

	// Fisrts item check
		if (typeof ar_elements[0]==="undefined") {
			console.error("Error on render_components_list. Empty ar_elements",ar_elements);
			return false
		}

	// Div container
		const top_parent = ui.create_dom_element({
			element_type	: 'ul',
			class_name 	 	: "search_section_container",
			parent 		    : target_div
		})

	// Div target_container
		const target_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 	 	: "search_section_container target_container",
			parent 		    : target_div
		})


	let section_group
	const len = ar_elements.length
	for (let i = 0; i < len; i++) {
		
		const element = ar_elements[i]

		switch (true) {

			case element.model==='section':
				// section title bar
				const section_bar = ui.create_dom_element({
					element_type : 'li',
					parent 		 : top_parent,
					class_name 	 : "search_section_bar_label ",
					inner_html 	 : element.label
				})
				section_bar.addEventListener("click", function(e){
				//this.parentNode.parentNode.innerHTML = ""
					if (target_div.classList.contains("target_container")) {
						target_div.innerHTML = ""
					}
					
				}, false);		
				break;

			case element.model==='section_group' || element.model==='section_tab':
				// Section group container (ul)
					section_group = ui.create_dom_element({
						element_type : 'ul',
						parent 		 : top_parent
					})
					// Section group label (li)
					ui.create_dom_element({
						element_type : 'li',
						parent 		 : section_group,
						class_name 	 : "search_section_group_label",
						inner_html 	 : element.label
					})

				break;

			default:
				// Calculated path (from dom position)
				const calculated_component_path = self.calculate_component_path( element, path )

				let class_names 				= "search_component_label element_draggable"
				let has_subquery_draggable 		= true
				if (element.model==="component_autocomplete") {
					// Autocompletes only
					// Pointer to open "children" section (portals and aurocompletes)											
					// Builds li element
					class_names = "search_component_label element_draggable"
				}else if (element.model==="component_portal"){
					class_names = "search_component_label"
					has_subquery_draggable 		= false
					
				}
				
				const component = ui.create_dom_element({
					element_type 			: 'li',
					parent 		 			: section_group,
					class_name 	 			: class_names,
					inner_html 				: element.label,
					draggable 	 			: has_subquery_draggable,
					data_set 				: { path 			: JSON.stringify(calculated_component_path),
												tipo 			: element.tipo,
												section_tipo 	: element.section_tipo
											  },
				})

				if (element.model!=="component_portal"){
					component.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
					//component.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
					component.addEventListener('drop',function(e){self.on_drop(this,e)})
				}

				// Portals and autocomplete only
				// Pointer to open "children" target section (portals and autocompletes)											
				// Builds li element
				if (element.target_section_tipo){

					component.classList.add('has_subquery')

					// Event on click load "children" section inside target_container recursively
					const target_section  = element.target_section_tipo[0] // Select first only		
					component.addEventListener("click", function(e){
						
						// component_tipo : component.component_tipo 
						self.render_components_list({
							section_tipo : target_section,
							target_div 	 : target_container,
							path 		 : calculated_component_path
						})
						// Reset active in current wrap
						const ar_active_now = top_parent.querySelectorAll("li.active")
						const len = ar_active_now.length
						for (let i = len - 1; i >= 0; i--) {
							ar_active_now[i].classList.remove('active');
						}
						// Active current
						this.classList.add('active');
					}, false);

				}
				break;
		}//end switch (true)

	}//end for (let i = 0; i < len; i++)

	// Scroll window to top always
		window.scrollTo(0, 0);


	return true
};//end render_components_list




render_search.prototype.render_editing_filter = async function(options){

}



render_search.prototype.render_search_buttons = async function(){

	const self = this

	// Add Send and reset buttons
		const search_group_container = self.search_group_container

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
				search.search(this, search_json_object).then(function(){
					// Close search div
					self.toggle_search_panel()
				})
			},false)

	return search_group_container
}//end render_search_buttons



/**
* BUILD_SEARCH_GROUP
* @return dom object
*/
render_search.prototype.build_search_group = async function( parent_div, options) {

	const self = this
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

		const all_search_groups = self.search_group_container.querySelectorAll(".search_group")
		const total  			= all_search_groups.length 		
		const counter 		  	= total + 1 
	
	// search_group
		const search_group = ui.create_dom_element({
			element_type 			: 'div',
			//id 					: options.is_root ? 'root_search_group' : null
			id 						: 'root_search_group',
			class_name 	 			: "search_group",
			data_set 				: {id:counter},
			parent 		 			: parent_div
		})

		search_group.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
		search_group.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
		search_group.addEventListener('drop',function(e){self.on_drop(this,e)})
		search_group.addEventListener('dragenter',function(e){self.on_dragenter(this,e)})
		search_group.addEventListener('dragover',function(e){self.on_dragover(this,e)})
		search_group.addEventListener('dragleave',function(e){self.on_dragleave(this,e)})

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


	
	return search_group
};//end build_search_group



/**
* BUILD_SEARCH_COMPONENT
* @return dom object
*/
render_search.prototype.build_search_component = function(parent_div, path_plain, current_value, q_operator) {
		
		const self = this

		const path 		 = JSON.parse(path_plain)
		const last_item  = path[path.length-1]
		const first_item = path[0]
	
		console.log("parent_div:",parent_div);
		// Create dom element before load html from trigger
		// search_component
		const search_component = ui.create_dom_element({
			element_type 			: 'div',
			parent 		 			: parent_div,
			class_name 	 			: "search_component",
			data_set 				: { path : path_plain },
			style 					: { display :"none" }		
		})

		// Load component script / css
		//component_common.load_component_class()


		const js_promise	= self.get_component_html({
								section_tipo 	: last_item.section_tipo,
								component_tipo 	: last_item.component_tipo,
								model 			: last_item.modelo,
								section_id 		: null,
								current_value 	: current_value,
								q_operator 		: q_operator || null
			}).then(function(response){								
				return
				const component_html = response
				
				// Inject component html
				search_component.innerHTML = component_html

				// Run inside scripts
				// Run scripts after dom changes are finish
				//setTimeout(function(){
					exec_scripts_inside(search_component);
				//},1)
				

				// Add button close
				const search_component_button_close = ui.create_dom_element({
					element_type 			: 'span',
					parent 		 			: search_component,
					//text_content 			: "X",
					class_name 	 			: "button_close"
				})
				search_component_button_close.addEventListener("click",function(e){
					self.remove_dom_component(search_component)
					// Set as changed
					self.update_state({state:'changed'})
				},false)

				// Add label component source if exists
				if (first_item!==last_item) {
					//console.log("first_item:",first_item);					
					const label_add = search_component.querySelector("span.label_add")
						if (label_add) {
							label_add.innerHTML = first_item.name +" "+ label_add.innerHTML
						}
				}

				// Check update_component_with_value_state
				// If component have any value or q_operator, set style with different color to remark it
				component_common.update_component_with_value_state( search_component.querySelector("div.wrap_component") )
				
				//search_component.style.display = "block"
				$(search_component).fadeIn(250) 
			})


		return js_promise
};//end build_search_component











/**
* RENDER_USER_PRESET_LIST
* Auxiliar function to create dom elements needed for build components presets list
* @return bool
*/
render_search.prototype.render_user_preset_list = async function(ar_elements, permissions, target_section_tipo) {

		const self = this

		const ar_nodes = []

		// clean wrap_div
			//while (wrap_div.hasChildNodes()) {
			//	wrap_div.removeChild(wrap_div.lastChild);
			//}

		// first item check
			if (typeof ar_elements[0]==="undefined") {

				//console.warn("[search.render_user_preset_list] Warning. Empty ar_elements received",ar_elements);
				return false
			}

		// Read cookie to track preset selected
			const cookie_name 				= "search_presets"
			let cookie_value 				= readCookie(cookie_name) || '{}'
				cookie_value 				= JSON.parse(cookie_value)
			let current_cookie_track 		= cookie_value[target_section_tipo] || false
				//return console.log("current_cookie_track:",current_cookie_track);

		let is_default = false
		const len = ar_elements.length
		for (let i = 0; i < len; i++) {

			let element = ar_elements[i]
			
			if(current_cookie_track===false) {
				// Default is defined by record data
				if (element.default===true && is_default===false) {
					is_default = true
				}else{
					is_default = false
				}				
			}else{
				// Default is defined by user selection (cookie)
				if (current_cookie_track==element.section_id) {
					is_default = true
					/*
					// Load current preset
					self.parse_json_query_obj_to_dom(null, JSON.parse(element.json_preset))
		
					// Update state
					self.update_state({
						state 					: 'unchanged',
						editing_section_id 		: element.section_id,
						editing_save_arguments 	: element.save_arguments
					})
					*/
				}else{
					is_default = false
				}
			}

			// Builds li element
				const li_element = ui.create_dom_element({
					element_type 	: 'li',
					class_name 	 	: (is_default===true) ? "selected" : "",
					data_set 		: {
						section_id  	: element.section_id,
						json_preset 	: element.json_preset,
						save_arguments 	: element.save_arguments
					}
				})
				// Button load preset (<)
				const icon_load = ui.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					class_name 	 			: "icon_bs link component_presets_button_load"
				})
				icon_load.addEventListener("click",function(e){
					self.load_search_preset(this)
				},false)

				// Span label name
				const span_name = ui.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					text_content 			: element.name,
					class_name 	 			: "css_span_dato",
					data_set 				: {
						parent 	 	 : element.section_id,
						section_tipo : "dd623",						
						tipo 	 	 : "dd624"
					}
				})
				if (permissions>=2) {
					span_name.addEventListener("click",function(e){
						self.edit_preset(this)
					},false)
				}

				// Button delete preset
				if (permissions>=2) {
				const icon_delete = ui.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					class_name 	 			: "icon_bs link component_presets_button_delete"
				})
				icon_delete.addEventListener("click",function(e){
					self.delete_preset(this)
				},false)
				}

				// DIV edit
				const div_edit = ui.create_dom_element({
					element_type 			: 'div',
					parent 		 			: li_element,
					class_name 	 			: "div_edit"
				})

			// add
				ar_nodes.push(li_element)

		}//end for (var i = 0; i < ar_elements.length; i++)


		return ar_nodes
};//end render_user_preset_list





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