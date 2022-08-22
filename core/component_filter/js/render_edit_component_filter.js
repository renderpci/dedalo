/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_FILTER
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter = function() {

	return true
}//end render_edit_component_filter



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_filter.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render_level
		const render_level 	= options.render_level

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})

	// set pointer to content_data
		wrapper.content_data = content_data

	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

		// render all items sequentially
			const tree_object = {}
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];

				const tree_node = (datalist_item.type==='typology')
					? get_grouper_element(i, datalist_item, self) // grouper
					: get_input_element(i, datalist_item, self) // input checkbox

				tree_node.item = datalist_item

				// store in the tree_object
				const key = datalist_item.section_tipo +'_'+ datalist_item.section_id
				tree_object[key] = tree_node
				// set the pointer
				if(datalist_item.type!=='typology'){
					content_data[i] = tree_node
				}
			}

		// hierarchize nodes
			const tree_fragment = new DocumentFragment()
			for(const key in tree_object) {

				const tree_node	= tree_object[key]

				if (!tree_node.item.parent) {
					// add to root level
					tree_fragment.appendChild(tree_node)
				}else{
					// add to parent typology branch
					const parent_key = tree_node.item.parent.section_tipo + '_' + tree_node.item.parent.section_id
					if(tree_object[parent_key]) {
						// add to parent branch
						tree_object[parent_key].branch.appendChild(tree_node)
						// console.log("Added to parent branch:", key, parent_key);
					}else{
						// add to root level
						tree_fragment.appendChild(tree_node)
					}
				}
			}
			content_data.appendChild(tree_fragment)


	return content_data
}//end get_content_data



/**
* GET_GROUPER_ELEMENT
*	Typology element
* @return DOM node li
*/
const get_grouper_element = (i, datalist_item, self) => {

	const key = datalist_item.section_tipo +'_'+ datalist_item.section_id

	// grouper
		const grouper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grouper'
		})

	// grouper_label
		const grouper_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grouper_label icon_arrow',
			inner_html		: datalist_item.label,
			parent			: grouper
		})

	// branch
		const branch = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'branch',
			parent			: grouper
		})
		grouper.branch = branch

	// collapse_toggle_track
		ui.collapse_toggle_track({
			header				: grouper_label,
			content_data		: branch,
			collapsed_id		: 'collapsed_component_filter_group_' + key,
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			grouper_label.classList.remove('up')
		}
		function expose() {
			grouper_label.classList.add('up')
		}


	return grouper
}//end get_grouper_element



/**
* GET_INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element = (i, current_value, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_item		= current_value
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label
		const section_id		= datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'item_li'
			// data_set		: {
			// 	id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
			// 	parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
			// }
		})

	// label
		const label_string = (SHOW_DEBUG===true) ? label + ' [' + section_id + ']' : label
		const label_node = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'item_label',
			inner_html		: label_string,
			parent			: li
		})

	// input checkbox
		const input_node = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'item_input',
			type			: 'checkbox'
		})
		label_node.prepend(input_node)
		input_node.addEventListener('change',function() {

			const action		= (input_node.checked===true) ? 'insert' : 'remove'
			const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			const changed_value	= (action==='insert') ? datalist_value : null

			const changed_data = Object.freeze({
				action	: action,
				key		: changed_key,
				value	: changed_value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false,
				remove_dialog	: ()=>{
					return true
				}
			})
		})//end change event

		// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input_node.checked = 'checked'
			}
		}




	return li
}//end get_input_element



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button edit (go to target section)
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const target_sections			= self.context.target_sections
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				const label = (SHOW_DEBUG===true)
					? `${item.label} [${item.tipo}]`
					: item.label

				const button_edit = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button edit',
					title			: label,
					parent			: fragment
				})
				button_edit.addEventListener("click", function(e){
					e.stopPropagation()
					// navigate link
					event_manager.publish('user_navigation', {
						source : {
							tipo	: item.tipo,
							model	: 'section',
							mode	: 'list'
						}
					})
				})
			}
		}

	// button reset
		const button_reset = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button reset',
			parent			: fragment
		})
		button_reset.addEventListener('click', function() {
			if (self.data.value.length===0) {
				return true
			}

			const changed_data = Object.freeze({
				action	: 'remove',
				key		: false,
				value	: null
			})
			self.change_value({
				changed_data	: changed_data,
				label			: 'All',
				refresh			: true
			})
			.then((api_response)=>{
				// rebuild and save the component
				// event_manager.publish('reset_element_'+self.id, self)
				// event_manager.publish('save_component_'+self.id, self)
			})

			return true
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
