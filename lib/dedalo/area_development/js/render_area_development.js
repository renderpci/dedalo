// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'


/**
* RENDER_AREA_development
* Manages the area apperance in client side
*/
export const render_area_development = function() {

	return true
}//end render_area_development



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

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data") // ,"nowrap","full_width"

	// widgets
		const widgets_lenght = self.widgets.length
		for (let i = 0; i < widgets_lenght; i++) {

			const widget = self.widgets[i]

			const widget_dom = build_widget(widget);
			content_data.appendChild(widget_dom)
		}


	return content_data
}//end content_data



/**
* BUILD_WIDGET
*/
const build_widget = (item) => {

	const container = ui.create_dom_element({
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
		})

	// body
		const body = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "widget_body",
			parent 		 : container
		})

		const widget_info = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "link",
			parent 		 : body,
			inner_html	 : item.info || ''
		})

		const widget_body = ui.create_dom_element({
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

	// action
		widget_info.addEventListener('mouseup',  async function(e){
			e.stopPropagation()

			widget_info.classList.add("lock")
			body_response.classList.add("preload")

			// data_manager
			const api_response = await data_manager.prototype.request({
				body : {
					action 		: 'trigger',
					class_name 	: item.trigger.class_name,
					method 		: item.trigger.method,
					options 	: item.trigger.options
				}
			})
			console.log("api_response:",api_response);

			print_response(body_response, api_response)

			widget_info.classList.remove("lock")
			body_response.classList.remove("preload")
		})


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
			inner_html 	 : JSON.stringify(api_response, null, " ")
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


