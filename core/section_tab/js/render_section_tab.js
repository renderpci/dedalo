// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* RENDER_SECTION_tab
* Manage the components logic and appearance in client side
*/
export const render_section_tab = function() {

	return true
}//end render_section_tab



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_section_tab.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	get_wrapper(self)
		// set wrapper content data property (used as grouper selector from section_record)
		wrapper.content_data = wrapper

	// view
		switch (self.context.view) {
			case 'tab': {
				// nothing to do
				const tab_active_handler = () => {
					wrapper.classList.add('active')
				}
				self.events_tokens.push(
					event_manager.subscribe('tab_active_'+self.tipo, tab_active_handler)
				)
				break;
			}

			case 'section_tab':
			default: {
				// status
					const status_id		= `section_tab_${self.section_tipo}_${self.tipo}`
					const status_table	= 'status'

				// section_tab children, as tab
				// children_object will store the tipo and the node in the object to be referenced and selected.
					const children			= self.context.children
					const children_length	= children.length
					const children_object	= {}
					for (let i = 0; i < children_length; i++) {
						const child = children[i]
						const child_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'tab_label',
							inner_html		: child.label,
							parent			: wrapper
						})
						child_node.tipo = child.tipo
						child_node.addEventListener("click", function(e) {
							e.stopPropagation()
							active_tab(child_node)
						})
						children_object[child.tipo] = child_node
					}

				// active_tab
					const active_tab = (child_node) => {

						const tipo = child_node.tipo;

						// clean all active
							[...wrapper.childNodes].map(el => {
								if(el.classList.contains('active')) {
									el.classList.remove('active')
								}
							})

						// publish the activate event
							event_manager.publish('tab_active_'+tipo, child_node)

						// status update
							const data = {
								id		: status_id,
								value	: tipo
							}
							data_manager.set_local_db_data(
								data,
								status_table
							)

						// active self
							child_node.classList.add('active')
					}

				// status
				// get active tab stored by previous user selection and active the tab
					const ui_status		= await data_manager.get_local_db_data(status_id, status_table)
					const selected_tipo	= ui_status && ui_status.value
						? ui_status.value
						: children[0].tipo // first tab tipo fallback

					// if the element is not available, for permissions or exclude it, use default node, first node.
					const valid_tab_node = children_object[selected_tipo] || children_object[children[0]?.tipo] // first tab tipo fallback

					// if the node is not available, don't active it (will create a error and block the access to the entire section)
					if(valid_tab_node){
						active_tab( valid_tab_node )
					}
				break;
			}
		}


	return wrapper
}//end edit



/**
* GET_WRAPPER
* Render node for use in edit
* @param object self
* @return HTMLElement wrapper
*/
const get_wrapper = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `${'wrapper_'+self.type} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.context.view} ${self.mode}`
		})

	// apply CSS from context
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
		}


	return wrapper
}//end get_wrapper



// @license-end
