// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {when_in_viewport} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_tree_data} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA_DEVELOPMENT
* Manages the area appearance in client side
*/
export const render_area_development = function() {

	return true
}//end render_area_development



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_area_development.prototype.edit = async function(options) {

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
render_area_development.prototype.list = async function(options) {

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
		const widgets_length = self.widgets.length
		for (let i = 0; i < widgets_length; i++) {

			const widget = self.widgets[i]

			const widget_dom = build_widget(widget, self);
			fragment.appendChild(widget_dom)
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.type, 'invisible')
			  content_data.appendChild(fragment)

		 // remove invisible class to prevent flickering
			when_in_viewport(content_data, ()=>{
				setTimeout(function(){
					content_data.classList.remove('invisible')
				}, 75)
			})


	return content_data
}//end content_data



/**
* BUILD_WIDGET
* Renders given widget DOM nodes
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
			parent			: container,
			inner_html		: item.label || ''
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
		const path = './widgets/'+ item.id +'/'+ item.id + '.js'
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
			// build
				await widget.build(false)
			// render
				widget.render()
				.then(function(node){
					if (node) {
						node.classList.add('body_info')
						body.appendChild(node)
					}
				})
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

	// msg
		const api_msg = api_response && api_response.msg
			? Array.isArray(api_response.msg)
				? api_response.msg.join('<br>')
				: api_response.msg.replace(/\\n/g, '<br>')
			: 'Unknown API response error'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
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
		const body_info			= widget_object.body_info
		const body_response		= widget_object.body_response
		const confirm_text		= widget_object.confirm_text || get_label.sure || 'Sure?'
		const inputs			= widget_object.inputs || []
		const submit_label		= widget_object.submit_label || 'OK'

	// create the form
		const form_container = ui.create_dom_element({
			element_type	: 'form',
			class_name		: 'form_container',
			parent			: body_info
		})
		// submit event
		form_container.addEventListener('submit', async function(e){
			e.preventDefault()

			if ( confirm(confirm_text) ) {

				// check mandatory values
					for (let i = 0; i < input_nodes.length; i++) {
						if(input_nodes[i].classList.contains('mandatory') && input_nodes[i].value.length<1) {
							input_nodes[i].focus()
							input_nodes[i].classList.add('empty')
							return
						}
					}

				// submit data
					form_container.classList.add('lock')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)

					// collect values from inputs
					const values = input_nodes.map((el)=>{
						return {
							name	: el.name,
							value	: el.value
						}
					})

					const options = (widget_object.trigger.options)
						? Object.assign(widget_object.trigger.options, values)
						: values

					// data_manager
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api	: widget_object.trigger.dd_api,
								action	: widget_object.trigger.action,
								options	: options
							}
						})
						print_response(body_response, api_response)
						form_container.classList.remove('lock')
						spinner.remove()
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
			class_name		: 'light',
			text_content	: submit_label,
			parent			: form_container
		})
		button_submit.addEventListener('click', function(e){
			e.stopPropagation()
		})


	return form_container
}//end build_form



// @license-end
