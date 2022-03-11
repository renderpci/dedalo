/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SECTION_tab
* Manage the components logic and appearance in client side
*/
export const render_section_tab = function() {

	return true
};//end render_section_tab



/**
* EDIT
* Render node for use in edit
* @return DOM node
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
			case 'tab':
				// nothing to do
				self.events_tokens.push(
					event_manager.subscribe('tab_active_'+self.tipo, fn_active)
				)
				function fn_active() {
					wrapper.classList.add('active')
				}
				break;

			case 'section_tab':
			default:
				// status
					const status_id		= `section_tab_${self.section_tipo}_${self.tipo}`
					const status_table	= 'status'

				// children
					const children = self.context.children
					const children_length = children.length
					const children_object = {}
					for (let i = 0; i < children_length; i++) {
						const child = children[i]
						const child_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'tab_label',
							inner_html		: child.label,
							parent			: wrapper
						})
						child_node.tipo = child.tipo
						child_node.addEventListener("click", function() {
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

						// event publish
							event_manager.publish('tab_active_'+tipo, child_node)

						// status update
							data_manager.prototype.set_local_db_data({
								id		: status_id,
								value	: tipo
							}, status_table)

						// active self
							child_node.classList.add('active')
					}

				// status
					const ui_status		= await data_manager.prototype.get_local_db_data(status_id, status_table)
					const selected_tipo	= ui_status && ui_status.value
						? ui_status.value
						: children[0].tipo // fisrt tab tipo fallback
					active_tab( children_object[selected_tipo] )

				break;
		}


	return wrapper
};//end edit



/**
* GET_WRAPPER
* Render node for use in edit
* @return DOM node
*/
const get_wrapper = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div'
		})
	// CSS
		const element_css = self.context.css || {}
		const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
		const ar_css = ['wrapper_'+self.type, self.model, self.tipo, self.context.view, self.mode, ...wrapper_structure_css]
		wrapper.classList.add(...ar_css)
	// legacy CSS
		const legacy_selector = '.wrap_section_tab_div'
		if (element_css[legacy_selector]) {
			// style
				if (element_css[legacy_selector].style) {
					// width from style
					if (element_css[legacy_selector].style.width) {
						// wrapper.style['flex-basis'] = element_css[legacy_selector].style.width;
						// wrapper.style['--width'] = element_css[legacy_selector].style.width
						wrapper.style.setProperty('width', element_css[legacy_selector].style.width);
					}
					// display none from style
					if (element_css[legacy_selector].style.display && element_css[legacy_selector].style.display==='none') {
						wrapper.classList.add('display_none')
					}
				}
		}


	return wrapper
}//end get_wrapper



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
	// const get_content_data = function(self) {

	// 	// content_data
	// 		const content_data = document.createElement("div")
	// 			  content_data.classList.add('content_data', self.type, 'hide')


	// 	return content_data
	// };//end get_content_data


