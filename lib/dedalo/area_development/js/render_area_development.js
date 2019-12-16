/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA_development
* Manages the area apperance in client side
*/
export const render_area_development = function() {

	return true
}//end render_area_development



/**
* LIST
* Alias of edit
* @return DOM node
*/
render_area_development.prototype.list = async function(options={render_level:'full'}) {

	return this.edit(options)
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_area_development.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		//const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : current_content_data,
			//buttons 	 : current_buttons
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const fragment = new DocumentFragment()

	// widgets
		const widgets_lenght = self.widgets.length
		for (let i = 0; i < widgets_lenght; i++) {

			const widget = self.widgets[i]

			const widget_dom = build_widget(widget, self);
			fragment.appendChild(widget_dom)

			// load external
				/*
				const load_promises = []
				if(widget.load_style) {

					for (let i = 0; i < widget.load_style.length; i++) {
						const src = widget.load_style[i]
						load_promises.push( common.prototype.load_style(src) )
					}
				}
				if(widget.load_script) {

					for (let i = 0; i < widget.load_script.length; i++) {
						const src = widget.load_script[i]
						load_promises.push( common.prototype.load_script(src) )
					}
				}
				*/
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
}//end content_data



/**
* BUILD_WIDGET
*/
const build_widget = (item, self) => {

	const container = ui.create_dom_element({
		id 			 : item.id,
		element_type : 'div',
		dataset 	 : {},
		class_name 	 : "widget_container"
	})

	// label
		const label = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "widget_label",
			parent 		 : container,
			inner_html	 : item.label || ''
		}).addEventListener("dblclick", function(e){
			const body = e.target.nextElementSibling
			body.classList.contains("display_none") ? body.classList.remove("display_none") : body.classList.add("display_none")
		})


	// body
		const body = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "widget_body",
			parent 		 : container
		})

		// item info
		if (item.info) {
			const widget_info = ui.create_dom_element({
				element_type : 'div',
				class_name 	 : "link",
				parent 		 : body,
				inner_html	 : item.info || ''
			})

			// action
				widget_info.addEventListener('mouseup',  async function(e){
					e.stopPropagation()

					// confirm optional
						if (item.confirm && !confirm(item.confirm)) {
							return false
						}

					widget_info.classList.add("lock")
					body_response.classList.add("preload")

					// data_manager
					const api_response = await data_manager.prototype.request({
						body : {
							dd_api		: item.trigger.dd_api,
							action 		: item.trigger.action,
							options 	: item.trigger.options
						}
					})
					console.log("api_response:",api_response);

					print_response(body_response, api_response)

					widget_info.classList.remove("lock")
					body_response.classList.remove("preload")
				})
		}//end if (item.info) {

		// body info
		const body_info = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "body_info",
			parent 		 : body,
			inner_html	 : item.body || ''
		})

		const body_response = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "body_response",
			parent 		 : body,
		})

	// run widget scripts
		if(item.run) {
			//event_manager.subscribe('render_page', (page_wrapper) => {

				for (let i = 0; i < item.run.length; i++) {

					const func 			= item.run[i].fn
					const func_options  = item.run[i].options

					const js_promise = self[func].apply(self, [{
						...item,
						...func_options,
						body_response:body_response,
						print_response:print_response
					}])
				}
			//})
		}


	return container
}//end build_widget



/**
* PRINT_RESPONSE
*/
const print_response = (container, api_response) => {

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// clean (eraser)
		const eraser = ui.create_dom_element({
			element_type : 'span',
			class_name 	 : "clean",
			parent 		 : container
		})
		eraser.addEventListener("mouseup", function(e){
			e.stopPropagation();

			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		})

	// msg
		const msg = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "",
			parent 		 : container,
			inner_html 	 : api_response.msg
		})

	// json response result
		const result = ui.create_dom_element({
			element_type : 'pre',
			class_name 	 : "",
			parent 		 : container,
			inner_html 	 : JSON.stringify(api_response, null, " ").replace(/\\n/g, "<br>")
		})

	container.classList.remove("preload")

	return container
}//end print_response



/**
* BUTTONS
* @return DOM node buttons
*/
const buttons = async function(self) {

	const buttons = []

	/*
	// button register tools
		const button_register_tools = ui.button.build_button({
			class_name 	: "button_register",
			label 		: "Register tools"
		})
		button_register_tools.addEventListener('mouseup', async (e) => {
			e.stopPropagation()
			//alert("Click here! ")

			// data_manager
			const api_response = await data_manager.prototype.request({
				body : {
					action 		: 'trigger',
					class_name 	: 'ontology',
					method 		: 'import_tools',
					options 	: {}
				}
			})
			console.log("+++ api_response:",api_response);
		})
		buttons.push(button_register_tools)
		*/

	return buttons
}//end buttons


