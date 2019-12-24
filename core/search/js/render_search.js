/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {create_cookie, read_cookie, erase_cookie} from '../../common/js/utils/cookie.js'



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
* @return DOM node wrapper
*/
render_search.prototype.render_base = async function() {

	const self = this

	const section_tipo = self.section_tipo

	// wrapper . Top div where elements are placed
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_search full_width'
		})
		// set
		self.wrapper = wrapper

	// filter button . Show and hide all search elements
		const filter_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter_button button search link',
			parent 			: wrapper
		})
		.addEventListener("click", () => {
			toggle_search_panel(self)
		})

	// search_global_container . Main search div
		const search_global_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_global_container hide',
			parent 			: wrapper
		})
		// set
		self.search_global_container = search_global_container

	// thesaurus add ons
		if (self.mode==='thesaurus') {
			const thesaurus_options_node = render_thesaurus_options(self)
			search_global_container.appendChild(thesaurus_options_node)
		}

	// button save_preset . Hidden by default
		const button_save_preset = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_save_preset hide99',
			text_content	: get_label["salvar"]+' '+get_label["cambios"],
			parent			: search_global_container
		})
		.addEventListener('click',function(){
			self.save_preset(this)
		},false)

	// button toggle fields (Show/hide where section fields list are loaded)
		const toggle_container_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toggle_container_selector',
			text_content	: get_label["campos"],
			parent			: search_global_container
		})
		.addEventListener('click',function(){
			toggle_fields(self)
		},false)

	// fields list . List of section fields usable in search
		const search_container_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_container_selector display_none',
			parent			: search_global_container
		})
		// set
		self.search_container_selector = search_container_selector

	// search canvas. Where fields are dragged and stored
		const search_container_selection = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_container_selection',
			parent			: search_global_container
		})
		const search_group_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_group_container',
			parent			: search_container_selection
		})
		// Set
		self.search_group_container = search_group_container

	// user presets. List of stored selection presets
		const search_container_selection_presets = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container_selection_presets display_none',
				dataset 		: {'section_tipo':section_tipo},
				parent			: search_global_container
			})
			// set
			self.search_container_selection_presets = search_container_selection_presets
			const component_presets_label = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'component_presets_label',
				inner_html		: get_label["presets_de_busqueda"],
				parent			: self.search_container_selection_presets
			})
			const button_new_preset = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button link add',
				parent			: component_presets_label
			})
			.addEventListener('click',function(){
				self.new_preset(this)
			},false)
		// create the new_preset_div
			const new_preset_div = ui.create_dom_element({
				element_type		: 'div',
				class_name 			: 'new_preset_div',
				parent				: self.search_container_selection_presets
			})
		// create the  component_presets_list
			const component_presets_list = ui.create_dom_element({
				element_type		: 'ul',
				class_name			: 'component_presets_list',
				parent				: self.search_container_selection_presets,
			})

	// button toggle user presets
		const toggle_container_selection_presets = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toggle_container_selection_presets',
			inner_html		: get_label["preset"],
			parent			: search_global_container
		})
		.addEventListener('click',function(){
			toggle_presets(self)
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

	// First item check
		if (!ar_elements || typeof ar_elements[0]==="undefined") {
			console.error(`[render_components_list] Error. Empty ar_elements on load_components_from_section ${section_tipo}`, ar_elements);
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
}//end render_components_list



/**
* RENDER_FILTER
*/
render_search.prototype.render_filter = async function(options){

	const self = this

	const editing_preset 			= options.editing_preset
	const clean_q 					= options.clean_q || false
	const allow_duplicates 			= options.allow_duplicates || false
	const search_group_container 	= self.search_group_container

	// Clean target_div
		while (search_group_container.hasChildNodes()) {
			search_group_container.removeChild(search_group_container.lastChild);
		}

	// Reset resolved
		this.ar_resolved_elements = []

	// Build global_group
		self.build_dom_group(editing_preset, search_group_container, {
			is_root 		 : true,
			clean_q 		 : clean_q,
			allow_duplicates : allow_duplicates
		})
		//console.log("global_group:",global_group);


	return true
}//end render_filter



/**
* RENDER_SEARCH_BUTTONS
* @return search_buttons_container dom object
*/
render_search.prototype.render_search_buttons = function(){

	const self = this

	const search_buttons_container = ui.create_dom_element({
			element_type : "div",
			class_name 	 : "search_buttons_container",
			parent 		 : self.search_group_container
		})

	// max group
		const max_group = ui.create_dom_element({
			element_type 			: "div",
			class_name 	 			: "max_group",
			parent 		 			: search_buttons_container
		})
	// max label
		const max_input_label = ui.create_dom_element({
			element_type 			: "span",
			class_name 	 			: "max_input_label",
			text_content 			: "max", // get_label["max"]
			parent 		 			: max_group
		})
	// max input
		const max_input = ui.create_dom_element({
			element_type 			: "input",
			class_name 	 			: "max_input", // btn css_max_rows
			value 					: self.limit, // default 10
			parent 		 			: max_group,
		})
		max_input.addEventListener('change',function(){
			self.limit = parseInt(max_input.value)
		})
	// reset group
		const reset_group = ui.create_dom_element({
			element_type 			: "div",
			class_name 	 			: "reset_group",
			parent 		 			: search_buttons_container
		})
	// Reset button
		const reset_button = ui.create_dom_element({
			element_type 			: "button",
			class_name 	 			: "button link reload",
			text_content 			: get_label["recargar"],
			parent 		 			: reset_group

		})
		reset_button.addEventListener("click", function(e){
			self.reset(this)
			//self.toggle_search_panel()
		}, false)
	// Show all
		const show_all_button = ui.create_dom_element({
			element_type 			: "button",
			class_name 	 			: "button link show_all",
			text_content 			: get_label["mostrar_todos"], //"mostrar_todos",
			parent 		 			: reset_group
		})
		show_all_button.addEventListener("click", function(e){
			self.show_all(this)
			// Close search div
			//self.toggle_search_panel()
		}, false)
	// Submit button
		const submit_button = ui.create_dom_element({
			element_type 			: "button",
			id 						: "button_submit",
			class_name 	 			: "button link submit",
			text_content 			: get_label["aplicar"], //"Submit",
			parent 		 			: search_buttons_container
		})
		submit_button.addEventListener("click", function(e){
			self.search(this).then(function(){
				// Close search div
				//self.toggle_search_panel()
			})
		},false)


	return search_buttons_container
}//end render_search_buttons



/**
* BUILD_SEARCH_GROUP
* @return dom object
*/
render_search.prototype.build_search_group = async function(parent_div, options) {

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
			class_name 	 			: "search_group",
			data_set 				: {id:counter},
			parent 		 			: parent_div
		})
		// Check already created root_search_group and store if not
		if(options.is_root===true){
			self.root_search_group = search_group
		}

	// drag and drop events
		search_group.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
		search_group.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
		search_group.addEventListener('drop',function(e){self.on_drop(this,e)})
		search_group.addEventListener('dragover',function(e){self.on_dragover(this,e)})
		search_group.addEventListener('dragleave',function(e){self.on_dragleave(this,e)})

	// Add operator
		const search_group_operator = ui.create_dom_element({
			element_type 			: 'div',
			parent 		 			: search_group,
			//text_content 			: options.operator.slice(1) + " "+counter,
			text_content 			: localize_operator(options.operator)+ " ["+counter+"]",
			data_set 				: { value : options.operator },
			class_name 	 			: "operator search_group_operator" + (options.operator==="$and" ? " and" : " or")
		})
		search_group_operator.addEventListener("click",function(e){
			//console.log("Clicked search_group_operator:",search_group_operator );
			toggle_operator_value(this)
			// Set initial state as unchanged
			self.update_state({state:'changed'})
		},false)

	// Add button close
		if (options.is_root===false) {
		const search_group_button_close = ui.create_dom_element({
			element_type 			: 'span',
			parent 		 			: search_group,
			class_name 	 			: "button link close"
		})
		search_group_button_close.addEventListener("click",function(e){
			// remove from dom
			search_group.parentNode.removeChild(search_group);
			// Set as changed
			self.update_state({state:'changed'})
		},false)
		}

	// Add button + group
		const search_group_button_plus = ui.create_dom_element({
			element_type 			: 'span',
			parent 		 			: search_group,
			//text_content 			: "X",
			class_name 	 			: "button link add"
		})
		search_group_button_plus.addEventListener("click",function(e){
			//self.add_search_group_to_dom(this, search_group)
			self.build_search_group( search_group )
			// Set as changed
			self.update_state({state:'changed'})
		},false)



	return search_group
}//end build_search_group



/**
* BUILD_SEARCH_COMPONENT
* @return dom object
*/
render_search.prototype.build_search_component = async function(parent_div, path_plain, current_value, q_operator) {

	const self = this

	const path 		 = JSON.parse(path_plain)
	const last_item  = path[path.length-1]
	const first_item = path[0]

	// Create dom element before load html from trigger
	// search_component
	const search_component = ui.create_dom_element({
		element_type 	: 'div',
		parent 		 	: parent_div,
		class_name 	 	: "search_component",
		data_set 		: { path : path_plain }
	})

	// component_instance
		const component_instance = await self.get_component({
			section_tipo 	: last_item.section_tipo,
			component_tipo 	: last_item.component_tipo,
			model 			: last_item.modelo,
			section_id 		: null,
			value 			: current_value,
			q_operator 		: q_operator || null,
			path 			: path
		})
		//console.log("////////// component_instance:",component_instance);

	// Render component
	const component_node = await component_instance.render()

	// Inject component html
	search_component.appendChild(component_node)

	// Add button close
		const search_component_button_close = ui.create_dom_element({
			element_type 			: 'span',
			parent 		 			: search_component,
			class_name 	 			: "button link close"
		})
		search_component_button_close.addEventListener("click",function(e){
			// remove search box and content (component) from dom
			search_component.parentNode.removeChild(search_component)
			// delete the instance from search ar_instances
			const delete_instance_index = self.ar_instances.findIndex( instance => instance.id === component_instance.id )
			self.ar_instances.splice(delete_instance_index, 1)
			// destroy component instance
			component_instance.destroy(true);
			// Set as changed
			self.update_state({state:'changed'})
		},false)

	// Add label component source if exists
		if (first_item!==last_item) {
			//console.log("first_item:",first_item);
			const label_add = parent_div.querySelector("span.label_add")
				if (label_add) {
					label_add.innerHTML = first_item.name +" "+ label_add.innerHTML
				}
		}

	// Check update_component_with_value_state
	// If component have any value or q_operator, set style with different color to remark it
	//	component_common.update_component_with_value_state( search_component.querySelector("div.wrap_component") )

	// show
	parent_div.classList.remove("hide")


	return
}//end build_search_component



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
}//end render_user_preset_list



/**
* RENDER_THESAURUS_OPTIONS
* Render and insert nodes into wrapper
*/
const render_thesaurus_options = (self) => {

	const thesaurus_search_selector = ui.create_dom_element({
		class_name 		: 'thesaurus_search_selector',
		element_type	: 'div'
	})
	// set thesaurus_search_selector
	self.thesaurus_search_selector = thesaurus_search_selector

	// selector (list of thesaurus typologies)
		const thesaurus_typology_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: 'thesaurus_typology_selector',
			parent			: thesaurus_search_selector
		})
		.addEventListener('change',function(){
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
}//end render_thesaurus_options



/**
* render_thesaurus_SECTIONS_CHECKBOXES
* @return
*/
export const render_thesaurus_sections_checkboxes = (select_value, ar_data_string) => {

	// ar_data_string = decodeURIComponent(ar_data_string)

	const ar_data = ar_data_string

	if(SHOW_DEBUG===true) {
		// console.log("[render_thesaurus_sections_checkboxes] ar_data:",ar_data);
	}

	if (ar_data.length===0) {
		console.warn("[render_thesaurus_sections_checkboxes] Empty ar_data:",ar_data)
		return false
	}

	// ul
		const ul = self.thesaurus_search_selector.querySelector(".thesaurus_search_selector_ul")
		if (!ul) {
			console.warn("[render_thesaurus_sections_checkboxes] DOM element not found: #thesaurus_search_selector_ul")
			return false
		}
		// clean ul
			while (ul.hasChildNodes()) {
				ul.removeChild(ul.lastChild);
			}

	const ar_items = ar_data[select_value]
	if(typeof ar_items==="undefined") {
		if(SHOW_DEBUG===true) {
			console.warn("[render_thesaurus_sections_checkboxes] ar_items is undefined for ar_data:",ar_data,select_value);
		}
		return false
	}

	const ar_items_len = ar_items.length
	for (let i = 0; i < ar_items_len; i++) {

		const item = ar_items[i]

		// li
			let li = ui.create_dom_element({
				element_type 	: 'li',
				parent 		 	: ul,
				//class_name 	: "",
				//data_set 		: {id:counter},
				//id 			: options.is_root ? 'root_search_group' : null
			})

		// checkbox
			let input = ui.create_dom_element({
				element_type 	: 'input',
				parent 		 	: li,
				id 				: item.hierarchy_target_section_tipo,
				name 			: item.hierarchy_target_section_tipo,
				value 			: item.hierarchy_target_section_tipo,
			})
			input.type = "checkbox"
			input.checked = true

		// label
			let label = ui.create_dom_element({
				element_type 	: 'label',
				parent 		 	: li,
				inner_html 		: item.hierarchy_target_section_name,
				//class_name 		: "checkbox-inline"
			})
			label.setAttribute("for", item.hierarchy_target_section_tipo)
	}

	// Store selected value as cookie to recover later
	const cookie_name  = "selected_tipology"
	create_cookie(cookie_name, select_value)


	return ul
}//end render_thesaurus_sections_checkboxes



// toggles

	/**
	* TOGGLE_SEARCH_PANEL
	* @return bool
	*/
	export const toggle_search_panel = (self) => {

		const section_tipo 				= self.section_tipo
		const search_global_container 	= self.search_global_container

		if (search_global_container.classList.contains("hide")) {

			search_global_container.classList.remove("hide")

			// Set search panel as opened
				self.track_show_panel({
					name 			: "search_panel",
					action 			: "open",
					section_tipo 	: section_tipo
				})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				const thesaurus_search_selector = wrapper.querySelector(".thesaurus_search_selector")
					//thesaurus_search_selector.style.display = "block"
					thesaurus_search_selector.classList.remove("hide")
			}

			self.search_panel_is_open = true

		}else{

			search_global_container.classList.add("hide")

			// Set search panel as closed
				self.track_show_panel({
					name 			: "search_panel",
					action 			: "close",
					section_tipo 	: section_tipo
				})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				const thesaurus_search_selector = wrapper.querySelector(".thesaurus_search_selector")
					//thesaurus_search_selector.style.display = "none"
					thesaurus_search_selector.classList.add("hide")
			}

			self.search_panel_is_open = false
		}

		return false;
	}//end toggle_search_panel



	/**
	* TOGGLE_FIELDS
	* @return bool
	*/
	export const toggle_fields = (self) => {

		const section_tipo 				= self.section_tipo
		const search_container_selector = self.search_container_selector

		// cookie to track state
		const cookie_name = "fields_panel"

		if (search_container_selector.classList.contains("display_none")) {

			search_container_selector.classList.remove("display_none")

			// Set search panel as closed
				self.track_show_panel({
					name 			: cookie_name,
					action 			: "open",
					section_tipo 	: section_tipo
				})

		}else{

			search_container_selector.classList.add("display_none")

			// Set search panel as closed
				self.track_show_panel({
					name 			: cookie_name,
					action 			: "close",
					section_tipo 	: section_tipo
				})
		}


		return true
	}//end toggle_fields



	/**
	* TOGGLE_PRESETS
	* @return bool
	*/
	export const toggle_presets = (self) => {

		const section_tipo 						 = self.section_tipo
		const search_container_selection_presets = self.search_container_selection_presets // button.parentNode.querySelector(".search_container_selection_presets")

		// Read cookie to track state
		const cookie_name = "presets_panel"

		if (search_container_selection_presets.classList.contains("display_none")) {

			search_container_selection_presets.classList.remove("display_none")

			// Set search panel as open
				self.track_show_panel({
					name 			: cookie_name,
					action 			: "open",
					section_tipo 	: section_tipo
				})

		}else{

			search_container_selection_presets.classList.add("display_none")

			// Set search panel as closed
				self.track_show_panel({
					name 			: cookie_name,
					action 			: "close",
					section_tipo 	: section_tipo
				})
		}


		return true
	}//end toggle_presets



	/**
	* TOGGLE_OPERATOR_VALUE
	* @return bool
	*/
	const toggle_operator_value = (element) => {

		const text 	  = element.innerHTML
		const ar_text = text.split(" ");
		const number  = ar_text[1]

		if (element.dataset.value==="$and") {
			// Replace dataset value
			element.dataset.value = "$or";

			// Inject new html value
			element.innerHTML = localize_operator(element.dataset.value) + " " + number

			element.classList.remove("and")
			element.classList.add("or")

		}else{
			// Replace dataset value
			element.dataset.value = "$and";

			// Inject new html value
			element.innerHTML = localize_operator(element.dataset.value) + " " + number

			element.classList.remove("or")
			element.classList.add("and")
		}

		return true
	}//end toggle_operator_value



	/**
	* LOCALIZE_OPERATOR
	* @return string localized
	*/
	const localize_operator = (operator) => {

		// Remove '$' (first char)
		const clean_operator = operator.slice(1)

		const name = (clean_operator==="and") ? "y" :
					 (clean_operator==="or") ? "o" :
					 clean_operator

		const localized = get_label[name] || ''

		return localized
	}//end localize_operator


