// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_csv_dd_grid} from './view_csv_dd_grid.js'
	import {view_tsv_dd_grid} from './view_tsv_dd_grid.js'
	import {view_table_dd_grid} from './view_table_dd_grid.js'
	import {view_table_export_dd_grid} from './view_table_export_dd_grid.js'
	import {view_default_dd_grid} from './view_default_dd_grid.js'
	import {view_mini_dd_grid} from './view_mini_dd_grid.js'
	import {view_indexation_dd_grid} from './view_indexation_dd_grid.js'
	import {view_descriptors_dd_grid} from './view_descriptors_dd_grid.js'
	import {
		render_links_list
	} from '../../component_iri/js/render_list_component_iri.js'



/**
* RENDER_LIST_DD_GRID
* Manage the components logic and appearance in client side
*/
export const render_list_dd_grid = function() {

	return true
}//end render_list_dd_grid



/**
* LIST
* Render node to use in list
* @param object options
* @return HTMLElement wrapper
*/
render_list_dd_grid.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.view
			? self.view
			: 'default'

	switch(view) {

		case 'csv':
			return view_csv_dd_grid.render(self, options)

		case 'tsv':
			return view_tsv_dd_grid.render(self, options)

		case 'table':
			return view_table_dd_grid.render(self, options)

		case 'table_export':
			return view_table_export_dd_grid.render(self, options)

		case 'mini':
			return view_mini_dd_grid.render(self, options)

		case 'indexation':
			return view_indexation_dd_grid.render(self, options)

		case 'descriptors':
			return view_descriptors_dd_grid.render(self, options)

		case 'default':
		default:
			return view_default_dd_grid.render(self, options)
	}
}//end list



/**
* GET_TEXT_COLUMN
* Render a span DOM node with given value
* @param object data_item
* @param bool use_fallback
* @return HTMLElement text_node (span)
*/
export const get_text_column = function(data_item, use_fallback) {

	const class_list = data_item.class_list || ''

	const value = use_fallback===true
		? (data_item.value && data_item.value[0]!==undefined ? data_item.value : data_item.fallback_value)
		: data_item.value

	const records_separator = (data_item.records_separator)
		? data_item.records_separator
		: ' | '

	const value_string = value
		? value.join(records_separator)
		: ''

	const add_style = value_string.length>0
		? ''
		: ' empty'

	const text_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list + add_style,
		inner_html		: value_string
	})

	return text_node
}//end get_text_column



/**
* GET_AV_COLUMN
* @param object data_item
* @return HTMLElement image (img)
*/
export const get_av_column = function(data_item) {

	const class_list = data_item.class_list || ''

	// url
		const posterframe_url	= data_item.value[0].posterframe_url
		const url				= posterframe_url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list

		})
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})

		image.src = url

	// set_bg_color
		// image.addEventListener('load', set_bg_color, false)
		// function set_bg_color() {
		// 	this.removeEventListener('load', set_bg_color, false)
		// 	ui.set_background_image(this, image)
		// }

	return image
}//end get_av_column



/**
* GET_IMG_COLUMN
* @param object data_item
* @return HTMLElement image (img)
*/
export const get_img_column = function(data_item) {

	const class_list = data_item.class_list || ''

	// url
		const url = data_item.value[0]

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list
		})
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})

		image.src = url

	// set_bg_color
		// image.addEventListener('load', set_bg_color, false)
		// function set_bg_color() {
		// 	this.removeEventListener('load', set_bg_color, false)
		// 	ui.set_background_image(this, image)
		// }

	return image
}//end get_img_column



/**
* GET_LABEL_COLUMN
* @param object current_data
* @return HTMLElement label_node (label)
*/
export const get_label_column = function(current_data) {

	const label_node = ui.create_dom_element({
		element_type	: 'label',
		inner_html		: current_data.label
	})

	return label_node
}//end get_label_column



/**
* GET_BUTTON_COLUMN
* @param object current_data
* @return HTMLElement button (img)
*/
export const get_button_column = function(current_data) {

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	// image
		const button = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list
		})

	// event
		if (value.action && value.action.event) {

			button.addEventListener(value.action.event, async (e)=>{
				const options			= value.action.options
				options.button_caller	= e.target

				const module = await import (value.action.module_path)
				module[value.action.method](options)
			})
		}

	return button
}//end get_button_column



/**
* GET_JSON_COLUMN
* @param object current_data
* @return HTMLElement text_json (span)
*/
export const get_json_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const text_json = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list,
		inner_html		: JSON.stringify(current_data.value)
	})

	return text_json
}//end get_json_column



/**
* GET_SECTION_ID_COLUMN
* @param object current_data
* @return HTMLElement text_node (span)
*/
export const get_section_id_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const section_id_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list,
		inner_html		: current_data.value
	})

	return section_id_node
}//end get_section_id_column



/**
* GET_IRI_COLUMN
* @param object current_data
* @return HTMLElement text_node (span)
*/
export const get_iri_column = function(current_data) {

	const class_list = current_data.class_list || ''

	// DOM fragment
		const fragment = render_links_list(current_data)

	// column
		const column = ui.create_dom_element({
			element_type	: 'span',
			class_name		: class_list
		})
		column.appendChild(fragment)


	return column
}//end get_iri_column



// @license-end
