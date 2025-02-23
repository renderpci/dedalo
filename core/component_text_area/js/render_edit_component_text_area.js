// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_text_area} from './view_default_edit_text_area.js'
	import {view_mini_text_area} from './view_mini_text_area.js'
	import {view_line_edit_text_area} from './view_line_edit_text_area.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_edit_component_text_area = function() {

	return true
}//end render_edit_component_text_area



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_text_area.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_text_area.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_text_area oh23 oh1_oh23 edit view_default disabled_component active inside">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the contect_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
			return view_line_edit_text_area.render(self, options)

		case 'html_text':
		case 'default':
		default:
			return view_default_edit_text_area.render(self, options)
	}
}//end edit



/**
* RENDER_LAYER_SELECTOR
* Creates the user layers selection nodes
* Used from component_image and component_geolocation
* @param options
* {
*	self: object (component_text_area instance sent by published event)
* 	text_editor: object (service_ckeditor instance)
* 	callback: function (to call in for each layer click event)
* 	data_tag: object as {data:"",label:"",layers:[{},{}],type:"geo"}
* }
* @return HTMLElement layer_selector
*/
export const render_layer_selector = function(options){

	// options
		const self			= options.self
		const text_editor	= options.text_editor
		const callback		= options.callback
		const data_tag		= options.data_tag

	// prevent open already created selector
		if (self.node.layer_selector) {
			return null
		}

	const fragment = new DocumentFragment()

	// add_layer button
		// const add_layer = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button add',
		// 	title			: get_label.new || 'New',
		// 	parent			: fragment
		// })
		// add_layer.addEventListener('click', (e) =>{
		// 	e.preventDefault()
		// 	e.stopPropagation()
		// 	data_tag.data = [data_tag.last_layer_id]
		// 	const tag 	= self.build_view_tag_obj(data_tag, tag_id)
		// 	text_editor.set_content(tag)
		// 	layer_selector.remove()
		// })

	// layer_selector_header
		const layer_selector_header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'layer_selector_header',
			parent			: fragment
		})

		// layer_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'layer_icon',
			text_node		: data_tag.type + ': ' + (get_label.layer_selector || 'Layer selector'),
			parent			: layer_selector_header,
		})

		// close button
		const close = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button close',
			parent			: layer_selector_header
		})
		const click_handler = (e) => {
			e.preventDefault()
			e.stopPropagation()
			// remove pointer
			self.node.layer_selector = null
			// remove node
			layer_selector.remove()
		}
		close.addEventListener('click', click_handler)

	// inputs container
		const layer_ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'layer_ul',
			parent			: fragment
		})
		// iterate all layers
		const ar_layers = data_tag.layers
		for (let i = 0; i < ar_layers.length; i++) {

			const layer = ar_layers[i]

			const layer_li = ui.create_dom_element({
				element_type	: 'li',
				parent			: layer_ul
			})
			const click_handler = (e) => {
				e.preventDefault()
				e.stopPropagation()

				data_tag.label = `${data_tag.tag_id}:${layer.layer_id}`
				data_tag.data = [layer.layer_id]

				callback({
					data_tag	: data_tag,
					text_editor	: text_editor
				})

				// remove pointer
				self.node.layer_selector = null
				// remove node
				layer_selector.remove()
			}
			layer_li.addEventListener('click', click_handler)

			// layer_id
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'layer_id',
					parent			: layer_li,
					text_node		: layer.layer_id
				})

			// user_layer_name
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'user_layer_name',
					parent			: layer_li,
					text_node		: layer.user_layer_name
				})

				// const layer_color_box = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name 		: 'layer_color_box',
				// 	parent 			: layer_li,
				// })
				// const layer_color = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name 		: 'layer_color',
				// 	parent 			: layer_color_box,
				// })
				// layer_color.style.backgroundColor = typeof layer.layer_color !== 'undefined'
				// 	? layer.layer_color
				// 	: 'black'
		}//end for (let i = 0; i < ar_layers.length; i++)

	const layer_selector = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'layer_selector'
	})
	layer_selector.appendChild(fragment)

	// fix pointer
	self.node.layer_selector = layer_selector


	return layer_selector
}//end render_layer_selector



/**
* RENDER_PAGE_SELECTOR
* Creates a modal dialog with page_selector options
* @return bool true
*/
export const render_page_selector = function(self, data_tag, tag_id, text_editor) {

	// short vars
		const total_pages	= data_tag.total_pages
		const offset		= data_tag.offset
		const page_in		= offset
		const page_out		= (offset -1) + total_pages

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			text_node		: get_label.select_page_of_the_doc
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body'
		})

		const label = eval('`'+get_label.choose_page_between+'`')
		const body_title = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_title',
			text_node		: label,
			parent			: body
		})

		const body_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'body_title',
			parent			: body
		})

		const error_input = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_title',
			text_node		: '',
			parent			: body
		})


	// footer
		const footer = ui.create_dom_element({
			element_type	: 'span'
		})

		const user_option_cancel = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'user_option ',
			inner_html		: get_label.cancel || 'Cancel',
			parent			: footer
		})

		const user_option_ok = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'user_option',
			inner_html		: get_label.insert_tag || 'Insert tag',
			parent			: footer
		})

	// save editor changes to prevent conflicts with modal components changes
		text_editor.save()

	// modal
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer,
			size	: 'normal'
		})

	user_option_ok.addEventListener('click', (e) =>{
		e.preventDefault()
		e.stopPropagation()
		const user_value = body_input.value
		if(user_value === null) {
			modal.renove()
		}
		if(user_value > page_out || user_value < page_in){
			error_input.textContent = get_label.value_out_of_range || 'Value out of range'
			return
		}
		const data		= body_input.value - (offset -1)
		data_tag.label	= body_input.value
		data_tag.data	= [data]
		const tag		= self.build_view_tag_obj(data_tag, tag_id)
		text_editor.set_content(tag)
		modal.remove()
	})

	user_option_cancel.addEventListener('click', (e) =>{
		e.stopPropagation()
		modal.remove()
	})


	return true
}//end render_page_selector



// @license-end
