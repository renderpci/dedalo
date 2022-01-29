/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SECTION_GROUP
* Manage the components logic and appearance in client side
*/
export const render_section_group = function() {

	return true
};//end render_section_group



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_group.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// collapsed_id (used to identify local DB records)
		const collapsed_id		= `section_group_collapsed_${self.section_tipo}_${self.tipo}`
		const collapsed_table	= 'context'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// content data state
		await data_manager.prototype.get_local_db_data(collapsed_id, collapsed_table)
		.then(function(ui_status){
			if (!ui_status) {
				// console.log("/// ui_status:",ui_status);
				content_data.classList.remove('hide')
			}
		})

	// wrapper. ui build_edit returns component wrapper
		// const wrapper =	ui.component.build_wrapper_edit(self, wrapper_options)
		const wrapper =	get_wrapper(self, {
			content_data : content_data
		})

	// events delegated
		wrapper.addEventListener("click", (e) => {
			// label click collapse 'content_data'
			if (e.target.matches('.label')) {
				e.stopPropagation()
				const content_data	= e.target.nextSibling
				const collapsed		= content_data.classList.contains('hide')
				if (!collapsed) {
					// add record to local DB
					data_manager.prototype.set_local_db_data({
						id		: collapsed_id,
						value	: !collapsed
					}, collapsed_table)
					content_data.classList.add('hide')
				}else{
					// remove record from local DB
					data_manager.prototype.delete_local_db_data(collapsed_id, collapsed_table)
					content_data.classList.remove('hide')
				}
			}
		})


	return wrapper
};//end edit



/**
* GET_WRAPPER
* Render node for use in edit
* @return DOM node
*/
const get_wrapper = function(self, options) {

	// options
		const content_data = options.content_data

	// short vars
		const element_css	= self.context.css || {}
		const fragment		= new DocumentFragment()

	// label (header)
		if (self.context.add_label===true) {
			const component_label = ui.create_dom_element({
				element_type	: 'div',
				inner_html		: self.label + ' ' + self.tipo + ' ' + (self.model) + ' [' + self.permissions + ']'
			})
			// css
 				const label_structure_css = typeof element_css.label!=="undefined" ? element_css.label : []
				const ar_css = ['label', ...label_structure_css]
				component_label.classList.add(...ar_css)
			// add
			fragment.appendChild(component_label)
		}

	// content_data
		fragment.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div'
		})
		// CSS
			const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
			const ar_css = ['wrapper_'+self.type, self.model, self.tipo, self.mode, ...wrapper_structure_css]
			wrapper.classList.add(...ar_css)
		// legacy CSS
			const legacy_selector = '.wrap_section_group_div'
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
		// no header cases. Remove margins on former section_group_div items
			if (self.context.add_label===false) {
				wrapper.classList.add('no_margin')
			}

		// add
			wrapper.appendChild(fragment)


	return wrapper
}//end get_wrapper



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add('content_data', self.type, 'hide')


	return content_data
};//end get_content_data



/**
* LIST
* Render node for use in list
* @return DOM node
*/
// render_section_group.prototype.list = render_section_group.prototype.edit


