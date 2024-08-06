// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global   */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* RENDER_SECTION_GROUP
* Manage the components logic and appearance in client side
*/
export const render_section_group = function() {

	return true
}//end render_section_group



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_section_group.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// collapsed_id (used to identify local DB records)
		const collapsed_id		= `section_group_${self.section_tipo}_${self.tipo}`
		const collapsed_table	= 'status'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// content data state. Needed to prevent blink components show on page load
		const ui_status = await data_manager.get_local_db_data(
			collapsed_id,
			collapsed_table
		)
		if (!ui_status) {
			content_data.classList.remove('hide')
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	get_wrapper(self)
		// set wrapper content data property (used as grouper selector from section_record)
		wrapper.content_data = content_data

	// header (label)
		if (self.context.add_label===false) {
			wrapper.classList.add('no_margin')
		}else{

			const component_label = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'icon_arrow' + (!ui_status ? ' up' : ''),
				inner_html		: self.label // + ' [' + self.tipo + ' - ' + self.permissions + ']'
			})
			// CSS
				const element_css = self.context.css || {}
 				const label_structure_css = typeof element_css.label!=="undefined" ? element_css.label : []
				const ar_css = ['label', ...label_structure_css]
				component_label.classList.add(...ar_css)

			// collapse_toggle_track
				const collapse = function() {
					component_label.classList.remove('up')
				}
				const expose = function() {
					component_label.classList.add('up')
				}
				ui.collapse_toggle_track({
					toggler				: component_label,
					container			: content_data,
					collapsed_id		: collapsed_id,
					collapse_callback	: collapse,
					expose_callback		: expose
				})

			// add component_label
				wrapper.appendChild(component_label)
		}

	// content_data
		wrapper.appendChild(content_data)


	return wrapper
}//end edit



/**
* LIST
* Alias of edit
* @return HTMLElement
*/
render_section_group.prototype.list = render_section_group.prototype.edit;



/**
* GET_WRAPPER
* Render node for use in edit
* @return HTMLElement
*/
const get_wrapper = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div',
			class_name : `${'wrapper_'+self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.mode}`
		})

	// css new way v6
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
		}

	return wrapper
}//end get_wrapper



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.type, 'hide')

	return content_data
}//end get_content_data



// @license-end
