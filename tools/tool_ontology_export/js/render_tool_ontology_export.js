// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {when_in_dom,dd_request_idle_callback} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_ONTOLOGY_EXPORT
* Manages the component's logic and appearance in client side
*/
export const render_tool_ontology_export = function() {

	return true
}//end render_tool_ontology_export



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_ontology_export.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// user_info
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'user_info',
			inner_html		: self.get_tool_label('user_info'),
			parent			: fragment
		})

	// ontologies_list_container
		const ontologies_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'ontologies_list_container',
			parent 			: fragment
		});
		const ontologies_list = render_ontologies_list(self)
		ontologies_list_container.appendChild(ontologies_list)

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// button_export
			const button_export = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning gear',
				inner_html		: self.get_tool_label('export') || 'Export',
				parent			: buttons_container
			})
			// click event
			const click_handler = async (e) => {
				e.stopPropagation();

				if (self.selected_ontologies.length===0) {
					alert("Error: empty selection");
					return
				}

				// messages clean
					[
						messages_container
					]
					.map(el => el.classList.remove('error'))

				// spinner
					let spinner
					const set_loading = ( set ) => {

						if (set===true) {

							content_data.classList.add('loading')
							messages_container.innerHTML = ''

							// spinner
							spinner = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner inside',
								parent			: content_data.parentNode
							})

						}else{

							content_data.classList.remove('loading')
							spinner.remove()
						}
					}
					set_loading(true)

				// call API
					const api_response = await self.export_ontologies()

				// user messages
					messages_container.innerHTML = api_response.msg
						? (Array.isArray(api_response.msg) ? api_response.msg.join('<br>') : api_response.msg)
						: 'Unknown error'

				// process messages
					process_error_container.innerHTML = ''
					if (api_response.errors.length) {
						process_error_container.innerHTML = api_response.errors.join('<br>')
						process_error_container.classList.remove('hidden')
					}

					process_messages_container.innerHTML = ''
					if (api_response.ar_msg.length) {
						process_messages_container.innerHTML = api_response.ar_msg.join('<br>')
						process_messages_container.classList.remove('hidden')
					}

				set_loading(false)
			}
			button_export.addEventListener('click', click_handler)

	// messages_container
		const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})
		const process_messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container process_messages hidden',
			parent			: fragment
		})
		const process_error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container process_error hidden',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_ONTOLOGIES_LIST
* Creates the checkbox list selectors of all available ontology sections
* @param object self
* 	tool instance
* @return DocumentFragment fragment
*/
const render_ontologies_list = function (self) {

	const ontologies = self.ontologies || []

	// parents unique
	const key = 'parent_tipo';
	const unique_parents = [...new Map(ontologies.map(el => [el[key], el] )).values()];

	const shared_parents = unique_parents.filter(el => el.target_section_tipo.indexOf('local') === -1 )
		.sort( (a,b) => (a.parent_order < b.parent_order) ? -1 : 0)

	const local_parents = unique_parents.filter(el => el.target_section_tipo.indexOf('local') != -1)
		.sort( (a,b) => (a.parent_order < b.parent_order) ? -1 : 0)

	const sorted_parents = [...shared_parents, ...local_parents]

	const fragment = new DocumentFragment()

	const sorted_parents_length = sorted_parents.length
	for (let i = 0; i < sorted_parents_length; i++) {

		const parent = sorted_parents[i]

		// parent_label
			const parent_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'item_label parent_label unselectable icon_arrow',
				inner_html		: parent.parent_name,
				parent			: fragment
			})
			parent_label.addEventListener('click', (e) => {
				e.preventDefault() // prevent interactions with the input checkbox
			})

		// input checkbox
			const parent_input_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				id				: parent.parent_tipo,
				value			: parent.parent_tipo
			})
			// change event handler
			const change_handler = (e) => {
				const children_nodes = children_container.querySelectorAll('input')
				for (let k = children_nodes.length - 1; k >= 0; k--) {
					children_nodes[k].checked = parent_input_checkbox.checked
					children_nodes[k].dispatchEvent( new Event('change') );
				}
			}
			parent_input_checkbox.addEventListener('change', change_handler)
			parent_input_checkbox.addEventListener('click', (e) => {
				e.stopPropagation()
			})
			parent_label.append(parent_input_checkbox)

		// children_container
			const children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'children_container',
				parent			: fragment
			})

		// track collapse toggle state of content
			ui.collapse_toggle_track({
				toggler				: parent_label,
				container			: children_container,
				collapsed_id		: 'tool_ontology_export_' + parent.target_section_tipo,
				collapse_callback	: () => {parent_label.classList.remove('up')},
				expose_callback		: () => {parent_label.classList.add('up')},
				default_state		: 'opened' // 'opened|closed'
			})

		// children group items
			const children_ontologies = ontologies.filter(el => el.parent_tipo === parent.parent_tipo)
				.sort( (a,b) => (a.name < b.name) ? -1 : 0)

			const children_len = children_ontologies.length
			let children_checked_counter = 0 // number of checked children counter
			for (let j = 0; j < children_len; j++) {

				const child = children_ontologies[j];

				// item_label
				const item_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'item_label',
					inner_html		: child.name,
					parent			: children_container
				})

				// input checkbox
				const input_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					id				: child.target_section_tipo,
					value			: child.target_section_tipo
				})
				// set value
				if (self.selected_ontologies.find(el => el===child.target_section_tipo)) {
					input_checkbox.checked = true
					children_checked_counter++ // update counter
				}
				item_label.prepend(input_checkbox)
				// change event handler
				const change_handler = (e) => {
					if (input_checkbox.checked) {
						// add if not is not already included
						if (!self.selected_ontologies.includes(child.target_section_tipo)) {
							self.selected_ontologies.push(child.target_section_tipo)
						}
					}else{
						const index = self.selected_ontologies.indexOf(child.target_section_tipo)
						if (index > -1) {
							self.selected_ontologies.splice(index, 1)
						}
					}
					// save selected_ontologies value as localStorage
					dd_request_idle_callback(
						() => {
							// current stored value
							const value_string = JSON.stringify( self.selected_ontologies )
							if (value_string!==localStorage.getItem('selected_ontologies')) {
								// store_value
								localStorage.setItem('selected_ontologies', value_string);
								if(SHOW_DEBUG===true) {
									// console.log("Saved localStorage.setItem:", localStorage.getItem('selected_ontologies'));
								}
							}
						}
					)
				}
				input_checkbox.addEventListener('change', change_handler)
			}

		// update grouper checked value. if all children are check, then parent id checked
			if (children_checked_counter===children_len) {
				parent_input_checkbox.checked = true
			}
	}


	return fragment
}//end render_ontologies_list



// @license-end
