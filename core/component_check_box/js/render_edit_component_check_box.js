/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {view_default_edit_check_box} from './view_default_edit_check_box.js'
	import {view_tools_edit_check_box} from './view_tools_edit_check_box.js'
	import {view_line_edit_check_box} from './view_line_edit_check_box.js'
	// import {render_view_mini} from './render_view_mini.js'



/**
* RENDER_EDIT_COMPONENT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const render_edit_component_check_box = function() {

	return true
}//end render_edit_component_check_box



/**
* EDIT
* Chose the view render module to generate DOM nodes
* @param object options
* @return DOM node wrapper | null
*/
render_edit_component_check_box.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		// case 'mini':
			// return render_view_mini.render(self, options)

		case 'line':
			return view_line_edit_check_box.render(self, options)

		case 'tools':
			return view_tools_edit_check_box.render(self, options)

		case 'default':
		default:
			return view_default_edit_check_box.render(self, options)
	}

	return null
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param instance self
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const datalist = self.data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})
		// content_data.classList.add('nowrap')

	// build options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element_node = get_input_element_edit(i, datalist[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM node content_value
*/
const get_input_element_edit = (i, current_value, self) => {

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const datalist_value	= datalist_item.value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		// const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input_checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		option_label.prepend(input_checkbox)
		input_checkbox.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input_checkbox.addEventListener('change', function(e){

			// add style modified to wrapper node
				if (!self.node.classList.contains('modified')) {
					self.node.classList.add('modified')
				}

			// const action		= (input_checkbox.checked===true) ? 'insert' : 'remove'
			// const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			// const changed_value	= (action==='insert') ? datalist_value : null

			// const changed_data = [Object.freeze({
			// 	action	: action,
			// 	key		: changed_key,
			// 	value	: changed_value
			// })]
			// // force to save on every change
			// 	self.change_value({
			// 		changed_data	: changed_data,
			// 		refresh			: false,
			// 		remove_dialog	: ()=>{
			// 			return true
			// 		}
			// 	})
			// 	.then(()=>{
			// 		self.selected_key = i
			// 	})

			self.change_handler({
				self			: self,
				e				: e,
				i				: i,
				datalist_value	: datalist_value,
				input_checkbox	: input_checkbox
			})
		})//end change event

		// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input_checkbox.checked = 'checked'
			}
		}

	// developer_info
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'developer_info show_on_active',
			text_content	: `[${section_id}]`,
			parent			: content_value
		})

	// button_edit
		// const button_edit = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button edit show_on_active',
		// 	parent			: content_value
		// })
		// button_edit.addEventListener("click", function(e){
		// 	e.stopPropagation()
		// 	try {
		// 		// target_section
		// 			const sqo = self.context.request_config.find(el => el.api_engine==='dedalo').sqo //.sqo.section_tipo
		// 			const target_section_tipo = sqo.section_tipo[0].tipo
		// 			console.log("+++ sqo:",sqo);
		// 		// navigation
		// 			const user_navigation_options = {
		// 				source		: {
		// 					action			: 'search',
		// 					model			: 'section',
		// 					tipo			: target_section_tipo,
		// 					section_tipo	: target_section_tipo,
		// 					mode			: 'edit',
		// 					lang			: self.lang
		// 				},
		// 				sqo : {
		// 					section_tipo		: [{tipo : target_section_tipo}],
		// 					filter				: null,
		// 					limit				: 1,
		// 					filter_by_locators	: [{
		// 						section_tipo	: target_section_tipo,
		// 						section_id		: section_id
		// 					}]
		// 				}
		// 			}
		// 		event_manager.publish('user_navigation', user_navigation_options)
		// 	} catch (error) {
		// 		console.error(error)
		// 	}
		// })


	return content_value
}//end get_input_element_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button edit (go to target section)
		if(!is_inside_tool) {

			const target_sections			= self.context.target_sections
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				// button edit
					const label = (SHOW_DEBUG===true)
						? `${item.label} [${item.tipo}]`
						: item.label
					const button_edit = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button edit',
						title			: label,
						parent			: fragment
					})
					button_edit.addEventListener('click', function(e){
						e.stopPropagation()

						// navigate link
							// event_manager.publish('user_navigation', {
							// 	source : {
							// 		tipo	: item.tipo,
							// 		model	: 'section',
							// 		mode	: 'list'
							// 	}
							// })

						// open a new window
							const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
								tipo	: item.tipo,
								mode	: 'list',
								menu	: false
							})
							const new_window = open_window({
								url		: url,
								name	: 'section_view',
								width	: 1280,
								height	: 740
							})
							new_window.addEventListener('blur', function() {
								// refresh current instance
								self.refresh({
									build_autoload : true
								})
							})
					})
			}
		}

	// button reset
		// remove all values
		if(!is_inside_tool) {
			const button_reset = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button reset',
				parent			: fragment
			})
			button_reset.addEventListener('click', function() {

				if (self.data.value.length===0) {
					return true
				}

				const changed_data = [Object.freeze({
					action  : 'remove',
					key 	: false,
					value 	: null
				})]
				self.change_value({
					changed_data : changed_data,
					label  		 : 'All',
					refresh 	 : true
				})
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons
