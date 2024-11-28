// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// imports
	import {render_components_list} from '../../common/js/render_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {create_cookie, read_cookie} from '../../common/js/utils/cookie.js'
	import {
		create_new_search_preset,
		edit_user_search_preset,
		save_preset,
		load_user_search_presets,
		presets_section_tipo
	} from './search_user_presets.js'
	import {render_preset_modal} from './view_search_user_presets.js'



/**
* RENDER_SEARCH
* Manages the component's logic and appearance in client side
*/
export const render_search = function() {

	return true
}//end render_section



/**
* LIST
* Render whole search in list mode
* @return HTMLElement wrapper
*/
render_search.prototype.list = async function() {

	const self = this

	// wrapper base html bounds
		const wrapper = self.render_base()

	// components_list. render section component list [left]
		const section_elements = await self.get_section_elements({
			use_real_sections : true
		})
		render_components_list({
			self				: self,
			section_tipo		: self.target_section_tipo,
			target_div			: self.search_container_selector,
			path				: [],
			section_elements	: section_elements
		})

	// filter. render components from temp preset [center]
		render_filter({
			self				: self,
			editing_preset		: self.json_filter,
			allow_duplicates	: true
		})

	// render buttons
		self.render_search_buttons()

	// panels status (close/open)
		self.get_panels_status()
		.then(function(ui_status){
			if (ui_status) {
				// search_panel cookie state track
				// if(self.cookie_track("search_panel")===true) {
					if(ui_status.value.search_panel && ui_status.value.search_panel.is_open) {
						// Open search panel
						toggle_search_panel(self) // toggle to open from default state close
					}
				// fields_panel cookie state track
					// if(self.cookie_track("fields_panel")===true) {
					if(ui_status.value.fields_panel && ui_status.value.fields_panel.is_open) {
						// Open search panel
						toggle_fields(self) // toggle to open from default state close
					}
				// presets_panel cookie state track
					// if(self.cookie_track("presets_panel")===true) {
					if(ui_status.value.presets_panel && ui_status.value.presets_panel.is_open) {
						// Open search panel
						toggle_presets(self) // toggle to open from default state close
					}
				// type_panel cookie state track
					// if(self.cookie_track("type_panel")===true) {
					if(ui_status.value.type_panel && ui_status.value.type_panel.is_open) {
						// Open search panel
						toggle_type(self) // toggle to open from default state close
					}
			}//end if (ui_status)
		})


	return wrapper
}//end list



/**
* RENDER_BASE
* Render basic nodes
* @return HTMLElement wrapper
*/
render_search.prototype.render_base = function() {

	const self = this

	const section_tipo = self.section_tipo

	const fragment = new DocumentFragment()

	// search_global_container . Main search div
		const search_global_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_global_container hide', // initial hide
			parent			: fragment
		})
		// set
		self.search_global_container = search_global_container

	// thesaurus add on
		if (self.caller.model==='area_thesaurus' || self.caller.model === 'area_ontology') {
			const thesaurus_options_node = render_sections_selector(self)
			search_global_container.appendChild(thesaurus_options_node)
		}

	// button_save_preset . Hidden by default
		// ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'button_save_preset hide99',
		// 	inner_html		: get_label.save +' '+ get_label.changes,
		// 	parent			: search_global_container
		// })
		// .addEventListener('click',function(e) {
		// 	e.stopPropagation()

		// 	console.log('e:', e);
		// 	// self.save_preset(this)
		// })

	// toggle_container_selector (Show/hide where section fields list are loaded)
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toggle_container_selector',
			inner_html		: get_label.fields || 'Fields',
			parent			: search_global_container
		})
		.addEventListener('click',function(e){
			e.stopPropagation()
			toggle_fields(self)
		})

	// fields list . List of section fields usable in search
		const search_container_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container search_container_selector display_none',
			parent			: search_global_container
		})
		// set
		self.search_container_selector = search_container_selector

	// search_container_selection canvas. Where fields are dragged and stored
		const search_container_selection = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_container_selection',
			parent			: search_global_container
		})

		// fix top based on menu(sticky)
		when_in_viewport(
			search_container_selection,
			() => {
				// get menu height to optimize sticky position top
				const menu_wrapper = document.querySelector('.menu_wrapper')
				if (menu_wrapper) {
					const menu_height = menu_wrapper.offsetHeight
					search_container_selection.style.top = (menu_height + 1) + 'px'
				}
			}
		)
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
			dataset			: {'section_tipo':section_tipo},
			parent			: search_global_container
		})
		// set
		self.search_container_selection_presets = search_container_selection_presets
		const component_presets_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_presets_label',
			inner_html		: get_label.search_presets || 'User search preset',
			parent			: self.search_container_selection_presets
		})

		// button_new_preset
			const button_add_preset = ui.create_dom_element({
				id 				: 'button_new_preset',
				element_type	: 'span',
				class_name		: 'button add',
				parent			: component_presets_label
			})
			// click event
			const add_click_handler = async (e) => {
				e.stopPropagation()

				const section_id = await create_new_search_preset({
					self			: self,
					section_tipo	: presets_section_tipo
				})

				// launch the editor
				const section = await edit_user_search_preset(self, section_id)

				// open modal to edit the new preset
				render_preset_modal({
					caller		: section,
					section_id	: section_id,
					on_close	: () => {
						self.user_presets_section.refresh()
					}
				})
			}
			button_add_preset.addEventListener('click', add_click_handler)

		// button save preset
			const button_save_preset = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'button_save_preset hide',
				inner_html		: get_label.save +' '+ get_label.changes,
				parent			: search_container_selection_presets
			})
			// click event
			const save_click_handler = (e) => {
				e.stopPropagation()

				// check user_preset_section_id is already set
					if (!self.user_preset_section_id) {
						console.log('Unable to save non defined section_id preset:', self.user_preset_section_id);
						return
					}

				const section_id = self.user_preset_section_id

				// save_preset
					save_preset({
						self			: self,
						section_id		: section_id,
						section_tipo	: 'dd623' // Search presets
					})
					.then(function(response){
						console.log('Preset saved!', response);
						if (response.result) {
							button_save_preset.classList.add('hide')
						}
					})
			}
			button_save_preset.addEventListener('click', save_click_handler)
			// fix
			self.button_save_preset = button_save_preset

	// toggle_container_selection_presets. button toggle user presets
		const toggle_container_selection_presets = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toggle_container_selection_presets',
			inner_html		: get_label.preset || 'Preset',
			parent			: search_global_container
		})
		toggle_container_selection_presets.addEventListener('click',function(){
			toggle_presets(self)
		})


	// wrapper . Top div where elements are placed
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_search full_width ' + self.caller.mode
		})
		wrapper.appendChild(fragment)
		// fix wrapper
		self.wrapper = wrapper


	return wrapper
}//end render_base



/**
* RENDER_FILTER
* Create the central filter group (components selected, max records, show all, apply button)
* @param object options
* @return DOM element search_group_container
*/
export const render_filter = function(options) {

	// options
		const self				= options.self
		const editing_preset	= options.editing_preset
		const clean_q			= options.clean_q || false
		const allow_duplicates	= options.allow_duplicates || false

	// search_group_container
		const search_group_container = self.search_group_container
		// Clean target_div
		while (search_group_container.hasChildNodes()) {
			search_group_container.removeChild(search_group_container.lastChild);
		}

	// Reset resolved
		self.ar_resolved_elements = []

	// Build global_group
		self.build_dom_group(editing_preset, search_group_container, {
			is_root				: true,
			clean_q				: clean_q,
			allow_duplicates	: allow_duplicates
		})
		//console.log("global_group:",global_group);


	return search_group_container
}//end render_filter



/**
* RENDER_SEARCH_BUTTONS
* Creates search buttons group: max, show all, apply
* @return HTMLElement search_buttons_container
*/
render_search.prototype.render_search_buttons = function(){

	const self = this

	const search_buttons_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'search_buttons_container',
		parent			: self.search_group_container
	})

	// max group
		const max_group = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'max_group',
			parent			: search_buttons_container
		})
	// max_input_label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'max_input_label unselectable',
			inner_html		: get_label.max || 'max',
			parent			: max_group
		})
	// max input
		const max_input = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'max_input', // btn css_max_rows
			value			: self.limit, // default 10
			parent			: max_group
		})
		max_input.addEventListener('change',function(){
			self.limit = parseInt(max_input.value)
		})

	// recursive children
		if (self.caller.context.section_map && self.caller.context.section_map.thesaurus) {
			// re-check if this section have really a component_relation_children before create the option
			const section_components_list		= self.components_list[self.section_tipo]
			const component_relation_children	= section_components_list.find(el => el.model==='component_relation_children')
			if (component_relation_children) {
				const recursive_label = ui.create_dom_element({
					element_type	: 'label',
					text_content	: get_label['children_recursive'] || 'Children',
					class_name		: 'children_recursive_label',
					parent			: max_group
				})
				const search_children_recursive_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					value			: '',
					class_name		: 'children_recursive'
				})
				recursive_label.prepend(search_children_recursive_node)
				// fix node
				self.search_children_recursive_node	= search_children_recursive_node
			}
		}

	// reset group
		const reset_group = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'reset_group',
			parent			: search_buttons_container
		})

	// Reset button
		const reset_fn = (e) => {
			e.stopPropagation()
			self.reset()
		}
		const reset_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button reload',
			title			: get_label.reload || 'Reload',
			parent			: reset_group

		})
		reset_button.addEventListener('mousedown', reset_fn)

	// Show all
		const show_all_fn = (e) => {
			e.stopPropagation()
			self.show_all(show_all_button)
			// Close search div
			toggle_search_panel(self) // toggle to open from default state close
		}
		const show_all_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button show_all',
			inner_html		: get_label.show_all || 'Show all',
			parent			: reset_group
		})
		show_all_button.addEventListener('mousedown', show_all_fn)

	// Submit button
		const submit_fn = (e) => {
			e.stopPropagation()
			// always blur active component to force set dato (!)
				document.activeElement.blur()
			// exec search command (return promise resolved as bool)
				self.exec_search()
			// toggle filter container
				toggle_search_panel(self) // toggle to open from default state close
		}
		const submit_button = ui.create_dom_element({
			element_type	: 'button',
			id				: 'button_submit',
			class_name		: 'button submit',
			inner_html		: get_label.apply || 'Apply',
			parent			: search_buttons_container
		})
		submit_button.addEventListener('mousedown', submit_fn)


	return search_buttons_container
}//end render_search_buttons



/**
* RENDER_SEARCH_GROUP
* Create the basic search element node. Includes nodes:
* 	operator, button add, search_component wrapper
* @param DOM node parent_div
* @param object options = {}
* @return HTMLElement search_group
*/
render_search.prototype.render_search_group = function(parent_div, options={}) {

	const self = this

	// options
		const operator	= options.operator || '$and'
		const is_root	= options.is_root || false

	// Check already created root_search_group
		//if (options.is_root===true && document.getElementById("root_search_group")) {
		//	return false
		//}

		const all_search_groups	= self.search_group_container.querySelectorAll(".search_group")
		const total				= all_search_groups.length
		const counter			= total + 1

	// search_group
		const search_group = ui.create_dom_element({
			element_type	: 'div',
			//id			: is_root ? 'root_search_group' : null
			class_name		: "search_group",
			data_set		: {id:counter},
			parent			: parent_div
		})

		when_in_viewport(
			search_group,
			() => {
				const search_group_size = search_group.getBoundingClientRect()

				if(search_group_size.width < 1024){
					search_group.classList.add('column_2')
				}
				if(search_group_size.width < 512){
					search_group.classList.add('column_1')
				}
			}
		)
		// Check already created root_search_group and store if not
		if(is_root===true){
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
			element_type	: 'div',
			parent			: search_group,
			//inner_html	: operator.slice(1) + " "+counter,
			inner_html		: localize_operator(operator)+ " ["+counter+"]",
			data_set		: { value : operator },
			class_name		: "operator search_group_operator" + (operator==="$and" ? " and" : " or")
		})
		search_group_operator.addEventListener('click', function(e){
			e.stopPropagation()
			//console.log("Clicked search_group_operator:",search_group_operator );
			toggle_operator_value(this)
			// Set initial state as unchanged
			self.update_state({state:'changed'})
		})

	// Add button x close
		if (is_root===false) {
		const search_group_button_close = ui.create_dom_element({
			element_type	: 'span',
			parent			: search_group,
			class_name		: "button close"
		})
		search_group_button_close.addEventListener('click', function(e){
			e.stopPropagation()
			// remove from dom
			search_group.parentNode.removeChild(search_group);
			// Set as changed
			self.update_state({state:'changed'})
		})
		}

	// Add button + group
		const search_group_button_plus = ui.create_dom_element({
			element_type	: 'span',
			title			: get_label.new || 'New',
			class_name		: 'button add',
			parent			: search_group
		})
		search_group_button_plus.addEventListener('click', function(e){
			e.stopPropagation()
			//self.add_search_group_to_dom(this, search_group)
			self.render_search_group( search_group )
			// Set as changed
			self.update_state({state:'changed'})
		})


	return search_group
}//end render_search_group



/**
* BUILD_SEARCH_COMPONENT
* Creates a instance of component and render it placing result in given parent_div
* Add too, button close and optional label
* @return promise bool true
*/
render_search.prototype.build_search_component = async function(options) {

	const self = this

	const parent_div		= options.parent_div
	const path_plain		= options.path_plain
	const current_value		= options.current_value
	const q_operator		= options.q_operator
	const section_id		= options.section_id

	// short vars
		const path			= JSON.parse(path_plain)
		const last_item		= path[path.length-1]
		const first_item	= path[0]

	// search_component container. Create dom element before load html from trigger
		const search_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "search_component",
			data_set		: {
				path		: path_plain,
				section_id	: section_id
			},
			parent			: parent_div
		})

		// component_instance. Get functional component, build and returns it ready to render
			const component_instance = await self.get_component_instance({
				section_id		: section_id,
				section_tipo	: last_item.section_tipo,
				component_tipo	: last_item.component_tipo,
				model			: last_item.model,
				mode			: 'search',
				value			: current_value || null, // value will be injected
				q_operator		: q_operator || null,
				path			: path
			})

		// render component
			// note that component here is already built with custom injected data
			const component_node = component_instance
				? await component_instance.render()
				: ui.create_dom_element({
					element_type	: 'div',
					class_name		: "invalid_component error",
					inner_html 		: get_label.invalid_componet || 'Invalid component',
				})

		// add component node
			search_component.appendChild(component_node)

	// button close
		const search_component_button_close = ui.create_dom_element({
			element_type	: 'span',
			parent			: search_component,
			class_name		: 'button close'
		})
		search_component_button_close.addEventListener('click', function(e){
			e.stopPropagation()
			// remove search box and content (component) from dom
			search_component.parentNode.removeChild(search_component)
			// delete the instance from search ar_instances
			const delete_instance_index = self.ar_instances.findIndex( instance => instance.id===component_instance.id )

			if(delete_instance_index !== -1){
				self.ar_instances.splice(delete_instance_index, 1)
				// destroy component instance
				component_instance.destroy(
					true // delete_self
				)
			}

			// Set as changed
			self.update_state({state:'changed'})
		})

	// label component source if exists
		if (first_item!==last_item) {
			//console.log("first_item:",first_item);
			const label_add = parent_div.querySelector('span.label_add')
			if (label_add) {
				label_add.innerHTML = first_item.name +' '+ label_add.innerHTML
			}
		}

	// Check update_component_with_value_state
	// If component have any value or q_operator, set style with different color to remark it
	//	component_common.update_component_with_value_state( search_component.querySelector("div.wrap_component") )

	// show hidden parent container
		parent_div.classList.remove("hide")


	return true
}//end build_search_component



/**
* RENDER_USER_PRESET_LIST
* Auxiliary function to create DOM elements needed for build components presets list
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
		if (typeof ar_elements[0]==='undefined') {
			//console.warn('[search.render_user_preset_list] Warning. Empty ar_elements received',ar_elements);
			return false
		}

	// Read cookie to track preset selected
		// const cookie_name			= 'search_presets'
		// const cookie_value			= JSON.parse(readCookie(cookie_name) || '{}')
		// const current_cookie_track	= cookie_value[target_section_tipo] || false

		// WORK IN PROGRESS
			// const current_cookie_track = await data_manager.get_local_db_data(
			// 	'search_presets', // string id
			// 	'status', // string table
			// 	true // bool cache
			// )
			// console.log('>>>>>>>>>>>>>>>> render_user_preset_list:current_cookie_track:', current_cookie_track);

	let is_default = false
	const len = ar_elements.length
	for (let i = 0; i < len; i++) {

		let element = ar_elements[i]

		// is_default calculate
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
					// Load current preset
						// self.parse_json_query_obj_to_dom(null, JSON.parse(element.json_preset))

					// // Update state
						// self.update_state({
						// 	state					: 'unchanged',
						// 	editing_section_id		: element.section_id,
						// 	editing_save_arguments	: element.save_arguments
						// })
				}else{
					is_default = false
				}
			}

		// li_element. Builds li element
			const li_element = ui.create_dom_element({
				element_type	: 'li',
				class_name		: (is_default===true) ? 'selected' : '',
				data_set		: {
					section_id		: element.section_id,
					json_preset		: element.json_preset,
					save_arguments	: element.save_arguments
				}
			})
			// icon_load. Button load preset (<)
			const icon_load = ui.create_dom_element({
				element_type	: 'span',
				parent			: li_element,
				class_name		: 'icon_bs component_presets_button_load'
			})
			icon_load.addEventListener('click', function(e){
				e.stopPropagation()
				self.load_search_preset(this)
			})

			// Span label name
			const span_name = ui.create_dom_element({
				element_type	: 'span',
				parent			: li_element,
				inner_html		: element.name,
				class_name		: 'css_span_dato',
				data_set		: {
					parent			: element.section_id,
					section_tipo	: 'dd623', // Search presets
					tipo			: 'dd624'
				}
			})
			if (permissions>=2) {
				span_name.addEventListener('click', function(e){
					e.stopPropagation()
					self.edit_preset(this)
				})
			}

			// Button delete preset
			if (permissions>=2) {
			const icon_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'icon_bs component_presets_button_delete',
				parent			: li_element
			})
			icon_delete.addEventListener('click', function(e){
				e.stopPropagation()
				self.delete_preset(this)
			})
			}

			// div_edit
			ui.create_dom_element({
				element_type	: 'div',
				parent			: li_element,
				class_name		: 'div_edit'
			})

		// add
			ar_nodes.push(li_element)
	}//end for (var i = 0; i < ar_elements.length; i++)



	return ar_nodes
}//end render_user_preset_list



/**
* RENDER_SECTIONS_SELECTOR
* Render and insert nodes into wrapper
* @param object self
* @return DocumentFragment
*/
const render_sections_selector = (self) => {

	if(!self.sections_selector_data) return false

	// fragment
		const fragment = new DocumentFragment()

	// button toggle type
		const toggle_container_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toggle_container_selector sections',
			inner_html		: get_label.type || 'Type',
			parent			: fragment
		})
		.addEventListener('click', function(e){
			e.stopPropagation()
			toggle_type(self)
		})

	// wrapper
		const wrapper_sections_selector = ui.create_dom_element({
			class_name		: 'wrapper_sections_selector display_none',
			element_type	: 'div',
			parent			: fragment
		})
		// set wrapper_sections_selector
		self.wrapper_sections_selector = wrapper_sections_selector

	// typologies
		const typologies = self.sections_selector_data.filter(item => item.type === 'typology')
		// typologies.sort((a, b) => new Intl.Collator().compare(a.label, b.label));
		typologies.sort((a, b) => parseFloat(a.order) - parseFloat(b.order));

		// selector (list of typologies)
			const typology_selector = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'dd_input typology_selector',
				parent			: wrapper_sections_selector
			})
			typology_selector.addEventListener('change', function(event){
				const typology_id = event.target.value
				build_sections_check_boxes(self, typology_id, wrapper_sections_selector_ul)
				// update_sections_list fire
				event_manager.publish('update_sections_list_' + self.id)

				// Store selected value as cookie to recover later
				const cookie_name = 'selected_typology'
				create_cookie(cookie_name, typology_id, 365)
			})

		// options for selector
			const typologies_length = typologies.length
			for (let i = 0; i < typologies_length; i++) {
				ui.create_dom_element({
					element_type	: 'option',
					value			: typologies[i].section_id,
					inner_html		: typologies[i].label,
					parent			: typology_selector
				})
			}

		// cookie. previous cookie stored value
			// get the model to set into the cookie / area_thesaurus || area_ontology
			const caller_model  	= self.caller.model
			const cookie_name		= `selected_typology_${caller_model}`
			const selected_typology	= read_cookie(cookie_name)
			if (selected_typology) {
				typology_selector.value = selected_typology
			}

		// checkbox list wrapper (sections of current selected thesaurus typology, like 'thematic')
			const wrapper_sections_selector_ul = ui.create_dom_element({
				element_type	: 'ul',
				class_name 		: 'wrapper_sections_selector_ul',
				parent			: wrapper_sections_selector
			})

		// trigger first selected value
			build_sections_check_boxes(
				self,
				typology_selector.value,
				wrapper_sections_selector_ul
			)


	return fragment
}//end render_sections_selector



/**
* BUILD_SECTIONS_CHECK_BOXES
* Render the checkbox list of available sections in current type
* For example, for type 2 (Toponymy) the list display your loaded countries
* This list is interactive and updates the 'Fields' list on every change to
* preserve the list coherence
* @param object self
* @param int|string typology_id
* @param HTMLElement parent
*/
const build_sections_check_boxes = (self, typology_id, parent) => {

	const ar_sections	= self.sections_selector_data.filter(item => item.typology_section_id===typology_id)
	const ul			= parent

	// reset the sqo sections
		self.target_section_tipo.splice(0,self.target_section_tipo.length)

	// cookie value (selected_search_sections)
		const cookie_name						= 'selected_search_sections'
		const selected_search_sections_value	= read_cookie(cookie_name)
		const selected_search_sections			= selected_search_sections_value
			? JSON.parse(selected_search_sections_value)
			: {}
		// sample expected parsed format
			// {
			// 	"1": [
			// 		"numisdata665"
			// 	],
			// 	"2": [
			// 		"es1",
			// 		"fr1"
			// 	]
			// }

	// update sections components list (left)
		const update_sections_list = async () => {

			// loading add
				self.search_container_selector.classList.add('loading')

			// reset and update var value
				self.target_section_tipo = []
				const ar_check_box_length = ar_check_box.length
				for (let i = 0; i < ar_check_box_length; i++) {
					const item = ar_check_box[i]
					if (item.checked) {
						self.target_section_tipo.push(item.value)
					}
				}

			// refresh the section list at left (use_real_sections)
				const section_elements = await self.get_section_elements({
					use_real_sections : true
				})
				render_components_list({
					self				: self,
					section_tipo		: self.target_section_tipo,
					target_div			: self.search_container_selector,
					path				: [],
					section_elements	: section_elements
				})

			// Store selected value as cookie to recover later
				selected_search_sections[typology_id] = self.target_section_tipo
				create_cookie(
					cookie_name,
					JSON.stringify(selected_search_sections),
					365
				)

			// loading remove
				self.search_container_selector.classList.remove('loading')
		}//end update_sections_list

	// clean wrapper_sections_selector_ul
		while (ul.hasChildNodes()) {
			ul.removeChild(ul.lastChild);
		}

	// li nodes
		const ar_check_box = []
		const ar_sections_len = ar_sections.length
		for (let i = 0; i < ar_sections_len; i++) {

			const item = ar_sections[i]

			self.target_section_tipo.push(item.target_section_tipo)

			// li
				const li = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'dd_input',
					parent			: ul
				})

			// label
				const label = ui.create_dom_element({
					element_type	: 'label',
					parent			: li,
					inner_html		: item.target_section_name
				})

			// checkbox
				const check_box = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					// id			: 'section_option_'+item.target_section_tipo,
					// name			: item.hierarchy_target_section_tipo,
					value			: item.target_section_tipo
				})
				ar_check_box.push(check_box)

				// selected
				if (selected_search_sections[typology_id]) {
					// defined cookie value case
					if(selected_search_sections[typology_id].includes(item.target_section_tipo)){
						check_box.checked = true
					}
				}else{
					// non defined cookie value case
					check_box.checked = true
				}

				check_box.addEventListener('change', update_sections_list)
				label.prepend(check_box)
		}//end for (let i = 0; i < ar_sections_len; i++)

	// select all option
		if (ar_check_box.length>1) {
			// li
				const li = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'dd_input',
					parent			: ul
				})
			// label
				const label = ui.create_dom_element({
					element_type	: 'label',
					parent			: li,
					inner_html		: get_label.all || 'All'
				})
			// checkbox
				const check_box = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					value			: null
				})
				if (!selected_search_sections[typology_id]) {
					check_box.checked = true
				}
				label.prepend(check_box)
				const fn_change = function() {
					// update checked states in all elements
					ar_check_box.map(el => {
						el.checked = this.checked
					})
					// fire update_sections_list
					update_sections_list()
				}
				check_box.addEventListener('change', fn_change)
		}//end if (ar_check_box.length>1)

	// event subscription. Fire update on each publication of update_sections_list_
		const update_sections_list_handler = () => {
			update_sections_list()
		}
		self.events_tokens.push(
			event_manager.subscribe('update_sections_list_' + self.id, update_sections_list_handler)
		)


	return true
}//end build_sections_check_boxes



// toggles

	/**
	* TOGGLE_SEARCH_PANEL
	* @param object self
	* @return bool
	*/
	export const toggle_search_panel = (self) => {

		// short vars
			const search_global_container	= self.search_global_container
			const status_id					= 'open_search_panel'
			const status_table				= 'status'

		if (search_global_container && search_global_container.classList.contains('hide')) {

			self.search_panel_is_open = true

			search_global_container.classList.remove('hide')

			const data = {
				id		: status_id,
				value	: true
			}
			data_manager.set_local_db_data(
				data,
				status_table
			)

		}else{

			self.search_panel_is_open = false

			if (search_global_container && !search_global_container.classList.contains('hide')) {
				search_global_container.classList.add('hide')
			}

			data_manager.delete_local_db_data(
				status_id,
				status_table
			)
		}

		return true;
	}//end toggle_search_panel



	/**
	* TOGGLE_FIELDS
	* @param object self
	* @return bool
	*/
	export const toggle_fields = (self) => {

		const search_container_selector = self.search_container_selector

		// cookie to track state
		const cookie_name = 'fields_panel'

		if (search_container_selector.classList.contains('display_none')) {

			search_container_selector.classList.remove('display_none')

			// Set search panel as closed
				self.track_show_panel({
					name	: cookie_name,
					action	: 'open'
				})

		}else{

			if (search_container_selector && !search_container_selector.classList.contains('display_none')) {
				search_container_selector.classList.add('display_none')
			}

			// Set search panel as closed
				self.track_show_panel({
					name	: cookie_name,
					action	: 'close'
				})
		}

		return true
	}//end toggle_fields



	/**
	* TOGGLE_PRESETS
	* Show/hide user_presets_node
	* If not already loaded, load the user_search_presets from API
	* @param object self
	* @return bool
	*/
	export const toggle_presets = async (self) => {

		const search_container_selection_presets = self.search_container_selection_presets // button.parentNode.querySelector(".search_container_selection_presets")

		// user_presets_section . get section of users presets
			if (!self.user_presets_section) {
				self.user_presets_section = await load_user_search_presets(self)
				const user_presets_node = await self.user_presets_section.render()
				search_container_selection_presets.appendChild(user_presets_node)
			}

		// action based on css
			let action
			if (search_container_selection_presets.classList.contains('display_none')) {

				search_container_selection_presets.classList.remove('display_none')
				action = 'open'

			}else{

				search_container_selection_presets.classList.add('display_none')
				action = 'close'
			}

		// Set search panel as open/close
			self.track_show_panel({
				name	: 'presets_panel', // cookie_name
				action	: action
			})


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
	* TOGGLE_TYPE
	* @param object self
	* @return bool
	*/
	export const toggle_type = (self) => {

		const wrapper_sections_selector = self.wrapper_sections_selector
		// check if exists (only exists in thesaurus)
		if (!wrapper_sections_selector) {
			return false
		}

		// cookie to track state
		const cookie_name = 'type_panel'

		if (wrapper_sections_selector.classList.contains('display_none')) {

			wrapper_sections_selector.classList.remove('display_none')

			// Set search panel as closed
				self.track_show_panel({
					name	: cookie_name,
					action	: 'open'
				})

		}else{

			if (wrapper_sections_selector && !wrapper_sections_selector.classList.contains('display_none')) {
				wrapper_sections_selector.classList.add('display_none')
			}

			// Set search panel as closed
				self.track_show_panel({
					name	: cookie_name,
					action	: 'close'
				})
		}

		return true
	}//end toggle_type
//end toggles



/**
* LOCALIZE_OPERATOR
* @return string localized
*/
const localize_operator = (operator) => {

	// Remove '$' (first char)
	const clean_operator = operator.slice(1)

	const name = (clean_operator==='and') ? 'and' :
				 (clean_operator==='or') ? 'or' :
				 clean_operator

	const localized = get_label[name] || ''


	return localized
}//end localize_operator



// @license-end
