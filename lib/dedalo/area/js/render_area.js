// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'


/**
* RENDER_AREA
* Manages the area apperance in client side
*/
export const render_area = function() {

	return true
}//end render_area



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : current_content_data,
			buttons 	 : current_buttons
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data") // ,"nowrap","full_width"

	// add all section_record rendered nodes
		const length = ar_section_record.length
		if (length===0) {
			const child_item = no_records_node()
			content_data.appendChild(child_item)
		}else{
			for (let i = 0; i < length; i++) {
				const child_item = await ar_section_record[i].render()
				content_data.appendChild(child_item)
			}
		}

	return content_data
}//end content_data



/**
* BUTTONS
* @return DOM node buttons
*/
const buttons = async function(self) {

	const buttons = []

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

	return buttons
}//end buttons


