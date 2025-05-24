// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {when_in_dom, when_in_viewport, dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_tree_data} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA_MAINTENANCE
* Manages the area appearance in client side
*/
export const render_area_maintenance = function() {

	return true
}//end render_area_maintenance



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_area_maintenance.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* LIST
* Alias of edit
* @param object options
* @return HTMLElement
*/
render_area_maintenance.prototype.list = async function(options) {

	return this.edit(options)
}//end list



/**
* CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// widgets
		const widgets = self.widgets || []
		const widgets_length = widgets.length
		for (let i = 0; i < widgets_length; i++) {

			const widget = widgets[i]

			const widget_dom = build_widget(widget, self);
			fragment.appendChild(widget_dom)
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.type, 'invisible')
			  content_data.appendChild(fragment)

		 // remove invisible class to prevent flickering
			when_in_viewport(content_data, ()=>{
				dd_request_idle_callback(
					() => {
						content_data.classList.remove('invisible')
					}
				)
			})


	return content_data
}//end content_data



/**
* BUILD_WIDGET
* Renders widget DOM nodes
* @param object item
* @param object self
* 	Instance of current area
* @return HTMLElement container
*/
const build_widget = (item, self) => {

	// container
		const container = ui.create_dom_element({
			id				: item.id,
			element_type	: 'div',
			dataset			: {},
			class_name		: 'widget_container ' + (item.class || '')
		})

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_label icon_arrow',
			inner_html		: item.label || '',
			parent			: container,
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'widget_body hide',
			parent			: container
		})

	// collapse_toggle_track
		when_in_viewport(label, ()=>{
			ui.collapse_toggle_track({
				toggler				: label,
				container			: body,
				collapsed_id		: 'collapsed_' + item.id,
				collapse_callback	: collapse,
				expose_callback		: expose,
				default_state		: 'closed'
			})
		})
		function collapse() {
			label.classList.remove('up')
		}
		function expose() {
			label.classList.add('up')
		}

	// widget module check. Use if exists
		const path = `../widgets/${item.id}/js/${item.id}.js`
		import(path)
		.then(async function(module){

			// instance widget
			const widget = new module[item.id]()

			// init widget
			await widget.init({
				id				: item.id,
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				lang			: self.lang,
				mode			: self.mode, // list
				model			: 'widget',
				name			: item.label,
				value			: item.value,
				caller			: self
			})

			// render and append widget node
			ui.load_item_with_spinner({
				container			: body,
				preserve_content	: false,
				label				: item.id,
				callback			: async () => {

					// build
					await widget.build(false)

					// render
					const node = await widget.render()

					// add CSS class for selection
					node.classList.add('body_info')

					return node
				}
			});
		})
		.catch((err) => {
			console.error(err)
		});


	return container
}//end build_widget



/**
* PRINT_RESPONSE
* Render API response result message and result
* Note that api_response is returned by the delegated worker
* @param DOM node container
* @param object api_response
* @return DON node container
*/
export const print_response = (container, api_response) => {

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// button_eraser
		const button_eraser = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button reset eraser',
			parent			: container
		})
		button_eraser.addEventListener('mouseup', function(e){
			e.stopPropagation();

			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		})

	// errors
		if (api_response.errors && api_response.errors.length) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'api_response error',
				parent			: container,
				inner_html		: api_response.errors.join('<br>')
			})
		}

	// msg
		const api_msg = api_response && api_response.msg
			? Array.isArray(api_response.msg)
				? api_response.msg.join('<br>')
				: api_response.msg.replace(/\\n/g, '<br>')
			: 'Unknown API response error'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'api_response',
			parent			: container,
			inner_html		: api_msg
		})

	// JSON response result
		const result = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pre',
			parent			: container
		})
		render_tree_data(api_response, result)


	return container
}//end print_response



/**
* BUILD_FORM
* Render a form for given widget_object
* @param object widget_object
* @return HTMLElement form_container
*/
export const build_form = function(widget_object) {

	// widget_object
		const body_info		= widget_object.body_info
		const body_response	= widget_object.body_response
		const confirm_text	= widget_object.confirm_text || get_label.sure || 'Sure?'
		const inputs		= widget_object.inputs || []
		const submit_label	= widget_object.submit_label || 'OK'
		const trigger		= widget_object.trigger || {}
		const on_submit		= widget_object.on_submit // optional replacement function to exec on submit
		const on_done		= widget_object.on_done // optional function to exec on API response
		const on_render		= widget_object.on_render // optional function to exec on render is complete

	// create the form
		const form_container = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'form_container',
			parent			: body_info
		})
		form_container.addEventListener('submit', async function(e){
			e.preventDefault()

			// blur button
				document.activeElement.blur()

			// collect values from inputs
				const values = input_nodes.map((el)=>{
					return {
						name	: el.name,
						value	: el.value
					}
				})

			if ( confirm(confirm_text) ) {

				// check mandatory values
					for (let i = 0; i < input_nodes.length; i++) {
						if(input_nodes[i].classList.contains('mandatory') && input_nodes[i].value.length<1) {
							input_nodes[i].focus()
							input_nodes[i].classList.add('empty')
							return
						}
					}

				// on_submit. Overwrites default submit action
					if (on_submit) {
						return on_submit(e, values)
					}

				// submit data
					form_container.classList.add('lock')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)

					const options = (trigger.options)
						? Object.assign(trigger.options, values)
						: values

					// data_manager
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api	: trigger.dd_api,
								action	: trigger.action,
								source	: trigger.source || null,
								options	: options
							}
						})
						print_response(body_response, api_response)
						form_container.classList.remove('lock')
						spinner.remove()

					// on_submit. Execute function after request
						if (on_done) {
							return on_done(api_response)
						}
			}
		})

	// form inputs
		const input_nodes = []
		for (let i = 0; i < inputs.length; i++) {

			const input = inputs[i]

			const class_name = input.mandatory
				? 'mandatory'
				: ''

			const input_node = ui.create_dom_element({
				element_type	: 'input',
				type			: input.type,
				name			: input.name,
				placeholder		: input.label,
				title			: input.label,
				class_name		: class_name,
				parent			: form_container
			})
			if (input.value) {
				input_node.value = input.value
			}
			input_node.addEventListener('keyup', function(){
				if (this.value.length>0) {
					this.classList.remove('empty')
				}
			})

			input_nodes.push(input_node)
		}

	// button submit
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: submit_label,
			parent			: form_container
		})
		form_container.button_submit = button_submit
		button_submit.addEventListener('click', function(e){
			e.stopPropagation()
		})

	// on_render
		if (on_render) {
			on_render({form_container, input_nodes})
		}


	return form_container
}//end build_form



/**
* SET_WIDGET_LABEL_STYLE
* Locate widget_container and set (add/remove) the given style
* If the node is not ready, wait until is available in the DOM
* @param object self
* @param string style (as 'danger')
* @param mode string add|remove
* @param HTMLElement ref_node (to observe node)
* @return void
*/
export const set_widget_label_style = function (self, style, mode, ref_node) {

	if (!self.node) {
		const when_in_dom_handler = () => {
			set_widget_label_style(self, style, mode, ref_node)
		}
		when_in_dom(ref_node, when_in_dom_handler)
		return
	}

	const wrapper = self.node
	const widget_container = wrapper.parentNode?.parentNode
	if (widget_container) {

		if (mode==='remove') {
			widget_container.classList.remove(style)
		}else{
			widget_container.classList.add(style)
		}
	}
}//end set_widget_label_style



// @license-end
