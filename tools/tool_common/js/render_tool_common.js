// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/

// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_ERROR
* Render generic error node
* @return HTMLElement wrapper
*/
export const render_error = async function(self, options) {

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data tool tool_error content_data_error',
			inner_html		: 'Error : ' + self.error + ' Try to close the tool and re-open it'
		})

	// icon_info
		const icon_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon info'
		})
		content_data.prepend(icon_info)

		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end render_error



/**
* RENDER_FOOTER
* Creates the footer nodes
* @param object self
* @return HTMLElement footer_node
*/
export const render_footer = function (self) {

	const footer_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'footer_node'
	})

	// icon
	ui.create_dom_element({
		element_type	: 'img',
		class_name		: 'icon',
		src				: self.context.icon,
		parent			: footer_node
	})

	// developer
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'info',
		inner_html		: `Developed by ${self.context.developer}`,
		parent			: footer_node
	})


	return footer_node
}//end render_footer



// @license-end
