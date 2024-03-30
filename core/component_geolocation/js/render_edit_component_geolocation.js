// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_geolocation} from './view_default_edit_geolocation.js'
	// import {view_text_geolocation} from './view_text_geolocation.js'
	import {view_mini_geolocation} from './view_mini_geolocation.js'



/**
* RENDER_EDIT_COMPONENT_geolocation
* Manage the components logic and appearance in client side
*/
export const render_edit_component_geolocation = function() {

	return true
}//end render_edit_component_geolocation



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_geolocation.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_geolocation.render(self, options)

		// case 'text':
		// 		return view_text_geolocation.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_geolocation.render(self, options)
	}
}//end edit



/**
* RENDER_POPUP_TEXT
* @param array ar_text_obj
* @return HTMLElement text_container
*/
export const render_popup_text = function(ar_text_obj) {

	const text_container = ui.create_dom_element({
		element_type : 'div'
	})

	const text_len = ar_text_obj.length
	for (let i = 0; i < text_len; i++) {
		const current_obj	= ar_text_obj[i]
		const label			= current_obj.label || ''
		const messure		= current_obj.messure || ''
		const separator		= current_obj.separator === false
			? false
			: true

		// text_node
			ui.create_dom_element({
				element_type	: 'span',
				inner_html		: label + ' ' + messure,
				parent			: text_container
			})

		// separator_node (br)
			if(separator) {
				ui.create_dom_element({
					element_type	: 'br',
					parent			: text_container
				})
			}
	}


	return text_container
}//end render_popup_text



/**
* RENDER_COLOR_PICKER
* Render a new iro.ColorPicker to allow user change
* item selected color
* @param object self
* @param object layer
* @param string layer_id
* @return HTMLElement color_container
*/
export const render_color_picker = function(self, layer, layer_id) {

	const layer_color = layer.options.color || '#31df25'

	const color_container = ui.create_dom_element({
		element_type	: 'span'
	})

	// color_picker
	const button_color_picker = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button tool button_color_picker',
		parent			: color_container
	})
	button_color_picker.style.backgroundColor = layer_color

	const text_color = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		value 			: layer_color,
		class_name		: 'text_color',
		parent			: color_container
	})
	text_color.addEventListener('change', function() {
		button_color_picker.style.backgroundColor = text_color.value
		layer.setStyle({color: text_color.value});
		self.update_draw_data(layer_id)
	})

	const color_wheel_contaniner = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'hide color_wheel_contaniner',
		parent			: color_container
	})

	const color_picker = new iro.ColorPicker(
		color_wheel_contaniner,
		{
			// Set the size of the color picker
			width: 160,
			// Set the initial color to paper project color
			color: layer_color,
			// color wheel will not fade to black when the lightness decreases.
			wheelLightness: true,
			// transparency: true,
			layout: [
				{
					component: iro.ui.Wheel, //can be iro.ui.Box
					options: {
						sliderShape: 'circle'
					}
				},
				{
					component: iro.ui.Slider,
					options: {
						sliderType: 'value' // can also be 'saturation', 'value', 'alpha' or 'kelvin'
					}
				},
				// {
				// 	component: iro.ui.Slider,
				// 	options: {
				// 		sliderType: 'alpha'
				// 	}
				// },
			]
		}
	)//end new iro.ColorPicker
	button_color_picker.addEventListener('mouseup', (e) =>{
		e.stopPropagation()
		color_wheel_contaniner.classList.toggle('hide')
	})
	// color:change event callback
	// color:change callbacks receive the current color and a changes object
	const color_selected = (color) =>{
		// if(this.path !== null){
		// 	this.path.fillColor = color.hex8String
		// }
		layer.setStyle({color: color.hex8String});
		button_color_picker.style.backgroundColor = color.hex8String
		text_color.value = color.hex8String
		// update the instance with the new layer information, prepared to save
		// (but is not saved directly, the user need click in the save button)
		self.update_draw_data(layer_id)
		// event_manager.publish('color_change_'+this.active_layer.data.layer_id, color.hex8String)
	}

	// listen to a color picker's color:change event
	color_picker.on(["color:change"], color_selected);


	return color_container
}//end render_color_picker



// @license-end
